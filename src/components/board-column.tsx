"use client";

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  Check,
  Moon,
  MoreHorizontal,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button, IconButton, Input, Plate, useDismiss } from "@/components/ui";
import { TaskCard } from "@/components/task-card";
import type { Priority } from "@/db/schema";
import type {
  ClientColumn,
  ClientContext,
  ClientLabel,
  ClientTask,
} from "@/lib/types";
import { TargetRings } from "@/components/target-rings";
import { columnIcon, columnIconTone } from "@/lib/column-icons";
import { cn } from "@/lib/utils";

type Props = {
  column: ClientColumn;
  tasks: ClientTask[];
  labels: ClientLabel[];
  contexts: ClientContext[];
  /** Total before filtering, so a filtered column still shows what it holds. */
  totalCount: number;
  /** Controlled so the `n` shortcut can open the first column's composer. */
  composing: boolean;
  onComposingChange: (open: boolean) => void;
  onOpenTask: (taskId: string) => void;
  onSetTaskContexts: (taskId: string, contextIds: string[]) => void;
  onSetTaskPriority: (taskId: string, priority: Priority) => void;
  onToggleSubtask: (taskId: string, subtaskId: string, done: boolean) => void;
  onQuickAdd: (columnId: string, title: string) => void;
  onRename: (columnId: string, name: string) => void;
  onDelete: (columnId: string) => void;
  onSetWipLimit: (columnId: string, limit: number | null) => void;
  onToggleDone: (columnId: string, isDone: boolean) => void;
  onToggleMuted: (columnId: string, isMuted: boolean) => void;
  onToggleFocus: (columnId: string, isFocus: boolean) => void;
  onArchiveAll: (columnId: string) => void;
};

export function BoardColumn({
  column,
  tasks,
  labels,
  contexts,
  totalCount,
  composing,
  onComposingChange,
  onOpenTask,
  onSetTaskContexts,
  onSetTaskPriority,
  onToggleSubtask,
  onQuickAdd,
  onRename,
  onDelete,
  onSetWipLimit,
  onToggleDone,
  onToggleMuted,
  onToggleFocus,
  onArchiveAll,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id, data: { type: "column" } });

  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useDismiss(menuOpen, () => setMenuOpen(false));
  const listRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const [moreAbove, setMoreAbove] = useState(false);

  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
    setMoreAbove(el.scrollTop > 2);
  }, []);

  // Re-measure when the card list changes or the column is resized, not just on
  // scroll — adding a card can make a column overflow without any scrolling.
  useEffect(() => {
    measure();
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, tasks.length]);

  // The featured column gets the two-ring mark; everything else takes a Lucide
  // glyph from the name/flag mapping.
  const ColumnGlyph = column.isFocus ? TargetRings : columnIcon(column);
  const overLimit = column.wipLimit !== null && totalCount > column.wipLimit;
  const labelsById = new Map(labels.map((l) => [l.id, l]));

  return (
    <section
      ref={setNodeRef}
      style={
        {
          transform: CSS.Translate.toString(transform),
          transition,
          ...(column.isFocus && {
            "--sq-radius": "var(--corner-panel)",
          }),
        } as CSSProperties
      }
      className={cn(
        "flex h-full w-[312px] shrink-0 flex-col",
        // Only the featured column is a surface at all — the rest float
        // directly on the board with no fill and no ring, so emphasis comes
        // from what's absent everywhere else. Which is also why only it needs a
        // corner: a radius on a transparent box is invisible.
        column.isFocus && "relative isolate",
        isDragging && "opacity-40",
      )}
    >
      {/* Fill, hairline and paper, all following the continuous corner. `isolate`
          keeps the negative z-index inside this column, and is scoped to the
          featured one so the other columns don't gain a stacking context they
          have no use for. */}
      {column.isFocus && (
        <Plate face="var(--color-canvas)" edge="var(--color-hairline)" grain />
      )}
      <header className="flex items-center gap-1 px-3 pb-2.5 pt-3">
        {/* The status glyph is also the drag handle — a grip alongside it was
            just noise. */}
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`Reorder ${column.name}`}
          title={`Drag to reorder ${column.name}`}
          className="grid size-5 shrink-0 cursor-grab place-items-center active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <ColumnGlyph
            strokeWidth={column.isDone ? 2.5 : 2}
            className={cn(
              "size-4",
              // Matches the title: accent on the featured column, otherwise
              // the same tone as every other column icon.
              column.isFocus
                ? "text-accent"
                : (columnIconTone(column) ?? "text-ink-faint"),
            )}
          />
        </button>

        {renaming ? (
          <RenameField
            value={column.name}
            onCommit={(name) => {
              onRename(column.id, name);
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className={cn(
              "min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left font-semibold hover:bg-black/5",
              column.isFocus
                ? "text-sm text-accent"
                : "text-[13px] text-ink-soft",
            )}
            title="Click to rename"
          >
            {column.name}
          </button>
        )}

        <span
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums",
            overLimit ? "bg-amber-500/20 text-amber-800" : "text-ink-faint",
          )}
          title={
            column.wipLimit !== null
              ? `${totalCount} of ${column.wipLimit} (WIP limit)`
              : `${totalCount} tasks`
          }
        >
          {totalCount}
          {column.wipLimit !== null && `/${column.wipLimit}`}
        </span>

        <div className="relative" ref={menuRef}>
          <IconButton
            label={`${column.name} options`}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreHorizontal className="size-4" />
          </IconButton>
          {menuOpen && (
            <ColumnMenu
              column={column}
              taskCount={totalCount}
              onClose={() => setMenuOpen(false)}
              onRename={() => setRenaming(true)}
              onDelete={() => onDelete(column.id)}
              onSetWipLimit={(limit) => onSetWipLimit(column.id, limit)}
              onToggleDone={(isDone) => onToggleDone(column.id, isDone)}
              onToggleMuted={(isMuted) => onToggleMuted(column.id, isMuted)}
              onToggleFocus={(isFocus) => onToggleFocus(column.id, isFocus)}
              onArchiveAll={() => onArchiveAll(column.id)}
            />
          )}
        </div>
      </header>

      <div
        ref={listRef}
        onScroll={measure}
        style={
          {
            "--fade-top": moreAbove ? "26px" : "0px",
            "--fade-bottom": moreBelow ? "40px" : "0px",
          } as CSSProperties
        }
        className="fade-edges scrollbar-none min-h-0 flex-1 space-y-3.5 overflow-y-auto px-3 pb-3 pt-0.5"
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              labels={task.labelIds
                .map((id) => labelsById.get(id))
                .filter((l): l is ClientLabel => Boolean(l))}
              contexts={contexts}
              muted={column.isMuted}
              onOpen={onOpenTask}
              onSetContexts={onSetTaskContexts}
              onSetPriority={onSetTaskPriority}
              onToggleSubtask={onToggleSubtask}
            />
          ))}
        </SortableContext>

        {/* Only worth saying something when a filter is hiding the contents —
            an empty column speaks for itself. */}
        {tasks.length === 0 && totalCount > 0 && !composing && (
          <p className="px-3 py-6 text-center text-xs text-ink-faint">
            No matches here
          </p>
        )}

        {composing ? (
          <Composer
            onCancel={() => onComposingChange(false)}
            onSubmit={(title) => onQuickAdd(column.id, title)}
          />
        ) : (
          <button
            type="button"
            onClick={() => onComposingChange(true)}
            className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-ink-faint transition-colors hover:bg-black/5 hover:text-ink-soft"
          >
            <Plus className="size-3.5" /> Add task
          </button>
        )}
      </div>
    </section>
  );
}

function RenameField({
  value,
  onCommit,
  onCancel,
}: {
  value: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <Input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => (draft.trim() ? onCommit(draft) : onCancel())}
      onKeyDown={(e) => {
        if (e.key === "Enter" && draft.trim()) onCommit(draft);
        if (e.key === "Escape") onCancel();
      }}
      className="h-7 flex-1 text-[13px] font-semibold"
    />
  );
}

function Composer({
  onSubmit,
  onCancel,
}: {
  onSubmit: (title: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => ref.current?.focus(), []);

  const submit = () => {
    const title = draft.trim();
    if (!title) return onCancel();
    onSubmit(title);
    setDraft("");
    ref.current?.focus();
  };

  /**
   * Clicking away closes the composer and keeps whatever was typed — the same
   * "leaving commits" rule as the inline rename fields. Deliberately not
   * `useDismiss`: that also closes on Escape, which must discard, not save.
   */
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (wrapperRef.current?.contains(e.target as Node)) return;
      const title = draft.trim();
      if (title) onSubmit(title);
      onCancel();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [draft, onSubmit, onCancel]);

  return (
    <div
      ref={wrapperRef}
      className="relative isolate rounded-[var(--corner-card)] p-2.5"
      style={{ "--sq-radius": "var(--corner-card)" } as CSSProperties}
    >
      <Plate
        face="var(--color-panel-raised)"
        edge="color-mix(in oklab, var(--color-accent) 40%, transparent)"
      />
      <textarea
        ref={ref}
        rows={2}
        value={draft}
        placeholder="What needs doing?"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") onCancel();
        }}
        className="w-full resize-none bg-transparent text-[13px] leading-snug text-ink outline-none placeholder:text-ink-ghost"
      />
      <div className="mt-1 flex items-center gap-2">
        <Button size="sm" variant="primary" onClick={submit}>
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="ml-auto text-[10px] text-ink-faint">⏎ to add</span>
      </div>
    </div>
  );
}

function ColumnMenu({
  column,
  taskCount,
  onClose,
  onRename,
  onDelete,
  onSetWipLimit,
  onToggleDone,
  onToggleMuted,
  onToggleFocus,
  onArchiveAll,
}: {
  column: ClientColumn;
  taskCount: number;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSetWipLimit: (limit: number | null) => void;
  onToggleDone: (isDone: boolean) => void;
  onToggleMuted: (isMuted: boolean) => void;
  onToggleFocus: (isFocus: boolean) => void;
  onArchiveAll: () => void;
}) {
  const [limitDraft, setLimitDraft] = useState(
    column.wipLimit === null ? "" : String(column.wipLimit),
  );

  const item =
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-ink transition-colors hover:bg-black/5 disabled:opacity-40";

  return (
    <div
      className="absolute right-0 top-9 z-30 isolate w-56 animate-pop-in rounded-[var(--corner-menu)] p-2 shadow-xl shadow-shade/15"
      style={{ "--sq-radius": "var(--corner-menu)" } as CSSProperties}
    >
      <Plate face="var(--color-panel-raised)" edge="var(--color-hairline)" />
      <button
        type="button"
        className={item}
        onClick={() => {
          onRename();
          onClose();
        }}
      >
        Rename column
      </button>

      <button
        type="button"
        className={item}
        onClick={() => {
          onToggleDone(!column.isDone);
          onClose();
        }}
      >
        <Check className="size-3.5" />
        {column.isDone ? "Not a done column" : "Mark as done column"}
      </button>

      <button
        type="button"
        className={item}
        onClick={() => {
          onToggleFocus(!column.isFocus);
          onClose();
        }}
      >
        <Star className="size-3.5" />
        {column.isFocus ? "Stop featuring this column" : "Feature this column"}
      </button>

      <button
        type="button"
        className={item}
        onClick={() => {
          onToggleMuted(!column.isMuted);
          onClose();
        }}
      >
        <Moon className="size-3.5" />
        {column.isMuted ? "Show cards as active" : "Dim cards (parked)"}
      </button>

      <label className="mt-1 block px-2 py-1.5">
        <span className="text-[10px] uppercase tracking-wider text-ink-faint">
          WIP limit
        </span>
        <Input
          type="number"
          min={1}
          value={limitDraft}
          placeholder="none"
          onChange={(e) => setLimitDraft(e.target.value)}
          onBlur={() => {
            const parsed = Number.parseInt(limitDraft, 10);
            onSetWipLimit(
              Number.isFinite(parsed) && parsed > 0 ? parsed : null,
            );
          }}
          className="mt-1 h-7 text-xs"
        />
      </label>

      <div className="my-1 h-px bg-hairline" />

      <button
        type="button"
        className={item}
        disabled={taskCount === 0}
        onClick={() => {
          onArchiveAll();
          onClose();
        }}
      >
        <Archive className="size-3.5" />
        Archive all {taskCount > 0 && `(${taskCount})`}
      </button>

      <button
        type="button"
        className={cn(item, "text-rose-700 hover:bg-rose-500/10")}
        onClick={() => {
          if (
            taskCount === 0 ||
            confirm(`Delete "${column.name}" and its ${taskCount} task(s)?`)
          ) {
            onDelete();
          }
          onClose();
        }}
      >
        <Trash2 className="size-3.5" />
        Delete column
      </button>
    </div>
  );
}
