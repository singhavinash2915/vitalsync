import { useMemo, useRef, useState } from 'react';
import { Upload, FileJson, CheckCircle2, ClipboardPaste } from 'lucide-react';

import { parseHealthExport, COLUMN_LABELS } from '../lib/healthImport';
import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { prettyDate } from '../lib/dates';
import { Modal, Button, TextArea, Alert, Badge, Field } from './ui';

/** Days older than this aren't loaded into memory, so they can't be scored. */
const SCORING_WINDOW_DAYS = 120;

export default function ImportHealthModal({ open, onClose }) {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const importHealthExport = useDataStore((s) => s.importHealthExport);
  const saving = useDataStore((s) => s.saving);

  const [text, setText] = useState('');
  const [progress, setProgress] = useState(null);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const fileInput = useRef(null);

  const parsed = useMemo(() => (text.trim() ? parseHealthExport(text) : null), [text]);

  const outOfWindow = useMemo(() => {
    if (!parsed?.ok) return 0;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - SCORING_WINDOW_DAYS);
    const key = cutoff.toISOString().slice(0, 10);
    return parsed.days.filter((d) => d.date < key).length;
  }, [parsed]);

  const readFile = async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    // Clear the input's value straight away. Without this, picking the *same*
    // filename twice fires no change event at all — and Health Auto Export
    // reuses names — so a second import silently did nothing.
    input.value = '';

    if (!file) return;
    setResult(null);
    setFileName(file.name);
    try {
      setText(await file.text());
    } catch {
      setResult({ ok: false, message: `Could not read ${file.name}. Try pasting the contents instead.` });
    }
  };

  const pasteFromClipboard = async () => {
    try {
      setText(await navigator.clipboard.readText());
      setResult(null);
    } catch {
      // Clipboard read needs a user gesture and permission; the textarea is
      // always available as the fallback.
    }
  };

  const runImport = async () => {
    if (!parsed?.ok) return;
    setResult(null);
    setProgress({ done: 0, total: parsed.days.length });

    const outcome = await importHealthExport({
      userId: user.id,
      profile,
      days: parsed.days,
      workouts: parsed.workouts,
      onProgress: (done, total, table) => setProgress({ done, total, table }),
    });

    setProgress(null);
    setResult(outcome);
    if (outcome.ok) setText('');
  };

  const close = () => {
    setText('');
    setResult(null);
    setProgress(null);
    setFileName('');
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title="Import from Apple Health" size="lg">
      <div className="space-y-4">
        {!result ? (
          <>
            <Alert tone="info">
              Paste the JSON from <strong>Health Auto Export</strong>, an iOS Shortcut, or any
              export with dated values. Existing days are updated, not duplicated — importing the
              same file twice is safe.
            </Alert>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" icon={FileJson} onClick={() => fileInput.current?.click()}>
                Choose file
              </Button>
              <Button variant="secondary" icon={ClipboardPaste} onClick={pasteFromClipboard}>
                Paste
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json,text/plain,application/octet-stream"
                className="hidden"
                onChange={readFile}
              />
            </div>

            <Field
              label={fileName || 'JSON'}
              hint={text ? `${(text.length / 1024).toFixed(0)} kB` : undefined}
            >
              <TextArea
                rows={7}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setResult(null);
                }}
                placeholder={'{\n  "date": "2026-07-28",\n  "hrv": 62.4,\n  "resting_hr": 51\n}'}
                className="font-mono text-[11px]"
                spellCheck={false}
              />
            </Field>

            {parsed && !parsed.ok ? (
              <Alert tone="error">
                {parsed.error}
                {parsed.unrecognised.length ? (
                  <>
                    {' '}
                    Fields found: <code>{parsed.unrecognised.slice(0, 8).join(', ')}</code>.
                  </>
                ) : null}
              </Alert>
            ) : null}

            {parsed?.ok ? (
              <div
                className="rounded-xl border p-3"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-sunken)' }}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">Ready to import</span>
                  <Badge color="#22c55e">{parsed.format}</Badge>
                </div>

                <dl className="space-y-1 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="muted">Days</dt>
                    <dd className="font-semibold tabular-nums">{parsed.days.length}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="muted">Range</dt>
                    <dd className="font-semibold">
                      {prettyDate(parsed.dateRange[0])} → {prettyDate(parsed.dateRange[1])}
                    </dd>
                  </div>
                  {parsed.workouts?.length ? (
                    <div className="flex justify-between gap-2">
                      <dt className="muted">Workouts</dt>
                      <dd className="font-semibold tabular-nums">{parsed.workouts.length}</dd>
                    </div>
                  ) : null}
                </dl>

                <div className="mt-2 flex flex-wrap gap-1">
                  {parsed.metrics.map((m) => (
                    <Badge key={m} color="#38bdf8">
                      {COLUMN_LABELS[m] ?? m}
                    </Badge>
                  ))}
                </div>

                {parsed.dropped ? (
                  <p className="muted mt-2 text-[11px]">
                    {parsed.dropped} value{parsed.dropped > 1 ? 's' : ''} skipped for being outside a
                    plausible range.
                  </p>
                ) : null}

                {parsed.unrecognised.length ? (
                  <p className="muted mt-1 text-[11px]">
                    Ignored fields: <code>{parsed.unrecognised.slice(0, 6).join(', ')}</code>
                  </p>
                ) : null}

                {outOfWindow ? (
                  <p className="muted mt-2 text-[11px]">
                    {outOfWindow} day{outOfWindow > 1 ? 's are' : ' is'} older than{' '}
                    {SCORING_WINDOW_DAYS} days. They&apos;ll be stored, but scores and charts only
                    cover the recent window.
                  </p>
                ) : null}
              </div>
            ) : null}

            {progress ? (
              <div>
                <p className="muted mb-1 text-[11px]">
                  Writing {progress.table?.replace('_', ' ') ?? 'rows'} — {progress.done} of{' '}
                  {progress.total}
                </p>
                <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--track)' }}>
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={close}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                icon={Upload}
                disabled={!parsed?.ok}
                loading={saving}
                onClick={runImport}
              >
                Import {parsed?.ok ? `${parsed.days.length} days` : ''}
              </Button>
            </div>
          </>
        ) : result.ok ? (
          <div className="py-4 text-center">
            <CheckCircle2 size={36} className="mx-auto mb-3 text-score-excellent" aria-hidden="true" />
            <p className="text-sm font-semibold">Import complete</p>
            <p className="muted mt-1 text-xs">
              {result.health} health {result.health === 1 ? 'day' : 'days'}, {result.sleep} sleep{' '}
              {result.sleep === 1 ? 'night' : 'nights'}
              {result.workouts ? ` and ${result.workouts} workouts` : ''} written. All scores have
              been rebuilt.
            </p>
            <Button className="mt-4 w-full" onClick={close}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <Alert tone="error">{result.message}</Alert>
            <Button variant="secondary" className="w-full" onClick={() => setResult(null)}>
              Back
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
