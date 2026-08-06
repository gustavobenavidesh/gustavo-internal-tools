"use client";

import { X } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * The squircle surface for an element that can't be clipped to the shape itself —
 * which is most of them: a clip path eats `outline`, and `outline` is what
 * `:focus-visible` draws, so anything focusable has to keep its box intact. This
 * sits behind the content instead and paints the fill, the 1px edge and
 * optionally the shadow.
 *
 * The host needs `relative isolate` and a `--sq-radius`. The colours are set here
 * rather than on the host on purpose: custom properties inherit, and a `--sq-face`
 * or `--sq-grain` left on a container leaks into every squircle nested inside it —
 * which is exactly how the featured column ended up tinting its own cards.
 */
export function Plate({
  face,
  edge,
  shadow,
  grain,
  surfaceClassName,
}: {
  face?: string;
  edge?: string;
  /** A `squircle-shadow-*` utility, or any `drop-shadow` via `--sq-shadow`. */
  shadow?: string;
  grain?: boolean;
  /** For hover and state variants, which belong on the painted surface. */
  surfaceClassName?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("squircle-plate -z-10", shadow)}
      style={
        {
          ...(face && { "--sq-face": face }),
          ...(edge && { "--sq-edge": edge }),
          ...(grain && { "--sq-grain": "var(--grain)" }),
        } as CSSProperties
      }
    >
      <div className={cn("squircle-surface size-full", surfaceClassName)} />
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "subtle" | "danger";
  size?: "sm" | "md";
};

/**
 * Split in two because the fill and the edge move onto the button's plate while
 * the text, and any shadow, stay on the button itself — it has to keep its box so
 * `:focus-visible` still has something to outline. `disabled:opacity-60` on the
 * root covers the plate too, since the plate is a child, which is why `primary`
 * no longer needs a separate disabled fill.
 */
const VARIANTS: Record<
  NonNullable<ButtonProps["variant"]>,
  { root: string; surface: string }
> = {
  primary: {
    root: "text-white shadow-sm shadow-accent/25",
    surface:
      "[--sq-face:var(--color-accent)] group-hover:[--sq-face:var(--color-accent-ink)]",
  },
  subtle: {
    root: "text-ink",
    surface:
      "[--sq-face:var(--color-surface)] [--sq-edge:var(--color-hairline)] group-hover:[--sq-face:var(--color-panel-raised)]",
  },
  ghost: {
    root: "text-ink-soft hover:text-ink",
    surface:
      "group-hover:[--sq-face:color-mix(in_oklab,var(--color-shade)_5%,transparent)]",
  },
  danger: {
    root: "text-rose-700 hover:text-rose-800",
    surface:
      "group-hover:[--sq-face:color-mix(in_oklab,var(--color-rose-500)_10%,transparent)]",
  },
};

export function Button({
  variant = "subtle",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "group relative isolate inline-flex items-center justify-center gap-1.5 rounded-[var(--corner-control)] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "h-7 px-2 text-xs" : "h-9 px-3 text-sm",
        VARIANTS[variant].root,
        className,
      )}
      style={{ "--sq-radius": "var(--corner-control)" } as CSSProperties}
      {...props}
    >
      <Plate
        surfaceClassName={cn("transition-colors", VARIANTS[variant].surface)}
      />
      {children}
    </button>
  );
}

export function IconButton({
  className,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md text-ink-faint transition-colors hover:bg-black/5 hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-lg bg-panel-raised px-2.5 text-sm text-ink ring-1 ring-hairline transition-colors placeholder:text-ink-ghost hover:ring-hairline-strong focus:ring-accent/60",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full resize-y rounded-lg bg-panel-raised p-2.5 text-sm leading-relaxed text-ink ring-1 ring-hairline transition-colors placeholder:text-ink-ghost focus:ring-accent/60",
        className,
      )}
      {...props}
    />
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-ink-faint">
      {children}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[8vh]">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 animate-fade-in cursor-default bg-shade/25 backdrop-blur-[2px]"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative isolate w-full animate-pop-in rounded-[var(--corner-panel)]",
          width,
        )}
        style={
          {
            "--sq-radius": "var(--corner-panel)",
          } as CSSProperties
        }
      >
        {/* Continuous corners: fill, hairline and shadow move onto a plate behind
            the panel, since a clip path on the panel itself would cut off the
            shadow it casts. `isolate` keeps the plate's negative z-index inside
            this box rather than sending it behind the backdrop. */}
        <Plate
          face="var(--color-canvas)"
          edge="var(--color-hairline)"
          shadow="squircle-shadow-2xl"
        />
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5">
          <div className="min-w-0 flex-1">{title}</div>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex items-center justify-between gap-3 border-t border-hairline px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * A menu pinned to an element but rendered in a portal, so the column's
 * `overflow-y-auto` can't clip it. Because it's `position: fixed`, any scroll
 * would detach it from its anchor — so scrolling closes it.
 */
export function AnchoredMenu({
  anchor,
  onClose,
  children,
  width = 184,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(rect.left, window.innerWidth - width - 8),
    );
    const spaceBelow = window.innerHeight - rect.bottom;

    // Flip above the pill when there isn't room for the menu underneath it.
    setStyle(
      spaceBelow < 220 && rect.top > spaceBelow
        ? { bottom: window.innerHeight - rect.top + 6, left, width }
        : { top: rect.bottom + 6, left, width },
    );
  }, [anchor, width]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  if (!style || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      style={
        {
          position: "fixed",
          ...style,
          "--sq-radius": "var(--corner-menu)",
        } as CSSProperties
      }
      // A portal escapes the DOM tree but NOT the React tree: without stopping
      // these, a click on a menu item still bubbles to the card that rendered
      // the trigger, opening the task dialog and starting a drag.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="isolate z-50 animate-pop-in rounded-[var(--corner-menu)] shadow-xl shadow-shade/20"
    >
      {/* The scroller moved to the inner element so this one can hold the plate:
          `absolute inset-0` inside a scrolling box resolves against the padding
          box, so the plate would slide away with the content. */}
      <Plate face="var(--color-panel-raised)" edge="var(--color-hairline)" />
      <div className="squircle max-h-64 overflow-y-auto p-1.5">{children}</div>
    </div>,
    document.body,
  );
}

/** Keyboard hints — shared so the search field and the New task button match. */
export const KBD =
  "rounded-md bg-black/5 px-1.5 py-1 text-[10px] font-medium leading-none text-ink-faint ring-1 ring-inset ring-black/5";

export const MENU_ITEM =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-ink transition-colors hover:bg-black/5";

/** Click-outside + Escape dismissal for header popovers. */
export function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return ref;
}
