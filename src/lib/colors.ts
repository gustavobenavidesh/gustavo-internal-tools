import type { Priority } from "@/db/schema";

/**
 * Class strings are written out in full because Tailwind only ships classes it
 * finds in source — `bg-${color}-500` would compile to nothing.
 *
 * `chip` is a tinted fill with dark text, `dot` a solid swatch, and `text` the
 * hue on its own — used where a colour has to sit on the page background, like
 * a selected sidebar icon.
 */
export const LABEL_COLORS = {
  stone: {
    chip: "bg-stone-500/12 text-stone-700 ring-stone-600/20 dark:text-stone-300",
    dot: "bg-stone-500",
    text: "text-stone-700 dark:text-stone-300",
  },
  rose: {
    chip: "bg-rose-500/12 text-rose-800 ring-rose-600/20 dark:text-rose-300",
    dot: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-300",
  },
  amber: {
    chip: "bg-amber-500/18 text-amber-800 ring-amber-700/20 dark:text-amber-300",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-300",
  },
  olive: {
    chip: "bg-lime-600/12 text-lime-800 ring-lime-700/20 dark:text-lime-300",
    dot: "bg-lime-600",
    text: "text-lime-700 dark:text-lime-300",
  },
  teal: {
    chip: "bg-teal-600/12 text-teal-800 ring-teal-700/20 dark:text-teal-300",
    dot: "bg-teal-600",
    text: "text-teal-700 dark:text-teal-300",
  },
  sky: {
    chip: "bg-sky-600/12 text-sky-800 ring-sky-700/20 dark:text-sky-300",
    dot: "bg-sky-600",
    text: "text-sky-700 dark:text-sky-300",
  },
  violet: {
    chip: "bg-violet-500/12 text-violet-800 ring-violet-600/20 dark:text-violet-300",
    dot: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-300",
  },
  clay: {
    chip: "bg-orange-700/12 text-orange-900 ring-orange-800/20 dark:text-orange-300",
    dot: "bg-orange-700",
    text: "text-orange-800 dark:text-orange-300",
  },
} as const;

export type LabelColor = keyof typeof LABEL_COLORS;
export const LABEL_COLOR_KEYS = Object.keys(LABEL_COLORS) as LabelColor[];

export function labelColor(color: string) {
  return LABEL_COLORS[color as LabelColor] ?? LABEL_COLORS.stone;
}

/**
 * `chip` tints text only (segmented controls, filter buttons); `pill` is the
 * filled badge used on cards. `bar` is kept for anywhere a bare colour swatch
 * is needed.
 */
export const PRIORITY_STYLES: Record<
  Priority,
  { label: string; bar: string; chip: string; pill: string }
> = {
  none: {
    label: "None",
    bar: "bg-transparent",
    chip: "text-ink-faint",
    pill: "bg-tint text-ink-faint ring-tint",
  },
  low: {
    label: "Low",
    bar: "bg-sky-600/60",
    chip: "text-sky-800 dark:text-sky-300",
    pill: "bg-sky-600/10 text-sky-800 ring-sky-700/20 dark:bg-sky-400/15 dark:text-sky-200 dark:ring-sky-300/25",
  },
  medium: {
    label: "Medium",
    bar: "bg-amber-500/80",
    chip: "text-amber-800 dark:text-amber-300",
    pill: "bg-amber-500/18 text-amber-800 ring-amber-700/20 dark:bg-amber-400/15 dark:text-amber-200 dark:ring-amber-300/25",
  },
  // High is the top of the scale now, so it takes the strongest colour.
  high: {
    label: "High",
    bar: "bg-rose-600",
    chip: "text-rose-800 dark:text-rose-300",
    pill: "bg-rose-600/14 text-rose-900 ring-rose-700/25 dark:bg-rose-400/15 dark:text-rose-200 dark:ring-rose-300/25",
  },
};
