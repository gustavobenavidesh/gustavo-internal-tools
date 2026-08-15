"use client";

import { format } from "date-fns";
import { Check, ChevronsUpDown, Pencil, Trash2 } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Button,
  FieldLabel,
  IconButton,
  Input,
  Modal,
  PILL,
  Plate,
} from "@/components/ui";
import { PRIORITY_STYLES, labelColor } from "@/lib/colors";
import { type Draft, clearDraft, readDraft, writeDraft } from "@/lib/drafts";
import { ColumnGlyph } from "@/components/column-glyph";
import { RichNotes } from "@/components/rich-notes";
import { VisualCanvas } from "@/components/visual-canvas";
import { contextIcon } from "@/lib/context-icons";
import { PriorityBars } from "@/components/priority-bars";
import { fromDateInputValue, toDateInputValue } from "@/lib/dates";
import { PRIORITIES, type Priority } from "@/db/schema";
import type { ClientColumn, ClientContext, ClientTask } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Both fields are native controls with their own box turned off, sitting inside a
 * `FieldShell` that draws the app's squircle behind them — `rounded-lg` was a
 * plain circular 8px, which read as a stranger next to everything else here. No
 * `outline-none`: the shell tints its edge on focus, and keyboard focus still gets
 * the global outline on top of that.
 */
const FIELD =
  "h-8 w-full rounded-[var(--corner-field)] bg-transparent px-2.5 text-[13px] font-medium text-ink";

export type TaskPatch = {
  title: string;
  description: string;
  priority: Priority;
  dueDate: number | null;
  labelIds: string[];
  contextIds: string[];
};

type Props = {
  task: ClientTask;
  columns: ClientColumn[];
  contexts: ClientContext[];
  /** False while the sheet slides out; `onClosed` fires when it has gone. */
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
  /** Resolves with whether the write landed, which is what clears the draft. */
  onSave: (patch: TaskPatch) => Promise<boolean> | void;
  onMoveToColumn: (columnId: string) => void;
  /**
   * Files the card in the board's parking lot. Absent when there's no muted
   * column to move it to, or when it's already there.
   */
  onMoveToBacklog?: () => void;
  onDelete: () => void;
  onAddSubtask: (title: string) => void;
  onUpdateSubtask: (
    subtaskId: string,
    patch: { title?: string; done?: boolean },
  ) => void;
  onDeleteSubtask: (subtaskId: string) => void;
};

/** The card's saved values, in the shape the form edits them in. */
function asPatch(task: ClientTask): TaskPatch {
  return {
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueDate: task.dueDate,
    labelIds: task.labelIds,
    contextIds: task.contextIds,
  };
}

function same(a: TaskPatch, b: TaskPatch) {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.priority === b.priority &&
    a.dueDate === b.dueDate &&
    a.labelIds.join() === b.labelIds.join() &&
    a.contextIds.join() === b.contextIds.join()
  );
}

export function TaskDialog({
  task,
  columns,
  contexts,
  open,
  onClose,
  onClosed,
  onSave,
  onMoveToColumn,
  onMoveToBacklog,
  onDelete,
  onAddSubtask,
  onUpdateSubtask,
  onDeleteSubtask,
}: Props) {
  const [draft, setDraft] = useState<TaskPatch>(() => asPatch(task));
  const dirty = !same(draft, asPatch(task));

  /** The element the canvas puts its zoom readout in — see where it's rendered. */
  const [zoomSlot, setZoomSlot] = useState<HTMLElement | null>(null);

  /**
   * The card can change while the sheet is open — ⌘Z or ⇧⌘Z, a pill clicked on
   * the board behind, a Slack poll. The form follows it, so an undo isn't quietly
   * reverted by a draft seeded before it happened.
   *
   * Compared against the *previous* task rather than the current one: after an
   * undo the draft no longer matches the card, and that's true whether the user
   * typed or the card moved under them. Matching what the card said a moment ago
   * is what separates the two — and if it doesn't match, the edits here are the
   * newer thing and are left alone.
   */
  const seen = useRef(task);
  useEffect(() => {
    const previous = seen.current;
    seen.current = task;
    if (previous !== task && same(draft, asPatch(previous))) {
      setDraft(asPatch(task));
    }
  });

  /**
   * What's been typed, kept on the device until the server says it has it.
   *
   * Written on every edit and cleared only by a confirmed write, so whatever
   * survives is by definition something the database never received. See
   * `src/lib/drafts.ts` for why that's worth the keystrokes.
   *
   * Only while it differs from the card: a draft equal to what's stored is not an
   * unsaved edit, and leaving one behind would offer the user their own saved
   * words back every time they opened the sheet.
   */
  const [orphan, setOrphan] = useState<Draft | null>(null);

  /**
   * Reading what a card left behind and mirroring what's being typed into it are
   * the same effect on purpose, because the order matters and two effects can only
   * get it wrong. A sheet opens un-dirty, so a mirror running on its own would
   * clear the copy on the way in — deleting the very thing it exists to keep, a
   * frame before anything could offer it back. The first pass for a card only ever
   * reads.
   *
   * What it finds is offered rather than applied. It's the older text by
   * definition — the card has moved on without it — so restoring is a decision,
   * and taking it silently would overwrite whatever has been typed since.
   *
   * Nothing here ever deletes. Only a confirmed write does, in `commit`, and only
   * Discard does on purpose. That looks over-cautious and isn't: the board saves
   * optimistically, so pressing Save patches local state and makes the form clean
   * *before* the server has said anything. A copy cleared on "no longer dirty" is
   * therefore cleared a beat before the write fails — which is precisely the case
   * it exists for, and precisely how this lost the notes it was written to save.
   * A draft that matches the card is harmless; it's filtered out of the offer.
   */
  const checked = useRef<string | null>(null);
  useEffect(() => {
    if (checked.current !== task.id) {
      checked.current = task.id;
      const stored = readDraft(task.id);
      setOrphan(stored && !same(stored.patch, asPatch(task)) ? stored : null);
      return;
    }
    if (dirty) writeDraft(task.id, draft);
  }, [dirty, draft, task]);

  /** A write that didn't land, said plainly and left there until one does. */
  const [unsaved, setUnsaved] = useState(false);

  /**
   * Hands the edit up and waits to hear whether it landed. The draft is cleared
   * only by a yes — the sheet is usually gone by the time this resolves, which is
   * fine, because the copy on the device outlives it and is offered back the next
   * time the card is opened.
   */
  const commit = (patch: TaskPatch) => {
    if (!patch.title.trim()) return;
    void Promise.resolve(onSave(patch)).then((landed) => {
      if (landed) clearDraft(task.id);
      setUnsaved(!landed);
    });
  };

  const save = () => {
    commit(draft);
    onClose();
  };

  /**
   * The parking lot column, for the button's glyph and its name. Taken through
   * `ColumnGlyph` rather than a hardcoded icon, so the button wears whatever that
   * column's own header wears — and named after it, so a board whose lot is called
   * Icebox doesn't get a button promising a Backlog.
   */
  const backlog = columns.find((column) => column.isMuted);

  /**
   * The column the card is in, whose mark sits in the select. `ColumnGlyph` is the
   * same component that column's own header uses, so the field shows exactly the
   * mark you'd look for on the board.
   *
   * Only the closed field can carry it: `<option>` renders text and nothing else,
   * so the list itself stays plain. A custom menu would fix that too.
   */
  const current = columns.find((column) => column.id === task.columnId);

  return (
    <Modal
      open={open}
      onClose={dirty ? save : onClose}
      onClosed={onClosed}
      // Switching cards doesn't close the sheet, so this is the only chance to
      // write what's in the form before it points somewhere else.
      onCommit={() => {
        if (dirty) commit(draft);
      }}
      title={
        // The title is a bare input with no box, which reads as a heading rather
        // than a field. The pencil is the only thing saying it can be typed in,
        // and it turns accent once the caret is in it. Absolutely placed with room
        // reserved by `pr-6`, since an input can't shrink to its text and a flex
        // sibling would sit at the far end of the header instead.
        <div className="group/title relative">
          <input
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
            className="w-full bg-transparent pr-6 text-xl font-semibold leading-snug text-ink outline-none placeholder:text-ink-ghost"
            placeholder="Task title"
          />
          <Pencil
            aria-hidden
            // `ink-faint` to match the close button beside it — `IconButton`'s
            // resting tone — rather than the lighter `ink-ghost` a hint would
            // usually take.
            className="pointer-events-none absolute right-0 top-1/2 size-3 -translate-y-1/2 text-ink-faint transition-colors group-focus-within/title:text-accent"
          />
        </div>
      }
      footer={
        <>
          {/* Pulled out by the ghost buttons' own `px-2`. Their padding is
              invisible, so without this their glyphs start eight points further in
              than the header and body do — the fill on Save is what lets that side
              align its box instead. */}
          <div className="-ml-2 flex items-center gap-1">
            {onMoveToBacklog && backlog && (
              <Button variant="ghost" size="sm" onClick={onMoveToBacklog}>
                <ColumnGlyph column={backlog} className="size-3.5" />
                Move to {backlog.name.toLowerCase()}
              </Button>
            )}
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
          {/* Wider than the app's usual `gap-2`: the created date is a note about
              the card and Save is an action on it, so they shouldn't read as a
              pair the way the two buttons on the left do. */}
          <div className="flex items-center gap-4">
            {/* A failed write outranks both of the others and stays put until one
                succeeds. The reassurance is the second line: the reason this can be
                stated calmly is that the words aren't gone. */}
            <span
              className={cn(
                "text-[11px]",
                unsaved ? "font-medium text-rose-700" : "text-ink-faint",
              )}
            >
              {unsaved
                ? "Not saved — kept on this device"
                : dirty
                  ? "Unsaved"
                  : `Created ${format(task.createdAt, "MMM d")}`}
            </span>
            <Button variant="primary" size="sm" onClick={save}>
              Save
            </Button>
          </div>
        </>
      }
    >
      {/* Keyed by card, so a switch fades the new one in over 120ms rather than
          cutting to it. Only the body: the header's title is an input the form
          drives, and remounting it mid-edit would take the caret with it. */}
      <div key={task.id} className="animate-fade-in space-y-5">
        {/* Edits this card never managed to store, offered back at the top of the
            sheet where they can't be missed. Restoring only fills the form — it
            still takes a Save, so the recovery goes through the same path every
            other edit does and can be looked at first. */}
        {orphan && (
          <div className="flex items-center gap-3 rounded-[var(--corner-field)] bg-amber-50 px-3 py-2 text-[12px] text-amber-900 ring-1 ring-inset ring-amber-200">
            <span className="min-w-0 flex-1">
              Unsaved edits from {format(orphan.at, "MMM d, h:mm a")} were never
              stored.
            </span>
            <button
              type="button"
              className="shrink-0 font-medium underline underline-offset-2"
              onClick={() => {
                setDraft(orphan.patch);
                setOrphan(null);
              }}
            >
              Restore
            </button>
            <button
              type="button"
              className="shrink-0 text-amber-700/70 hover:text-amber-900"
              onClick={() => {
                clearDraft(task.id);
                setOrphan(null);
              }}
            >
              Discard
            </button>
          </div>
        )}

        {/* Two-up even at this width: ~170px each, which the select and the date
            field both hold. `min-w-0` on the cells so a long column name shrinks
            its select rather than pushing the row wider than the sheet. */}
        <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
          <label>
            <FieldLabel>Column</FieldLabel>
            <FieldShell>
              {current && (
                <ColumnGlyph
                  column={current}
                  className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2"
                />
              )}
              {/* `appearance-none` is what makes the padding above take: Safari
                  lays out a native `menulist` select's text itself and ignores
                  `padding-left`, which is why the glyph was sitting on top of the
                  column name. Losing the appearance loses its chevron too, hence
                  the one below — the same double arrow macOS draws on a popup
                  button, so the control still reads as one. */}
              <select
                value={task.columnId}
                onChange={(e) => onMoveToColumn(e.target.value)}
                className={cn(
                  FIELD,
                  // `pl-9` puts ten points between the glyph and the name, which
                  // is what the column's own header leaves: a 16px mark centred in
                  // a 20px box, then `gap-1`, then the title's own `px-1`.
                  "appearance-none pl-9 pr-7",
                  // And the featured column's name is accent in its header, so it
                  // is here too — the field should read as that column, not as a
                  // neutral copy of its text.
                  current?.isFocus && "text-accent",
                )}
              >
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name}
                  </option>
                ))}
              </select>
              <ChevronsUpDown
                aria-hidden
                className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint"
              />
            </FieldShell>
          </label>

          <label>
            <FieldLabel>Due date</FieldLabel>
            <FieldShell>
              <input
                type="date"
                value={toDateInputValue(draft.dueDate)}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    dueDate: fromDateInputValue(e.target.value),
                  }))
                }
                className={FIELD}
              />
            </FieldShell>
          </label>
        </div>

        <div>
          <FieldLabel>Priority</FieldLabel>
          {/* The same pills the card wears, not a segmented control. Priority is a
              pill everywhere else in the app — on the card, and in the dropdown
              that pill opens — so a four-across bar with a sliding white segment
              was the one place it looked like a different setting entirely. The
              chosen one takes its own colour straight from `PRIORITY_STYLES.pill`,
              which is the card's class, and the rest sit quiet in the same shape
              as the context pills below. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {PRIORITIES.map((priority) => {
              const on = draft.priority === priority;
              return (
                <button
                  key={priority}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, priority }))}
                  className={cn(
                    PILL,
                    "transition-colors",
                    on
                      ? PRIORITY_STYLES[priority].pill
                      : "bg-transparent text-ink-faint ring-hairline hover:text-ink",
                  )}
                >
                  <PriorityBars
                    level={priority}
                    className={cn(
                      "size-3.5",
                      on ? PRIORITY_STYLES[priority].chip : "text-ink-ghost",
                    )}
                  />
                  {PRIORITY_STYLES[priority].label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <FieldLabel>Contexts</FieldLabel>
          <div className="flex flex-wrap items-center gap-1.5">
            {contexts.map((context) => {
              const Icon = contextIcon(context.name);
              const on = draft.contextIds.includes(context.id);
              return (
                <button
                  key={context.id}
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      contextIds: on
                        ? d.contextIds.filter((id) => id !== context.id)
                        : [...d.contextIds, context.id],
                    }))
                  }
                  className={cn(
                    PILL,
                    "transition-colors",
                    on
                      ? "bg-panel-raised text-ink ring-hairline-strong"
                      : "bg-transparent text-ink-faint ring-hairline hover:text-ink",
                  )}
                >
                  <span
                    className={cn(
                      "mr-0.5 size-1.5 rounded-full",
                      labelColor(context.color).dot,
                    )}
                  />
                  <Icon className="size-3.5 opacity-70" />
                  {context.name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <FieldLabel>
            Subtasks
            {task.subtasks.length > 0 && (
              <span className="ml-1.5 font-mono normal-case tracking-normal text-ink-ghost">
                {task.subtasks.filter((sub) => sub.done).length}/
                {task.subtasks.length}
              </span>
            )}
          </FieldLabel>
          <Subtasks
            subtasks={task.subtasks}
            onAdd={onAddSubtask}
            onUpdate={onUpdateSubtask}
            onDelete={onDeleteSubtask}
          />
        </div>

        <div>
          <FieldLabel>Notes</FieldLabel>
          {/* Toolbar and editor share one box, the buttons along its top edge, so
              they read as part of what they act on rather than as a strip floating
              above it. `FieldShell` is the same surface the column and date fields
              wear, which also gets this one the accent edge on focus. */}
          <FieldShell radius="var(--corner-notes)">
            <RichNotes
              value={draft.description}
              onChange={(description) => setDraft((d) => ({ ...d, description }))}
              onSave={save}
              placeholder="Take notes"
            />
          </FieldShell>
        </div>

        <div>
          {/* The zoom reads out at the end of the label's line. An empty element
              handed down for the canvas to fill rather than a value passed up: the
              zoom changes on every event of a pinch, and holding it here would
              re-render the whole sheet at gesture rate. */}
          <div className="flex items-baseline gap-1.5">
            <FieldLabel>Visual canvas</FieldLabel>
            <span ref={setZoomSlot} className="mb-1.5" />
          </div>
          {/* The notes box's surface and corner, since it's the same kind of
              thing: a panel you put things into rather than a control. Its own
              writes, too — a screenshot is saved when it's pasted, not when the
              sheet's Save is pressed, so it isn't part of `draft`. */}
          <FieldShell radius="var(--corner-notes)">
            <VisualCanvas taskId={task.id} readout={zoomSlot} />
          </FieldShell>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Checklist editor. Writes through on every keystroke-completing action rather
 * than into the dialog's draft, because subtasks are their own rows — the Save
 * button covers the fields on the task itself.
 */
/**
 * The app's squircle, worn by a native control. The control keeps its own box for
 * layout and focus and paints nothing; the plate behind it carries the fill, the
 * hairline and the corner — the same split every other surface here uses, since a
 * `border-radius` on a `<select>` can only ever be a circular one.
 *
 * The fill and edge are set as classes rather than through `face`/`edge`, which
 * write inline custom properties that a `focus-within` variant couldn't override.
 */
function FieldShell({
  children,
  radius = "var(--corner-field)",
}: {
  children: ReactNode;
  /** Overridden by the notes box, which is bigger and takes a rounder corner. */
  radius?: string;
}) {
  return (
    <div
      // Just enough shadow to lift the white off the glass — these are the only
      // opaque surfaces in the sheet, and without it they sat flat on it.
      //
      // A `box-shadow` on this unclipped root rather than a `drop-shadow` on the
      // plate, which is the same call the task cards make: a filter would mean a
      // repaint layer per field, and at a 10px radius the gap between the
      // shadow's circular silhouette and the squircle over it vanishes under the
      // blur. The `rounded-*` here shapes only the shadow.
      // `rounded-[var(--sq-radius)]` so the one value below drives both the clip
      // path's corner and the box-shadow's silhouette.
      className="group relative isolate rounded-[var(--sq-radius)] shadow-[0_3px_12px_-2px] shadow-shade/[0.09]"
      style={{ "--sq-radius": radius } as CSSProperties}
    >
      <Plate
        surfaceClassName="[--sq-face:var(--color-panel-raised)] [--sq-edge:var(--color-hairline)] transition-colors group-focus-within:[--sq-edge:color-mix(in_oklab,var(--color-accent)_60%,transparent)]"
      />
      {/* One pixel of inset, which is the width of the plate's edge. The edge is
          painted *behind* the content — that's the whole plate technique — so
          anything reaching the field's perimeter covers it, and the focus ring is
          the thing you'd least want covered. Static rather than `relative`, so the
          glyph and chevron inside the two toggles still position against the shell.
      */}
      <div className="p-px">{children}</div>
    </div>
  );
}

function Subtasks({
  subtasks,
  onAdd,
  onUpdate,
  onDelete,
}: {
  subtasks: ClientTask["subtasks"];
  onAdd: (title: string) => void;
  onUpdate: (
    subtaskId: string,
    patch: { title?: string; done?: boolean },
  ) => void;
  onDelete: (subtaskId: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    onAdd(title);
    setDraft("");
  };

  return (
    <div className="space-y-1.5">
      {subtasks.map((sub) => (
        <div key={sub.id} className="group flex items-center gap-2">
          <button
            type="button"
            aria-label={sub.done ? "Mark as not done" : "Mark as done"}
            onClick={() => onUpdate(sub.id, { done: !sub.done })}
            className={cn(
              "grid size-4 shrink-0 place-items-center rounded-[5px] ring-1 ring-inset transition-colors",
              sub.done
                ? "bg-ink-faint/70 ring-transparent"
                : "ring-hairline-strong hover:ring-ink-ghost",
            )}
          >
            {sub.done && <Check className="size-3 text-white" />}
          </button>

          <input
            defaultValue={sub.title}
            onBlur={(e) => {
              const title = e.currentTarget.value.trim();
              if (title && title !== sub.title) onUpdate(sub.id, { title });
              else e.currentTarget.value = sub.title;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className={cn(
              "min-w-0 flex-1 bg-transparent text-sm outline-none",
              sub.done ? "text-ink-ghost line-through" : "text-ink",
            )}
          />

          <IconButton
            label="Delete subtask"
            onClick={() => onDelete(sub.id)}
            className="size-6 opacity-0 hover:text-rose-700 group-hover:opacity-100"
          >
            <Trash2 className="size-3" />
          </IconButton>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <span className="grid size-4 shrink-0 place-items-center rounded-[5px] ring-1 ring-dashed ring-inset ring-hairline-strong" />
        <input
          value={draft}
          placeholder="Add a subtask"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-ghost"
        />
      </div>
    </div>
  );
}

