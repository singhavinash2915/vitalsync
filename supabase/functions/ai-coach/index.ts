/**
 * ai-coach — the conversational half of the trainer.
 *
 * The app already computes everything factual: scores, baselines, discovered
 * findings, today's prescription. This function does not recompute any of it.
 * It receives that brief and puts language around it, which keeps the model on
 * the one job it is actually better at than arithmetic.
 *
 * The API key lives here rather than in the bundle. A browser calling Anthropic
 * directly would ship the key to anyone who opened devtools.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODEL = 'claude-sonnet-4-5';
const MAX_HISTORY = 12;

const SYSTEM = `You are the training coach inside VitalSync, a private health app with one user: a 34-year-old cricket all-rounder who bats, bowls seam, and plays 16-over matches on open ground in Pune. He lifts in the morning and wants to be durable and performing, not to win an argument about training theory.

You will be given a JSON brief containing his real, current numbers: today's HRV and resting heart rate, his recent readiness scores, today's prescribed session, and a list of findings that were mined from his own multi-year history. Ground every answer in that brief.

Rules that matter more than sounding helpful:
- Use his actual numbers. Quote them. "Your HRV is 33.7 against a 47 baseline" beats "your HRV is low".
- The findings in the brief were computed from his own data and beat textbook advice. If a finding says sleep length does not predict his HRV, do not tell him to sleep more to fix his HRV. Each finding carries a confidence and a sample size — respect both, and say "weak" when it is weak.
- If the brief does not contain what you need, say so plainly and say what he would have to log. Never estimate a number that is not in the brief, and never invent a trend.
- He is not a beginner. Skip the disclaimers and the encouragement padding. Answer the question.
- Two to five sentences unless he asks for a plan. No headers or bullet lists for a short answer.
- You are not a doctor. If something in the data looks like illness or injury — a resting heart rate well up for days, pain that is not soreness — say that it warrants a doctor rather than a training tweak, once, without hedging around it.`;

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
      {
        error: 'not_configured',
        message:
          'The chat coach needs an Anthropic API key. Set it with: supabase secrets set ANTHROPIC_API_KEY=sk-ant-…',
      },
      503
    );
  }

  let payload: { message?: string; context?: unknown; history?: { role: string; content: string }[] };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'bad_request', message: 'Expected a JSON body.' }, 400);
  }

  const message = (payload.message ?? '').toString().trim();
  if (!message) return json({ error: 'bad_request', message: 'Ask something.' }, 400);

  // Only the last few turns are replayed; the brief carries the state that matters.
  const history = (payload.history ?? [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

  const brief = JSON.stringify(payload.context ?? {}, null, 1).slice(0, 20000);

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
        max_tokens: 1024,
        system: SYSTEM,
        messages: [
          ...history,
          { role: 'user', content: `Today's brief:\n\`\`\`json\n${brief}\n\`\`\`\n\n${message}` },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('anthropic error', res.status, detail);
      return json(
        {
          error: 'upstream',
          message:
            res.status === 401
              ? 'The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.'
              : res.status === 429
                ? 'Rate limited by Anthropic — try again in a moment.'
                : `Anthropic returned ${res.status}.`,
        },
        502
      );
    }

    const data = await res.json();
    const reply = (data.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('\n')
      .trim();

    return json({ reply: reply || 'No answer came back — try rephrasing.' });
  } catch (error) {
    console.error('ai-coach failed', error);
    return json({ error: 'network', message: 'Could not reach Anthropic.' }, 502);
  }
});
