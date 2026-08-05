import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Gap between generated positions. Large enough to insert between forever. */
const STEP = 1000;

/**
 * Fractional ordering: a moved item takes the midpoint of its new neighbours,
 * so a drag writes exactly one row instead of renumbering the whole column.
 */
export function positionBetween(before?: number, after?: number): number {
  if (before == null && after == null) return STEP;
  if (before == null) return after! - STEP;
  if (after == null) return before + STEP;
  return (before + after) / 2;
}

export function positionAtEnd(positions: number[]): number {
  return positions.length ? Math.max(...positions) + STEP : STEP;
}

/**
 * Ties the last two words together with a non-breaking space so a title can
 * never wrap to a lone word. `text-wrap: pretty` does this natively but only in
 * recent browsers, and only as a preference — this is deterministic.
 */
export function noOrphans(text: string) {
  return text.replace(/\s+(\S+)\s*$/, "\u00A0$1");
}
