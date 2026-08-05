"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, Check, type LucideIcon, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { AnchoredMenu, MENU_ITEM } from "@/components/ui";
import { PRIORITIES, type Priority } from "@/db/schema";
import { PRIORITY_STYLES, labelColor } from "@/lib/colors";
import { contextIcon } from "@/lib/context-icons";
import { PRIORITY_ICONS } from "@/lib/priority-icons";
import { DUE_TONES, formatDue } from "@/lib/dates";
import type { ClientContext, ClientLabel, ClientTask } from "@/lib/types";
import { cn } from "@/lib/utils";

const PILL =
  "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium leading-4 ring-1 ring-inset";

/** Unassigned pills stay on the card as empty slots you can click to fill. */
const EMPTY_PILL =
  "bg-transparent text-ink-ghost ring-0 outline outline-1 outline-dashed -outline-offset-1 outline-hairline-strong";

type Props = {
  task: ClientTask;
  labels: ClientLabel[];
  contexts: ClientContext[];
  /** Cards in a muted column render as parked: flat, dashed, barely filled. */
  muted?: boolean;
  onOpen: (taskId: string) => void;
  onSetContexts: (taskId: string, contextIds: string[]) => void;
  onSetPriority: (taskId: string, priority: Priority) => void;
};

export function TaskCard({
  task,
  labels,
  contexts,
  muted,
  onOpen,
  onSetContexts,
  onSetPriority,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
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
        contexts={contexts}
        muted={muted}
        onSetContexts={onSetContexts}
        onSetPriority={onSetPriority}
        onClick={() => onOpen(task.id)}
        {...attributes}
        {...listeners}
      />
    </div>
  );
}

/**
 * Split out so the `DragOverlay` can render an identical card that isn't wired
 * to a sortable node. Without the setter callbacks the pills render as plain
 * text, which is what the overlay wants.
 */
export function TaskCardBody({
  task,
  labels,
  contexts,
  muted,
  overlay,
  className,
  onSetContexts,
  onSetPriority,
  ...props
}: {
  task: ClientTask;
  labels: ClientLabel[];
  contexts: ClientContext[];
  muted?: boolean;
  overlay?: boolean;
  onSetContexts?: (taskId: string, contextIds: string[]) => void;
  onSetPriority?: (taskId: string, priority: Priority) => void;
} & React.HTMLAttributes<HTMLDivElement>) {
  const due = task.dueDate ? formatDue(task.dueDate) : null;
  const priority = PRIORITY_STYLES[task.priority];
  const done = task.completedAt !== null;
  const assigned = contexts.filter((c) => task.contextIds.includes(c.id));

  const toggleContext = (contextId: string) =>
    onSetContexts?.(
      task.id,
      task.contextIds.includes(contextId)
        ? task.contextIds.filter((id) => id !== contextId)
        : [...task.contextIds, contextId],
    );

  /**
   * Shared by every context pill and the add button. It's a multi-select, so
   * picking an item toggles it and leaves the menu open for the next one.
   */
  const contextMenu = (close: () => void) => (
    <>
      {contexts.map((option) => {
        const OptionIcon = contextIcon(option.name);
        const on = task.contextIds.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            className={MENU_ITEM}
            onClick={() => toggleContext(option.id)}
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                labelColor(option.color).dot,
              )}
            />
            <OptionIcon className="size-3.5 shrink-0 text-ink-faint" />
            <span className={cn("truncate", on && "font-medium")}>
              {option.name}
            </span>
            {on && <Check className="ml-auto size-3 shrink-0 text-accent" />}
          </button>
        );
      })}

      {task.contextIds.length > 0 && (
        <>
          <div className="my-1 h-px bg-hairline" />
          <button
            type="button"
            className={cn(MENU_ITEM, "text-ink-faint")}
            onClick={() => {
              onSetContexts?.(task.id, []);
              close();
            }}
          >
            Clear contexts
          </button>
        </>
      )}
    </>
  );

  return (
    <div
      className={cn(
        "group relative w-full cursor-grab overflow-hidden rounded-xl p-4 text-left ring-1 transition-[box-shadow,transform,background-color]",
        // Parked cards read as inactive: flat, dashed and barely filled.
        muted
          ? "bg-panel-raised/45 ring-0 outline outline-[1.5px] outline-dashed -outline-offset-[1.5px] outline-hairline-strong"
          : "bg-panel-raised shadow-sm shadow-shade/6 ring-hairline hover:ring-hairline-strong",
        overlay &&
          "rotate-1 cursor-grabbing bg-panel-raised shadow-xl shadow-shade/25 ring-accent/50",
        className,
      )}
      {...props}
    >
      <p
        className={cn(
          "line-clamp-3 pr-4 text-[16px] font-medium leading-snug",
          muted ? "text-ink-soft" : "text-ink",
          done && "text-ink-faint line-through decoration-ink-ghost",
        )}
      >
        {task.title}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {assigned.map((option) => (
          <PillMenu
            key={option.id}
            className={
              muted
                ? "bg-transparent text-ink-faint ring-0 outline outline-1 outline-dashed -outline-offset-1 outline-hairline-strong"
                : "bg-black/4 text-ink-soft ring-black/6"
            }
            label={option.name}
            dot={labelColor(option.color).dot}
            icon={contextIcon(option.name)}
            disabled={!onSetContexts}
          >
            {contextMenu}
          </PillMenu>
        ))}

        {assigned.length === 0 ? (
          <PillMenu
            className={EMPTY_PILL}
            label="No context"
            disabled={!onSetContexts}
          >
            {contextMenu}
          </PillMenu>
        ) : (
          onSetContexts && (
            <PillMenu
              className={cn(EMPTY_PILL, "px-1.5")}
              label=""
              icon={Plus}
              title="Add another context"
            >
              {contextMenu}
            </PillMenu>
          )
        )}

        <PillMenu
          className={task.priority === "none" ? EMPTY_PILL : priority.pill}
          label={task.priority === "none" ? "No priority" : priority.label}
          icon={PRIORITY_ICONS[task.priority]}
          disabled={!onSetPriority}
        >
          {(close) => (
            <>
              {PRIORITIES.map((option) => {
                const OptionIcon = PRIORITY_ICONS[option];
                return (
                  <button
                    key={option}
                    type="button"
                    className={MENU_ITEM}
                    onClick={() => {
                      onSetPriority?.(task.id, option);
                      close();
                    }}
                  >
                    <OptionIcon
                      className={cn(
                        "size-3.5 shrink-0",
                        option === "none"
                          ? "text-ink-ghost"
                          : PRIORITY_STYLES[option].chip,
                      )}
                    />
                    {option === "none"
                      ? "No priority"
                      : PRIORITY_STYLES[option].label}
                    {option === task.priority && (
                      <Check className="ml-auto size-3 shrink-0 text-accent" />
                    )}
                  </button>
                );
              })}
            </>
          )}
        </PillMenu>

        {labels.map((label) => (
          <span
            key={label.id}
            className={cn(PILL, labelColor(label.color).chip)}
          >
            {label.name}
          </span>
        ))}
      </div>

      {(due || task.description || done) && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-faint">
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
            <Check
              className="ml-auto size-3.5 text-lime-700"
              aria-label="Done"
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A pill that opens its own menu. Pointer events stop here so clicking it
 * neither starts a drag (dnd-kit's sensor lives on the card) nor opens the task
 * dialog — setting a context shouldn't cost a round trip through the modal.
 */
function PillMenu({
  label,
  dot,
  icon: Icon,
  className,
  disabled,
  title,
  children,
}: {
  label: string;
  dot?: string;
  icon?: LucideIcon;
  className?: string;
  disabled?: boolean;
  title?: string;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);

  const content = (
    <>
      {dot && (
        <span aria-hidden className={cn("mr-0.5 size-1.5 rounded-full", dot)} />
      )}
      {Icon && <Icon aria-hidden className="size-3 shrink-0 opacity-70" />}
      {label && <span className="truncate">{label}</span>}
    </>
  );

  if (disabled) {
    return <span className={cn(PILL, className)}>{content}</span>;
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        title={title ?? `${label} — click to change`}
        className={cn(
          PILL,
          className,
          "cursor-pointer hover:ring-hairline-strong",
        )}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {content}
      </button>

      {open && (
        <AnchoredMenu anchor={anchor.current} onClose={() => setOpen(false)}>
          {children(() => setOpen(false))}
        </AnchoredMenu>
      )}
    </>
  );
}
