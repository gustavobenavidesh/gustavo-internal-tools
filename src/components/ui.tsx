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

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "subtle" | "danger";
  size?: "sm" | "md";
};

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-ink shadow-sm shadow-accent/25 disabled:bg-accent/40",
  subtle: "bg-surface text-ink hover:bg-panel-raised ring-1 ring-hairline",
  ghost: "text-ink-soft hover:text-ink hover:bg-black/5",
  danger: "text-rose-700 hover:text-rose-800 hover:bg-rose-500/10",
};

export function Button({
  variant = "subtle",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "h-7 px-2 text-xs" : "h-9 px-3 text-sm",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
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
          "relative w-full animate-pop-in rounded-2xl bg-canvas shadow-2xl shadow-shade/20 ring-1 ring-hairline",
          width,
        )}
      >
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
      style={{ position: "fixed", ...style }}
      // A portal escapes the DOM tree but NOT the React tree: without stopping
      // these, a click on a menu item still bubbles to the card that rendered
      // the trigger, opening the task dialog and starting a drag.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="z-50 max-h-64 animate-pop-in overflow-y-auto rounded-xl bg-panel-raised p-1.5 shadow-xl shadow-shade/20 ring-1 ring-hairline"
    >
      {children}
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
