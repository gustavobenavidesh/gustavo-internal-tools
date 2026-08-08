import type {
  ClientBoardData,
  ClientColumn,
  ClientContext,
  ClientLabel,
  ClientTask,
} from "@/lib/types";

/**
 * Order is stored as explicit id arrays rather than the numeric positions the
 * DB uses. Drag-and-drop is all "put this between those two", so the client
 * only ever needs neighbours — the server turns them back into a position.
 */
export type BoardState = {
  boardName: string;
  columnOrder: string[];
  columns: Record<string, ClientColumn>;
  taskOrder: Record<string, string[]>;
  tasks: Record<string, ClientTask>;
  labels: ClientLabel[];
  contexts: ClientContext[];
};

export type BoardAction =
  | { type: "reset"; data: ClientBoardData }
  | { type: "board/rename"; name: string }
  | { type: "task/add"; task: ClientTask }
  | { type: "task/insert"; task: ClientTask; index: number }
  | { type: "task/patch"; taskId: string; patch: Partial<ClientTask> }
  | { type: "task/remove"; taskIds: string[] }
  | { type: "task/move"; taskId: string; toColumnId: string; toIndex: number }
  | { type: "column/add"; column: ClientColumn }
  | { type: "column/patch"; columnId: string; patch: Partial<ClientColumn> }
  | { type: "column/remove"; columnId: string }
  | { type: "column/move"; columnId: string; toIndex: number }
  | { type: "label/add"; label: ClientLabel }
  | { type: "context/add"; context: ClientContext }
  | {
      type: "context/patch";
      contextId: string;
      patch: Partial<ClientContext>;
    }
  | { type: "context/remove"; contextId: string };

export function initBoardState(data: ClientBoardData): BoardState {
  const taskOrder: Record<string, string[]> = {};
  for (const column of data.columns) taskOrder[column.id] = [];
  for (const task of data.tasks) taskOrder[task.columnId]?.push(task.id);

  return {
    boardName: data.board.name,
    columnOrder: data.columns.map((c) => c.id),
    columns: Object.fromEntries(data.columns.map((c) => [c.id, c])),
    taskOrder,
    tasks: Object.fromEntries(data.tasks.map((t) => [t.id, t])),
    labels: data.labels,
    contexts: data.contexts,
  };
}

export function columnOfTask(state: BoardState, taskId: string) {
  return state.tasks[taskId]?.columnId;
}

export function boardReducer(
  state: BoardState,
  action: BoardAction,
): BoardState {
  switch (action.type) {
    case "reset":
      return initBoardState(action.data);

    case "board/rename":
      return { ...state, boardName: action.name };

    case "task/add":
      return {
        ...state,
        tasks: { ...state.tasks, [action.task.id]: action.task },
        taskOrder: {
          ...state.taskOrder,
          // Top of the column, matching the position the action assigns.
          [action.task.columnId]: [
            action.task.id,
            ...(state.taskOrder[action.task.columnId] ?? []),
          ],
        },
      };

    /**
     * Puts a card back at a known place in its column, which is what undoing an
     * archive or a fold-in needs — `task/add` always lands at the top, matching
     * where a freshly created card goes.
     */
    case "task/insert": {
      const column = action.task.columnId;
      // Its column can have been deleted since, taking the card with it.
      if (!state.taskOrder[column]) return state;

      const order = state.taskOrder[column].filter((id) => id !== action.task.id);
      const index = Math.max(0, Math.min(action.index, order.length));
      order.splice(index, 0, action.task.id);
      return {
        ...state,
        tasks: { ...state.tasks, [action.task.id]: action.task },
        taskOrder: { ...state.taskOrder, [column]: order },
      };
    }

    case "task/patch": {
      const task = state.tasks[action.taskId];
      if (!task) return state;
      return {
        ...state,
        tasks: { ...state.tasks, [task.id]: { ...task, ...action.patch } },
      };
    }

    case "task/remove": {
      const removed = new Set(action.taskIds);
      const tasks = { ...state.tasks };
      for (const id of removed) delete tasks[id];
      const taskOrder: Record<string, string[]> = {};
      for (const [columnId, ids] of Object.entries(state.taskOrder)) {
        taskOrder[columnId] = ids.filter((id) => !removed.has(id));
      }
      return { ...state, tasks, taskOrder };
    }

    case "task/move": {
      const task = state.tasks[action.taskId];
      const from = task?.columnId;
      if (!task || !from || !state.taskOrder[action.toColumnId]) return state;

      const sameColumn = from === action.toColumnId;
      const source = state.taskOrder[from].filter((id) => id !== action.taskId);
      const target = sameColumn
        ? source
        : state.taskOrder[action.toColumnId].filter(
            (id) => id !== action.taskId,
          );

      const index = Math.max(0, Math.min(action.toIndex, target.length));
      target.splice(index, 0, action.taskId);

      const isDone = state.columns[action.toColumnId]?.isDone ?? false;

      return {
        ...state,
        taskOrder: {
          ...state.taskOrder,
          [from]: sameColumn ? target : source,
          [action.toColumnId]: target,
        },
        tasks: {
          ...state.tasks,
          [task.id]: {
            ...task,
            columnId: action.toColumnId,
            completedAt: isDone ? (task.completedAt ?? Date.now()) : null,
          },
        },
      };
    }

    case "column/add":
      return {
        ...state,
        columnOrder: [...state.columnOrder, action.column.id],
        columns: { ...state.columns, [action.column.id]: action.column },
        taskOrder: { ...state.taskOrder, [action.column.id]: [] },
      };

    case "column/patch": {
      const column = state.columns[action.columnId];
      if (!column) return state;
      return {
        ...state,
        columns: {
          ...state.columns,
          [column.id]: { ...column, ...action.patch },
        },
      };
    }

    case "column/remove": {
      const columns = { ...state.columns };
      delete columns[action.columnId];
      const taskOrder = { ...state.taskOrder };
      const orphaned = new Set(taskOrder[action.columnId] ?? []);
      delete taskOrder[action.columnId];
      const tasks = { ...state.tasks };
      for (const id of orphaned) delete tasks[id];

      return {
        ...state,
        columns,
        taskOrder,
        tasks,
        columnOrder: state.columnOrder.filter((id) => id !== action.columnId),
      };
    }

    case "column/move": {
      const rest = state.columnOrder.filter((id) => id !== action.columnId);
      const index = Math.max(0, Math.min(action.toIndex, rest.length));
      rest.splice(index, 0, action.columnId);
      return { ...state, columnOrder: rest };
    }

    case "label/add":
      return { ...state, labels: [...state.labels, action.label] };

    case "context/add":
      return { ...state, contexts: [...state.contexts, action.context] };

    case "context/patch":
      return {
        ...state,
        contexts: state.contexts.map((c) =>
          c.id === action.contextId ? { ...c, ...action.patch } : c,
        ),
      };

    case "context/remove": {
      // The FK cascade drops the join rows server-side; mirror that locally so
      // cards stay on the board instead of vanishing with their context.
      const tasks = Object.fromEntries(
        Object.entries(state.tasks).map(([id, task]) => [
          id,
          task.contextIds.includes(action.contextId)
            ? {
                ...task,
                contextIds: task.contextIds.filter(
                  (c) => c !== action.contextId,
                ),
              }
            : task,
        ]),
      );
      return {
        ...state,
        tasks,
        contexts: state.contexts.filter((c) => c.id !== action.contextId),
      };
    }
  }
}
