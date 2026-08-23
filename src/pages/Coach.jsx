import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Dumbbell,
  Send,
  Sparkles,
  Loader2,
  AlertTriangle,
  Info,
  CircleAlert,
  Clock,
  ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';

import { useDataStore } from '../store/useDataStore';
import { useAuthStore } from '../store/useAuthStore';
import { useFindings } from '../lib/useFindings';
import { prescribeSession, coachContext } from '../lib/coach';
import { detectIllnessSignal } from '../lib/illness';
import { ACTIVITIES } from '../lib/training';
import { scoreColor } from '../lib/scores';
import { anonKey, functionsBaseUrl } from '../lib/supabase';
import { Card, CardBody, CardHeader, Button, TextArea, Badge, EmptyState } from '../components/ui';

const NOTE_TONE = {
  bad: { icon: CircleAlert, color: '#ef4444' },
  warn: { icon: AlertTriangle, color: '#f97316' },
  info: { icon: Info, color: '#38bdf8' },
};

const STARTERS = [
  'Why is my readiness so low today?',
  'Should I train tomorrow?',
  'What should I eat before a match?',
  'Is my bowling load too high this week?',
];

/** Today's session, written out in full. Works with no network and no API key. */
function Prescription({ session, readiness }) {
  const activity = ACTIVITIES[session.activity] ?? ACTIVITIES.other;

  return (
    <Card delay={0} className="overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: `${activity.color}14`, borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-xl" aria-hidden="true">
          {activity.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{session.title}</p>
          <p className="muted text-[11px]">{session.subtitle}</p>
        </div>
        {session.duration ? (
          <span className="muted flex shrink-0 items-center gap-1 text-[11px]">
            <Clock size={12} aria-hidden="true" />
            {session.duration}m
          </span>
        ) : null}
        {Number.isFinite(Number(readiness)) ? (
          <Badge color={scoreColor(readiness)}>{readiness}</Badge>
        ) : null}
      </div>

      <CardBody className="space-y-3.5 pt-3.5">
        {session.focus ? (
          <p className="text-xs font-medium" style={{ color: activity.color }}>
            {session.focus}
          </p>
        ) : null}

        {session.blocks.map((block) => (
          <div key={block.name}>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: activity.color }}>
              {block.name}
            </p>
            <ul className="space-y-1">
              {block.items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs leading-relaxed">
                  <span
                    className="mt-1.5 h-1 w-1 shrink-0 rounded-full"
                    style={{ background: activity.color }}
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <p className="muted border-t pt-3 text-xs leading-relaxed" style={{ borderColor: 'var(--border)' }}>
          {session.rationale}
        </p>

        {session.notes.map((note) => {
          const { icon: Icon, color } = NOTE_TONE[note.tone] ?? NOTE_TONE.info;
          return (
            <p
              key={note.text}
              className="flex items-start gap-2 rounded-xl px-2.5 py-2 text-[11px] leading-relaxed"
              style={{ background: `${color}14`, color }}
            >
              <Icon size={13} className="mt-px shrink-0" aria-hidden="true" />
              {note.text}
            </p>
          );
        })}
      </CardBody>
    </Card>
  );
}

export default function Coach() {
  const { health, sleep, scores, workouts, plan, journal } = useDataStore();
  const profile = useAuthStore((s) => s.profile);

  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState(null);
  const endRef = useRef(null);

  const { findings, days } = useFindings();

  const ordered = useMemo(() => [...scores].sort((a, b) => (a.date < b.date ? -1 : 1)), [scores]);
  const readiness = ordered.at(-1)?.readiness_score ?? null;

  const illness = useMemo(() => detectIllnessSignal(health), [health]);

  const session = useMemo(
    () =>
      prescribeSession({
        readiness,
        trend: ordered.slice(-7).map((s) => s.readiness_score),
        plan,
        findings,
        profile,
        illness,
      }),
    [readiness, ordered, plan, findings, profile, illness]
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const ask = async (text) => {
    const question = text.trim();
    if (!question || sending) return;

    const outgoing = [...messages, { role: 'user', content: question }];
    setMessages(outgoing);
    setDraft('');
    setSending(true);
    setChatError(null);

    try {
      // No sign-in, so the anon key is the credential. Supabase still checks
      // it is a JWT this project issued before the function ever runs.
      const res = await fetch(`${functionsBaseUrl}/ai-coach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({
          message: question,
          history: messages,
          context: coachContext({ health, sleep, scores: ordered, workouts, journal, findings, plan, profile }),
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || `Request failed (${res.status}).`);
      setMessages([...outgoing, { role: 'assistant', content: body.reply }]);
    } catch (error) {
      setChatError(error.message);
      setMessages(outgoing);
    } finally {
      setSending(false);
    }
  };

  if (!plan?.length) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="No training plan yet"
        body="The trainer writes each session against the day you have planned. Tell it which days are gym and which are cricket and it will take it from there."
        action={
          <Link to="/plan">
            <Button>Set up your week</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <Prescription session={session} readiness={readiness} />

      <Card delay={60}>
        <CardHeader
          title="Ask the coach"
          subtitle="Answers come from your own numbers, not the internet"
          icon={Sparkles}
        />
        <CardBody className="space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-full border px-2.5 py-1.5 text-[11px] transition-colors hover:border-accent hover:text-accent"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          {messages.map((m, i) => (
            <div
              key={`${m.role}-${i}`}
              className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={clsx(
                  'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs leading-relaxed',
                  m.role === 'user' ? 'bg-accent text-white' : 'bg-[color:var(--bg-elevated)]'
                )}
                style={m.role === 'assistant' ? { border: '1px solid var(--border)' } : undefined}
              >
                {m.content}
              </div>
            </div>
          ))}

          {sending ? (
            <p className="muted flex items-center gap-2 text-xs">
              <Loader2 size={13} className="animate-spin" aria-hidden="true" /> Thinking…
            </p>
          ) : null}

          {chatError ? (
            <p
              className="rounded-xl px-2.5 py-2 text-[11px] leading-relaxed"
              style={{ background: '#ef444414', color: '#ef4444' }}
            >
              {chatError}
            </p>
          ) : null}

          <div ref={endRef} />

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
            className="flex items-end gap-2"
          >
            <TextArea
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about today or this week…"
              className="min-h-[44px] flex-1 !resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  ask(draft);
                }
              }}
            />
            <Button type="submit" disabled={!draft.trim() || sending} aria-label="Send">
              <Send size={15} />
            </Button>
          </form>
        </CardBody>
      </Card>

      <Link to="/insights" className="block">
        <Card delay={100}>
          <CardBody className="flex items-center gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15">
              <Sparkles size={17} className="text-accent" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {findings.length} things your own history says
              </p>
              <p className="muted text-xs">
                Mined from {days.toLocaleString()} days of readings, not from a textbook.
              </p>
            </div>
            <ChevronRight size={18} className="muted shrink-0" />
          </CardBody>
        </Card>
      </Link>
    </div>
  );
}
