import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Save, Trash2, Plus } from 'lucide-react';

import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { ACTIVITIES, WEEKDAYS, sessionFor } from '../lib/training';
import { todayKey } from '../lib/dates';
import {
  Card,
  Button,
  Input,
  Field,
  Alert,
  Badge,
  Skeleton,
} from '../components/ui';
import EditGate, { useCanEdit } from '../components/EditGate';

/**
 * Weekly training blocks.
 *
 * Blocks rather than a calendar because amateur schedules repeat weekly and
 * change in chunks — "gym every morning in September, then cricket three days
 * a week from October". A block has a start date and optionally an end date;
 * the most recent block covering a given day wins, so starting a new one
 * retires the old without editing anything.
 */
const ACTIVITY_KEYS = ['gym', 'cricket', 'run', 'rest'];

function BlockEditor({ block, onSave, onDelete, saving }) {
  const [draft, setDraft] = useState(block);
  useEffect(() => setDraft(block), [block]);

  const setDay = (weekday, activity) =>
    setDraft((d) => ({ ...d, days: { ...d.days, [weekday]: activity } }));

  return (
    <Card className="p-4">
      <div className="space-y-3">
        <Field label="Block name">
          <Input
            value={draft.name ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="September — gym base"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" required>
            <Input
              type="date"
              value={draft.starts_on}
              onChange={(e) => setDraft((d) => ({ ...d, starts_on: e.target.value }))}
            />
          </Field>
          <Field label="Ends" hint="blank = ongoing">
            <Input
              type="date"
              value={draft.ends_on ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, ends_on: e.target.value || null }))}
            />
          </Field>
        </div>

        <Field label="Session time" hint="used on the morning card">
          <Input
            type="time"
            value={draft.start_time ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, start_time: e.target.value || null }))}
          />
        </Field>

        <div>
          <p className="muted mb-1.5 text-xs font-medium">What happens each day</p>
          <div className="space-y-1.5">
            {WEEKDAYS.map((label, weekday) => (
              <div key={weekday} className="flex items-center gap-2">
                <span className="w-9 shrink-0 text-[11px] font-semibold">{label}</span>
                <div className="flex flex-1 gap-1">
                  {ACTIVITY_KEYS.map((key) => {
                    const active = (draft.days?.[weekday] ?? 'rest') === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDay(weekday, key)}
                        className="flex-1 rounded-lg border py-1.5 text-[10px] font-medium transition-all active:scale-95"
                        style={{
                          borderColor: active ? ACTIVITIES[key].color : 'var(--border)',
                          background: active ? `${ACTIVITIES[key].color}1f` : 'transparent',
                          color: active ? ACTIVITIES[key].color : 'var(--text-muted)',
                        }}
                      >
                        {ACTIVITIES[key].emoji} {ACTIVITIES[key].label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button icon={Save} loading={saving} className="flex-1" onClick={() => onSave(draft)}>
            Save block
          </Button>
          {block.id ? (
            <Button variant="danger" icon={Trash2} onClick={() => onDelete(block)}>
              Delete
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export default function Plan() {
  const user = useAuthStore((s) => s.user);
  const canEdit = useCanEdit();
  const { plan, savePlanBlock, deletePlanBlock, loading, saving } = useDataStore();
  const [editing, setEditing] = useState(null);
  const [status, setStatus] = useState({ tone: null, message: '' });

  // Rows are per-weekday; group them back into the blocks they came from.
  const blocks = useMemo(() => {
    const map = new Map();
    for (const row of plan ?? []) {
      const key = `${row.starts_on}|${row.ends_on ?? ''}`;
      const block = map.get(key) ?? {
        starts_on: row.starts_on,
        ends_on: row.ends_on,
        name: row.name,
        start_time: row.start_time,
        days: {},
      };
      block.days[row.weekday] = row.activity;
      block.id = block.id ?? row.id;
      map.set(key, block);
    }
    return [...map.values()].sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1));
  }, [plan]);

  const today = sessionFor(plan ?? [], new Date());

  const blank = {
    name: '',
    starts_on: todayKey(),
    ends_on: null,
    start_time: '07:00',
    days: { 0: 'rest', 1: 'gym', 2: 'gym', 3: 'gym', 4: 'gym', 5: 'gym', 6: 'rest' },
  };

  const save = async (draft) => {
    const result = await savePlanBlock({ userId: user.id, block: draft });
    setStatus(
      result.ok
        ? { tone: 'success', message: 'Plan saved.' }
        : { tone: 'error', message: result.message }
    );
    if (result.ok) setEditing(null);
  };

  const remove = async (block) => {
    const result = await deletePlanBlock({ userId: user.id, block });
    if (result.ok) setEditing(null);
  };

  if (loading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15">
            <CalendarCheck size={19} className="text-accent" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-semibold">Training plan</h1>
            <p className="muted text-xs">
              {today
                ? `Today is ${ACTIVITIES[today.activity]?.label ?? today.activity}`
                : 'No block covers today'}
            </p>
          </div>
        </div>
      </Card>

      {status.message ? <Alert tone={status.tone}>{status.message}</Alert> : null}

      {editing ? (
        <BlockEditor block={editing} onSave={save} onDelete={remove} saving={saving} />
      ) : (
        <>
          {blocks.map((block) => (
            <Card key={`${block.starts_on}-${block.ends_on ?? 'open'}`} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{block.name || 'Training block'}</p>
                  <p className="muted text-[11px]">
                    {block.starts_on} → {block.ends_on ?? 'ongoing'}
                    {block.start_time ? ` · ${block.start_time.slice(0, 5)}` : ''}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setEditing(block)} disabled={!canEdit}>
                  Edit
                </Button>
              </div>
              <div className="mt-2.5 flex gap-1">
                {WEEKDAYS.map((label, weekday) => {
                  const act = ACTIVITIES[block.days[weekday] ?? 'rest'];
                  return (
                    <div key={weekday} className="flex-1 text-center">
                      <div
                        className="rounded-lg py-1.5 text-sm"
                        style={{ background: `${act.color}1f` }}
                        title={act.label}
                      >
                        {act.emoji}
                      </div>
                      <span className="muted mt-0.5 block text-[9px]">{label}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}

          <EditGate className="mb-3" />
          <Button icon={Plus} className="w-full" onClick={() => setEditing(blank)} disabled={!canEdit}>
            {blocks.length ? 'Add another block' : 'Create your first block'}
          </Button>

          {blocks.length ? (
            <p className="muted px-1 text-[11px] leading-relaxed">
              When blocks overlap, the one that starts latest wins — so to change your routine, add
              a new block starting the day it changes rather than editing the old one. That keeps
              the history of what you were actually doing.
            </p>
          ) : null}
        </>
      )}

      <div className="pb-2">
        {Object.entries(ACTIVITIES)
          .filter(([key]) => ACTIVITY_KEYS.includes(key))
          .map(([key, act]) => (
            <Badge key={key} color={act.color} className="mr-1.5">
              {act.emoji} {act.label}
            </Badge>
          ))}
      </div>
    </div>
  );
}
