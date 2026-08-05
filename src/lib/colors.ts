import type { Priority } from "@/db/schema";

/**
 * Class strings are written out in full because Tailwind only ships classes it
 * finds in source — `bg-${color}-500` would compile to nothing.
 *
 * Tuned for the beige canvas: a soft tint fill with dark text, since the pale
 * text used on dark UIs disappears here.
 */
export const LABEL_COLORS = {
  stone: { chip: "bg-stone-500/12 text-stone-700 ring-stone-600/20", dot: "bg-stone-500" },
  rose: { chip: "bg-rose-500/12 text-rose-800 ring-rose-600/20", dot: "bg-rose-500" },
  amber: { chip: "bg-amber-500/18 text-amber-800 ring-amber-700/20", dot: "bg-amber-500" },
  olive: { chip: "bg-lime-600/12 text-lime-800 ring-lime-700/20", dot: "bg-lime-600" },
  teal: { chip: "bg-teal-600/12 text-teal-800 ring-teal-700/20", dot: "bg-teal-600" },
  sky: { chip: "bg-sky-600/12 text-sky-800 ring-sky-700/20", dot: "bg-sky-600" },
  violet: { chip: "bg-violet-500/12 text-violet-800 ring-violet-600/20", dot: "bg-violet-500" },
  clay: { chip: "bg-orange-700/12 text-orange-900 ring-orange-800/20", dot: "bg-orange-700" },
} as const;

export type LabelColor = keyof typeof LABEL_COLORS;
export const LABEL_COLOR_KEYS = Object.keys(LABEL_COLORS) as LabelColor[];

export function labelColor(color: string) {
  return LABEL_COLORS[color as LabelColor] ?? LABEL_COLORS.stone;
}

export const PRIORITY_STYLES: Record<
  Priority,
  { label: string; bar: string; chip: string }
> = {
  none: { label: "None", bar: "bg-transparent", chip: "text-ink-faint" },
  low: { label: "Low", bar: "bg-sky-600/60", chip: "text-sky-800" },
  medium: { label: "Medium", bar: "bg-amber-500/80", chip: "text-amber-800" },
  high: { label: "High", bar: "bg-orange-600/85", chip: "text-orange-800" },
  urgent: { label: "Urgent", bar: "bg-rose-600", chip: "text-rose-800" },
};
