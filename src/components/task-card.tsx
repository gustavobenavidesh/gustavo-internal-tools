"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignLeft, Check, Plus } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { AnchoredMenu, MENU_ITEM } from "@/components/ui";
import { PRIORITIES, type Priority } from "@/db/schema";
import { PRIORITY_STYLES, labelColor } from "@/lib/colors";
import { contextIcon } from "@/lib/context-icons";
import { PriorityBars } from "@/components/priority-bars";
import { DUE_TONES, formatDue } from "@/lib/dates";
import type { ClientContext, ClientLabel, ClientTask } from "@/lib/types";
import { cn, noOrphans } from "@/lib/utils";

/**
 * Fixed height rather than padding-derived: an icon-only pill (the docked `+`)
 * has no text line box, so it would otherwise come out shorter than its
 * neighbours and the docked pair wouldn't line up.
 */
const PILL =
  "inline-flex h-5 max-w-full items-center gap-1 rounded-full px-2 text-[10px] font-medium leading-none ring-1 ring-inset";

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
  onToggleSubtask: (taskId: string, subtaskId: string, done: boolean) => void;
};

export function TaskCard({
  task,
  labels,
  contexts,
  muted,
  onOpen,
  onSetContexts,
  onSetPriority,
  onToggleSubtask,
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

  /**
   * dnd-kit's own layout animation opts out when a container's item list changes
   * without the item's index changing — which is exactly what happens to the
   * cards below one that's dragged away, so they snapped into place. This FLIPs
   * them by hand: remember where the card was laid out, and if the next render
   * puts it somewhere else, animate from the old position to the new one.
   *
   * Offsets, not `getBoundingClientRect`: offsets are layout-relative, so
   * scrolling the column doesn't look like movement.
   */
  const wrapper = useRef<HTMLDivElement | null>(null);
  const lastBox = useRef<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrapper.current;
    if (!el) return;

    const box = { top: el.offsetTop, left: el.offsetLeft };
    const previous = lastBox.current;
    lastBox.current = box;

    // The dragged card is already following the pointer; don't fight it.
    if (!previous || isDragging) return;

    const dx = previous.left - box.left;
    const dy = previous.top - box.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
      { duration: 220, easing: "cubic-bezier(.2,.8,.3,1)" },
    );
  });

  return (
    <div
      ref={(node) => {
        wrapper.current = node;
        setNodeRef(node);
      }}
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
        onToggleSubtask={onToggleSubtask}
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
  onToggleSubtask,
  ...props
}: {
  task: ClientTask;
  labels: ClientLabel[];
  contexts: ClientContext[];
  muted?: boolean;
  overlay?: boolean;
  onSetContexts?: (taskId: string, contextIds: string[]) => void;
  onSetPriority?: (taskId: string, priority: Priority) => void;
  onToggleSubtask?: (taskId: string, subtaskId: string, done: boolean) => void;
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
          ? "bg-transparent ring-0 outline outline-2 outline-dashed -outline-offset-2 outline-hairline"
          : cn(
              "shadow-sm shadow-shade/10 hover:shadow-shade/15",
              done
                ? "bg-done ring-emerald-600/15 hover:ring-emerald-600/25"
                : "bg-panel-raised ring-hairline hover:ring-hairline-strong",
            ),
        overlay &&
          "rotate-3 scale-[1.03] cursor-grabbing bg-panel-raised shadow-2xl shadow-shade/30 ring-accent/50",
        className,
      )}
      {...props}
    >
      {/* The tick shares the title's row, so a long title wraps against it
          rather than running underneath. */}
      <div className="flex items-start gap-2">
        <p
          className={cn(
            "line-clamp-3 min-w-0 flex-1 pr-2 text-pretty text-[16px] font-medium leading-snug",
            muted ? "text-ink-soft" : "text-ink",
            done && "text-ink-faint",
          )}
        >
          {noOrphans(task.title)}
        </p>

        {done && (
          <Check
            className="mt-0.5 size-4 shrink-0 text-emerald-600"
            strokeWidth={2.75}
            aria-label="Done"
          />
        )}
      </div>

      {task.subtasks.length > 0 && (
        <ul className="mt-3 space-y-1">
          {task.subtasks.map((sub) => (
            <li key={sub.id}>
              <button
                type="button"
                disabled={!onToggleSubtask}
                // Same guard as the pills: don't drag the card, don't open the
                // dialog — just tick the box.
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSubtask?.(task.id, sub.id, !sub.done);
                }}
                className="group/sub flex w-full items-start gap-1.5 text-left text-[12px] leading-snug"
              >
                <span
                  className={cn(
                    "mt-px grid size-3.5 shrink-0 place-items-center rounded-[4px] ring-1 ring-inset transition-colors",
                    sub.done
                      ? "bg-ink-faint/70 ring-transparent"
                      : "ring-hairline-strong group-hover/sub:ring-ink-ghost",
                  )}
                >
                  {sub.done && <Check className="size-2.5 text-white" />}
                </span>
                <span
                  className={cn(
                    sub.done
                      ? "text-ink-ghost line-through decoration-ink-ghost"
                      : "text-ink-soft",
                  )}
                >
                  {sub.title}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {assigned.map((option, i) => {
          const ContextIcon = contextIcon(option.name);
          // The + docks onto the last pill, so that one squares off its right.
          const docked = Boolean(onSetContexts) && i === assigned.length - 1;
          return (
            <PillMenu
              key={option.id}
              className={cn(
                muted
                  ? "bg-transparent text-ink-faint ring-0 outline outline-1 outline-dashed -outline-offset-1 outline-hairline-strong"
                  : done
                    ? // White, not the canvas tone: on the green fill of a
                      // finished card the grey pill all but disappears.
                      "bg-panel-raised text-ink-soft ring-emerald-600/15"
                    : "bg-canvas text-ink-soft ring-hairline",
                docked && "pr-2.5",
              )}
              style={
                docked
                  ? { borderTopRightRadius: 0, borderBottomRightRadius: 0 }
                  : undefined
              }
              label={option.name}
              dot={labelColor(option.color).dot}
              icon={<ContextIcon className="size-3 shrink-0 opacity-70" />}
              disabled={!onSetContexts}
            >
              {contextMenu}
            </PillMenu>
          );
        })}

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
              // Docked onto the pill before it: the negative margin closes the
              // row gap and overlaps by 1px so the two rings read as a single
              // divider rather than a double line.
              className={cn(
                "-ml-[7px] w-6 justify-center px-0",
                muted
                  ? "bg-transparent text-ink-ghost ring-0 outline outline-1 outline-dashed -outline-offset-1 outline-hairline-strong"
                  : done
                    ? "bg-panel-raised text-ink-faint ring-emerald-600/15 hover:text-ink-soft"
                    : "bg-canvas text-ink-faint ring-hairline hover:text-ink-soft",
              )}
              style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
              label=""
              icon={<Plus className="size-3 shrink-0" strokeWidth={2.25} />}
              title="Add another context"
            >
              {contextMenu}
            </PillMenu>
          )
        )}

        <PillMenu
          className={task.priority === "none" ? EMPTY_PILL : priority.pill}
          label={task.priority === "none" ? "No priority" : priority.label}
          icon={<PriorityBars level={task.priority} className="size-3.5" />}
          disabled={!onSetPriority}
        >
          {(close) => (
            <>
              {PRIORITIES.map((option) => {
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
                    <PriorityBars
                      level={option}
                      className={cn(
                        "size-3.5",
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

      {(due || task.description) && (
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
  icon,
  className,
  style,
  disabled,
  title,
  children,
}: {
  label: string;
  dot?: string;
  icon?: ReactNode;
  className?: string;
  style?: CSSProperties;
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
      {icon}
      {label && <span className="truncate">{label}</span>}
    </>
  );

  if (disabled) {
    return (
      <span className={cn(PILL, className)} style={style}>
        {content}
      </span>
    );
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        title={title ?? `${label} — click to change`}
        style={style}
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
