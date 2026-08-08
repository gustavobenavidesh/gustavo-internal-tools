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

/** Ahead of everything else in a column — where new cards go. */
export function positionBefore(first?: number | null): number {
  return first == null ? STEP : first - STEP;
}

/**
 * A card title cut down to fit in a sentence — the toast quotes two of them at
 * once, so each is clipped rather than the line being allowed to run. Cut in code
 * rather than with `text-overflow`, which would truncate the whole sentence and
 * take the second title with it.
 */
export function clipTitle(title: string, max = 26) {
  const trimmed = title.trim();
  return trimmed.length > max
    ? `${trimmed.slice(0, max - 1).trimEnd()}…`
    : trimmed;
}

/**
 * Ties the last two words together with a non-breaking space so a title can
 * never wrap to a lone word. `text-wrap: pretty` does this natively but only in
 * recent browsers, and only as a preference — this is deterministic.
 */
export function noOrphans(text: string) {
  return text.replace(/\s+(\S+)\s*$/, "\u00A0$1");
}
