import { format, parseISO, subDays, isValid, differenceInCalendarDays } from 'date-fns';

/** Canonical storage format for every `date` column: yyyy-MM-dd, local time. */
export const toKey = (date = new Date()) => format(date, 'yyyy-MM-dd');

export const todayKey = () => toKey(new Date());

/** Parses a yyyy-MM-dd key without the UTC shift `new Date(str)` would apply. */
export function fromKey(key) {
  if (!key) return new Date();
  const parsed = parseISO(key);
  return isValid(parsed) ? parsed : new Date();
}

export const shiftKey = (key, days) => toKey(subDays(fromKey(key), -days));

/** Inclusive list of the last `n` day-keys, oldest first. */
export function lastNDays(n, endKey = todayKey()) {
  const end = fromKey(endKey);
  return Array.from({ length: n }, (_, i) => toKey(subDays(end, n - 1 - i)));
}

export const prettyDate = (key) => format(fromKey(key), 'EEE, d MMM');
export const prettyDateLong = (key) => format(fromKey(key), 'EEEE, d MMMM yyyy');
export const shortDate = (key) => format(fromKey(key), 'd MMM');
export const chartTick = (key) => format(fromKey(key), 'd/M');

export function relativeDay(key) {
  const diff = differenceInCalendarDays(new Date(), fromKey(key));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  return prettyDate(key);
}

export const isFutureKey = (key) => fromKey(key) > new Date();

/** "7h 25m" from a decimal hours value. */
export function formatHours(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return '—';
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  if (mins === 60) return `${whole + 1}h 0m`;
  return `${whole}h ${String(mins).padStart(2, '0')}m`;
}

/** Converts "23:15" + "06:45" into decimal hours, handling the midnight wrap. */
export function hoursBetween(bedtime, wakeTime) {
  if (!bedtime || !wakeTime) return null;
  const [bh, bm] = bedtime.split(':').map(Number);
  const [wh, wm] = wakeTime.split(':').map(Number);
  if ([bh, bm, wh, wm].some((n) => !Number.isFinite(n))) return null;
  let minutes = wh * 60 + wm - (bh * 60 + bm);
  if (minutes <= 0) minutes += 24 * 60;
  return Number((minutes / 60).toFixed(2));
}
