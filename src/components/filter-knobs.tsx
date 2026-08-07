/**
 * Three tracks with a ring riding each one — the control-knob filter mark.
 *
 * Drawn by hand because Lucide's `SlidersHorizontal` handles are vertical tick
 * bars (`M14 3v4`), not rings, and nothing else in the set is close. Same reason
 * `priority-bars.tsx` and `target-rings.tsx` exist.
 *
 * Each track is split either side of its knob rather than run underneath it, so
 * the ring reads as a hole in the line at any size — a track passing behind an
 * unfilled circle would show through it and turn the knob into a bead.
 */
/**
 * Two tracks, sitting symmetrically about the centre line rather than the three
 * a slider icon usually carries — at 16px the third track closed the gaps up
 * until the rings started to merge into it. Knobs on opposite sides so the pair
 * reads as adjustable rather than as a list.
 */
const ROWS = [
  { y: 8, knob: 15 },
  { y: 16, knob: 9 },
];

const TRACK_START = 3;
const TRACK_END = 21;
const RADIUS = 2.25;
/** Radius plus a hair, so the track stops just clear of the ring's stroke. */
const GAP = RADIUS + 1.15;

export function FilterKnobs({
  className,
  strokeWidth = 2,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      aria-hidden
      className={className}
    >
      {ROWS.map(({ y, knob }) => (
        <g key={y}>
          <path d={`M${TRACK_START} ${y}H${knob - GAP}`} />
          <path d={`M${knob + GAP} ${y}H${TRACK_END}`} />
          <circle cx={knob} cy={y} r={RADIUS} />
        </g>
      ))}
    </svg>
  );
}
