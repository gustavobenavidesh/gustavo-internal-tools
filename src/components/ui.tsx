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
import { Resizer } from "@/components/resizer";
import { cn } from "@/lib/utils";

/**
 * The squircle surface for an element that can't be clipped to the shape itself —
 * which is most of them: a clip path eats `outline`, and `outline` is what
 * `:focus-visible` draws, so anything focusable has to keep its box intact. This
 * sits behind the content instead and paints the fill, the 1px edge and
 * optionally the shadow.
 *
 * The host needs `relative` and a `--sq-radius`, plus `isolate` unless it passes
 * a `layer` of its own — see that prop. The colours are set here
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
  layer = "-z-10",
}: {
  face?: string;
  edge?: string;
  /** A `squircle-shadow-*` utility, or any `drop-shadow` via `--sq-shadow`. */
  shadow?: string;
  grain?: boolean;
  /** For hover and state variants, which belong on the painted surface. */
  surfaceClassName?: string;
  /**
   * Where the plate sits in its host's stack. The default goes behind, which
   * needs the host to be `isolate` so it doesn't fall through to whatever is
   * under that — and `isolation` creates a backdrop root, which leaves a
   * `backdrop-filter` on this plate with nothing behind it to sample. A frosted
   * surface passes `z-0` instead and lets the host's content paint over it in DOM
   * order, so nothing between here and the page needs isolating.
   */
  layer?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("squircle-plate", layer, shadow)}
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
    // The edge matches the fill rather than being left unset. `squircle-surface`
    // paints the edge across the whole shape and insets the face by a pixel over
    // it, so with no edge a filled button carries a 1px transparent frame —
    // invisible on the canvas, a white outline once it's on the glass sheet.
    surface:
      "[--sq-face:var(--color-accent)] [--sq-edge:var(--color-accent)] group-hover:[--sq-face:var(--color-accent-ink)] group-hover:[--sq-edge:var(--color-accent-ink)]",
  },
  subtle: {
    root: "text-ink",
    surface:
      "[--sq-face:var(--color-surface)] [--sq-edge:var(--color-hairline)] group-hover:[--sq-face:var(--color-panel-raised)]",
  },
  ghost: {
    root: "text-ink-soft hover:text-ink",
    surface:
      "group-hover:[--sq-face:color-mix(in_oklab,#000_5%,transparent)]",
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

/**
 * Sentence case, not caps. The wide tracking went with it — that was there to
 * open up letterspacing that only uppercase needs.
 */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1.5 block text-[11px] font-medium text-ink-faint">
      {children}
    </span>
  );
}

/**
 * How far a two-finger swipe has to carry the sheet before letting go dismisses
 * it. Short enough to feel like a flick, past anything a stray horizontal wobble
 * during a vertical scroll would reach.
 */
const SWIPE_DISMISS = 96;

/**
 * A trackpad swipe has no end event, so the gesture is over once the wheel stops
 * arriving. Long enough to bridge the gap between deliveries mid-swipe, short
 * enough that letting go springs back immediately.
 */
const SWIPE_IDLE_MS = 140;

/**
 * A sheet down the right-hand side rather than a box in the middle.
 *
 * A task belongs to the column it's in, and a centred dialog covers the board it
 * came from to say so. This keeps the board in view beside it — column, position,
 * neighbours — and blurs it rather than dimming it, so what's behind reads as
 * present but out of focus instead of switched off.
 *
 * Full height less the gutter it sits in, so it floats in the window the way the
 * board card does rather than butting against three edges. The header and footer
 * hold still and only the middle scrolls, which a centred dialog didn't need when
 * it was sized to its content.
 */
export function Modal({
  open,
  onClose,
  onClosed,
  onCommit,
  title,
  children,
  footer,
}: {
  /** False starts the slide-out; `onClosed` fires when it has finished. */
  open: boolean;
  onClose: () => void;
  onClosed?: () => void;
  /** An outside press that switches the sheet rather than closing it. */
  onCommit?: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  /**
   * How far a two-finger swipe has carried the sheet, and whether one is still
   * running — `swiping` turns the transition off so the sheet tracks the fingers
   * rather than easing after them.
   */
  const [swipe, setSwipe] = useState({ x: 0, swiping: false });
  const gesture = useRef<{ x: number; timer: ReturnType<typeof setTimeout> | null }>(
    { x: 0, timer: null },
  );

  /**
   * Two fingers across a trackpad arrive as `wheel` with a horizontal delta, so
   * the sheet can follow them one to one. Rightward is negative under natural
   * scrolling — fingers right, content right — hence the sign; it's the one thing
   * to flip if this comes out backwards.
   *
   * Only when the gesture is more sideways than vertical, or the sheet would edge
   * across every time the body is scrolled. Never leftward: there's nowhere for it
   * to go, and the clamp at zero is what makes a swipe back cancel cleanly.
   *
   * Attached by hand, and that's the whole point of the effect. React registers
   * `wheel` passively at its root, so a handler given to `onWheel` *cannot* cancel
   * the event — and a sideways two-finger swipe that nobody cancels is how Safari
   * is asked to go back a page. The sheet would follow the fingers while the
   * browser started its own back gesture underneath, which is what the fighting
   * was. A non-passive listener on the sheet itself can say no.
   *
   * Cancelled on every sideways wheel this sees, including the ones too small to
   * move the sheet: Safari decides a gesture is a navigation from how it starts,
   * so leaving the first few events uncancelled loses the argument before the
   * sheet has moved a pixel.
   */
  useEffect(() => {
    const el = panel.current;
    if (!el || !open) return;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      // Sideways, over the sheet: ours, and nothing else's — not the page's.
      e.preventDefault();

      const x = Math.max(0, Math.min(gesture.current.x - e.deltaX, 800));
      gesture.current.x = x;
      if (gesture.current.timer) clearTimeout(gesture.current.timer);

      if (x >= SWIPE_DISMISS) {
        // Left where the fingers put it, with no transition, so the exit animation
        // carries on from there instead of springing back first.
        setSwipe({ x, swiping: true });
        gesture.current = { x: 0, timer: null };
        onClose();
        return;
      }

      setSwipe({ x, swiping: true });
      gesture.current.timer = setTimeout(() => {
        gesture.current = { x: 0, timer: null };
        setSwipe({ x: 0, swiping: false });
      }, SWIPE_IDLE_MS);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, onClose]);

  // Reopening before the exit finishes would otherwise start the new sheet
  // wherever the last swipe left it.
  useEffect(() => {
    if (open) setSwipe({ x: 0, swiping: false });
    gesture.current = { x: 0, timer: null };
    return () => {
      if (gesture.current.timer) clearTimeout(gesture.current.timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    // Closing on an outside press rather than a full-screen backdrop, which would
    // have to sit over the board and would swallow its scrolling with it.
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || panel.current?.contains(target)) return;

      // A press on another card is a switch, not a dismissal: the click behind
      // this will point the sheet at that card, so it stays where it is and swaps
      // what's in it. Closing here instead would start the sheet leaving and then
      // bring it straight back from off screen. Anything typed in it still has to
      // be committed, which is what `onCommit` is for.
      if (target.closest("[data-card]")) {
        onCommit?.();
        return;
      }
      onClose();
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose, onCommit]);

  if (typeof document === "undefined") return null;

  return createPortal(
    // `pointer-events-none` on the frame, restored on the sheet: the board keeps
    // every one of its own — scrolling, hovering, dragging — while this is open,
    // which is the point of a sheet beside it rather than a dialog over it. No
    // `aria-modal` for the same reason; the rest of the app isn't inert.
    <div className="pointer-events-none fixed inset-0 z-50 flex justify-end p-2">
      {/* Two layers, because both want `transform` and a CSS animation wins over
          an inline style — so a swipe written onto the animated element would be
          ignored outright. The outer one carries the gesture and the sizing, the
          inner one the arrival and departure.
          `max-w` for the narrow window, where the stored width would hang off the
          left edge and take the gutter with it. */}
      <div
        ref={panel}
        role="dialog"
        aria-label="Task"
        // `overscroll-none` as well as the cancelled wheel: the first stops a scroll
        // inside the sheet from chaining out to the page, the second stops the page
        // reading the gesture as a swipe back. Both, because they cover different
        // halves of it — chaining, and navigation.
        className="pointer-events-auto flex h-full w-[var(--sheet-width)] max-w-[calc(100vw-1rem)] overscroll-none"
        style={{
          transform: swipe.x ? `translateX(${swipe.x}px)` : undefined,
          transition: swipe.swiping
            ? undefined
            : "transform 260ms cubic-bezier(0.2, 0.8, 0.3, 1)",
        }}
      >
        <div
          // `animationend` bubbles, so anything animating inside the sheet would
          // otherwise report it as having finished leaving.
          onAnimationEnd={(e) => {
            if (!open && e.target === e.currentTarget) onClosed?.();
          }}
          className={cn(
            // No `isolate`, and the shadow is a box-shadow on this unclipped root
            // rather than a `drop-shadow` on the plate — see the plate's `layer`.
            // Both of those would otherwise make this element a backdrop root and
            // there'd be nothing for the glass to blur.
            // Weighted downward on purpose. The sheet's top edge is eight points
            // from the window's, and this app runs installed — anything the
            // shadow throws upward lands in the strip where the page meets
            // Safari's title bar and gets cut flat. A shadow spills up by
            // `blur / 2 + spread - offsetY`, which this keeps at -14.
            "relative flex h-full w-full flex-col rounded-[var(--corner-panel)] shadow-[0_24px_60px_-20px] shadow-shade/25",
            open ? "animate-slide-in-right" : "animate-slide-out-right",
          )}
          style={
            {
              "--sq-radius": "var(--corner-panel)",
            } as CSSProperties
          }
        >
          {/* Frosted, so the board shows through the sheet rather than around it.
              The blur sits on the surface itself, which is the element clipped to
              the superellipse, so it stops at the corners like the fill does.

              Both tones carry alpha, because whatever the surface paints lands *on
              top* of the blurred backdrop: an opaque fill would hide it. The edge is
              a dark tint rather than the hairline colour — over a board that's
              already light, a light hairline on glass disappears. At 14% it lands
              around the app's `hairline-strong`, which is what it takes for a single
              pixel to hold an edge that has the board showing through on both sides
              of it; a fixed token can't, because what's behind this one moves.

              The blur and the fill are one dial between them. A heavy white veil
              over a wide blur is just a white panel: the board is behind it, but
              smeared past recognising, so nothing reads as glass. Less white and a
              tighter radius makes what's behind legible as the board — cards and
              columns still identifiable through it — which is the point of the
              material. Both trade against ink contrast, so this is about as far as
              they go before the text starts to sit on the board rather than on the
              sheet.

              Whiteness is the other two, and neither costs any opacity. The fill is
              already pure white, so what tints the sheet is the board coming
              through it — mostly the priority pills, which is why this saturates
              *down*: it was boosting them to 1.6 and painting the glass with them.
              The brightness lifts what's left towards white. Between them the sheet
              reads whiter at the same 62%. */}
          <Plate
            layer="z-0"
            face="color-mix(in oklab, var(--color-panel-raised) 62%, transparent)"
            edge="color-mix(in oklab, var(--color-ink) 14%, transparent)"
            surfaceClassName="backdrop-blur-[14px] backdrop-saturate-[0.9] backdrop-brightness-[1.08]"
          />

          {/* Its left edge is the resize handle — the sheet is pinned to the right,
              so this is the only side that can move. Straddles the edge on a
              negative offset so the grab strip costs no width. */}
          <Resizer
            label="Resize task sheet"
            cssVar="--sheet-width"
            storageKey="board:sheet-width"
            min={320}
            max={760}
            initial={400}
            // Pinned right, so the width is the cursor's distance from the
            // sheet's far edge — the window less the gutter it floats in. That 8
            // is the frame's `p-2`, and the `max-w` above is twice it; the three
            // have to agree or the left edge drifts from the cursor.
            measure={(e) => window.innerWidth - 8 - e.clientX}
            className="absolute inset-y-0 -left-1.5 z-10 w-3"
            lineClassName="inset-y-4 rounded-full"
          />

          {/* Above the plate by DOM order rather than z-index, which is what lets
              the root skip `isolate`. */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            {/* Centred, not top-aligned: the close button is taller than a line of
                the title, so pinning both to the top left the pencil beside the
                title sitting a few pixels above the cross. The title is a
                single-line input, so there's no wrapping case where centring would
                drift. Less padding below than above, since the taller button still
                pushes the rule away from the words. */}
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-hairline px-6 pb-4 pt-5">
              <div className="min-w-0 flex-1">{title}</div>
              <IconButton label="Close" onClick={onClose}>
                <X className="size-4" />
              </IconButton>
            </div>
            {/* The only part that scrolls. `min-h-0` so it can actually shrink
                inside the flex column — without it the body sizes to its content
                and pushes the footer off the bottom of the sheet. */}
            <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {children}
            </div>
            {footer ? (
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-hairline px-6 py-4">
                {footer}
              </div>
            ) : null}
          </div>
        </div>
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

/**
 * The one thing that speaks from the bottom of the screen. `alert` is for a write
 * the server refused, `status` for the quieter running commentary — a card folded
 * into another, a ⌘Z — which shouldn't interrupt a screen reader mid-sentence.
 */
export function Toast({
  tone = "notice",
  children,
}: {
  tone?: "notice" | "error";
  children: ReactNode;
}) {
  const error = tone === "error";

  return (
    <div
      role={error ? "alert" : "status"}
      className={cn(
        // Above the modal's own z-50: `Modal` portals to the body, so at equal
        // depth it would paint over this — and "close the card first to undo" is
        // a message you only see while a card is open.
        "fixed bottom-4 left-1/2 isolate z-[60] -translate-x-1/2 animate-pop-in rounded-[var(--corner-chip)] text-xs shadow-lg shadow-shade/8",
        error ? "text-rose-900" : "text-ink-soft",
      )}
      style={{ "--sq-radius": "var(--corner-chip)" } as CSSProperties}
    >
      <Plate
        face={error ? "var(--color-rose-50)" : "var(--color-panel-raised)"}
        edge={
          error
            ? "color-mix(in oklab, var(--color-rose-600) 25%, transparent)"
            : "var(--color-hairline-strong)"
        }
      />
      <div className="squircle flex items-center gap-2 px-3 py-2">{children}</div>
    </div>
  );
}

/**
 * A pill, wherever one appears — the contexts and priority on a card, and the
 * same two in the task sheet. Shared because it's one shape showing the same data
 * in both places, and the sheet's copy had drifted a size larger.
 *
 * Fixed height rather than padding-derived: an icon-only pill (the card's docked
 * `+`) has no text line box, so it would otherwise come out shorter than its
 * neighbours and the docked pair wouldn't line up.
 */
export const PILL =
  "inline-flex h-5 max-w-full items-center gap-1 rounded-full px-2 text-[10px] font-medium leading-none ring-1 ring-inset";

/**
 * Keyboard hints — shared so the search field and the New task button match.
 *
 * Opaque, not a black tint. A tint composes with whatever is behind it, so the
 * same class rendered a light chip on the white button and an almost invisible
 * dark one inside the search pill: identical code, different key. These two are
 * what `black/5` and its ring already computed to on white, to a couple of
 * points, so nothing moves where it was already right.
 */
/**
 * The half pixel in the padding is the letter sitting low in its own line box.
 * `leading-none` makes the box the font's size, but a capital only fills the part
 * of it between the baseline and the cap height — the descender space below stays
 * empty, so splitting the padding evenly centres the *box* and leaves the glyph
 * riding high in it. Four and a half above against three and a half below puts it
 * back, at the same overall height, which is why it's written as a pair rather
 * than as a nudge.
 */
export const KBD =
  "rounded-md bg-panel px-1.5 pb-[3.5px] pt-[4.5px] text-[10px] font-medium leading-none text-ink-faint ring-1 ring-inset ring-hairline";

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
