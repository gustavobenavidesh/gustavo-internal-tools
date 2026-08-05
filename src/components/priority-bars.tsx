import type { Priority } from "@/db/schema";
import { cn } from "@/lib/utils";

const ACTIVE_BARS: Record<Priority, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Signal bars drawn by hand rather than with Lucide's `Signal*` icons, which
 * omit the inactive bars entirely — so "low" was a lone tick floating in the
 * pill. Here all three bars are always drawn and the inactive ones are faded,
 * which makes the level read as a proportion and keeps every priority the same
 * visual width.
 */
export function PriorityBars({
  level,
  className,
}: {
  level: Priority;
  className?: string;
}) {
  const active = ACTIVE_BARS[level];

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.75}
      strokeLinecap="round"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      {[0, 1, 2].map((i) => (
        <line
          key={i}
          x1={5.5 + i * 6}
          x2={5.5 + i * 6}
          y1={18.5 - i * 4.75}
          y2={18.5}
          strokeOpacity={i < active ? 1 : 0.25}
        />
      ))}
    </svg>
  );
}
