"use client";

import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragMoveEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import * as actions from "@/app/actions";
import { AppSidebar } from "@/components/app-sidebar";
import { BoardColumn } from "@/components/board-column";
import { Plate, Toast } from "@/components/ui";
import {
  BoardHeader,
  type Filters,
  emptyFilters,
} from "@/components/board-header";
import { boardReducer, initBoardState } from "@/components/board-state";
import { type Box, FoldFlight } from "@/components/fold-flight";
import { PendingDemos } from "@/components/pending-demos";
import { SidebarResizer } from "@/components/sidebar-resizer";
import { TaskCardBody } from "@/components/task-card";
import { TaskDialog, type TaskPatch } from "@/components/task-dialog";
import { celebrate } from "@/lib/celebrate";
import { readFocused, toggleFocused, writeFocused } from "@/lib/focus";
import type { Priority } from "@/db/schema";
import type { HistoryFact } from "@/lib/history-fact";
import { clipTitle, plainText } from "@/lib/utils";
import type {
  ClientBoard,
  ClientBoardData,
  ClientColumn,
  ClientLabel,
  ClientSubtask,
  ClientTask,
  DropHint,
} from "@/lib/types";

/**
 * How often to look for new Slack pins. Slack rates `reactions.list` at Tier 2
 * (20+/min), so this is three orders of magnitude inside the limit — the number
 * is chosen for how soon a pin should appear, not to avoid throttling.
 */
const SLACK_POLL_MS = 3 * 60 * 1000;

/**
 * How much of a card, as a fraction of its height around the middle, means "into
 * this card" rather than above or below it. The outer quarters are the two
 * insertion slots, and they're what a reorder aims at.
 *
 * There's no dwell and no hysteresis on this, because there's nothing to chase:
 * the card being aimed at is the one card that doesn't move as the others make
 * room (see `roomFor` in `src/lib/drag.ts`). Where you point is what you get,
 * immediately.
 */
const DROP_INTO_BAND = 0.5;

/**
 * How far back ⌘Z reaches. The stack holds closures over card ids, not copies of
 * the board, so the cost of a deep history is negligible — this is about how far
 * back a step is still recognisable as yours.
 */
const UNDO_LIMIT = 50;

export function BoardView({
  data,
  boards,
  fact,
}: {
  data: ClientBoardData;
  boards: ClientBoard[];
  fact: HistoryFact | null;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(boardReducer, data, initBoardState);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  /**
   * The cards being worked on, up to three — see `src/lib/focus.ts` for the cap and
   * why this lives on the device. Read after mount rather than during render,
   * because the server has no idea which they are and rendering a guess would be a
   * hydration mismatch; the rings simply arrive a frame late, which for a mark you
   * set yourself is unnoticeable.
   */
  const [focusedTaskIds, setFocusedTaskIds] = useState<string[]>([]);
  useEffect(() => setFocusedTaskIds(readFocused()), []);

  const toggleFocus = useCallback((taskId: string) => {
    setFocusedTaskIds((current) => {
      const next = toggleFocused(current, taskId);
      writeFocused(next);
      return next;
    });
  }, []);
  const [composeColumnId, setComposeColumnId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{
    type: "task" | "column";
    id: string;
    /** Which column a task drag began in, for the drag overlay's own styling. */
    fromColumnId?: string;
  } | null>(null);
  /**
   * What the drop would do, drawn on the card being pointed at: land above it,
   * below it, or inside it as a checklist item. Kept in a ref as well as in state
   * because the drop handler needs the value the user was just shown, and a state
   * update from the last `onDragMove` hasn't landed by then.
   */
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const hint = useRef<DropHint | null>(null);
  /** A card in flight into the one that swallowed it. Cleared when it lands. */
  const [folding, setFolding] = useState<{
    task: ClientTask;
    targetId: string;
    from: Box;
    to: Box;
  } | null>(null);
  /**
   * The checklist row the fold-in creates, held back until the flight lands.
   *
   * The row arrives from the server long before the card does — a few
   * milliseconds against a third of a second — and adding it early grows the
   * target mid-flight, shifting it and everything under it out from under the
   * card still travelling towards it. So the target keeps showing the dashed
   * placeholder it had during the drag, and this swaps it for the real row at
   * the moment of landing: same height, so nothing reflows at all.
   */
  const pendingRow = useRef<{ taskId: string; apply: () => void } | null>(null);
  /** Which card is mid-flight, readable the instant the drop is handled. */
  const flying = useRef<string | null>(null);
  /** Last pointer position dnd-kit computed, filled in by collision detection. */
  const pointer = useRef<{ x: number; y: number } | null>(null);
  /**
   * And the last one the window saw, which is a different thing: this one is kept
   * up to date whether or not a drag is running, so a keystroke can ask where the
   * mouse is. Null until the mouse first moves — a keyboard-only session never
   * fills it in.
   */
  const mouse = useRef<{ x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * The quiet toast: what ⌘Z just did, and what a fold-in just did — the two
   * edits worth narrating, because both make a card leave the board.
   */
  const [notice, setNotice] = useState<{ text: string; hint?: string } | null>(
    null,
  );

  /**
   * The two halves of the ⌘Z history — see `record` below for how they're kept.
   * Refs rather than state: entries are recorded and replayed inside event
   * handlers, which have to see the current stack and not their render's copy.
   */
  const undoStack = useRef<{ label: string; run: () => void }[]>([]);
  const redoStack = useRef<{ label: string; run: () => void }[]>([]);
  /** Which direction we're replaying in, so `record` knows where to file. */
  const replaying = useRef<"undo" | "redo" | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [sideFade, setSideFade] = useState({ left: false, right: false });

  /**
   * The board as it is now, for the mutations below to read.
   *
   * They can't use the render's `state`: an undo entry is a closure that outlives
   * the render that recorded it — three edits later it still has to see today's
   * cards to work out which neighbours a card is going back between — and the
   * ones that await a server action read after their render is already stale.
   * Going through this ref makes every mutation independent of *when* it was
   * created, which is what makes replaying an old one safe.
   *
   * Assigned during render rather than in an effect: a drop is handled from a
   * pointer event that can be delivered before a passive effect has flushed, and
   * a move whose neighbours came from one render stale would write the card to
   * the wrong place. Writing the current render's own state is idempotent.
   */
  const live = useRef(state);
  live.current = state;

  // The board id changing means we navigated to another board; a new reducer
  // init is the only way to swap the whole dataset out.
  const boardId = data.board.id;
  useEffect(() => {
    dispatch({ type: "reset", data });
    // Fresh rows from the server: whatever the stacks knew about the old ones no
    // longer describes what's on screen. This also fires after a failed write
    // re-fetches, which is exactly when the history is least trustworthy.
    undoStack.current = [];
    redoStack.current = [];
  }, [data]);

  /**
   * Every mutation is applied locally first and persisted in the background.
   * If the server rejects it, re-fetch rather than trying to invert the edit.
   *
   * Resolves with whether the write actually landed. Nothing has to look — most
   * callers still fire and forget, and the error banner is unchanged — but it
   * means a caller holding something it can't afford to lose has a way to find
   * out. The task sheet is the one that does: it keeps a copy of what you typed
   * until this says the database has it.
   */
  const persist = useCallback(
    (run: () => Promise<unknown>, message: string): Promise<boolean> =>
      new Promise((resolve) => {
        startTransition(async () => {
          try {
            await run();
            resolve(true);
          } catch (cause) {
            console.error(cause);
            setError(message);
            router.refresh();
            resolve(false);
          }
        });
      }),
    [router],
  );

  // ------------------------------------------------------------------- undo

  /**
   * ⌘Z is built out of the mutations themselves rather than a parallel set of
   * inverse writes: an entry's `run` calls the same helpers a click would, so
   * undoing a move *is* a move, and it records its own inverse on the way past.
   * That's where redo comes from — the two stacks are the same machinery read in
   * opposite directions, and there is no second code path to keep honest.
   *
   * The stacks are declared with the rest of the state above, because the reset
   * effect clears them.
   */
  const record = useCallback(
    (label: string, run: () => void, mode = replaying.current) => {
      const entry = { label, run };
      if (mode === "undo") {
        // Reversing an edit is itself an edit worth reversing.
        redoStack.current.push(entry);
        return;
      }
      undoStack.current.push(entry);
      if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
      // A fresh edit forks the timeline; a redo continues along it.
      if (mode !== "redo") redoStack.current = [];
    },
    [],
  );

  /**
   * For the mutations that can only describe their inverse once the server has
   * answered — a card's id doesn't exist until it's been created. They capture
   * the direction at call time, because by the time the promise resolves the
   * replay has finished and the ref has been reset.
   */
  const recorder = useCallback(() => {
    const mode = replaying.current;
    return (label: string, run: () => void) => record(label, run, mode);
  }, [record]);

  const step = useCallback(
    (direction: "undo" | "redo") => {
      const stack = direction === "undo" ? undoStack : redoStack;
      const entry = stack.current.pop();
      if (!entry) {
        setNotice({
          text: direction === "undo" ? "Nothing to undo" : "Nothing to redo",
        });
        return;
      }

      replaying.current = direction;
      try {
        entry.run();
      } finally {
        replaying.current = null;
      }

      setNotice({
        text:
          direction === "undo"
            ? `Undid ${entry.label}`
            : `Redid ${entry.label}`,
        hint: direction === "undo" ? "⇧⌘Z to put it back" : "⌘Z to undo again",
      });
    },
    [],
  );

  /**
   * Slack pins, pulled in while the board is open.
   *
   * Polling rather than a webhook, because Slack can't reach localhost — see
   * `src/lib/slack.ts`. It runs once on mount and then on an interval; the
   * action is a no-op without `SLACK_USER_TOKEN`, so this costs nothing until
   * the integration is configured. Only a non-zero `created` triggers a refresh,
   * so a quiet poll doesn't re-render the board every few minutes.
   *
   * Failures are logged and swallowed: a dropped network or an expired token
   * shouldn't put a toast in front of a board the user is working on.
   */
  useEffect(() => {
    let cancelled = false;

    const pull = async () => {
      try {
        const { created } = await actions.syncSlackPins(boardId);
        if (created > 0 && !cancelled) router.refresh();
      } catch (cause) {
        console.warn("Slack sync failed", cause);
      }
    };

    pull();
    const timer = setInterval(pull, SLACK_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [boardId, router]);

  const labelsById = useMemo(
    () => new Map(state.labels.map((l) => [l.id, l])),
    [state.labels],
  );

  const visibleTaskIds = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const matches = (task: ClientTask) => {
      if (filters.contextId === "none" && task.contextIds.length > 0)
        return false;
      if (
        filters.contextId !== null &&
        filters.contextId !== "none" &&
        !task.contextIds.includes(filters.contextId)
      )
        return false;
      if (filters.hideDone && task.completedAt !== null) return false;
      if (
        filters.priorities.length &&
        !filters.priorities.includes(task.priority)
      )
        return false;
      if (
        filters.labelIds.length &&
        !filters.labelIds.some((id) => task.labelIds.includes(id))
      )
        return false;
      if (
        query &&
        !task.title.toLowerCase().includes(query) &&
        !plainText(task.description).toLowerCase().includes(query)
      )
        return false;
      return true;
    };

    const byColumn: Record<string, string[]> = {};
    for (const columnId of state.columnOrder) {
      byColumn[columnId] = (state.taskOrder[columnId] ?? []).filter((id) => {
        const task = state.tasks[id];
        return task ? matches(task) : false;
      });
    }
    return byColumn;
  }, [filters, state.columnOrder, state.taskOrder, state.tasks]);

  // Soften whichever side of the board has columns scrolled past it.
  const measureSides = useCallback(() => {
    const el = boardRef.current;
    if (!el) return;
    setSideFade({
      left: el.scrollLeft > 2,
      right: el.scrollWidth - el.scrollLeft - el.clientWidth > 2,
    });
  }, []);

  useEffect(() => {
    measureSides();
    const el = boardRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureSides);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measureSides, state.columnOrder.length]);

  /**
   * Sidebar counts deliberately ignore the context filter — a row has to show
   * how many cards it holds even while a different row is selected.
   */
  const contextCounts = useMemo(() => {
    const counts: Record<string, number> & { all: number; none: number } = {
      all: 0,
      none: 0,
    };
    for (const task of Object.values(state.tasks)) {
      counts.all += 1;
      if (task.contextIds.length === 0) {
        counts.none += 1;
        continue;
      }
      // A card in two contexts counts under both.
      for (const contextId of task.contextIds) {
        counts[contextId] = (counts[contextId] ?? 0) + 1;
      }
    }
    return counts;
  }, [state.tasks]);

  // ------------------------------------------------------------- drag & drop

  const sensors = useSensors(
    // A few pixels of slop so a click to open a card isn't read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const resolveColumn = (overId: string) =>
    state.columns[overId] ? overId : state.tasks[overId]?.columnId;

  /**
   * Columns only ever collide with columns — otherwise a column dragged over a
   * card resolves to that card and the drop silently does nothing. Cards prefer
   * other cards so you can aim between two of them, and fall back to the column
   * itself when the pointer is over empty space.
   */
  const collisionDetection: CollisionDetection = (args) => {
    // Where dnd-kit thinks the pointer is, in the same space as the rects it
    // measured — which is what the nest band has to be judged against, and isn't
    // otherwise handed to the drag callbacks.
    pointer.current = args.pointerCoordinates ?? null;

    if (args.active.data.current?.type === "column") {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (container) => container.data.current?.type === "column",
        ),
      });
    }

    const pointerHits = pointerWithin(args);
    const hits = pointerHits.length ? pointerHits : closestCorners(args);
    const cardHits = hits.filter((hit) => state.tasks[String(hit.id)]);
    return cardHits.length ? cardHits : hits;
  };

  /**
   * What dropping right now would do: land above the card being pointed at, below
   * it, or inside it.
   *
   * Judged from the pointer against the card's own box, not from the dragged
   * card's centre — you aim with the cursor, and where you happened to grab the
   * card shouldn't change what it can be dropped on. No dwell and no hysteresis
   * are needed because the cards don't move: this reads off a layout that stands
   * still for the whole drag.
   *
   * A keyboard drag never nests. It steps from card to card, landing dead centre
   * on each one, so "into" would swallow every stop and leave no way to reorder
   * with the arrow keys — those get the insertion slots only.
   */
  const dropHintFor = ({
    active,
    over,
    activatorEvent,
  }: DragMoveEvent): DropHint | null => {
    if (!over || active.data.current?.type !== "task") return null;

    const activeId = String(active.id);
    const title = state.tasks[activeId]?.title;
    const overId = String(over.id);
    if (!title || overId === activeId) return null;

    // Over the column rather than any card in it — the empty space past the last
    // one. That slot is the bottom edge of the last card, so the hint says so and
    // the same bar draws it. An empty column gets nothing: there's no card to
    // hang a bar on, and nowhere else the drop could land anyway.
    if (!state.tasks[overId]) {
      const last = (state.taskOrder[overId] ?? [])
        .filter((id) => id !== activeId)
        .at(-1);
      return last ? { targetId: last, where: "below", title } : null;
    }

    const keyboard = activatorEvent instanceof KeyboardEvent;
    const at = pointer.current;

    // Without a pointer there's only the dragged card's top edge to go on, which
    // gives the two insertion slots and nothing else.
    if (keyboard || !at) {
      const rect = active.rect.current.translated;
      const below = rect
        ? rect.top > over.rect.top + over.rect.height / 2
        : false;
      return { targetId: overId, where: below ? "below" : "above", title };
    }

    const offset = at.y - over.rect.top;
    const edge = (over.rect.height * (1 - DROP_INTO_BAND)) / 2;
    if (offset < edge) return { targetId: overId, where: "above", title };
    if (offset > over.rect.height - edge) {
      return { targetId: overId, where: "below", title };
    }
    return { targetId: overId, where: "into", title };
  };

  const clearHint = () => {
    hint.current = null;
    setDropHint(null);
  };

  /**
   * `onDragOver` only fires when the card underneath changes, and all three
   * outcomes live *within* one card — so this is tracked on every move.
   */
  const onDragMove = (event: DragMoveEvent) => {
    const next = dropHintFor(event);
    const current = hint.current;
    if (
      next?.targetId === current?.targetId &&
      next?.where === current?.where
    ) {
      return;
    }
    hint.current = next;
    setDropHint(next);
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    const id = String(active.id);
    setDragging({
      type: active.data.current?.type === "column" ? "column" : "task",
      id,
      fromColumnId: state.tasks[id]?.columnId,
    });
  };

  /**
   * Which slot in `to`'s order a card lands in, as an index into that order with
   * the card itself taken out — what the reducer and `moveTaskTo` both expect.
   * Straight off the hint, so the drop goes exactly where the bar was drawn.
   */
  const slotFor = (activeId: string, to: string, at: DropHint | null) => {
    const order = (state.taskOrder[to] ?? []).filter((id) => id !== activeId);
    if (!at || at.targetId === activeId) return order.length;

    const index = order.indexOf(at.targetId);
    if (index < 0) return order.length;
    return at.where === "below" ? index + 1 : index;
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const dropped = hint.current;
    setDragging(null);
    clearHint();
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (active.data.current?.type === "column") {
      const overColumnId = resolveColumn(overId);
      if (!overColumnId || activeId === overColumnId) return;
      const toIndex = state.columnOrder.indexOf(overColumnId);
      if (toIndex < 0) return;
      moveColumnTo(activeId, toIndex);
      return;
    }

    // Released over its own hole, which the card never left. Checked before the
    // slot arithmetic, where a missing hint means "the end of the column" — the
    // right answer for a drop on empty space, and quite the wrong one here.
    if (overId === activeId) return;

    // Dropped inside another card rather than next to it — that's a fold-in, and
    // the card doesn't need a place in any column any more.
    if (dropped?.where === "into" && state.tasks[dropped.targetId]) {
      const task = state.tasks[activeId];
      const released = active.rect.current.translated;
      // Both rects are dnd-kit's, and the drag left the layout alone, so they
      // still describe what's on screen: where the card was let go, and the card
      // it's going into.
      if (task && released) {
        // A second fold-in while one is still in the air: land the first now
        // rather than replacing its flight and stranding the row it was carrying.
        if (flying.current) landFold();
        flying.current = activeId;
        setFolding({
          task,
          targetId: dropped.targetId,
          from: released,
          to: over.rect,
        });
      }
      nestTask(activeId, dropped.targetId);
      return;
    }

    // Read off `over`, since nothing moved during the drag: the card is still
    // wherever it started, and this is the first and only write.
    const columnId = resolveColumn(overId) ?? state.tasks[activeId]?.columnId;
    if (!columnId || !state.taskOrder[columnId]) return;

    moveTaskTo(activeId, columnId, slotFor(activeId, columnId, dropped));
  };

  // ------------------------------------------------------------- mutations

  const quickAdd = (columnId: string, title: string) => {
    const remember = recorder();
    persist(async () => {
      // Adding a card while a context is selected files it under that context.
      const contextIds =
        filters.contextId && filters.contextId !== "none"
          ? [filters.contextId]
          : [];
      const task = await actions.createTask({
        boardId,
        columnId,
        contextIds,
        title,
      });
      dispatch({
        type: "task/add",
        task: {
          ...task,
          subtasks: [],
          dueDate: null,
          completedAt: null,
          createdAt: Date.now(),
          labelIds: [],
          // Typed here, so it has no upstream to point back at.
          source: null,
        },
      });
      // Undone by archiving rather than deleting, which is both this app's habit
      // and what keeps the id alive — so redo brings back the same card and not
      // a copy of it.
      remember("adding that card", () => archiveCard(task.id));
    }, "Couldn't add that task");
  };

  /**
   * The one way a card changes place, so the neighbour arithmetic lives once.
   * `index` is a slot in the target column's order with the card taken out of
   * wherever it was.
   *
   * Where the card is when this runs is where ⌘Z puts it back. That's sound for a
   * drag because nothing moves until the drop: the card is still in the slot it
   * was picked up from, and this is the only write the whole gesture makes.
   */
  const moveTaskTo = (taskId: string, columnId: string, index: number) => {
    const task = live.current.tasks[taskId];
    if (!task || !live.current.taskOrder[columnId]) return;

    const origin = {
      columnId: task.columnId,
      index: live.current.taskOrder[task.columnId]?.indexOf(taskId) ?? 0,
    };

    // Mirrors the reducer's own `task/move`, to name the neighbours the card
    // ends up between without waiting for the render.
    const sameColumn = origin.columnId === columnId;
    const order = live.current.taskOrder[columnId].filter((id) => id !== taskId);
    order.splice(Math.max(0, Math.min(index, order.length)), 0, taskId);
    const at = order.indexOf(taskId);

    // A drag that ends where it started is not an edit: no write, and nothing
    // for ⌘Z to step back through later.
    if (sameColumn && at === origin.index) return;

    record("the move", () => moveTaskTo(taskId, origin.columnId, origin.index));
    dispatch({ type: "task/move", taskId, toColumnId: columnId, toIndex: index });
    persist(
      () =>
        actions.moveTask(
          taskId,
          columnId,
          order[at - 1] ?? null,
          order[at + 1] ?? null,
        ),
      "Couldn't save the card's new place",
    );

    // Finishing something is worth marking; shuffling within a done column
    // isn't, hence the check against where the card came from.
    if (
      !sameColumn &&
      live.current.columns[columnId]?.isDone &&
      !live.current.columns[origin.columnId]?.isDone
    ) {
      void celebrate();
    }
  };

  /** Pill dropdowns on the card write straight through, no dialog involved. */
  const setTaskContexts = (taskId: string, contextIds: string[]) => {
    const previous = live.current.tasks[taskId]?.contextIds;
    if (!previous) return;

    record("the context change", () => setTaskContexts(taskId, previous));
    dispatch({ type: "task/patch", taskId, patch: { contextIds } });
    persist(
      () => actions.updateTask(taskId, { contextIds }),
      "Couldn't change that card's contexts",
    );
  };

  const setTaskPriority = (taskId: string, priority: Priority) => {
    const previous = live.current.tasks[taskId]?.priority;
    if (!previous) return;

    record("the priority change", () => setTaskPriority(taskId, previous));
    dispatch({ type: "task/patch", taskId, patch: { priority } });
    persist(
      () => actions.updateTask(taskId, { priority }),
      "Couldn't change that card's priority",
    );
  };

  /**
   * Archiving and its inverse, as one pair. Nothing on screen archives any more —
   * that button is now "Move to backlog", which puts the card somewhere you can
   * find it — but ⌘Z still needs this to undo a card being *created*. Deleting
   * would work once and then have nothing to redo; archiving keeps the row and its
   * id, so redo brings back the same card rather than a copy of it.
   *
   * Each card's slot travels with it, so coming back doesn't mean landing at the
   * top of the column, and both directions move the whole set in one step.
   */
  type ArchiveEntry = { task: ClientTask; index: number };

  const archiveCards = (entries: ArchiveEntry[], label: string) => {
    if (entries.length === 0) return;

    // Re-read each card on the way out. Redoing an archive replays the entries it
    // was given, which by then can describe a card as it was two edits ago.
    const current = entries.map(({ task, index }) => ({
      task: live.current.tasks[task.id] ?? task,
      index,
    }));

    record(label, () => restoreCards(current, label));
    dispatch({ type: "task/remove", taskIds: entries.map((e) => e.task.id) });
    persist(
      () => actions.archiveTasks(entries.map((e) => e.task.id)),
      "Couldn't archive that",
    );
  };

  const restoreCards = (entries: ArchiveEntry[], label: string) => {
    if (entries.length === 0) return;

    record(label, () => archiveCards(entries, label));
    for (const { task, index } of entries) {
      dispatch({ type: "task/insert", task, index });
    }
    persist(
      () => actions.unarchiveTasks(entries.map((e) => e.task.id)),
      "Couldn't put those cards back",
    );
  };

  /** Where a card sits in its column, which archiving has to remember. */
  const entryFor = (taskId: string): ArchiveEntry[] => {
    const task = live.current.tasks[taskId];
    if (!task) return [];
    const index = live.current.taskOrder[task.columnId]?.indexOf(taskId) ?? 0;
    return [{ task, index }];
  };

  const archiveCard = (taskId: string) =>
    archiveCards(entryFor(taskId), "adding that card");

  // Checklists: the client keeps the whole array, so each change replaces it
  // locally and persists just the one row that moved.
  const addSubtask = (taskId: string, title: string) => {
    const remember = recorder();
    persist(async () => {
      const created = await actions.createSubtask(taskId, title);
      const task = live.current.tasks[taskId];
      dispatch({
        type: "task/patch",
        taskId,
        patch: {
          subtasks: [
            ...(task?.subtasks ?? []),
            { id: created.id, title: created.title, done: created.done },
          ],
        },
      });
      remember("that subtask", () => deleteSubtask(taskId, created.id));
    }, "Couldn't add that subtask");
  };

  /**
   * A card dropped into another card becomes a checklist item on it and leaves
   * the board. It goes locally straight away; the item itself waits for the
   * insert, since only the server can name it — the same round trip `addSubtask`
   * makes, and the card vanishing is the feedback that the drop landed.
   */
  const nestTask = (taskId: string, parentId: string) => {
    const task = live.current.tasks[taskId];
    if (!task) return;
    const index = live.current.taskOrder[task.columnId]?.indexOf(taskId) ?? 0;
    const remember = recorder();

    // Said out loud, because a fold-in is the one edit that takes a card off the
    // board: the flight shows where it went, this says what it became and that
    // it's reversible. A replay overwrites this with its own line, which is
    // right — "Undid the fold-in" is the more useful thing to have said.
    const into = live.current.tasks[parentId]?.title;
    setNotice({
      text: into
        ? `Folded “${clipTitle(task.title)}” into “${clipTitle(into)}”`
        : `Folded “${clipTitle(task.title)}” in`,
      hint: "⌘Z to undo",
    });

    dispatch({ type: "task/remove", taskIds: [taskId] });
    persist(async () => {
      const added = await actions.nestTaskAsSubtask(taskId, parentId);

      const apply = () => {
        const parent = live.current.tasks[parentId];
        dispatch({
          type: "task/patch",
          taskId: parentId,
          patch: { subtasks: [...(parent?.subtasks ?? []), ...added] },
        });
      };

      // Held only while the card is still on its way in; a fold-in with no
      // flight — replayed by ⇧⌘Z, or reduced motion — lands the row at once.
      if (flying.current === taskId) {
        pendingRow.current = { taskId, apply };
      } else {
        apply();
      }

      // The first item is the card itself; the rest is the checklist it brought
      // along, which has to go back with it.
      const [became, ...carried] = added;
      remember("the fold-in", () =>
        unnestTask(taskId, parentId, task, index, became.id, carried),
      );
    }, "Couldn't fold that card into the one below it");
  };

  /** The card has arrived: the row it became replaces the placeholder. */
  const landFold = useCallback(() => {
    pendingRow.current?.apply();
    pendingRow.current = null;
    flying.current = null;
    setFolding(null);
  }, []);

  /** The inverse of a fold-in: the card returns, the item it became goes. */
  const unnestTask = (
    taskId: string,
    parentId: string,
    task: ClientTask,
    index: number,
    subtaskId: string,
    carried: ClientSubtask[],
  ) => {
    // Undone before it finished landing. The row it was about to gain must not
    // arrive afterwards, and the card itself is coming back, so the flight has
    // nothing left to deliver.
    if (pendingRow.current?.taskId === taskId) pendingRow.current = null;
    if (flying.current === taskId) {
      flying.current = null;
      setFolding(null);
    }

    const carriedIds = carried.map((sub) => sub.id);
    const removed = new Set([subtaskId, ...carriedIds]);
    const parent = live.current.tasks[parentId];

    record("the fold-in", () => nestTask(taskId, parentId));
    dispatch({
      type: "task/insert",
      task: { ...task, subtasks: carried },
      index,
    });
    if (parent) {
      dispatch({
        type: "task/patch",
        taskId: parentId,
        patch: {
          subtasks: parent.subtasks.filter((sub) => !removed.has(sub.id)),
        },
      });
    }
    persist(
      () => actions.unnestTask(taskId, subtaskId, carriedIds),
      "Couldn't unfold that card",
    );
  };

  const updateSubtask = (
    taskId: string,
    subtaskId: string,
    patch: { title?: string; done?: boolean },
  ) => {
    const task = live.current.tasks[taskId];
    const previous = task?.subtasks.find((sub) => sub.id === subtaskId);
    if (!task || !previous) return;

    record(patch.done === undefined ? "that subtask" : "the tick", () =>
      updateSubtask(taskId, subtaskId, {
        title: previous.title,
        done: previous.done,
      }),
    );
    dispatch({
      type: "task/patch",
      taskId,
      patch: {
        subtasks: task.subtasks.map((sub) =>
          sub.id === subtaskId ? { ...sub, ...patch } : sub,
        ),
      },
    });
    persist(
      () => actions.updateSubtask(subtaskId, patch),
      "Couldn't update that subtask",
    );
  };

  const deleteSubtask = (taskId: string, subtaskId: string) => {
    const task = live.current.tasks[taskId];
    const removed = task?.subtasks.find((sub) => sub.id === subtaskId);
    if (!task || !removed) return;

    // Undone by re-adding, which means a new row: the item comes back at the
    // bottom of the checklist rather than where it was, and ticked afresh.
    record("deleting that subtask", () => addSubtask(taskId, removed.title));
    dispatch({
      type: "task/patch",
      taskId,
      patch: { subtasks: task.subtasks.filter((sub) => sub.id !== subtaskId) },
    });
    persist(
      () => actions.deleteSubtask(subtaskId),
      "Couldn't delete that subtask",
    );
  };

  /** Resolves with whether the edit reached the database — see `persist`. */
  const saveTask = (taskId: string, patch: TaskPatch): Promise<boolean> => {
    const task = live.current.tasks[taskId];
    if (!task) return Promise.resolve(false);

    // Only the fields this save touched, so undoing it doesn't reach further
    // back than the edit did.
    const previous = Object.fromEntries(
      Object.keys(patch).map((key) => [key, task[key as keyof ClientTask]]),
    ) as TaskPatch;

    record("your edits", () => saveTask(taskId, previous));
    dispatch({ type: "task/patch", taskId, patch });
    return persist(
      () => actions.updateTask(taskId, patch),
      "Couldn't save your changes",
    );
  };

  const renameBoard = (name: string) => {
    const previous = live.current.boardName;

    record("the rename", () => renameBoard(previous));
    dispatch({ type: "board/rename", name });
    persist(
      () => actions.renameBoard(boardId, name),
      "Couldn't rename the board",
    );
  };

  /** Column name, WIP limit and the three flags, all invertible in one place. */
  const patchColumn = (
    columnId: string,
    patch: Partial<ClientColumn>,
    label: string,
  ) => {
    const column = live.current.columns[columnId];
    if (!column) return;

    const previous = Object.fromEntries(
      Object.keys(patch).map((key) => [key, column[key as keyof ClientColumn]]),
    ) as Partial<ClientColumn>;

    const heldFocus = live.current.columnOrder.find(
      (id) => live.current.columns[id]?.isFocus,
    );

    record(label, () => {
      // Featuring a column cleared the flag from whichever held it before, so
      // undo has to hand it back rather than just unset this one.
      if (patch.isFocus && heldFocus) {
        patchColumn(heldFocus, { isFocus: true }, label);
        return;
      }
      patchColumn(columnId, previous, label);
    });

    if (patch.isFocus) {
      // Mirror the server's exclusivity so the change is instant.
      for (const other of live.current.columnOrder) {
        if (live.current.columns[other]?.isFocus && other !== columnId) {
          dispatch({
            type: "column/patch",
            columnId: other,
            patch: { isFocus: false },
          });
        }
      }
    }
    dispatch({ type: "column/patch", columnId, patch });
    persist(
      () => actions.updateColumn(columnId, patch),
      "Couldn't update the column",
    );
  };

  const moveColumnTo = (columnId: string, index: number) => {
    const from = live.current.columnOrder.indexOf(columnId);
    if (from < 0) return;

    const order = live.current.columnOrder.filter((id) => id !== columnId);
    order.splice(Math.max(0, Math.min(index, order.length)), 0, columnId);
    const at = order.indexOf(columnId);

    record("the column move", () => moveColumnTo(columnId, from));
    dispatch({ type: "column/move", columnId, toIndex: index });
    persist(
      () =>
        actions.moveColumn(
          columnId,
          order[at - 1] ?? null,
          order[at + 1] ?? null,
        ),
      "Couldn't save the column order",
    );
  };

  /** From the dialog's column picker: lands at the bottom of the column. */
  const moveTaskToColumn = (taskId: string, columnId: string) =>
    moveTaskTo(taskId, columnId, live.current.taskOrder[columnId]?.length ?? 0);

  const createContext = (name: string, color: string) => {
    persist(async () => {
      const context = await actions.createContext(boardId, name, color);
      dispatch({
        type: "context/add",
        context: { id: context.id, name: context.name, color: context.color },
      });
    }, "Couldn't add that context");
  };

  const updateContext = (
    contextId: string,
    patch: { name?: string; color?: string },
  ) => {
    const context = live.current.contexts.find((c) => c.id === contextId);
    if (!context) return;

    record("that context change", () =>
      updateContext(contextId, { name: context.name, color: context.color }),
    );
    dispatch({ type: "context/patch", contextId, patch });
    persist(
      () => actions.updateContext(contextId, patch),
      "Couldn't update that context",
    );
  };

  const deleteContext = (contextId: string) => {
    dispatch({ type: "context/remove", contextId });
    if (filters.contextId === contextId) {
      setFilters((f) => ({ ...f, contextId: null }));
    }
    persist(
      () => actions.deleteContext(contextId),
      "Couldn't delete that context",
    );
  };

  const addColumn = () => {
    persist(async () => {
      const column = await actions.createColumn(boardId, "New column");
      dispatch({
        type: "column/add",
        column: {
          id: column.id,
          name: column.name,
          wipLimit: column.wipLimit,
          isDone: column.isDone,
          isMuted: column.isMuted,
          isFocus: column.isFocus,
        },
      });
    }, "Couldn't add that column");
  };

  /**
   * A new card opens wherever you're pointing — the column under the cursor is
   * almost always the one you meant, and it saves aiming at a composer after the
   * fact. Off the columns entirely, it falls back to the featured one, then to
   * the first.
   *
   * Hit-tested on demand rather than tracked per column: a keystroke has no
   * position of its own, so the last pointer move is the only record of where the
   * mouse is, and asking the document once is cheaper than every column knowing
   * whether it's hovered.
   */
  const startNewTask = useCallback(() => {
    const at = mouse.current;
    const under = at
      ? document
          .elementFromPoint(at.x, at.y)
          ?.closest<HTMLElement>("[data-column]")?.dataset.column
      : undefined;

    const { columnOrder, columns } = live.current;
    const focused = columnOrder.find((id) => columns[id]?.isFocus);
    setComposeColumnId(
      (under && columns[under] ? under : null) ??
        focused ??
        columnOrder[0] ??
        null,
    );
  }, []);

  // ------------------------------------------------------------- shortcuts

  // Into a ref, so following the mouse costs nothing between keystrokes.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Checked before the typing guard: ⌘K should reach the search box even
      // when the focus is already inside a field. `code` is checked too because
      // `key` can arrive as something else under non-Latin layouts.
      if (
        (e.metaKey || e.ctrlKey) &&
        (e.key.toLowerCase() === "k" || e.code === "KeyK")
      ) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }

      // ⌘N / ⌃N / ⌥N for a new task. Checked before the typing guard so it works
      // from a field, though a browser may keep ⌘N for itself — see `n` below,
      // which always reaches us.
      if (
        (e.metaKey || e.ctrlKey || e.altKey) &&
        (e.key.toLowerCase() === "n" || e.code === "KeyN")
      ) {
        e.preventDefault();
        startNewTask();
        return;
      }

      const target = e.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");

      // ⌘Z / ⇧⌘Z for the board's own history — but not from inside a field,
      // where the browser's text undo is what you meant and is the only thing
      // that can put a half-typed title back.
      if (
        !typing &&
        (e.metaKey || e.ctrlKey) &&
        (e.key.toLowerCase() === "z" || e.code === "KeyZ")
      ) {
        e.preventDefault();
        // Works with the sheet open too: it follows whatever an undo does to the
        // card it's showing, as long as you haven't typed into it — see the draft
        // effect in `TaskDialog`.
        step(e.shiftKey ? "redo" : "undo");
        return;
      }

      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      // A plain letter, like `n`: ⌘K is unreliable because some browsers (Arc,
      // and Chrome with certain extensions) keep it for their own command bar
      // and never deliver the keydown. ⌘K above still works where it arrives.
      if (e.key === "s") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (e.key === "n" && !openTaskId) {
        e.preventDefault();
        startNewTask();
      }
      if (e.key === "Escape") {
        setComposeColumnId(null);
        setFilters((f) => ({ ...emptyFilters, contextId: f.contextId }));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openTaskId, startNewTask, step]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  // Shorter than the error's five seconds: this one is a receipt, not a warning.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  const openTask = openTaskId ? state.tasks[openTaskId] : null;

  /**
   * The board's parking lot: the muted column, found by its flag rather than by
   * the name "Backlog" — the same way `syncSlackPins` picks its import target, so
   * a rename can't break either of them. Undefined if no column is marked, which
   * is what hides the sheet's button.
   */
  const backlogColumnId = state.columnOrder.find(
    (id) => state.columns[id]?.isMuted,
  );

  /**
   * The sheet outlives `openTaskId` by the length of its slide-out, so it has
   * something to render on the way off screen — including a card that archive or
   * delete has already taken out of the board. `leaving` holds that last copy and
   * the sheet clears it when the animation ends.
   */
  const shown = useRef<ClientTask | null>(null);
  if (openTask) shown.current = openTask;
  const [leaving, setLeaving] = useState<ClientTask | null>(null);
  useEffect(() => {
    if (openTaskId === null && shown.current) setLeaving(shown.current);
  }, [openTaskId]);
  const sheetTask = openTask ?? leaving;
  const draggedTask =
    dragging?.type === "task" ? state.tasks[dragging.id] : null;

  /**
   * The target keeps the state it had while being aimed at for as long as the
   * card is flying in: lit up, with the dashed row standing in for the one on its
   * way. Held over rather than re-shown, so the card it's receiving never sees
   * the target flicker back to normal and then grow a row.
   */
  const targetHint: DropHint | null =
    dropHint ??
    (folding
      ? {
          targetId: folding.targetId,
          where: "into",
          title: folding.task.title,
        }
      : null);

  return (
    <div className="flex h-full min-h-0">
      <AppSidebar
        boards={boards}
        boardId={boardId}
        boardName={state.boardName}
        contexts={state.contexts}
        activeContextId={filters.contextId}
        counts={contextCounts}
        fact={fact}
        onSelectContext={(contextId) =>
          setFilters((f) => ({ ...f, contextId }))
        }
        onNewTask={startNewTask}
        onRenameBoard={renameBoard}
        onCreateContext={createContext}
        onUpdateContext={updateContext}
        onDeleteContext={deleteContext}
      />

      <SidebarResizer />

      {/* The toolbar floats on the canvas; the card below holds only the
          columns, so it reads as one board surface rather than a window. */}
      <main className="flex min-w-0 flex-1 flex-col pb-3.5 pr-[var(--board-gutter)] pt-1.5">
        <BoardHeader
          labels={state.labels}
          filters={filters}
          searchRef={searchRef}
          onFiltersChange={setFilters}
          onAddColumn={addColumn}
        />

        {/* The card's fill, hairline and shadow are drawn on a plate *behind*
            the content rather than on the content's own box. Clipping this box to
            the superellipse would also clip the `DragOverlay`, which is
            `position: fixed` and rendered inside this subtree — today it escapes
            because `overflow: hidden` doesn't clip fixed descendants, and a clip
            path would. The content keeps its circular corner for that clipping,
            which is strictly inside the squircle, so what shows in the corners is
            the plate. */}
        <div
          className="relative flex min-h-0 flex-1 flex-col"
          style={
            {
              "--sq-radius": "var(--corner-board)",
            } as CSSProperties
          }
        >
          {/* The strong hairline rather than the plain one: `surface` and the
              grained canvas behind it are only a few points apart, so at
              `--color-hairline` this edge all but disappears — and it's the one
              edge in the app with no shadow close enough underneath to imply it.
              Task cards keep the lighter tone; they sit on `panel` with more
              contrast to begin with. */}
          <Plate
            face="var(--color-surface)"
            edge="var(--color-hairline-mid)"
            shadow="squircle-shadow-lg"
          />
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--corner-board)]">
          {/* Floats over the board's bottom-right corner. Outside the DnD context
              on purpose: it isn't part of the drag surface, and a textarea inside
              one has to fight the pointer sensor for its own clicks. */}
          <PendingDemos />
          <DndContext
            /* Without an explicit id, dnd-kit names its hidden drag description
               from a module-level counter — which the server process keeps
               incrementing across requests while every fresh page load starts
               back at 0. The `aria-describedby` it writes onto each drag handle
               then differs between the server HTML and the first client render,
               which React reports as a hydration mismatch. A fixed id takes the
               counter out of the path. */
            id="board-dnd"
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              setDragging(null);
              clearHint();
            }}
          >
            <div
              ref={boardRef}
              onScroll={measureSides}
              style={
                {
                  // Short on purpose: enough to take the hard edge off, not
                  // enough to read as a vignette.
                  "--fade-left": sideFade.left ? "24px" : "0px",
                  "--fade-right": sideFade.right ? "24px" : "0px",
                } as CSSProperties
              }
              className="fade-sides scrollbar-none flex min-h-0 flex-1 gap-2 overflow-x-auto p-4"
            >
              <SortableContext
                items={state.columnOrder}
                strategy={horizontalListSortingStrategy}
              >
                {state.columnOrder.map((columnId) => {
                  const column = state.columns[columnId];
                  if (!column) return null;
                  return (
                    <BoardColumn
                      key={columnId}
                      column={column}
                      labels={state.labels}
                      tasks={(visibleTaskIds[columnId] ?? []).map(
                        (id) => state.tasks[id],
                      )}
                      contexts={state.contexts}
                      totalCount={state.taskOrder[columnId]?.length ?? 0}
                      dropHint={targetHint}
                      draggingTaskId={
                        dragging?.type === "task" ? dragging.id : null
                      }
                      viewingTaskId={openTaskId}
                      focusedTaskIds={focusedTaskIds}
                      onToggleTaskFocus={toggleFocus}
                      composing={composeColumnId === columnId}
                      onComposingChange={(open) =>
                        setComposeColumnId(open ? columnId : null)
                      }
                      onOpenTask={setOpenTaskId}
                      onSetTaskContexts={setTaskContexts}
                      onSetTaskPriority={setTaskPriority}
                      onToggleSubtask={(taskId, subtaskId, done) =>
                        updateSubtask(taskId, subtaskId, { done })
                      }
                      onQuickAdd={quickAdd}
                      onRename={(id, name) =>
                        patchColumn(id, { name }, "the column rename")
                      }
                      onDelete={(id) => {
                        dispatch({ type: "column/remove", columnId: id });
                        persist(
                          () => actions.deleteColumn(id),
                          "Couldn't delete the column",
                        );
                      }}
                      onSetWipLimit={(id, wipLimit) =>
                        patchColumn(id, { wipLimit }, "the WIP limit")
                      }
                      onToggleFocus={(id, isFocus) =>
                        patchColumn(id, { isFocus }, "featuring that column")
                      }
                      onToggleMuted={(id, isMuted) =>
                        patchColumn(id, { isMuted }, "that column change")
                      }
                      onToggleDone={(id, isDone) =>
                        patchColumn(id, { isDone }, "that column change")
                      }
                    />
                  );
                })}
              </SortableContext>
            </div>

            <DragOverlay
              /* When its child goes, dnd-kit clones it and keeps that clone on
                 screen for the release animation — which for a fold-in would send
                 it back to the slot the card came from, while `FoldFlight` sends
                 an identical card the other way. `null` skips it and drops the
                 clone at once, leaving exactly one card in motion. */
              dropAnimation={
                folding
                  ? null
                  : { duration: 180, easing: "cubic-bezier(.2,.8,.3,1)" }
              }
            >
              {draggedTask ? (
                <TaskCardBody
                  overlay
                  // Pulls back and fades while it's about to be folded in — the
                  // card underneath has already drawn the item it becomes.
                  className={
                    dropHint?.where === "into"
                      ? "scale-90 opacity-70"
                      : undefined
                  }
                  task={draggedTask}
                  contexts={state.contexts}
                  labels={draggedTask.labelIds
                    .map((id) => labelsById.get(id))
                    .filter((l): l is ClientLabel => Boolean(l))}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
          </div>
        </div>
      </main>

      {sheetTask && (
        <TaskDialog
          // Not keyed by card any more. It was, to stop a switch handing the next
          // card the last one's form — but the sheet's own draft effect now
          // re-seeds when the task changes underneath it, and remounting was what
          // made a switch slide the sheet out and back in from off screen.
          task={sheetTask}
          columns={state.columnOrder.map((id) => state.columns[id])}
          contexts={state.contexts}
          open={openTaskId !== null}
          onClose={() => setOpenTaskId(null)}
          onClosed={() => setLeaving(null)}
          onSave={(patch) => saveTask(sheetTask.id, patch)}
          onMoveToColumn={(columnId) => moveTaskToColumn(sheetTask.id, columnId)}
          onAddSubtask={(title) => addSubtask(sheetTask.id, title)}
          onUpdateSubtask={(subtaskId, patch) =>
            updateSubtask(sheetTask.id, subtaskId, patch)
          }
          onDeleteSubtask={(subtaskId) => deleteSubtask(sheetTask.id, subtaskId)}
          onMoveToBacklog={
            backlogColumnId && sheetTask.columnId !== backlogColumnId
              ? () => {
                  moveTaskToColumn(sheetTask.id, backlogColumnId);
                  setOpenTaskId(null);
                }
              : undefined
          }
          onDelete={() => {
            // The one edit ⌘Z can't reach, which is why the dialog asks first.
            dispatch({ type: "task/remove", taskIds: [sheetTask.id] });
            setOpenTaskId(null);
            persist(
              () => actions.deleteTask(sheetTask.id),
              "Couldn't delete that task",
            );
          }}
        />
      )}

      {folding && (
        <FoldFlight
          task={folding.task}
          from={folding.from}
          to={folding.to}
          contexts={state.contexts}
          labels={folding.task.labelIds
            .map((id) => labelsById.get(id))
            .filter((l): l is ClientLabel => Boolean(l))}
          onDone={landFold}
        />
      )}

      {/* One slot at the bottom of the screen, so a failed write and a ⌘Z can't
          stack up on top of each other. The error is the louder of the two and
          wins while it's up. */}
      {error ? (
        <Toast tone="error">{error} — reloading from the database.</Toast>
      ) : (
        notice && (
          <Toast>
            {notice.text}
            {notice.hint && (
              <span className="text-ink-ghost">{notice.hint}</span>
            )}
          </Toast>
        )
      )}
    </div>
  );
}
