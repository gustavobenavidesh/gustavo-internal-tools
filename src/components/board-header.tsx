"use client";

import { ChevronDown, KanbanSquare, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import Link from "next/link";
import { type RefObject, startTransition, useState } from "react";
import * as actions from "@/app/actions";
import { Button, IconButton, Input, useDismiss } from "@/components/ui";
import { PRIORITIES, type Priority } from "@/db/schema";
import { PRIORITY_STYLES, labelColor } from "@/lib/colors";
import type { ClientBoard, ClientLabel } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Filters = {
  query: string;
  priorities: Priority[];
  labelIds: string[];
  hideDone: boolean;
};

export const emptyFilters: Filters = {
  query: "",
  priorities: [],
  labelIds: [],
  hideDone: false,
};

type Props = {
  boards: ClientBoard[];
  boardId: string;
  boardName: string;
  labels: ClientLabel[];
  filters: Filters;
  searchRef: RefObject<HTMLInputElement | null>;
  taskCount: number;
  onFiltersChange: (filters: Filters) => void;
  onRename: (name: string) => void;
  onAddColumn: () => void;
};

export function BoardHeader({
  boards,
  boardId,
  boardName,
  labels,
  filters,
  searchRef,
  taskCount,
  onFiltersChange,
  onRename,
  onAddColumn,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(boardName);

  const activeFilterCount =
    filters.priorities.length + filters.labelIds.length + (filters.hideDone ? 1 : 0);

  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-hairline bg-panel/60 px-3 py-2.5">
      <BoardSwitcher boards={boards} boardId={boardId} />

      {renaming ? (
        <Input
          autoFocus
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            if (nameDraft.trim() && nameDraft !== boardName) onRename(nameDraft.trim());
            setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setNameDraft(boardName);
              setRenaming(false);
            }
          }}
          className="h-7 w-56 text-sm font-semibold"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setNameDraft(boardName);
            setRenaming(true);
          }}
          title="Click to rename"
          className="rounded px-1.5 py-0.5 text-sm font-semibold text-ink hover:bg-black/5"
        >
          {boardName}
        </button>
      )}

      <span className="font-mono text-[11px] tabular-nums text-ink-faint">
        {taskCount}
      </span>

      <div className="relative ml-auto">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
        <Input
          ref={searchRef}
          value={filters.query}
          placeholder="Search tasks"
          onChange={(e) => onFiltersChange({ ...filters, query: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              onFiltersChange({ ...filters, query: "" });
              e.currentTarget.blur();
            }
          }}
          className="h-8 w-56 pl-8 pr-7"
        />
        {filters.query ? (
          <IconButton
            label="Clear search"
            onClick={() => onFiltersChange({ ...filters, query: "" })}
            className="absolute right-0.5 top-1/2 size-6 -translate-y-1/2"
          >
            <X className="size-3.5" />
          </IconButton>
        ) : (
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-ink-ghost">
            /
          </kbd>
        )}
      </div>

      <FilterMenu
        labels={labels}
        filters={filters}
        activeCount={activeFilterCount}
        onChange={onFiltersChange}
      />

      <Button size="sm" variant="subtle" onClick={onAddColumn}>
        <Plus className="size-3.5" /> Column
      </Button>
    </header>
  );
}

function BoardSwitcher({
  boards,
  boardId,
}: {
  boards: ClientBoard[];
  boardId: string;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const ref = useDismiss(open, () => setOpen(false));

  const createBoard = () => {
    const trimmed = name.trim();
    if (!trimmed) return setCreating(false);
    // `createBoard` redirects to the new board, so no local state to update.
    startTransition(() => actions.createBoard(trimmed));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-ink-soft transition-colors hover:bg-black/5 hover:text-ink"
      >
        <KanbanSquare className="size-4 text-accent" />
        <ChevronDown className="size-3" />
      </button>

      {open && (
        <div className="absolute left-0 top-9 z-40 w-60 animate-pop-in rounded-xl bg-panel-raised p-1.5 shadow-xl shadow-[#3a332a]/15 ring-1 ring-hairline">
          <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-ink-faint">
            Boards
          </p>
          {boards.map((board) => (
            <Link
              key={board.id}
              href={`/board/${board.id}`}
              onClick={() => setOpen(false)}
              className={cn(
                "block truncate rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-black/5",
                board.id === boardId ? "font-semibold text-accent" : "text-ink",
              )}
            >
              {board.name}
            </Link>
          ))}

          <div className="my-1 h-px bg-hairline" />

          {creating ? (
            <Input
              autoFocus
              value={name}
              placeholder="Board name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createBoard();
                if (e.key === "Escape") setCreating(false);
              }}
              className="h-7 text-xs"
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-ink transition-colors hover:bg-black/5"
            >
              <Plus className="size-3.5" /> New board
            </button>
          )}

          {boards.length > 1 && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Delete this board and everything on it?")) {
                  startTransition(() => actions.deleteBoard(boardId));
                }
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-rose-700 transition-colors hover:bg-rose-500/10"
            >
              <Trash2 className="size-3.5" /> Delete this board
            </button>
          )}
        </div>
      )}
    </div>
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
      <Button
        size="sm"
        variant={activeCount > 0 ? "primary" : "subtle"}
        onClick={() => setOpen((v) => !v)}
      >
        <SlidersHorizontal className="size-3.5" />
        Filter
        {activeCount > 0 && (
          <span className="rounded bg-black/15 px-1 font-mono text-[10px]">
            {activeCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-9 z-40 w-64 animate-pop-in space-y-3 rounded-xl bg-panel-raised p-3 shadow-xl shadow-[#3a332a]/15 ring-1 ring-hairline">
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
                      ? cn("bg-canvas ring-hairline-strong", PRIORITY_STYLES[priority].chip)
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
              onChange={(e) => onChange({ ...filters, hideDone: e.target.checked })}
              className="size-3.5 accent-[var(--color-accent)]"
            />
            Hide completed tasks
          </label>

          {activeCount > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={() => onChange({ ...emptyFilters, query: filters.query })}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
