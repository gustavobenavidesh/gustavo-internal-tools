"use client";

import { Plus, Search, X } from "lucide-react";
import type { RefObject } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { IconButton, Input, KBD } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * What's hidden right now. Two things, and both of them are picked somewhere
 * other than a filter panel: the search field here, and the context chosen in
 * the sidebar.
 *
 * There used to be a third — a menu of priority chips, label chips and a
 * "hide completed" box behind the knobs glyph. It went unused: the sidebar
 * already answers "what is this about", search answers "where is that card",
 * and nobody reaches for "show me only the high-priority ones" on a board they
 * can see all of. A panel of controls nobody opens is still a control you have
 * to read past every time you look at the toolbar.
 */
export type Filters = {
  query: string;
  /** A context id, `"none"` for cards without one, or null for everything. */
  contextId: string | null;
};

export const emptyFilters: Filters = {
  query: "",
  contextId: null,
};

type Props = {
  filters: Filters;
  searchRef: RefObject<HTMLInputElement | null>;
  onFiltersChange: (filters: Filters) => void;
  onAddColumn: () => void;
};

export function BoardHeader({
  filters,
  searchRef,
  onFiltersChange,
  onAddColumn,
}: Props) {
  return (
    // Equal `1fr` side columns centre the search field independently of how
    // wide the controls on the right get, then the translate shifts it from the
    // header's centre to the viewport's — the header starts after the sidebar.
    <header className="relative z-30 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2.5 px-0 pb-2.5 pt-1">
      <span aria-hidden />

      {/* The translate centres the field on the viewport rather than on the
          header, which starts after the sidebar. */}
      <div className="flex items-center -translate-x-[calc((var(--sidebar-width)_-_var(--board-gutter))/2)]">
        <div className="relative">
          {/* Icon and text are a step down from the app's usual sizes. The pill
              is the widest thing in the toolbar and can't be much narrower and
              still be a search field, so what makes it recede is the type inside
              it rather than the box. */}
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-well-ink" />
          {/* The one control in the app that cuts *into* its background rather
              than sitting on it: everywhere else an input is `panel-raised`, but
              those are inside a panel, and this one is out on the bare canvas
              with nothing behind it to be raised above. A well needs no edge —
              the fill carries it, so the inherited hairline comes off and the
              focus ring is the only one left.

              A mid grey, and a deliberately soft one: the icon, the placeholder
              and what you type are plain white on it, which comes to 2.6:1 —
              under what you'd ship to other people, and chosen anyway, because
              this is a single-user board and the pill wanted to stay quiet. The
              contrast follows the fill, so lightening it further means the white
              has to give way to ink instead. It's the app's one inverted surface,
              so everything inside is keyed off white rather than ink. */}
          <Input
            ref={searchRef}
            value={filters.query}
            placeholder="Search tasks"
            onChange={(e) =>
              onFiltersChange({ ...filters, query: e.target.value })
            }
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onFiltersChange({ ...filters, query: "" });
                e.currentTarget.blur();
              }
            }}
            // Hover deepens, which on this one *raises* contrast against the
            // white inside it — the opposite of what it did while the fill was
            // light, and the reason the two numbers swapped places.
            className="h-8 w-[22rem] rounded-full bg-well pl-[34px] pr-8 text-[13px] text-well-ink ring-transparent transition-colors hover:bg-well-hover hover:ring-transparent placeholder:text-well-ink"
          />
          {filters.query ? (
            <IconButton
              label="Clear search"
              onClick={() => onFiltersChange({ ...filters, query: "" })}
              // Takes the key cap's place, so it lights the same way rather than
              // darkening into the well the way the shared button does.
              className="absolute right-1 top-1/2 size-7 -translate-y-1/2 rounded-full text-well-ink hover:bg-well-cap hover:text-well-ink"
            >
              <X className="size-3.5" />
            </IconButton>
          ) : (
            /* The shared cap's shape and type, in this field's own colours. It used
               to be the chip verbatim, on the principle that two keys for two
               shortcuts should look like the same kind of thing — but that was
               written while this field was a light well. Inverted, the opaque light
               chip became the brightest thing in the header, a white tile floating
               on a grey pill.

               So it follows its surface rather than its twin: set *into* the fill
               rather than lifted off it, which is the right way round for a key —
               and the way that keeps it from competing with the placeholder for
               attention. Its glyph is a step under the white beside it for the same
               reason, and the ring comes off entirely: an edge is what holds a
               light chip against a light surface, and here the fill is doing that
               job on its own. A shape and a size hold the two caps together well
               enough without the fill having to match across two opposite
               surfaces. */
            <kbd
              className={cn(
                KBD,
                "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 bg-well-cap text-well-ink/80 ring-0",
              )}
            >
              S
            </kbd>
          )}
        </div>
      </div>

      {/* Tighter than the app's usual `gap-2.5`, because both of these carry their
          own padding — twelve points inside the button, eight inside the toggle —
          so the space you actually see between the word and the glyph is the gap
          plus twenty. At the standard gap they read as two separate controls that
          happen to share a corner rather than one cluster. */}
      <div className="flex items-center gap-0.5 justify-self-end">
        <button
          type="button"
          onClick={onAddColumn}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-ink-faint transition-colors hover:bg-tint hover:text-ink-soft"
        >
          <Plus className="size-3.5" /> Column
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
