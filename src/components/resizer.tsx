"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A drag handle that resizes something by writing a CSS variable.
 *
 * The variable is the whole interface: whoever cares about the width reads it in
 * CSS, so a drag costs one custom-property write and no React render. The width
 * lives in a ref for the same reason — nothing here re-renders while you drag
 * except the handle's own hover line.
 *
 * `measure` turns a pointer position into a width, which is the only thing that
 * differs between edges: the sidebar grows as the cursor moves right, a sheet on
 * the far side grows as it moves left.
 */
export function Resizer({
  label,
  cssVar,
  storageKey,
  min,
  max,
  initial,
  measure,
  className,
  lineClassName,
}: {
  label: string;
  cssVar: string;
  storageKey: string;
  min: number;
  max: number;
  initial: number;
  measure: (event: PointerEvent) => number;
  className?: string;
  lineClassName?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const width = useRef(initial);

  const apply = (value: number) => {
    document.documentElement.style.setProperty(cssVar, `${value}px`);
  };

  const clamp = (value: number) => Math.max(min, Math.min(max, value));

  // Restore in an effect rather than during render: the server has no idea
  // what's in localStorage, and reading it while rendering would mismatch.
  useEffect(() => {
    const saved = Number(localStorage.getItem(storageKey));
    if (Number.isFinite(saved) && saved >= min && saved <= max) {
      width.current = saved;
      document.documentElement.style.setProperty(cssVar, `${saved}px`);
    }
  }, [cssVar, storageKey, min, max]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      const next = clamp(measure(e));
      width.current = next;
      apply(next);
    };
    const stop = () => {
      setDragging(false);
      localStorage.setItem(storageKey, String(width.current));
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);

    // Without this the drag selects text across everything the cursor crosses.
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

  const set = (value: number) => {
    const next = clamp(value);
    width.current = next;
    apply(next);
    localStorage.setItem(storageKey, String(next));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width.current}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDoubleClick={() => set(initial)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") set(width.current - 16);
        if (e.key === "ArrowRight") set(width.current + 16);
      }}
      title="Drag to resize — double-click to reset"
      className={cn("group cursor-col-resize", className)}
    >
      <span
        aria-hidden
        // Full height in both states, so hovering previews exactly the boundary
        // the drag will move.
        className={cn(
          "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors",
          dragging ? "bg-accent" : "bg-transparent group-hover:bg-hairline-strong",
          lineClassName,
        )}
      />
    </div>
  );
}
