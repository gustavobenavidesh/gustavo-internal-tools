/**
 * Two concentric rings. Lucide's `Target` adds a third (a centre dot) and
 * `Disc2` keeps a dot too, so this is drawn to match their geometry — 24px box,
 * 2px stroke — without it.
 */
export function TargetRings({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}
