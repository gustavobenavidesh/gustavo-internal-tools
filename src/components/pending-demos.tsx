"use client";

import { ChevronDown, MonitorPlay } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Plate } from "@/components/ui";
import { BULLET, bulleted, readDemos, writeDemos } from "@/lib/pending-demos";
import { cn } from "@/lib/utils";

/**
 * A note in the board's bottom-right corner for things waiting to be demoed.
 *
 * Quiet on purpose: it sits over the board rather than in it, so anything with a
 * heavy fill or a deep shadow would read as a column that had come loose.
 *
 * Nearly opaque, though — the first pass was proper glass at nine tenths, and a
 * card's title showing through a list of names is noise, not subtlety. What's
 * behind stays *sensed* rather than read: a hint of blur at the edge, enough to
 * say the panel is floating, not enough to make you pick your own words out of
 * someone else's.
 *
 * Editable in place — no edit mode, no save button. It's a scrap of paper.
 *
 * Bulleted by typing rather than by markup: Enter opens the next line with a
 * bullet, and the first character typed into an empty note gets one. The value
 * stays plain text with the bullets in it, which keeps the store a string and means
 * a line can be un-bulleted by deleting two characters — a real list would need a
 * contenteditable, and a contenteditable for four lines of names is a bad trade.
 */
export function PendingDemos() {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(true);
  /**
   * Read after mount, like every other device-held piece of state here: the
   * server can't know what's in it, and rendering a guess would be a hydration
   * mismatch.
   */
  const mounted = useRef(false);
  useEffect(() => {
    setText(readDemos());
    mounted.current = true;
  }, []);

  /**
   * The note is as tall as what's in it. A textarea has no intrinsic height — it
   * takes whatever `rows` says and keeps its own scrollbar — so the height is
   * measured and written back on every change: collapse to nothing first, then
   * take the content's own `scrollHeight`, which is the only way to get a figure
   * that can shrink as well as grow.
   *
   * The padding is inside that measurement, so the buffer under the last line comes
   * along for free rather than having to be added back — and it's deeper than the
   * sides, because a list that stops flush against the bottom edge looks cut off
   * where the same gap beside it looks deliberate. Capped before it can
   * take over the corner of the board, at which point it keeps its scrollbar after
   * all.
   */
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [text, open]);

  return (
    <div
      // The app's continuous corner, same as every other surface — a plain radius
      // next to a board full of squircles reads as a stranger.
      //
      // No `isolate`, and the plate takes `z-0` rather than sitting behind: both
      // are what keep the blur alive. `isolation` creates a backdrop root, and a
      // `backdrop-filter` under one has nothing left to sample. The shadow stays a
      // `box-shadow` on this unclipped root for the same reason a filter can't be
      // used for it.
      className="absolute bottom-3 right-3 z-20 w-[276px] rounded-[var(--corner-card)] shadow-[0_6px_20px_-8px] shadow-shade/35"
      style={{ "--sq-radius": "var(--corner-card)" } as CSSProperties}
    >
      {/* The edge is the fill, not unset. `squircle-surface` paints the edge across
          the whole shape and insets the face a pixel over it, so leaving it out
          doesn't mean "no edge" — it means a one-pixel transparent frame, which on
          a light board reads as a white outline drawn round the panel. The same
          trap the primary button documents. */}
      <Plate
        layer="z-0"
        face="var(--color-note)"
        edge="var(--color-note)"
        surfaceClassName="backdrop-blur-sm"
      />
      {/* The whole header is the collapse control. A floating panel that can't get
          out of the way is in the way, and a separate button for it would be more
          chrome than the panel itself has. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        // Even padding, so the row is centred in the panel when it's the only
        // thing in it. The asymmetric version was balancing the header against the
        // text underneath and left the title sitting high once that text was gone.
        className="relative flex w-full items-center gap-1.5 px-4 py-3 text-left text-[11px] font-medium text-note-ink/60 transition-colors hover:text-note-ink"
      >
        {/* A screen with a play mark on it — the thing a demo happens on, and the
            same weight of glyph the sidebar's fact card wears above its own
            heading. A step smaller than the chevron opposite it, since one is a
            label and the other is a control. */}
        <MonitorPlay aria-hidden className="size-3.5 shrink-0" />
        {/* One line, always. The panel is wide enough for the title as it stands,
            and `whitespace-nowrap` is the guard for the next time it grows: a
            two-line heading over a one-line list reads as the note's contents
            rather than its name. */}
        <span className="whitespace-nowrap">Pending Demos &amp; Announcements</span>
        <ChevronDown
          aria-hidden
          // Points the way it would go: down to open the note, up to fold it away.
          className={cn(
            "ml-auto size-3 transition-transform duration-300 ease-out",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </button>

      {/* Height rather than display, so opening and closing are a movement instead
          of a jump. `grid-template-rows` from 0fr to 1fr is what animates an
          unknown height without measuring it — the row is the textarea's natural
          size at both ends, and the fraction between them is what moves.

          Eased out, and a touch longer closing than opening: a panel that folds
          away instantly reads as having been dismissed rather than put down. */}
      <div
        className={cn(
          "relative grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <textarea
            ref={field}
            value={text}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const el = e.currentTarget;
              const { selectionStart: from, selectionEnd: to, value } = el;
              const next = `${value.slice(0, from)}\n${BULLET}${value.slice(to)}`;
              // Written onto the element before React hears about it, so the caret
              // can be placed in the same tick. Deferring that to a frame later
              // loses whatever is typed in between: the next keystroke lands at the
              // old position and the caret jumps over it afterwards, which turned
              // "maggie" into "aggie" with the m stranded at the end of the line.
              el.value = next;
              const caret = from + 1 + BULLET.length;
              el.setSelectionRange(caret, caret);
              setText(next);
              writeDemos(next);
            }}
            onChange={(e) => {
              // The first character typed into an empty note opens the list.
              const raw = e.target.value;
              // Only the line being typed on is left alone, so a marker can be
              // deleted without it growing straight back. Everything else — pasted
              // lines, and whatever was in the note before it had bullets — is
              // brought into line.
              const caretLine = raw.slice(0, e.target.selectionStart).split("\n").length - 1;
              const value = raw
                .split("\n")
                .map((line, i) =>
                  i === caretLine || !line.trim() || line.startsWith(BULLET)
                    ? line
                    : BULLET + line,
                )
                .join("\n");
              setText(value);
              // Straight to the device on every keystroke. It's a few hundred bytes
              // written synchronously, and the alternative — a debounce — is the
              // thing that loses the last sentence when a window goes away.
              if (mounted.current) writeDemos(value);
            }}
            placeholder="What's waiting to be shown?"
            rows={1}
            spellCheck={false}
            className="block max-h-[220px] w-full resize-none overflow-y-auto bg-transparent px-4 pb-5 text-[12px] leading-relaxed text-note-ink outline-none scrollbar-none placeholder:text-note-ink/35"
          />
        </div>
      </div>
    </div>
  );
}
