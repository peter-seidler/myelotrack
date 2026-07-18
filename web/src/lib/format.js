/** Formatting + small numeric/date utilities. */

/** Clamp `n` into the inclusive range [min, max]. */
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/** Format a Date for display. */
export const fmtDate = (date, options) =>
  date.toLocaleDateString(
    'en-US',
    options || { weekday: 'long', month: 'long', day: 'numeric' },
  );

/**
 * A Date `n` days before now, normalized to 09:00 local.
 * Used to build stable relative timestamps for seed data.
 */
export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(9, 0, 0, 0);
  return d;
}

/** "08:00" -> "8:00 AM". */
export function prettyTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const meridiem = h < 12 ? 'AM' : 'PM';
  const hour = ((h + 11) % 12) + 1;
  return `${hour}:${String(m).padStart(2, '0')} ${meridiem}`;
}

/** Whole numbers render bare; fractional values to one decimal place. */
export const formatVal = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
