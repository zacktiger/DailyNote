/** Date wording for the UI: forward-looking, casual, never a countdown. */

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "Aug 5", with the year only when it isn't this year. */
export function formatDay(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** For list rows: "Today", "Yesterday", then "Aug 5" / "Aug 5, 2025". */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / DAY_MS);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return formatDay(iso, now);
}

/** For commitments: "today", "tomorrow", "Thursday" inside a week, else the date. */
export function comesBack(iso: string, now: Date = new Date()): string {
  const days = Math.round((startOfDay(new Date(iso)) - startOfDay(now)) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return new Date(iso).toLocaleDateString(undefined, { weekday: 'long' });
  return formatDay(iso, now);
}

/** The composer's dateline: "Sunday, August 3". */
export function todayHeading(now: Date = new Date()): string {
  return now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
