/**
 * nutrition-estimate — macros for a meal the built-in table does not know.
 *
 * Deliberately the fallback, not the front door. The catalogue in
 * `src/lib/foods.js` answers the everyday meal instantly, free and offline;
 * this exists for the rest. It matters that it is only the remainder, because
 * this account has already run its Anthropic balance to zero once, and a food
 * log that stops working when the credit does is not a food log.
 *
 * Everything it returns is treated as an estimate: validated, clamped, and
 * stored with its own confidence so it never sits on the screen looking like a
 * measurement.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * The cheapest current model, chosen deliberately.
 *
 * Haiku 4.5 is $1/$5 per million tokens against Sonnet's $3/$15 — a third of
 * the cost — and neither job here is hard: the coach is handed a brief that has
 * already done the arithmetic, and the estimator is reading portion sizes off a
 * sentence. Both are language tasks, not reasoning ones.
 *
 * Note on prompt caching: it is NOT used, and that is not an oversight. The
 * minimum cacheable prefix is about 1,024 tokens and the system prompt below is
 * a third of that, so a `cache_control` breakpoint would be accepted and then
 * silently cache nothing. The saving that actually exists here is not making
 * the call at all — see the estimate reuse in src/lib/nutrition.js.
 */
const MODEL = 'claude-haiku-4-5';

const SYSTEM = `You estimate the macronutrients of food described in plain language, usually Indian home cooking described in household portions — rotis, katoris, bowls, plates.

Reply with ONLY a JSON object. No prose, no markdown fence, no explanation:

{"items":[{"name":"","portion":"","protein_g":0,"carbs_g":0,"fat_g":0,"kcal":0}],
 "total":{"protein_g":0,"carbs_g":0,"fat_g":0,"kcal":0},
 "confidence":"high|medium|low"}

Rules:
- Assume typical Indian home cooking unless told otherwise: a katori is about 150ml, a roti about 40g.
- Where a quantity is not given, assume one standard household portion and say so in the item name.
- "total" must equal the sum of "items". Do not round the total independently.
- confidence: "high" for a plain single ingredient, "medium" for a normal home-cooked dish, "low" for a restaurant dish or anything vague where the oil content could vary widely.
- If the input is not food at all, return an empty items array, zeroed totals, and confidence "low".`;

const clamp = (n: unknown, max: number): number => {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(v, max);
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json(
      { error: 'not_configured', message: 'No Anthropic API key is set, so meals outside the built-in food list cannot be estimated.' },
      503
    );
  }

  let payload: { description?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'bad_request', message: 'Expected a JSON body.' }, 400);
  }

  const description = (payload.description ?? '').toString().trim().slice(0, 500);
  if (!description) return json({ error: 'bad_request', message: 'Describe the meal first.' }, 400);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: SYSTEM,
        messages: [{ role: 'user', content: description }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('anthropic error', res.status, detail);
      // Say what actually went wrong. "Returned 400" sent someone hunting for
      // a bug when the real answer — no credit left — was sitting in the body.
      let upstream = '';
      try {
        upstream = JSON.parse(detail)?.error?.message ?? '';
      } catch {
        upstream = '';
      }
      return json(
        {
          error: 'upstream',
          message:
            upstream ||
            (res.status === 401 ? 'The Anthropic API key was rejected.' : `Anthropic returned ${res.status}.`),
        },
        502
      );
    }

    const data = await res.json();
    const text = (data.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')
      .trim();

    // The model was asked for bare JSON, but a stray fence is cheap to survive.
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return json({ error: 'parse', message: 'Could not read that estimate — try describing the meal differently.' }, 502);

    let parsed;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return json({ error: 'parse', message: 'Could not read that estimate — try describing the meal differently.' }, 502);
    }

    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 20) : [];
    const clean = items.map((i: Record<string, unknown>) => ({
      name: String(i.name ?? 'Item').slice(0, 120),
      portion: String(i.portion ?? '').slice(0, 60),
      protein_g: clamp(i.protein_g, 300),
      carbs_g: clamp(i.carbs_g, 800),
      fat_g: clamp(i.fat_g, 300),
      kcal: clamp(i.kcal, 5000),
    }));

    // Recomputed from the items rather than trusted: a total that disagrees
    // with its own parts is the one number nobody would catch by eye.
    const total = clean.reduce(
      (sum, i) => ({
        protein_g: Math.round((sum.protein_g + i.protein_g) * 10) / 10,
        carbs_g: Math.round((sum.carbs_g + i.carbs_g) * 10) / 10,
        fat_g: Math.round((sum.fat_g + i.fat_g) * 10) / 10,
        kcal: Math.round(sum.kcal + i.kcal),
      }),
      { protein_g: 0, carbs_g: 0, fat_g: 0, kcal: 0 }
    );

    const confidence = ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low';
    return json({ items: clean, total, confidence });
  } catch (error) {
    console.error('nutrition-estimate failed', error);
    return json({ error: 'network', message: 'Could not reach Anthropic.' }, 502);
  }
});
