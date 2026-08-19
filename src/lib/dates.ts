import { differenceInCalendarDays, format } from "date-fns";

/**
 * Due dates are day-granular, so everything here compares calendar days rather
 * than instants — a task due today is never "overdue" at 4pm.
 */
export function formatDue(timestamp: number) {
  const days = differenceInCalendarDays(new Date(timestamp), new Date());

  if (days < -1)
    return { text: `${Math.abs(days)}d overdue`, tone: "overdue" as const };
  if (days === -1) return { text: "Yesterday", tone: "overdue" as const };
  if (days === 0) return { text: "Today", tone: "today" as const };
  if (days === 1) return { text: "Tomorrow", tone: "soon" as const };
  if (days < 7)
    return { text: format(timestamp, "EEE"), tone: "soon" as const };
  return { text: format(timestamp, "MMM d"), tone: "later" as const };
}

export const DUE_TONES = {
  overdue: "text-danger bg-danger-face ring-danger/25",
  today: "text-warn-ink bg-warn-edge/40 ring-warn-edge",
  soon: "text-ink-soft bg-canvas ring-hairline",
  later: "text-ink-faint bg-canvas ring-hairline",
} as const;

/** `<input type="date">` speaks `yyyy-MM-dd` in local time. */
export function toDateInputValue(timestamp: number | null) {
  return timestamp ? format(timestamp, "yyyy-MM-dd") : "";
}

export function fromDateInputValue(value: string): number | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime();
}
