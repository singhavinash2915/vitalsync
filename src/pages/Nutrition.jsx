import { useMemo, useState } from 'react';
import { Beef, Pill, Plus, Check, Trash2, Sparkles, Loader2, Search, RotateCcw, Flame } from 'lucide-react';

import { useDataStore } from '../store/useDataStore';
import { useAuthStore } from '../store/useAuthStore';
import { latestScan } from '../lib/body';
import { energyBalance, deficitTarget, balanceSummary, weeklyBalance } from '../lib/energy';
import { proteinTarget, dayTotals, dayEntry, proteinSummary, findCachedEstimate, WHEY_PROTEIN_G } from '../lib/nutrition';
import { parseMeal, totalsFor, toMealRow, searchFoods } from '../lib/foods';
import { anonKey, functionsBaseUrl } from '../lib/supabase';
import { toNumber, hasNumber } from '../lib/scores';
import { todayKey, shortDate } from '../lib/dates';
import EditGate, { useCanEdit } from '../components/EditGate';
import { Card, CardHeader, CardBody, Button, Input, Modal } from '../components/ui';

const MACROS = [
  { key: 'protein_g', label: 'Protein', unit: 'g', color: 'var(--status-excellent)' },
  { key: 'carbs_g', label: 'Carbs', unit: 'g', color: 'var(--viz-1)' },
  { key: 'fat_g', label: 'Fat', unit: 'g', color: 'var(--status-moderate)' },
  { key: 'kcal', label: 'Calories', unit: '', color: 'var(--viz-2)' },
];

/**
 * Describe a meal, get its macros.
 *
 * The built-in food table answers first — instantly, offline, and free. Only
 * what it does not recognise goes to the estimator, which matters because that
 * API has already run out of credit once and a food log that stops working
 * when the balance does is not a food log.
 */
function MealSheet({ open, onClose, onLog, recent, meals }) {
  const [text, setText] = useState('');
  const [aiItems, setAiItems] = useState(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState(null);

  const parsed = useMemo(() => (text.trim() ? parseMeal(text) : { matched: [], unmatched: [] }), [text]);
  const catalogueTotal = totalsFor(parsed.matched);
  const suggestions = useMemo(() => (text.trim().length > 1 ? searchFoods(text, 5) : []), [text]);

  const askAI = async () => {
    const description = parsed.unmatched.join(', ');

    // Answered before? Then there is nothing to ask. This is where the token
    // saving actually comes from — the same lunch does not get re-estimated
    // every week at a fraction of a cent a time.
    const cached = findCachedEstimate(meals, description);
    if (cached) {
      setAiItems(cached);
      return;
    }

    setAsking(true);
    setError(null);
    try {
      const res = await fetch(`${functionsBaseUrl}/nutrition-estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}`, apikey: anonKey },
        body: JSON.stringify({ description }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || 'Could not estimate that.');
      setAiItems(body);
    } catch (e) {
      setError(e.message);
    } finally {
      setAsking(false);
    }
  };

  const submit = () => {
    const rows = parsed.matched.map((m) => toMealRow(m, todayKey()));
    if (aiItems?.items?.length) {
      for (const item of aiItems.items) {
        rows.push({
          description: item.name,
          portion: item.portion || null,
          protein_g: item.protein_g,
          carbs_g: item.carbs_g,
          fat_g: item.fat_g,
          kcal: item.kcal,
          source: 'ai',
          confidence: aiItems.confidence,
        });
      }
    }
    onLog(rows);
    setText('');
    setAiItems(null);
    setError(null);
  };

  const anything = parsed.matched.length || aiItems?.items?.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="What did you eat?"
      size="lg"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={!anything} onClick={submit}>
            Log it
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Input
          value={text}
          onChange={(e) => { setText(e.target.value); setAiItems(null); }}
          placeholder="3 roti, katori dal, paneer sabzi, curd"
          autoFocus
        />

        {recent.length && !text.trim() ? (
          <div>
            <p className="muted mb-1.5 text-[10px] font-semibold uppercase tracking-wider">Eaten before</p>
            <div className="flex flex-wrap gap-1.5">
              {recent.slice(0, 8).map((m) => (
                <button
                  key={m.description}
                  onClick={() => onLog([{ ...m, source: 'repeat' }])}
                  className="rounded-full border px-2.5 py-1.5 text-[11px] transition-colors hover:border-accent hover:text-accent"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {m.description} · {Math.round(toNumber(m.protein_g) ?? 0)}g P
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {suggestions.length && !parsed.matched.length ? (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((f) => (
              <button
                key={f.name}
                onClick={() => setText((t) => (t ? `${t}, ${f.name}` : f.name))}
                className="muted flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] hover:text-accent"
                style={{ borderColor: 'var(--border)' }}
              >
                <Search size={10} /> {f.name}
              </button>
            ))}
          </div>
        ) : null}

        {parsed.matched.length ? (
          <div className="space-y-1 rounded-xl p-2.5" style={{ background: 'var(--bg-elevated)' }}>
            {parsed.matched.map((m, i) => (
              <div key={`${m.food.name}-${i}`} className="flex items-baseline justify-between text-[11px]">
                <span>{m.qty === 1 ? m.food.name : `${m.qty} × ${m.food.name}`}</span>
                <span className="muted tabular-nums">
                  {Math.round(m.food.p * m.qty)}P · {Math.round(m.food.kcal * m.qty)} kcal
                </span>
              </div>
            ))}
            <div className="mt-1 flex items-baseline justify-between border-t pt-1.5 text-xs font-semibold" style={{ borderColor: 'var(--border)' }}>
              <span>From the food list</span>
              <span className="tabular-nums">
                {catalogueTotal.protein_g}g P · {catalogueTotal.kcal} kcal
              </span>
            </div>
          </div>
        ) : null}

        {parsed.unmatched.length ? (
          <div className="space-y-2 rounded-xl p-2.5" style={{ background: 'color-mix(in srgb, var(--status-moderate) 12%, transparent)' }}>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--status-moderate)' }}>
              Not in the food list: <strong>{parsed.unmatched.join(', ')}</strong>
            </p>
            {aiItems ? (
              <div className="space-y-1">
                {aiItems.items.map((i) => (
                  <div key={i.name} className="flex items-baseline justify-between text-[11px]">
                    <span>{i.name}</span>
                    <span className="muted tabular-nums">{Math.round(i.protein_g)}P · {Math.round(i.kcal)} kcal</span>
                  </div>
                ))}
                <p className="muted text-[10px]">
                  {aiItems.cached ? 'Reused from the last time you logged this' : `Estimated, ${aiItems.confidence} confidence`} — edit after logging if it looks off.
                </p>
              </div>
            ) : (
              <Button size="sm" variant="secondary" icon={asking ? Loader2 : Sparkles} onClick={askAI} disabled={asking}>
                {asking ? 'Estimating…' : 'Estimate with AI'}
              </Button>
            )}
            {error ? <p className="text-[10px] text-score-poor">{error}</p> : null}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export default function Nutrition() {
  const { meals, nutrition, bodyComposition, health, logMeals, deleteMeal, saveNutrition } = useDataStore();
  const { user, profile } = useAuthStore();
  const canEdit = useCanEdit();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const date = todayKey();
  const scan = latestScan(bodyComposition);
  const target = useMemo(() => proteinTarget({ profile, latestScan: scan }), [profile, scan]);
  const totals = useMemo(() => dayTotals(meals, date), [meals, date]);
  const supplements = useMemo(() => dayEntry(nutrition, date), [nutrition, date]);
  const summary = useMemo(() => proteinSummary(meals, target.grams, 7, nutrition), [meals, target.grams, nutrition]);
  const todayMeals = useMemo(() => meals.filter((m) => m.date === date), [meals, date]);

  // Named for the deficit, not "target" — the protein target above already
  // owns that word on this page.
  const deficit = useMemo(
    () => deficitTarget({ scans: bodyComposition, goalWeightKg: profile?.goal_weight_kg, weeks: 8 }),
    [bodyComposition, profile]
  );
  const balance = useMemo(
    () => energyBalance({ meals, scans: bodyComposition, health, profile, date }),
    [meals, bodyComposition, health, profile, date]
  );
  const week = useMemo(
    () => weeklyBalance({ meals, scans: bodyComposition, health, profile }),
    [meals, bodyComposition, health, profile]
  );
  const verdict = balanceSummary(balance, deficit);

  /** Distinct past meals, most recent first — the self-building food library. */
  const recent = useMemo(() => {
    const seen = new Map();
    for (const m of [...meals].sort((a, b) => (a.date < b.date ? 1 : -1))) {
      if (m.date === date) continue;
      if (!seen.has(m.description)) seen.set(m.description, m);
    }
    return [...seen.values()].map(({ description, portion, protein_g, carbs_g, fat_g, kcal }) => ({
      description, portion, protein_g, carbs_g, fat_g, kcal,
    }));
  }, [meals, date]);

  const pct = Math.min(100, Math.round((totals.protein_g / target.grams) * 100));

  const log = async (rows) => {
    setBusy(true);
    await logMeals({ userId: user.id, date, rows });
    setBusy(false);
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <EditGate />

      <Card delay={0}>
        <CardBody className="space-y-4 pt-5">
          <div className="text-center">
            <p className="text-4xl font-bold tabular-nums" style={{ color: pct >= 90 ? 'var(--status-excellent)' : 'var(--status-moderate)' }}>
              {totals.protein_g}
              <span className="ml-1 text-lg font-semibold" style={{ color: 'var(--text-muted)' }}>
                / {target.grams} g
              </span>
            </p>
            <p className="muted mt-1 text-xs">
              {Math.max(0, target.grams - totals.protein_g) > 0
                ? `${Math.max(0, target.grams - totals.protein_g)} g of protein to go`
                : 'Protein target hit'}{' '}
              · from {target.basis}
            </p>
          </div>

          <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--track)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 90 ? 'var(--status-excellent)' : 'var(--status-moderate)' }} />
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {MACROS.map((m) => (
              <div key={m.key} className="rounded-xl px-1 py-2 text-center" style={{ background: 'var(--bg-elevated)' }}>
                <p className="text-sm font-bold tabular-nums" style={{ color: m.color }}>
                  {totals[m.key]}
                </p>
                <p className="muted text-[9px]">{m.label}</p>
              </div>
            ))}
          </div>

          <Button size="lg" icon={Plus} className="w-full" disabled={!canEdit || busy} onClick={() => setOpen(true)}>
            Add a meal
          </Button>
        </CardBody>
      </Card>

      {balance ? (
        <Card delay={20}>
          <CardHeader
            title="Energy balance"
            subtitle={`Burn ${balance.burn} kcal · BMR ${balance.bmr} ${balance.basis}`}
            icon={Flame}
          />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="rounded-xl px-1 py-2" style={{ background: 'var(--bg-elevated)' }}>
                <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--viz-1)' }}>{balance.intake}</p>
                <p className="muted text-[9px]">eaten</p>
              </div>
              <div className="rounded-xl px-1 py-2" style={{ background: 'var(--bg-elevated)' }}>
                <p className="text-sm font-bold tabular-nums" style={{ color: 'var(--viz-2)' }}>{balance.burn}</p>
                <p className="muted text-[9px]">burned</p>
              </div>
              <div className="rounded-xl px-1 py-2" style={{ background: 'var(--bg-elevated)' }}>
                <p
                  className="text-sm font-bold tabular-nums"
                  style={{ color: balance.balance === null ? 'var(--text-muted)' : balance.balance < 0 ? 'var(--status-excellent)' : 'var(--status-moderate)' }}
                >
                  {balance.balance === null ? '—' : `${balance.balance > 0 ? '+' : ''}${balance.balance}`}
                </p>
                <p className="muted text-[9px]">{balance.balance !== null && balance.balance < 0 ? 'deficit' : 'balance'}</p>
              </div>
            </div>

            {deficit ? (
              <div>
                <div className="mb-1 flex items-baseline justify-between text-[11px]">
                  <span className="muted">
                    {deficit.toLose} kg to {deficit.goal} kg in {deficit.weeks} weeks
                  </span>
                  <span className="font-semibold" style={{ color: 'var(--viz-1)' }}>
                    needs {deficit.perDay}/day
                  </span>
                </div>
                {balance.balance !== null ? (
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--track)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, Math.max(0, (Math.abs(Math.min(0, balance.balance)) / deficit.perDay) * 100))}%`,
                        background: 'var(--status-excellent)',
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {verdict ? (
              <p className="text-[11px] leading-relaxed" style={{ color: verdict.tone === 'good' ? 'var(--status-excellent)' : verdict.tone === 'warn' ? 'var(--status-moderate)' : 'var(--text-muted)' }}>
                {verdict.text}
              </p>
            ) : null}

            {week.loggedDays > 1 ? (
              <p className="muted text-[11px]">
                Averaging {week.average > 0 ? '+' : ''}{week.average} kcal across {week.loggedDays} logged days.
              </p>
            ) : null}

            <p className="muted border-t pt-2 text-[10px] leading-relaxed" style={{ borderColor: 'var(--border)' }}>
              Three estimates stacked: portion sizes, a bioimpedance BMR, and a wrist-worn activity
              figure that is commonly out by a fifth. Treat this as a direction. If it says you are
              well under and the scale has not moved in a month, believe the scale.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {todayMeals.length ? (
        <Card delay={40}>
          <CardHeader title="Today" subtitle={`${todayMeals.length} logged`} icon={Beef} />
          <CardBody className="space-y-1.5">
            {todayMeals.map((m) => (
              <div key={m.id} className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{m.description}</p>
                  {/*
                    An unknown macro shows as a dash, not a zero. The rescued
                    pre-meals rows carry protein and nothing else, and printing
                    "0C · 0F · 0 kcal" would state as fact that a meal had no
                    carbohydrate — the same null-as-zero mistake that has
                    already produced a 0 bpm resting heart rate and a 0.0 VO2
                    max in this app.
                  */}
                  <p className="muted text-[10px] tabular-nums">
                    {[
                      ['P', m.protein_g],
                      ['C', m.carbs_g],
                      ['F', m.fat_g],
                    ]
                      .map(([unit, v]) => `${hasNumber(v) ? Math.round(toNumber(v)) : '—'}${unit}`)
                      .join(' · ')}
                    {' · '}
                    {hasNumber(m.kcal) ? `${Math.round(toNumber(m.kcal))} kcal` : 'kcal unknown'}
                    {m.source === 'ai' ? ' · estimated' : ''}
                  </p>
                </div>
                {canEdit ? (
                  <button onClick={() => deleteMeal({ id: m.id })} className="muted shrink-0 hover:text-score-poor" aria-label="Remove">
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <Card delay={80}>
        <CardHeader title="Supplements" subtitle="One tap each" icon={Pill} />
        <CardBody className="grid grid-cols-2 gap-2">
          <button
            disabled={!canEdit || busy}
            onClick={async () => {
              await saveNutrition({ userId: user.id, date, patch: { whey_scoops: supplements.whey_scoops + 1 } });
              await log([{ description: 'Whey protein', portion: '1 scoop', protein_g: WHEY_PROTEIN_G, carbs_g: 2, fat_g: 1.5, kcal: 120, source: 'supplement', confidence: 'high' }]);
            }}
            className="flex flex-col items-center gap-1 rounded-xl border px-3 py-3 disabled:opacity-50"
            style={{ borderColor: supplements.whey_scoops ? 'var(--status-excellent)' : 'var(--border)', background: supplements.whey_scoops ? 'color-mix(in srgb, var(--status-excellent) 12%, transparent)' : 'transparent' }}
          >
            <Beef size={17} style={{ color: supplements.whey_scoops ? 'var(--status-excellent)' : 'var(--text-muted)' }} />
            <span className="text-xs font-semibold">Whey</span>
            <span className="muted text-[10px]">
              {supplements.whey_scoops ? `${supplements.whey_scoops} today` : `adds ${WHEY_PROTEIN_G} g`}
            </span>
          </button>

          <button
            disabled={!canEdit || busy}
            onClick={() => saveNutrition({ userId: user.id, date, patch: { creatine_taken: !supplements.creatine_taken } })}
            className="flex flex-col items-center gap-1 rounded-xl border px-3 py-3 disabled:opacity-50"
            style={{ borderColor: supplements.creatine_taken ? 'var(--status-excellent)' : 'var(--border)', background: supplements.creatine_taken ? 'color-mix(in srgb, var(--status-excellent) 12%, transparent)' : 'transparent' }}
          >
            {supplements.creatine_taken ? <Check size={17} style={{ color: 'var(--status-excellent)' }} /> : <Pill size={17} className="muted" />}
            <span className="text-xs font-semibold">Creatine</span>
            <span className="muted text-[10px]">{supplements.creatine_taken ? 'taken' : 'not yet'}</span>
          </button>
        </CardBody>
      </Card>

      <Card delay={120}>
        <CardHeader title="This week" subtitle={summary.coverage} icon={RotateCcw} />
        <CardBody className="space-y-2">
          <div className="flex items-baseline justify-between text-xs">
            <span className="muted">Average protein on logged days</span>
            <span className="font-semibold tabular-nums">{summary.average === null ? '—' : `${summary.average} g`}</span>
          </div>
          {summary.hitRate !== null ? (
            <div className="flex items-baseline justify-between text-xs">
              <span className="muted">Days at or near target</span>
              <span className="font-semibold tabular-nums">{summary.onTarget} of {summary.loggedDays}</span>
            </div>
          ) : null}

          {summary.byDay?.length ? (
            <div className="flex items-end gap-1.5 pt-1">
              {summary.byDay.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-16 w-full items-end">
                    <div
                      className="w-full rounded-t"
                      style={{
                        height: `${Math.max(6, Math.min(100, (d.protein_g / target.grams) * 100))}%`,
                        background: d.protein_g >= target.grams * 0.9 ? 'var(--status-excellent)' : 'var(--status-moderate)',
                      }}
                    />
                  </div>
                  <span className="muted text-[9px]">{shortDate(d.date).split(' ')[0]}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted text-[11px] leading-relaxed">
              Nothing logged yet this week. Unlogged days stay out of the average rather than counting
              as zero — the number should describe your eating, not your logging.
            </p>
          )}
        </CardBody>
      </Card>

      <MealSheet open={open} onClose={() => setOpen(false)} onLog={log} recent={recent} meals={meals} />
    </div>
  );
}
