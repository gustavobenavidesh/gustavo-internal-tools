"use client";

import { Crosshair, ImagePlus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import * as actions from "@/app/actions";
import { IconButton } from "@/components/ui";
import type { Attachment } from "@/db/schema";

/** How wide an image is drawn on the canvas at 1:1, however large the file is. */
const DISPLAY = 300;

/** Each new one lands a little down and right of the last, so they don't hide. */
const CASCADE = 28;

/** Far enough out to see a wall of screenshots, far enough in to read one. */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * How much canvas there is, with the origin at its middle — so an image can sit at a
 * negative coordinate and still be somewhere real to scroll to.
 *
 * There's a size at all, rather than a genuinely endless plane, because the canvas
 * pans by *scrolling*: it's a real scroll container with a surface this big inside
 * it. That hands containment to the browser — `overscroll-behavior` keeps a scroll
 * from chaining out to the sheet on both axes — where a transform-panned canvas has
 * to cancel the event instead, and React registers wheel passively so it can't.
 * Momentum and rubber-banding come free with it.
 */
const WORLD = 8000;
const ORIGIN = WORLD / 2;

/** The smallest an image can be dragged to, in canvas units. */
const MIN_WIDTH = 60;

/**
 * How large an image is drawn. A stored `displayWidth` of zero means it has never
 * been resized, so it takes a readable default instead of a screenshot's full
 * retina width. Height always follows the natural aspect — it's never stored, which
 * is what makes squashing one impossible.
 */
const size = (item: Attachment) => {
  const width = item.displayWidth || Math.min(item.width, DISPLAY);
  return { width, height: (item.height * width) / (item.width || 1) };
};

/**
 * The dot grid's spacing on screen. It scales with the zoom so the texture moves
 * with the canvas rather than sitting on the glass in front of it — clamped at both
 * ends, since 24px of canvas is a haze at a quarter zoom and a scattering at three
 * times it.
 */
const DOT_STEP = 24;
const dotStep = (z: number) => Math.min(56, Math.max(14, DOT_STEP * z));

/**
 * The card's visual canvas: screenshots placed anywhere on it, panned and zoomed
 * inside a window of its own.
 *
 * Two layers. The viewport is the window — fixed height, clipped, and the thing
 * "self-contained" means. Inside it a world layer carries one transform, so the
 * view moves everything at once and each image only has to know its own place on
 * the canvas. Image coordinates never change when the view does, which is what
 * keeps a drag, a pan and a zoom from fighting over the same numbers: everything
 * that touches a position converts through `toWorld` first.
 *
 * Loaded on open rather than with the board: each row carries its image inline, so
 * the board's own read stays clear of them.
 */
export function VisualCanvas({
  taskId,
  readout,
}: {
  taskId: string;
  /**
   * Where to put the zoom percentage: an element above the canvas, owned by the
   * section around it. Portalled rather than passed upward as a value, so a pinch
   * re-renders this component and not the sheet holding it.
   */
  readout?: HTMLElement | null;
}) {
  const [items, setItems] = useState<Attachment[] | null>(null);
  /**
   * Only the zoom is state. The pan is the container's own `scrollLeft`/`scrollTop`,
   * which is the point of the rewrite: one source of truth for where the view is,
   * owned by the browser, rather than a transform to keep in step with a scroll.
   */
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<Attachment | null>(null);

  const viewport = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  /** Which image is being dragged, and where in it the pointer took hold. */
  const drag = useRef<{ id: string; grabX: number; grabY: number } | null>(null);
  /** A resize in progress: where it began, and how wide the image was then. */
  const sizing = useRef<{ id: string; fromX: number; width: number } | null>(
    null,
  );
  /** The live zoom, for listeners and helpers that subscribe once and stay. */
  const level = useRef(1);
  level.current = zoom;

  /**
   * Screen to canvas: add back what's scrolled out of view, take off the origin, and
   * undo the zoom. The origin comes off *before* the divide because the canvas is
   * scaled about its own middle rather than its top-left corner — see the surface.
   */
  const toWorld = (clientX: number, clientY: number) => {
    const el = viewport.current;
    if (!el) return { x: 0, y: 0 };
    const box = el.getBoundingClientRect();
    return {
      x: (clientX - box.left + el.scrollLeft - ORIGIN) / level.current,
      y: (clientY - box.top + el.scrollTop - ORIGIN) / level.current,
    };
  };

  /** Puts a canvas point in the middle of the window. */
  const centreOn = (x: number, y: number, z = level.current) => {
    const el = viewport.current;
    if (!el) return;
    el.scrollLeft = ORIGIN + x * z - el.clientWidth / 2;
    el.scrollTop = ORIGIN + y * z - el.clientHeight / 2;
  };

  /**
   * Zooms, keeping whatever is under `at` exactly where it is — the arithmetic that
   * makes a pinch feel like it's pulling the canvas rather than resizing a picture
   * of it. `to` is absolute because a pinch reports its scale cumulatively from
   * where the fingers started, not as a delta per event.
   */
  const zoomTo = (to: number, at?: { x: number; y: number }) => {
    const el = viewport.current;
    if (!el) return;
    const z = clampZoom(to);
    if (z === level.current) return;

    const box = el.getBoundingClientRect();
    const px = at ? at.x - box.left : el.clientWidth / 2;
    const py = at ? at.y - box.top : el.clientHeight / 2;
    // The canvas point under that spot, read before anything moves.
    const world = {
      x: (px + el.scrollLeft - ORIGIN) / level.current,
      y: (py + el.scrollTop - ORIGIN) / level.current,
    };

    level.current = z;
    /**
     * The scale and the scroll that compensates for it have to land in the same
     * frame, or the canvas paints once at its new scale against the old offset and
     * is dragged back afterwards — a lurch per event, which at gesture rate is the
     * whole pinch shaking. So the render is forced through here rather than left to
     * React's own schedule, and the scroll follows it inside the same event.
     *
     * Cheap now that it is: a scale and two scroll offsets, no layout.
     */
    flushSync(() => setZoom(z));
    el.scrollLeft = ORIGIN + world.x * z - px;
    el.scrollTop = ORIGIN + world.y * z - py;
  };

  /**
   * Every trackpad gesture over the canvas, attached by hand.
   *
   * Scrolling is driven from here rather than left to the container, because macOS
   * locks a native trackpad scroll to one axis and a canvas wants both. The window
   * stays a scroll container regardless: that's what holds the movement inside it,
   * and what makes it safe for this to cancel the default — the fallback if the
   * cancel doesn't take is doubled movement, not the sheet sliding away.
   *
   * Pinch is two paths because browsers disagree. Chrome sends `wheel` with
   * `ctrlKey` set; WebKit sends its own non-standard `gesturestart`/`gesturechange`
   * pair with a cumulative `scale` and no wheel event at all — so on the browser
   * this board runs in, only the gesture path fires. Unhandled, those zoom the whole
   * page.
   *
   * Those gesture events are raised for *any* two-finger gesture though, a plain
   * scroll included, and preventing one takes the wheel events after it down with
   * it. So a gesture is only claimed once its `scale` has actually moved.
   *
   * Subscribed once: everything below reads refs or updates state functionally, so
   * a handler from the first render behaves exactly like one from the latest.
   */
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;

    /** The spread a WebKit pinch began at, and whether one is running. */
    let base = 1;
    let pinching = false;

    const onWheel = (event: WheelEvent) => {
      /**
       * Nothing above this sees a wheel that happened over the canvas. The sheet
       * listens for one natively, on an ancestor of this — a sideways scroll here is
       * panning, not a swipe to dismiss the sheet it sits in, and stopping the
       * synthetic event can't say so: React's own listener is at the root of the
       * document, so by the time it runs the sheet's has long since fired.
       */
      event.stopPropagation();

      /**
       * A WebKit pinch in progress owns the zoom outright, and any wheel that
       * arrives under it is dropped — cancelled, so the page doesn't take it, but
       * not acted on.
       *
       * The two drive the zoom in incompatible ways: the gesture sets it absolutely
       * from the spread the fingers started at, a wheel nudges it relatively from
       * wherever it is. Interleaved, each gesture event throws away what the wheels
       * between them just did, so the zoom oscillates — and every oscillation drags
       * the view with it, since holding a point still under the fingers means a
       * scroll correction proportional to how far that point is off centre. Which is
       * why it looked fine in the middle of the window and threw the canvas around
       * at the edges.
       */
      if (pinching) {
        event.preventDefault();
        return;
      }

      // Chrome's pinch, and a held ⌘ or ⌃ with a mouse wheel.
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        zoomTo(level.current * Math.exp(-event.deltaY / 180), {
          x: event.clientX,
          y: event.clientY,
        });
        return;
      }

      /**
       * Scrolling driven by hand, both axes at once, because macOS locks a native
       * trackpad scroll to whichever direction the gesture started in — which is
       * right for a page and wrong for a canvas, where a diagonal drag should go
       * diagonally. Applying both deltas is the only way past that lock.
       *
       * It stays a scroll container even so, which is what makes this safe to do:
       * if the `preventDefault` here ever fails to take, the native scroll it was
       * suppressing is still contained by `overscroll-behavior` rather than
       * chaining out to the sheet. Doubled movement on one axis is a far softer
       * failure than the whole panel moving.
       */
      event.preventDefault();
      // Wheel deltas aren't always pixels: a mouse can report lines or pages.
      const unit =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? el.clientHeight : 1;
      el.scrollLeft += event.deltaX * unit;
      el.scrollTop += event.deltaY * unit;
    };

    /**
     * WebKit raises `gesturestart` for any two-finger gesture, a plain scroll
     * included — so this only remembers where the zoom began. Preventing here
     * swallows the wheel events that follow, which is what stopped panning.
     */
    const onStart = () => {
      base = level.current;
      pinching = false;
    };

    /**
     * And a scroll keeps `scale` at 1 throughout, so a pinch is the only thing that
     * gets claimed. Prevented only once it is one, since that's what stops Safari
     * zooming the page instead.
     *
     * Claimed once and then held for the rest of the gesture, rather than re-tested
     * each event: `scale` is cumulative from where the fingers started, so it reads
     * ~1 again every time a pinch passes back through the spread it began at. Testing
     * per event put a dead patch around that spread — the zoom stuck, then jumped
     * when the fingers cleared it, which is most of what a pinch here felt like.
     */
    const onChange = (event: Event) => {
      const gesture = event as Event & {
        scale: number;
        clientX: number;
        clientY: number;
      };
      if (!pinching) {
        if (Math.abs(gesture.scale - 1) < 0.005) return;
        pinching = true;
      }
      event.preventDefault();
      zoomTo(base * gesture.scale, {
        x: gesture.clientX,
        y: gesture.clientY,
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onStart, { passive: false });
    el.addEventListener("gesturechange", onChange, { passive: false });
    el.addEventListener("gestureend", onStart, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onStart);
      el.removeEventListener("gesturechange", onChange);
      el.removeEventListener("gestureend", onStart);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setZoom(1);
    level.current = 1;
    actions
      .listAttachments(taskId)
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
        // Eight thousand points of canvas, so open on the pictures rather than on
        // whichever corner the scroll happened to start in.
        requestAnimationFrame(() => {
          const first = rows[0];
          if (!first) return centreOn(0, 0, 1);
          const box = size(first);
          centreOn(first.x + box.width / 2, first.y + box.height / 2, 1);
        });
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this canvas");
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  /**
   * Reads an image off the clipboard and measures it, since the row stores its
   * natural size — the canvas scales down from that rather than waiting for a
   * decode to find out how tall a slot to leave.
   *
   * It lands in the middle of whatever the view is showing, stepped down and right
   * per image already there, so a run of pastes fans out instead of stacking into
   * one pile.
   */
  const add = async (blob: File) => {
    setBusy(true);
    setError(null);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });

      const natural = await new Promise<{ width: number; height: number }>(
        (resolve) => {
          const image = new Image();
          image.onload = () =>
            resolve({ width: image.naturalWidth, height: image.naturalHeight });
          // A shape it can still lay out if the decode fails.
          image.onerror = () => resolve({ width: 1200, height: 800 });
          image.src = data;
        },
      );

      const el = viewport.current;
      const box = el?.getBoundingClientRect();
      const step = ((items?.length ?? 0) % 6) * CASCADE;
      const width = Math.min(natural.width, DISPLAY);
      const height = (natural.height * width) / (natural.width || 1);
      // The middle of what's on screen, in canvas units, so it lands where you're
      // looking however far in or out the view is.
      const centre = toWorld(
        (box?.left ?? 0) + (el?.clientWidth ?? DISPLAY) / 2,
        (box?.top ?? 0) + (el?.clientHeight ?? 240) / 2,
      );
      const x = centre.x - width / 2 + step;
      const y = centre.y - height / 2 + step;

      const row = await actions.addAttachment(
        taskId,
        data,
        natural.width,
        natural.height,
        Math.round(x),
        Math.round(y),
      );
      setItems((current) => [...(current ?? []), row]);
    } catch (cause) {
      console.error(cause);
      setError(
        cause instanceof Error ? cause.message : "Couldn't add that image",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => {
    setItems((current) => (current ?? []).filter((item) => item.id !== id));
    setZoomed(null);
    actions.deleteAttachment(id).catch((cause) => {
      console.error(cause);
      setError("Couldn't remove that image");
    });
  };

  const images = (files: FileList | File[]) => {
    const picked = Array.from(files).filter((item) =>
      item.type.startsWith("image/"),
    );
    for (const image of picked) void add(image);
    return picked.length > 0;
  };

  /**
   * Back to 1:1 with the images in view, for a view that got lost. Resets the zoom
   * too, since a canvas you can't find your way around is usually both panned away
   * and scaled oddly.
   */
  const recentre = () => {
    level.current = 1;
    // Rendered synchronously so the surface is back at 1:1 before we scroll into it,
    // and the reset lands in one frame rather than flashing through a half-done one.
    flushSync(() => setZoom(1));
    const first = items?.[0];
    if (!first) return centreOn(0, 0, 1);
    const box = size(first);
    centreOn(first.x + box.width / 2, first.y + box.height / 2, 1);
  };

  return (
    <div className="relative">
      <div
        ref={viewport}
        // A real scroll container, which is the whole point: `overscroll-contain`
        // then keeps both axes inside this window with nothing to cancel, and the
        // sheet behind it never sees the gesture.
        className="scrollbar-none relative h-[22rem] overflow-auto overscroll-contain rounded-[calc(var(--sq-radius)-1px)]"
        tabIndex={0}
        aria-label="Visual canvas"
        // Keeping the sheet out of it is the hand-attached listener's job now — see
        // the `stopPropagation` there. `overscroll-contain` above is the other half:
        // it keeps the *scroll* in this window, where that stops the *event*.
        onPaste={(e) => {
          if (images(e.clipboardData.files)) e.preventDefault();
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          if (images(e.dataTransfer.files)) e.preventDefault();
        }}
        onPointerMove={(e) => {
          const stretch = sizing.current;
          if (stretch) {
            // In canvas units, so the edge follows the cursor at any zoom.
            const at = toWorld(e.clientX, e.clientY);
            const width = Math.max(MIN_WIDTH, stretch.width + (at.x - stretch.fromX));
            setItems((current) =>
              (current ?? []).map((item) =>
                item.id === stretch.id ? { ...item, displayWidth: width } : item,
              ),
            );
            return;
          }

          const held = drag.current;
          if (held) {
            // In canvas units, so the image stays under the cursor at any zoom —
            // the grab offset was taken in the same units.
            const at = toWorld(e.clientX, e.clientY);
            setItems((current) =>
              (current ?? []).map((item) =>
                item.id === held.id
                  ? { ...item, x: at.x - held.grabX, y: at.y - held.grabY }
                  : item,
              ),
            );
            return;
          }

        }}
        onPointerUp={() => {
          const stretch = sizing.current;
          if (stretch) {
            const resized = items?.find((item) => item.id === stretch.id);
            if (resized) {
              actions
                .resizeAttachment(stretch.id, Math.round(size(resized).width))
                .catch((cause) => {
                  console.error(cause);
                  setError("Couldn't save that size");
                });
            }
          }
          sizing.current = null;

          const held = drag.current;
          if (held) {
            const moved = items?.find((item) => item.id === held.id);
            if (moved) {
              actions
                .moveAttachment(held.id, Math.round(moved.x), Math.round(moved.y))
                .catch((cause) => {
                  console.error(cause);
                  setError("Couldn't save where that went");
                });
            }
          }
          drag.current = null;
        }}
      >
        {/* The scrollable surface, and a fixed size on purpose: the zoom does not
            touch it. That's what makes a pinch cost nothing but a scale — the
            container's scroll range never moves under the gesture, so there is no
            relayout per event and no offset to be clamped as the surface grows or
            shrinks. Panning it is still the browser's own scrolling.

            The dot grid rides on this rather than on the window, so it moves with
            the content instead of sitting on the glass in front, and it's placed
            from the origin so it scales about the same point the canvas does. */}
        <div
          className="relative"
          style={{
            width: WORLD,
            height: WORLD,
            backgroundImage:
              "radial-gradient(circle, color-mix(in oklab, var(--color-ink) 14%, transparent) 1px, transparent 1px)",
            backgroundSize: `${dotStep(zoom)}px ${dotStep(zoom)}px`,
            backgroundPosition: `${ORIGIN}px ${ORIGIN}px`,
          }}
        >
          {/* And the canvas itself: one transform for everything on it, scaled about
              the origin rather than the corner so the content stays gathered in the
              middle of the surface at any zoom. Every coordinate below is in canvas
              units — the scale is the only thing that knows about the zoom, which is
              what keeps this off the layout path entirely.

              `--z` rides along so the few things that must *not* scale with the
              canvas can divide it back out. */}
          <div
            className="absolute inset-0"
            style={
              {
                transform: `scale(${zoom})`,
                transformOrigin: `${ORIGIN}px ${ORIGIN}px`,
                "--z": zoom,
              } as React.CSSProperties
            }
          >
          {(items ?? []).map((item) => {
            const box = size(item);
            return (
              <div
                key={item.id}
                className="group/shot absolute"
                style={{
                  left: ORIGIN + item.x,
                  top: ORIGIN + item.y,
                  width: box.width,
                }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  // Off the container, which would otherwise begin a scroll.
                  e.stopPropagation();
                  e.preventDefault();
                  const at = toWorld(e.clientX, e.clientY);
                  drag.current = {
                    id: item.id,
                    grabX: at.x - item.x,
                    grabY: at.y - item.y,
                  };
                  viewport.current?.setPointerCapture(e.pointerId);
                }}
              >
                <img
                  src={item.data}
                  alt=""
                  width={item.width}
                  height={item.height}
                  // Its own drag would take over from ours.
                  draggable={false}
                  onDoubleClick={() => setZoomed(item)}
                  className="block w-full cursor-grab rounded-[10px] bg-panel-raised shadow-[0_2px_10px_-3px] shadow-shade/25 ring-1 ring-inset ring-hairline active:cursor-grabbing"
                  style={{ height: box.height }}
                />
                <IconButton
                  label="Remove image"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => remove(item.id)}
                  // Counter-scaled, like the grip below it: the canvas is a transform
                  // now, so a control left alone would grow and shrink with the
                  // picture it belongs to.
                  className="absolute right-1.5 top-1.5 size-6 origin-top-right [scale:calc(1/var(--z))] bg-panel-raised/90 opacity-0 shadow-sm shadow-shade/20 transition-opacity hover:text-danger group-hover/shot:opacity-100"
                >
                  <Trash2 className="size-3" />
                </IconButton>

                {/* The corner, for resizing. Counter-scaled so it keeps the same size
                    on screen at any zoom — a handle that shrank with its image would
                    eventually be unhittable. */}
                <button
                  type="button"
                  aria-label="Resize image"
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    e.preventDefault();
                    sizing.current = {
                      id: item.id,
                      fromX: toWorld(e.clientX, e.clientY).x,
                      width: box.width,
                    };
                    viewport.current?.setPointerCapture(e.pointerId);
                  }}
                  className="absolute -bottom-1 -right-1 size-3.5 origin-bottom-right [scale:calc(1/var(--z))] cursor-se-resize rounded-full border-2 border-panel-raised bg-accent opacity-0 transition-opacity group-hover/shot:opacity-100"
                />
              </div>
            );
          })}
          </div>
        </div>

        {/* `sticky` rather than `absolute`: the container scrolls, so an absolute
            overlay would sit at one spot on eight thousand points of canvas and be
            scrolled away from. */}
        {items !== null && items.length === 0 && (
          <button
            type="button"
            onClick={() => file.current?.click()}
            className="sticky left-0 top-0 flex h-[22rem] w-full flex-col items-center justify-center gap-1.5 text-xs text-ink-ghost transition-colors hover:text-ink-faint"
          >
            <ImagePlus className="size-4" />
            Paste or drop a screenshot
          </button>
        )}
        {items === null && (
          <p className="sticky left-0 top-0 grid h-[22rem] w-full place-items-center text-xs text-ink-ghost">
            Loading…
          </p>
        )}
      </div>

      {/* Over the window's bottom edge: adding and recentring belong to the canvas
          rather than to any one image on it. */}
      {items !== null && items.length > 0 && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          {busy && (
            <span className="mr-1 text-[11px] text-ink-ghost">Adding…</span>
          )}
          <IconButton
            label="Reset the view"
            onClick={recentre}
            className="size-6 bg-panel-raised/90 text-ink-faint shadow-sm shadow-shade/15"
          >
            <Crosshair className="size-3.5" />
          </IconButton>
          <IconButton
            label="Add an image"
            onClick={() => file.current?.click()}
            className="size-6 bg-panel-raised/90 text-ink-faint shadow-sm shadow-shade/15"
          >
            <ImagePlus className="size-3.5" />
          </IconButton>
        </div>
      )}

      {error && (
        <p className="px-3 pb-2 text-center text-[11px] text-danger">
          {error}
        </p>
      )}

      <input
        ref={file}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          images(e.target.files ?? []);
          e.target.value = "";
        }}
      />

      {/* No zoom buttons — a pinch does it. The readout stands in for them, up in
          the sheet's header, which is why it's a portal.

          Shown from the moment there's a canvas to measure, rather than only once
          the zoom is off 1:1. Hiding it at rest made sense when it floated in the
          corner of the picture, where it would have been one more thing over the
          image; in a header it just reads as missing, and something that appears
          mid-pinch is no use for telling you where you are before one. Still
          nothing on a card with no images, where there's nothing to be zoomed. */}
      {readout &&
        (items?.length ?? 0) > 0 &&
        createPortal(
          // Lighter than the label it sits beside, which is `ink-faint`.
          <span className="font-mono text-[10px] tabular-nums text-ink-ghost">
            {Math.round(zoom * 100)}%
          </span>,
          readout,
        )}

      {zoomed && <Lightbox item={zoomed} onClose={() => setZoomed(null)} />}
    </div>
  );
}

/**
 * Full size, over everything, on a double click. A screenshot of a thread is
 * unreadable at 300px, and being able to read them is the point of keeping them.
 */
function Lightbox({
  item,
  onClose,
}: {
  item: Attachment;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex animate-fade-in items-center justify-center bg-shade/70 p-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <img
        src={item.data}
        alt=""
        className="max-h-full max-w-full rounded-[var(--corner-card)] shadow-2xl shadow-shade/40"
        onClick={(e) => e.stopPropagation()}
      />
      <IconButton
        label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 size-8 text-white/70 hover:bg-white/15 hover:text-white"
      >
        <X className="size-4" />
      </IconButton>
    </div>
  );
}
