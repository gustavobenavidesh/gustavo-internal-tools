"use client";

import {
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragOverEvent,
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
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import * as actions from "@/app/actions";
import { BoardColumn } from "@/components/board-column";
import { BoardHeader, type Filters, emptyFilters } from "@/components/board-header";
import { boardReducer, initBoardState } from "@/components/board-state";
import { TaskCardBody } from "@/components/task-card";
import { TaskDialog, type TaskPatch } from "@/components/task-dialog";
import type { ClientBoard, ClientBoardData, ClientLabel, ClientTask } from "@/lib/types";

export function BoardView({
  data,
  boards,
}: {
  data: ClientBoardData;
  boards: ClientBoard[];
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(boardReducer, data, initBoardState);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [composeColumnId, setComposeColumnId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ type: "task" | "column"; id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // The board id changing means we navigated to another board; a new reducer
  // init is the only way to swap the whole dataset out.
  const boardId = data.board.id;
  useEffect(() => {
    dispatch({ type: "reset", data });
  }, [data]);

  /**
   * Every mutation is applied locally first and persisted in the background.
   * If the server rejects it, re-fetch rather than trying to invert the edit.
   */
  const persist = useCallback(
    (run: () => Promise<unknown>, message: string) => {
      startTransition(async () => {
        try {
          await run();
        } catch (cause) {
          console.error(cause);
          setError(message);
          router.refresh();
        }
      });
    },
    [router],
  );

  const labelsById = useMemo(
    () => new Map(state.labels.map((l) => [l.id, l])),
    [state.labels],
  );

  const visibleTaskIds = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    const matches = (task: ClientTask) => {
      if (filters.hideDone && task.completedAt !== null) return false;
      if (filters.priorities.length && !filters.priorities.includes(task.priority))
        return false;
      if (
        filters.labelIds.length &&
        !filters.labelIds.some((id) => task.labelIds.includes(id))
      )
        return false;
      if (
        query &&
        !task.title.toLowerCase().includes(query) &&
        !task.description.toLowerCase().includes(query)
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

  // ------------------------------------------------------------- drag & drop

  const sensors = useSensors(
    // A few pixels of slop so a click to open a card isn't read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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

  const onDragStart = ({ active }: DragStartEvent) => {
    setDragging({
      type: active.data.current?.type === "column" ? "column" : "task",
      id: String(active.id),
    });
  };

  /** Cross-column previewing happens here; same-column shifting is handled by
   * the sortable strategy and committed on drop. */
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || active.data.current?.type !== "task") return;

    const taskId = String(active.id);
    const overId = String(over.id);
    const from = state.tasks[taskId]?.columnId;
    const to = resolveColumn(overId);
    if (!from || !to || from === to) return;

    let index = state.taskOrder[to]?.length ?? 0;
    if (state.tasks[overId]) {
      const overIndex = state.taskOrder[to].indexOf(overId);
      const activeRect = active.rect.current.translated;
      const isBelow =
        activeRect && over.rect
          ? activeRect.top > over.rect.top + over.rect.height / 2
          : false;
      index = overIndex + (isBelow ? 1 : 0);
    }

    dispatch({ type: "task/move", taskId, toColumnId: to, toIndex: index });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (active.data.current?.type === "column") {
      const overColumnId = resolveColumn(overId);
      if (!overColumnId || activeId === overColumnId) return;
      const toIndex = state.columnOrder.indexOf(overColumnId);
      if (toIndex < 0) return;

      const order = state.columnOrder.filter((id) => id !== activeId);
      order.splice(toIndex, 0, activeId);
      dispatch({ type: "column/move", columnId: activeId, toIndex });

      const at = order.indexOf(activeId);
      persist(
        () => actions.moveColumn(activeId, order[at - 1] ?? null, order[at + 1] ?? null),
        "Couldn't save the column order",
      );
      return;
    }

    const columnId = state.tasks[activeId]?.columnId;
    if (!columnId) return;

    // Same-column drops still need committing; cross-column ones were already
    // applied in onDragOver, so this just recomputes the final neighbours.
    let order = state.taskOrder[columnId];
    if (state.tasks[overId] && overId !== activeId) {
      const toIndex = order.indexOf(overId);
      order = order.filter((id) => id !== activeId);
      order.splice(toIndex, 0, activeId);
      dispatch({ type: "task/move", taskId: activeId, toColumnId: columnId, toIndex });
    }

    const at = order.indexOf(activeId);
    persist(
      () =>
        actions.moveTask(
          activeId,
          columnId,
          order[at - 1] ?? null,
          order[at + 1] ?? null,
        ),
      "Couldn't save the card's new place",
    );
  };

  // ------------------------------------------------------------- mutations

  const quickAdd = (columnId: string, title: string) => {
    persist(async () => {
      const task = await actions.createTask({ boardId, columnId, title });
      dispatch({
        type: "task/add",
        task: {
          ...task,
          dueDate: null,
          completedAt: null,
          createdAt: Date.now(),
          labelIds: [],
        },
      });
    }, "Couldn't add that task");
  };

  const saveTask = (taskId: string, patch: TaskPatch) => {
    dispatch({ type: "task/patch", taskId, patch });
    persist(() => actions.updateTask(taskId, patch), "Couldn't save your changes");
  };

  const moveTaskToColumn = (taskId: string, columnId: string) => {
    const toIndex = state.taskOrder[columnId]?.length ?? 0;
    dispatch({ type: "task/move", taskId, toColumnId: columnId, toIndex });
    const prev = state.taskOrder[columnId]?.at(-1) ?? null;
    persist(
      () => actions.moveTask(taskId, columnId, prev, null),
      "Couldn't move that task",
    );
  };

  const createLabel = async (
    name: string,
    color: string,
  ): Promise<ClientLabel | null> => {
    try {
      const label = await actions.createLabel(boardId, name, color);
      dispatch({ type: "label/add", label });
      return label;
    } catch (cause) {
      console.error(cause);
      setError("Couldn't create that label");
      return null;
    }
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
        },
      });
    }, "Couldn't add that column");
  };

  // ------------------------------------------------------------- shortcuts

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "n" && !openTaskId) {
        e.preventDefault();
        setComposeColumnId(state.columnOrder[0] ?? null);
      }
      if (e.key === "Escape") {
        setComposeColumnId(null);
        setFilters(emptyFilters);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openTaskId, state.columnOrder]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const openTask = openTaskId ? state.tasks[openTaskId] : null;
  const draggedTask = dragging?.type === "task" ? state.tasks[dragging.id] : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <BoardHeader
        boards={boards}
        boardId={boardId}
        boardName={state.boardName}
        labels={state.labels}
        filters={filters}
        searchRef={searchRef}
        taskCount={Object.keys(state.tasks).length}
        onFiltersChange={setFilters}
        onRename={(name) => {
          dispatch({ type: "board/rename", name });
          persist(() => actions.renameBoard(boardId, name), "Couldn't rename the board");
        }}
        onAddColumn={addColumn}
      />

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
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
                  tasks={(visibleTaskIds[columnId] ?? []).map((id) => state.tasks[id])}
                  totalCount={state.taskOrder[columnId]?.length ?? 0}
                  composing={composeColumnId === columnId}
                  onComposingChange={(open) =>
                    setComposeColumnId(open ? columnId : null)
                  }
                  onOpenTask={setOpenTaskId}
                  onQuickAdd={quickAdd}
                  onRename={(id, name) => {
                    dispatch({ type: "column/patch", columnId: id, patch: { name } });
                    persist(
                      () => actions.updateColumn(id, { name }),
                      "Couldn't rename the column",
                    );
                  }}
                  onDelete={(id) => {
                    dispatch({ type: "column/remove", columnId: id });
                    persist(() => actions.deleteColumn(id), "Couldn't delete the column");
                  }}
                  onSetWipLimit={(id, wipLimit) => {
                    dispatch({ type: "column/patch", columnId: id, patch: { wipLimit } });
                    persist(
                      () => actions.updateColumn(id, { wipLimit }),
                      "Couldn't save the WIP limit",
                    );
                  }}
                  onToggleDone={(id, isDone) => {
                    dispatch({ type: "column/patch", columnId: id, patch: { isDone } });
                    persist(
                      () => actions.updateColumn(id, { isDone }),
                      "Couldn't update the column",
                    );
                  }}
                  onArchiveAll={(id) => {
                    const taskIds = state.taskOrder[id] ?? [];
                    dispatch({ type: "task/remove", taskIds });
                    persist(
                      () => actions.archiveColumnTasks(id),
                      "Couldn't archive those tasks",
                    );
                  }}
                />
              );
            })}
          </SortableContext>

          <button
            type="button"
            onClick={addColumn}
            className="flex h-10 w-[300px] shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-hairline-strong text-xs font-medium text-ink-faint transition-colors hover:border-accent/50 hover:text-ink-soft"
          >
            <Plus className="size-3.5" /> Add column
          </button>
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.3,1)" }}>
          {draggedTask ? (
            <TaskCardBody
              overlay
              task={draggedTask}
              labels={draggedTask.labelIds
                .map((id) => labelsById.get(id))
                .filter((l): l is ClientLabel => Boolean(l))}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {openTask && (
        <TaskDialog
          task={openTask}
          columns={state.columnOrder.map((id) => state.columns[id])}
          labels={state.labels}
          onClose={() => setOpenTaskId(null)}
          onSave={(patch) => saveTask(openTask.id, patch)}
          onMoveToColumn={(columnId) => moveTaskToColumn(openTask.id, columnId)}
          onCreateLabel={createLabel}
          onArchive={() => {
            dispatch({ type: "task/remove", taskIds: [openTask.id] });
            setOpenTaskId(null);
            persist(() => actions.archiveTask(openTask.id), "Couldn't archive that task");
          }}
          onDelete={() => {
            dispatch({ type: "task/remove", taskIds: [openTask.id] });
            setOpenTaskId(null);
            persist(() => actions.deleteTask(openTask.id), "Couldn't delete that task");
          }}
        />
      )}

      {error && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 animate-pop-in rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-900 shadow-lg shadow-[#3a332a]/10 ring-1 ring-rose-600/25"
        >
          {error} — reloading from the database.
        </div>
      )}
    </div>
  );
}
