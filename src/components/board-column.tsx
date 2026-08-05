"use client";

import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  Check,
  GripVertical,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, IconButton, Input, useDismiss } from "@/components/ui";
import { TaskCard } from "@/components/task-card";
import type { ClientColumn, ClientLabel, ClientTask } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  column: ClientColumn;
  tasks: ClientTask[];
  labels: ClientLabel[];
  /** Total before filtering, so a filtered column still shows what it holds. */
  totalCount: number;
  /** Controlled so the `n` shortcut can open the first column's composer. */
  composing: boolean;
  onComposingChange: (open: boolean) => void;
  onOpenTask: (taskId: string) => void;
  onQuickAdd: (columnId: string, title: string) => void;
  onRename: (columnId: string, name: string) => void;
  onDelete: (columnId: string) => void;
  onSetWipLimit: (columnId: string, limit: number | null) => void;
  onToggleDone: (columnId: string, isDone: boolean) => void;
  onArchiveAll: (columnId: string) => void;
};

export function BoardColumn({
  column,
  tasks,
  labels,
  totalCount,
  composing,
  onComposingChange,
  onOpenTask,
  onQuickAdd,
  onRename,
  onDelete,
  onSetWipLimit,
  onToggleDone,
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

  const overLimit = column.wipLimit !== null && totalCount > column.wipLimit;
  const labelsById = new Map(labels.map((l) => [l.id, l]));

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex h-full w-[300px] shrink-0 flex-col rounded-2xl bg-panel/70 ring-1 ring-hairline",
        isDragging && "opacity-40",
      )}
    >
      <header className="flex items-center gap-1 px-2 py-2.5">
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`Reorder ${column.name}`}
          className="cursor-grab text-ink-ghost transition-colors hover:text-ink-soft active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
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
            className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-[13px] font-semibold text-ink hover:bg-black/5"
            title="Click to rename"
          >
            {column.name}
            {column.isDone && (
              <Check className="ml-1.5 inline size-3 text-lime-700" />
            )}
          </button>
        )}

        <span
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums",
            overLimit
              ? "bg-amber-500/20 text-amber-800"
              : "text-ink-faint",
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
              onArchiveAll={() => onArchiveAll(column.id)}
            />
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
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
              onOpen={onOpenTask}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && !composing && (
          <p className="rounded-xl border border-dashed border-hairline-strong px-3 py-6 text-center text-xs text-ink-faint">
            {totalCount > 0 ? "No matches here" : "Drop tasks here"}
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
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-black/5 hover:text-ink"
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

  return (
    <div className="rounded-xl bg-panel-raised p-2 ring-1 ring-accent/40">
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
  onArchiveAll,
}: {
  column: ClientColumn;
  taskCount: number;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
  onSetWipLimit: (limit: number | null) => void;
  onToggleDone: (isDone: boolean) => void;
  onArchiveAll: () => void;
}) {
  const [limitDraft, setLimitDraft] = useState(
    column.wipLimit === null ? "" : String(column.wipLimit),
  );

  const item =
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-ink transition-colors hover:bg-black/5 disabled:opacity-40";

  return (
    <div className="absolute right-0 top-8 z-30 w-56 animate-pop-in rounded-xl bg-panel-raised p-1.5 shadow-xl shadow-[#3a332a]/15 ring-1 ring-hairline">
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
            onSetWipLimit(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
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
