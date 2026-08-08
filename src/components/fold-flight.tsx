"use client";

import { useLayoutEffect, useRef } from "react";
import { TaskCardBody } from "@/components/task-card";
import type { ClientContext, ClientLabel, ClientTask } from "@/lib/types";

/**
 * How small the card gets on the way in. Small enough to read as "absorbed"
 * rather than "moved" — by the end it's about the size of the checklist tick it
 * turns into.
 */
const SHRINK_TO = 0.14;

const DURATION = 320;

export type Box = { top: number; left: number; width: number; height: number };

/**
 * A card being folded into another, mid-flight.
 *
 * The board has already dropped it by the time this renders — the reducer removed
 * it on the drop — so this copy of it is the only thing left saying where it
 * went. It's a plain fixed-position clone rather than the drag overlay: dnd-kit
 * owns that, and it has to keep the release animation it has for ordinary drops.
 */
export function FoldFlight({
  task,
  labels,
  contexts,
  from,
  to,
  onDone,
}: {
  task: ClientTask;
  labels: ClientLabel[];
  contexts: ClientContext[];
  /** Where the card was released, and the card it's being folded into. */
  from: Box;
  to: Box;
  onDone: () => void;
}) {
  const flyer = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = flyer.current;
    if (!el) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onDone();
      return;
    }

    // Centre to centre, so it collapses *into* the card that took it instead of
    // sliding to a corner and disappearing there.
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);

    const flight = el.animate(
      [
        { transform: "translate3d(0px, 0px, 0) scale(1)", opacity: 1 },
        {
          // Most of the shrink happens late, so the card reads as travelling
          // first and being swallowed second. Only the scale is held back — the
          // travel keeps to the single curve below, so the eye sees one motion
          // rather than a second acceleration halfway.
          transform: `translate3d(${dx * 0.72}px, ${dy * 0.72}px, 0) scale(0.74)`,
          opacity: 0.92,
          offset: 0.5,
        },
        {
          transform: `translate3d(${dx}px, ${dy}px, 0) scale(${SHRINK_TO})`,
          opacity: 0,
        },
      ],
      { duration: DURATION, easing: "cubic-bezier(.32,.72,.24,1)", fill: "forwards" },
    );

    // `finish` only, not the `finished` promise: that one rejects on cancel, and
    // a cancelled flight is one whose card is already gone.
    flight.addEventListener("finish", onDone);
    return () => flight.cancel();
  }, [from, to, onDone]);

  return (
    <div
      aria-hidden
      ref={flyer}
      // `will-change` from the first paint, so the layer exists before the
      // animation needs it — this card carries a shadow and a squircle plate,
      // which are the expensive things to composite per frame.
      className="pointer-events-none fixed z-[70] will-change-transform"
      style={{ top: from.top, left: from.left, width: from.width }}
    >
      {/* The same card the overlay was rendering, in the same state it was left
          in: `overlay` for the tilt and the accent edge, and the pulled-back
          scale it takes while aimed into a card. The flight starts from an
          untransformed wrapper, so its first frame is the overlay's last one and
          the handoff between the two is invisible. */}
      <TaskCardBody
        overlay
        className="scale-90 opacity-70"
        task={task}
        labels={labels}
        contexts={contexts}
      />
    </div>
  );
}
