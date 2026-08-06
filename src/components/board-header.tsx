"use client";

import { ListFilter, Plus, Search, X } from "lucide-react";
import {
  type CSSProperties, type RefObject, useState
} from "react";
import { Button, IconButton, Input, KBD, Plate, useDismiss } from "@/components/ui";
import { PRIORITIES, type Priority } from "@/db/schema";
import { PRIORITY_STYLES, labelColor } from "@/lib/colors";
import type { ClientLabel } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Filters = {
  query: string;
  priorities: Priority[];
  labelIds: string[];
  hideDone: boolean;
  /** A context id, `"none"` for cards without one, or null for everything. */
  contextId: string | null;
};

export const emptyFilters: Filters = {
  query: "",
  priorities: [],
  labelIds: [],
  hideDone: false,
  contextId: null,
};

type Props = {
  labels: ClientLabel[];
  filters: Filters;
  searchRef: RefObject<HTMLInputElement | null>;
  onFiltersChange: (filters: Filters) => void;
  onAddColumn: () => void;
};

export function BoardHeader({
  labels,
  filters,
  searchRef,
  onFiltersChange,
  onAddColumn,
}: Props) {
  const activeFilterCount =
    filters.priorities.length +
    filters.labelIds.length +
    (filters.hideDone ? 1 : 0);

  return (
    // Equal `1fr` side columns centre the search field independently of how
    // wide the controls on the right get, then the translate shifts it from the
    // header's centre to the viewport's — the header starts after the sidebar.
    <header className="relative z-30 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2.5 px-0 pb-3 pt-1">
      <span aria-hidden />

      {/* Search and Filter travel together, so the translate centres the pair on
          the viewport rather than the field alone. */}
      <div className="flex items-center gap-2.5 -translate-x-[calc((var(--sidebar-width)_-_var(--board-gutter))/2)]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
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
            className="h-8 w-[26rem] rounded-full bg-white/35 pl-[38px] pr-8 shadow-[0_1px_22px_-2px] shadow-shade/10 placeholder:text-ink-faint"
          />
          {filters.query ? (
            <IconButton
              label="Clear search"
              onClick={() => onFiltersChange({ ...filters, query: "" })}
              className="absolute right-1 top-1/2 size-7 -translate-y-1/2 rounded-full"
            >
              <X className="size-3.5" />
            </IconButton>
          ) : (
            <kbd
              className={cn(
                KBD,
                "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2",
              )}
            >
              S
            </kbd>
          )}
        </div>

        <FilterMenu
          labels={labels}
          filters={filters}
          activeCount={activeFilterCount}
          onChange={onFiltersChange}
        />
      </div>

      <div className="flex items-center gap-2.5 justify-self-end">
        <button
          type="button"
          onClick={onAddColumn}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-ink-faint transition-colors hover:bg-black/5 hover:text-ink-soft"
        >
          <Plus className="size-3.5" /> Column
        </button>
      </div>
    </header>
  );
}

function FilterMenu({
  labels,
  filters,
  activeCount,
  onChange,
}: {
  labels: ClientLabel[];
  filters: Filters;
  activeCount: number;
  onChange: (filters: Filters) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <div className="relative" ref={ref}>
      {/* Dressed as the search field rather than as a button, since the two now
          read as one control. An active filter shows in the text and count
          instead of a filled background, which would break the pairing. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-white/35 px-3.5 text-[13px] font-medium shadow-[0_1px_22px_-2px] shadow-shade/10 ring-1 ring-hairline transition-colors hover:bg-white/60",
          activeCount > 0
            ? "text-accent-ink"
            : "text-ink-faint hover:text-ink-soft",
        )}
      >
        <ListFilter className="size-3.5" />
        Filter
        {activeCount > 0 && (
          <span className="rounded bg-accent/12 px-1 font-mono text-[10px] text-accent-ink">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-9 z-40 isolate w-64 animate-pop-in space-y-3 rounded-[var(--corner-menu)] p-3 shadow-xl shadow-shade/15"
          style={{ "--sq-radius": "var(--corner-menu)" } as CSSProperties}
        >
          <Plate face="var(--color-panel-raised)" edge="var(--color-hairline)" />
          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-faint">
              Priority
            </p>
            <div className="flex flex-wrap gap-1">
              {PRIORITIES.filter((p) => p !== "none").map((priority) => (
                <button
                  key={priority}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...filters,
                      priorities: toggle(filters.priorities, priority),
                    })
                  }
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                    filters.priorities.includes(priority)
                      ? cn(
                          "bg-canvas ring-hairline-strong",
                          PRIORITY_STYLES[priority].chip,
                        )
                      : "text-ink-faint ring-hairline hover:text-ink",
                  )}
                >
                  {PRIORITY_STYLES[priority].label}
                </button>
              ))}
            </div>
          </div>

          {labels.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] uppercase tracking-wider text-ink-faint">
                Labels
              </p>
              <div className="flex flex-wrap gap-1">
                {labels.map((label) => (
                  <button
                    key={label.id}
                    type="button"
                    onClick={() =>
                      onChange({
                        ...filters,
                        labelIds: toggle(filters.labelIds, label.id),
                      })
                    }
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                      filters.labelIds.includes(label.id)
                        ? labelColor(label.color).chip
                        : "text-ink-faint ring-hairline hover:text-ink",
                    )}
                  >
                    {label.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
            <input
              type="checkbox"
              checked={filters.hideDone}
              onChange={(e) =>
                onChange({ ...filters, hideDone: e.target.checked })
              }
              className="size-3.5 accent-[var(--color-accent)]"
            />
            Hide completed tasks
          </label>

          {activeCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={() =>
                onChange({ ...emptyFilters, query: filters.query })
              }
            >
              Clear filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
