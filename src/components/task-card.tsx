"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, Check } from "lucide-react";
import { DUE_TONES, formatDue } from "@/lib/dates";
import { PRIORITY_STYLES, labelColor } from "@/lib/colors";
import type { ClientLabel, ClientTask } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  task: ClientTask;
  labels: ClientLabel[];
  onOpen: (taskId: string) => void;
};

export function TaskCard({ task, labels, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: { type: "task", columnId: task.columnId },
    });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // While this card is the drag source it stays in the flow as a hole for
      // the overlay to land in.
      className={cn(isDragging && "opacity-0")}
    >
      <TaskCardBody
        task={task}
        labels={labels}
        onClick={() => onOpen(task.id)}
        {...attributes}
        {...listeners}
      />
    </div>
  );
}

/**
 * Split out so the `DragOverlay` can render an identical card that isn't wired
 * to a sortable node.
 */
export function TaskCardBody({
  task,
  labels,
  overlay,
  className,
  ...props
}: {
  task: ClientTask;
  labels: ClientLabel[];
  overlay?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  const due = task.dueDate ? formatDue(task.dueDate) : null;
  const priority = PRIORITY_STYLES[task.priority];
  const done = task.completedAt !== null;

  return (
    <div
      className={cn(
        "group relative w-full cursor-grab overflow-hidden rounded-xl bg-panel-raised p-2.5 pl-3 text-left ring-1 ring-hairline transition-[box-shadow,transform,background-color]",
        "hover:ring-hairline-strong",
        overlay
          ? "rotate-1 cursor-grabbing shadow-xl shadow-[#3a332a]/25 ring-accent/50"
          : "shadow-sm shadow-[#3a332a]/6",
        className,
      )}
      {...props}
    >
      {task.priority !== "none" && (
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-1.5 left-0 w-[3px] rounded-full",
            priority.bar,
          )}
        />
      )}

      <p
        className={cn(
          "line-clamp-3 text-[13px] font-medium leading-snug text-ink",
          done && "text-ink-faint line-through decoration-ink-ghost",
        )}
      >
        {task.title}
      </p>

      {labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {labels.map((label) => (
            <span
              key={label.id}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium leading-4 ring-1 ring-inset",
                labelColor(label.color).chip,
              )}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      {(due || task.description || done) && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-faint">
          {due && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-medium ring-1 ring-inset",
                DUE_TONES[due.tone],
              )}
            >
              {due.text}
            </span>
          )}
          {task.description && (
            <AlignLeft className="size-3.5" aria-label="Has notes" />
          )}
          {done && (
            <Check className="ml-auto size-3.5 text-lime-700" aria-label="Done" />
          )}
        </div>
      )}
    </div>
  );
}
