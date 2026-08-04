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

/**
 * The list row's numeric date: "31/07/2026".
 *
 * Fixed to day/month/year rather than the locale's order, because it sits
 * inline in front of the preview text where a variable-width date would make
 * the previews fail to line up down the list.
 */
export function shortDate(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/**
 * Feed ages: "now", "4m", "3h", "6d", then the date.
 *
 * Terse rather than "6 days ago" because it sits beside a handle in a line
 * that is already carrying a name and an event, and because past about a week
 * the actual date is the more useful thing anyway.
 */
export function sinceThen(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;

  const days = Math.floor(seconds / 86400);
  return days < 7 ? `${days}d` : formatDay(iso, now);
}

/** The editor's meta line: "04/08/2026, 5:08 pm". */
export function editedAt(iso: string): string {
  const time = new Date(iso)
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    .toLowerCase();
  return `${shortDate(iso)}, ${time}`;
}
