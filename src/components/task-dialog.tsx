"use client";

import { format } from "date-fns";
import { Archive, Plus, Tag, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Button,
  FieldLabel,
  Input,
  Modal,
  Textarea,
} from "@/components/ui";
import { LABEL_COLOR_KEYS, PRIORITY_STYLES, labelColor } from "@/lib/colors";
import { fromDateInputValue, toDateInputValue } from "@/lib/dates";
import { PRIORITIES, type Priority } from "@/db/schema";
import type { ClientColumn, ClientLabel, ClientTask } from "@/lib/types";
import { cn } from "@/lib/utils";

export type TaskPatch = {
  title: string;
  description: string;
  priority: Priority;
  dueDate: number | null;
  labelIds: string[];
};

type Props = {
  task: ClientTask;
  columns: ClientColumn[];
  labels: ClientLabel[];
  onClose: () => void;
  onSave: (patch: TaskPatch) => void;
  onMoveToColumn: (columnId: string) => void;
  onArchive: () => void;
  onDelete: () => void;
  onCreateLabel: (name: string, color: string) => Promise<ClientLabel | null>;
};

export function TaskDialog({
  task,
  columns,
  labels,
  onClose,
  onSave,
  onMoveToColumn,
  onArchive,
  onDelete,
  onCreateLabel,
}: Props) {
  const [draft, setDraft] = useState<TaskPatch>({
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueDate: task.dueDate,
    labelIds: task.labelIds,
  });

  const dirty = useMemo(
    () =>
      draft.title !== task.title ||
      draft.description !== task.description ||
      draft.priority !== task.priority ||
      draft.dueDate !== task.dueDate ||
      draft.labelIds.join() !== task.labelIds.join(),
    [draft, task],
  );

  const save = () => {
    if (draft.title.trim()) onSave(draft);
    onClose();
  };

  const toggleLabel = (labelId: string) =>
    setDraft((d) => ({
      ...d,
      labelIds: d.labelIds.includes(labelId)
        ? d.labelIds.filter((id) => id !== labelId)
        : [...d.labelIds, labelId],
    }));

  return (
    <Modal
      open
      onClose={dirty ? save : onClose}
      title={
        <input
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          className="w-full bg-transparent text-base font-semibold leading-snug text-ink outline-none placeholder:text-ink-ghost"
          placeholder="Task title"
        />
      }
      footer={
        <>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onArchive}>
              <Archive className="size-3.5" /> Archive
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirm("Delete this task permanently?")) onDelete();
              }}
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-ink-faint">
              {dirty ? "Unsaved" : `Created ${format(task.createdAt, "MMM d")}`}
            </span>
            <Button variant="primary" size="sm" onClick={save}>
              Save
            </Button>
          </div>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label>
            <FieldLabel>Column</FieldLabel>
            <select
              value={task.columnId}
              onChange={(e) => onMoveToColumn(e.target.value)}
              className="h-9 w-full rounded-lg bg-panel-raised px-2 text-sm text-ink ring-1 ring-hairline focus:ring-accent/60"
            >
              {columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <FieldLabel>Due date</FieldLabel>
            <Input
              type="date"
              value={toDateInputValue(draft.dueDate)}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  dueDate: fromDateInputValue(e.target.value),
                }))
              }
            />
          </label>
        </div>

        <div>
          <FieldLabel>Priority</FieldLabel>
          <div className="flex gap-1 rounded-lg bg-panel p-1 ring-1 ring-hairline">
            {PRIORITIES.map((priority) => (
              <button
                key={priority}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, priority }))}
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  draft.priority === priority
                    ? cn("bg-panel-raised shadow-sm shadow-[#3a332a]/10", PRIORITY_STYLES[priority].chip)
                    : "text-ink-faint hover:bg-black/5",
                )}
              >
                {PRIORITY_STYLES[priority].label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>Labels</FieldLabel>
          <LabelPicker
            labels={labels}
            selected={draft.labelIds}
            onToggle={toggleLabel}
            onCreate={async (name, color) => {
              const created = await onCreateLabel(name, color);
              if (created) toggleLabel(created.id);
            }}
          />
        </div>

        <div>
          <FieldLabel>Notes</FieldLabel>
          <Textarea
            rows={6}
            value={draft.description}
            placeholder="Context, links, next steps…"
            onChange={(e) =>
              setDraft((d) => ({ ...d, description: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
            }}
          />
        </div>
      </div>
    </Modal>
  );
}

function LabelPicker({
  labels,
  selected,
  onToggle,
  onCreate,
}: {
  labels: ClientLabel[];
  selected: string[];
  onToggle: (labelId: string) => void;
  onCreate: (name: string, color: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  // Cycle the palette so consecutive new labels don't all come out the same.
  const [colorIndex, setColorIndex] = useState(labels.length);
  const color = LABEL_COLOR_KEYS[colorIndex % LABEL_COLOR_KEYS.length];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {labels.map((label) => {
        const active = selected.includes(label.id);
        return (
          <button
            key={label.id}
            type="button"
            onClick={() => onToggle(label.id)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset transition-all",
              active
                ? labelColor(label.color).chip
                : "bg-transparent text-ink-faint ring-hairline hover:text-ink",
            )}
          >
            {label.name}
          </button>
        );
      })}

      {creating ? (
        <span className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Change colour"
            onClick={() => setColorIndex((i) => i + 1)}
            className={cn(
              "size-5 rounded-full ring-2 ring-black/10",
              labelColor(color).dot,
            )}
          />
          <Input
            autoFocus
            value={name}
            placeholder="Label name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                onCreate(name.trim(), color);
                setName("");
                setCreating(false);
              }
              if (e.key === "Escape") setCreating(false);
            }}
            className="h-7 w-32 text-xs"
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-faint ring-1 ring-dashed ring-hairline-strong transition-colors hover:text-ink"
        >
          <Plus className="size-3" /> <Tag className="size-3" />
        </button>
      )}
    </div>
  );
}
