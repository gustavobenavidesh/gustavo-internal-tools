"use client";

import { Resizer } from "@/components/resizer";

/**
 * The gap between the sidebar and the board card, as a drag handle. It writes
 * `--sidebar-width`, which the sidebar reads for its width — and which the
 * search field reads to stay centred on the viewport — so one variable keeps
 * everything in step.
 */
export function SidebarResizer() {
  return (
    <Resizer
      label="Resize sidebar"
      cssVar="--sidebar-width"
      storageKey="board:sidebar-width"
      min={180}
      max={420}
      initial={236}
      // The sidebar starts at the window edge, so the cursor's distance from it
      // *is* the width.
      measure={(e) => e.clientX}
      // Negative margin on *both* sides, so the 12px grab strip straddles the
      // seam and takes up no layout width at all. With `-mr-1.5` alone it still
      // contributed 6px, which is why the board card sat further from the
      // sidebar than the window edges do. The hover line lands in the same place
      // either way: dead on the board card's left edge.
      className="relative z-20 -mx-1.5 w-3 shrink-0"
    />
  );
}
