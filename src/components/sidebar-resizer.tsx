"use client";

import { useEffect, useRef, useState } from "react";

const MIN = 180;
const MAX = 420;
const DEFAULT = 236;
const STORAGE_KEY = "board:sidebar-width";

function apply(width: number) {
  document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
}

/**
 * The gap between the sidebar and the board card, as a drag handle. It writes
 * `--sidebar-width`, which the sidebar reads for its width — and which the
 * search field reads to stay centred on the viewport — so one variable keeps
 * everything in step.
 */
export function SidebarResizer() {
  const [dragging, setDragging] = useState(false);
  const width = useRef(DEFAULT);

  // Restore in an effect rather than during render: the server has no idea
  // what's in localStorage, and reading it while rendering would mismatch.
  useEffect(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(saved) && saved >= MIN && saved <= MAX) {
      width.current = saved;
      apply(saved);
    }
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const next = Math.max(MIN, Math.min(MAX, e.clientX));
      width.current = next;
      apply(next);
    };
    const stop = () => {
      setDragging(false);
      localStorage.setItem(STORAGE_KEY, String(width.current));
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);

    // Without this the drag selects text across the board as the cursor moves.
    const previousSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", stop);
      document.removeEventListener("pointercancel", stop);
      document.body.style.userSelect = previousSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [dragging]);

  const nudge = (by: number) => {
    const next = Math.max(MIN, Math.min(MAX, width.current + by));
    width.current = next;
    apply(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width.current}
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDoubleClick={() => {
        width.current = DEFAULT;
        apply(DEFAULT);
        localStorage.setItem(STORAGE_KEY, String(DEFAULT));
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") nudge(-16);
        if (e.key === "ArrowRight") nudge(16);
      }}
      title="Drag to resize — double-click to reset"
      className="group relative z-20 -mr-1.5 w-3 shrink-0 cursor-col-resize"
    >
      <span
        aria-hidden
        // Full height in both states, so hovering previews exactly the boundary
        // the drag will move.
        className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${
          dragging
            ? "bg-accent"
            : "bg-transparent group-hover:bg-hairline-strong"
        }`}
      />
    </div>
  );
}
