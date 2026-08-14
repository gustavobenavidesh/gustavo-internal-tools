"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, FileText, Plus } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { AnchoredMenu, MENU_ITEM, PILL } from "@/components/ui";
import { PRIORITIES, type Priority } from "@/db/schema";
import { PRIORITY_STYLES, labelColor } from "@/lib/colors";
import { contextIcon } from "@/lib/context-icons";
import { PriorityBars } from "@/components/priority-bars";
import { SlackMark } from "@/components/slack-mark";
import type {
  ClientContext,
  ClientLabel,
  ClientTask,
  DropHint,
} from "@/lib/types";
import { cn, noOrphans } from "@/lib/utils";

/** Unassigned pills stay on the card as empty slots you can click to fill. */
const EMPTY_PILL =
  "bg-transparent text-ink-ghost ring-0 outline outline-1 outline-dashed -outline-offset-1 outline-hairline-strong";

type Props = {
  task: ClientTask;
  labels: ClientLabel[];
  contexts: ClientContext[];
  /** Cards in a muted column render as parked: flat, dashed, barely filled. */
  muted?: boolean;
  /**
   * Set while a drag is aimed at this card: a bar along the top or bottom edge
   * for the slot the card would be inserted into, or the whole card lit up with
   * the checklist item it would gain. Null on every other card.
   */
  drop?: DropHint | null;
  /** This is the card the sheet is showing. */
  viewing?: boolean;
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
  drop,
  viewing,
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
   * scrolling the column doesn't look like movement. The drag transform is added
   * back in, so what's remembered is where the card *looked* — a card that gives
   * up a transform at the same moment the layout absorbs it hasn't moved at all,
   * and animating the layout half of that on its own is a visible jump.
   */
  const wrapper = useRef<HTMLDivElement | null>(null);
  const lastBox = useRef<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrapper.current;
    if (!el) return;

    const box = {
      top: el.offsetTop + (transform?.y ?? 0),
      left: el.offsetLeft + (transform?.x ?? 0),
    };
    const previous = lastBox.current;
    lastBox.current = box;

    // The dragged card is already following the pointer; don't fight it. Nor
    // dnd-kit, which animates the transform itself whenever it hands one over.
    if (!previous || isDragging || transition) return;

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
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        // Only while it's actually displaced. A card carries a shadow and a
        // clip-path plate, so moving one without its own layer repaints both
        // every frame; promoting all of them all the time would be worse still.
        willChange: transform ? "transform" : undefined,
      }}
      // What the task sheet's outside-press check looks for, so a press here
      // switches the open sheet to this card instead of closing it.
      data-card={task.id}
      // While this card is the drag source it stays in the flow as a hole for
      // the overlay to land in.
      className={cn(isDragging && "opacity-0")}
    >
      <TaskCardBody
        task={task}
        labels={labels}
        contexts={contexts}
        muted={muted}
        drop={drop}
        viewing={viewing}
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
  drop,
  viewing,
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
  drop?: DropHint | null;
  viewing?: boolean;
  overlay?: boolean;
  onSetContexts?: (taskId: string, contextIds: string[]) => void;
  onSetPriority?: (taskId: string, priority: Priority) => void;
  onToggleSubtask?: (taskId: string, subtaskId: string, done: boolean) => void;
} & React.HTMLAttributes<HTMLDivElement>) {
  const priority = PRIORITY_STYLES[task.priority];
  const done = task.completedAt !== null;
  const assigned = contexts.filter((c) => task.contextIds.includes(c.id));
  /** The fold-in is the only drop state that changes the card itself. */
  const swallowing = drop?.where === "into";

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
        // Opacity is in the transition list for the overlay's sake: it dims as it
        // comes to rest over a card it would fold into, and the flight it hands
        // off to starts from that exact value — a snap here would be the first
        // frame of the animation. `scale` is listed separately from `transform`
        // because Tailwind sets it as its own property, so every `scale-*` below
        // — the press, the overlay, the lift when a card is about to swallow
        // another — would otherwise jump instead of easing.
        "group relative isolate w-full cursor-grab rounded-[var(--corner-card)] text-left transition-[box-shadow,transform,opacity,scale]",
        // The shadow stays a box-shadow on this root, which is deliberately left
        // unclipped. Moving it onto the plate would mean a `filter` — and so a
        // repaint layer — per card during a drag, and at a 12px radius the gap
        // between the shadow's circular silhouette and the squircle sitting on
        // top of it disappears under the blur.
        //
        // Parked cards read as inactive: flat, dashed and barely filled. Their
        // dash is the one thing that can't move onto the plate — there's no way
        // to stroke a dashed superellipse in CSS — so it stays an `outline` here,
        // which is also why this root must not be clipped: a clip path eats
        // outlines, including the focus ring.
        muted
          ? cn(
              "outline outline-2 outline-dashed -outline-offset-2",
              // A parked card has no plate to tint, so its dash is the only
              // thing that can say it's the one about to swallow the drop.
              swallowing ? "outline-accent" : "outline-hairline-strong",
            )
          : "shadow-[0_5px_16px_-6px] shadow-shade/16 hover:shadow-shade/24",
        overlay &&
          "rotate-3 scale-[1.03] cursor-grabbing shadow-2xl shadow-shade/30",
        // A press gives a little under the finger. Only on the real card — the
        // drag overlay is never pressed, and a pointer held down on a card that's
        // about to be dragged has already gone invisible by then.
        !overlay && "active:scale-[0.985] active:duration-75",
        // Lifts towards the card being dropped in, the way a folder opens.
        swallowing && "scale-[1.02]",
        className,
      )}
      style={{ "--sq-radius": "var(--corner-card)" } as CSSProperties}
      {...props}
    >
      {/* Fill and hairline, both following the continuous corner. Parked cards
          get no plate: they have no fill, and their edge is the dashed outline
          above. */}
      {!muted && (
        <div aria-hidden className="squircle-plate -z-10">
          <div
            className={cn(
              "squircle-surface size-full transition-colors",
              swallowing
                ? "[--sq-edge:var(--color-accent)] [--sq-face:color-mix(in_oklab,var(--color-accent)_7%,var(--color-panel-raised))]"
                : overlay
                  ? "[--sq-edge:color-mix(in_oklab,var(--color-accent)_50%,transparent)] [--sq-face:var(--color-panel-raised)]"
                  : done
                    ? "[--sq-edge:color-mix(in_oklab,var(--color-emerald-600)_15%,transparent)] [--sq-face:var(--color-done)] group-hover:[--sq-edge:color-mix(in_oklab,var(--color-emerald-600)_25%,transparent)]"
                    : "[--sq-edge:var(--color-hairline)] [--sq-face:var(--color-panel-raised)] group-hover:[--sq-edge:var(--color-hairline-strong)]",
            )}
          />
        </div>
      )}
      {/* Which card the sheet is showing. Down the left edge, on the one axis the
          drop bars don't use — those mark the slot above or below a card, so a
          vertical tick beside it can't be mistaken for one. */}
      {viewing && !overlay && (
        <div
          aria-hidden
          className="absolute inset-y-5 -left-px z-10 w-[3px] rounded-full bg-accent/75"
        />
      )}

      {/* The insertion slot, drawn as a bar along whichever edge the card would
          land on. Inside the card's own box on purpose: a line *between* cards
          would need layout space, and shifting the list is the one thing a drag
          must not do here. Sat above the content so it isn't lost against a
          title, and out of the flow so it costs no height. */}
      {drop && !swallowing && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-x-2 z-10 h-[3px] rounded-full bg-accent shadow-[0_0_0_3px] shadow-accent/20",
            drop.where === "above" ? "-top-[2px]" : "-bottom-[2px]",
          )}
        />
      )}

      {/* Content is clipped to the same shape, standing in for the
          `overflow-hidden` this used to carry on the root. */}
      <div className="squircle p-4">
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

        {/* A mark on the title's row rather than a row of its own — it says
            something about the card, the way the tick beside it does. */}
        {task.description && (
          <FileText
            className="mt-[3px] size-3.5 shrink-0 text-ink-ghost"
            aria-label="Has notes"
          />
        )}

        {done && (
          <Check
            // A mark, not a control: small enough to sit under the title's cap
            // height rather than beside it at the same weight. The extra pixel of
            // top margin keeps its centre on the first line where `size-4` had it.
            className="mt-[3px] size-3.5 shrink-0 text-emerald-600"
            strokeWidth={2.75}
            aria-label="Done"
          />
        )}
      </div>

      {(task.subtasks.length > 0 || swallowing) && (
        <ul className="mt-3.5 space-y-1">
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

          {/* Where the hovering card would land, drawn as the item it's about
              to become — so the gesture explains itself before the drop. */}
          {swallowing && (
            <li className="flex animate-pop-in items-start gap-1.5 text-[12px] leading-snug">
              <span className="mt-px size-3.5 shrink-0 rounded-[4px] outline outline-1 outline-dashed -outline-offset-1 outline-accent" />
              <span className="truncate text-accent-ink">{drop.title}</span>
            </li>
          )}
        </ul>
      )}

      <div className="mt-[18px] flex flex-wrap items-center gap-1.5">
        {assigned.map((option, i) => {
          const ContextIcon = contextIcon(option.name);
          // The + docks onto the last pill, so that one squares off its right.
          const docked = Boolean(onSetContexts) && i === assigned.length - 1;
          return (
            <PillMenu
              key={option.id}
              className={cn(
                // A parked card is dashed, but what's *assigned* to it isn't —
                // only genuinely empty slots get the placeholder treatment.
                done
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
                done
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

      {/* The due date is set and shown in the sheet only — it isn't on the card
          for now. `formatDue` and `DUE_TONES` in `src/lib/dates.ts` still hold the
          relative wording and the overdue/soon tones if it comes back. */}
      {task.source && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-faint">
          {/* Provenance, and a way back to it. Pointer events stop here for the
              same reason the pills do: this is a link inside a draggable card
              that also opens the dialog on click. */}
          <a
            href={task.source.url}
            target="_blank"
            rel="noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            title={[
              "Open in Slack",
              task.source.author && `pinned from ${task.source.author}`,
              task.source.channel && `in #${task.source.channel}`,
            ]
              .filter(Boolean)
              .join(" — ")}
            className="inline-flex min-w-0 items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-black/5 hover:text-ink-soft"
          >
            <SlackMark className="size-3 shrink-0" />
            {task.source.channel && (
              <span className="truncate">#{task.source.channel}</span>
            )}
          </a>
        </div>
      )}
      </div>
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
