import type { BoardData, TaskWithLabels } from "@/db/queries";
import type {
  Board,
  Column,
  Context,
  Label,
  Priority,
  Subtask,
} from "@/db/schema";

/**
 * Client-side mirrors of the DB rows with timestamps as epoch millis. Dates do
 * survive the RSC boundary, but server actions return plain numbers, and having
 * one representation on the client removes a whole class of `Date | number` bugs.
 */
export type ClientTask = {
  id: string;
  columnId: string;
  contextIds: string[];
  title: string;
  description: string;
  priority: Priority;
  dueDate: number | null;
  completedAt: number | null;
  createdAt: number;
  labelIds: string[];
  subtasks: ClientSubtask[];
};

export type ClientColumn = {
  id: string;
  name: string;
  wipLimit: number | null;
  isDone: boolean;
  isMuted: boolean;
  isFocus: boolean;
};

export type ClientLabel = Pick<Label, "id" | "name" | "color">;

export type ClientContext = Pick<Context, "id" | "name" | "color">;

export type ClientSubtask = Pick<Subtask, "id" | "title" | "done">;

export type ClientBoard = Pick<Board, "id" | "name">;

export type ClientBoardData = {
  board: ClientBoard;
  columns: ClientColumn[];
  tasks: ClientTask[];
  labels: ClientLabel[];
  contexts: ClientContext[];
};

export function toClientTask(task: TaskWithLabels): ClientTask {
  return {
    id: task.id,
    columnId: task.columnId,
    contextIds: task.contextIds,
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueDate: task.dueDate?.getTime() ?? null,
    completedAt: task.completedAt?.getTime() ?? null,
    createdAt: task.createdAt.getTime(),
    labelIds: task.labelIds,
    subtasks: task.subtasks.map((sub) => ({
      id: sub.id,
      title: sub.title,
      done: sub.done,
    })),
  };
}

export function toClientColumn(column: Column): ClientColumn {
  return {
    id: column.id,
    name: column.name,
    wipLimit: column.wipLimit,
    isDone: column.isDone,
    isMuted: column.isMuted,
    isFocus: column.isFocus,
  };
}

export function toClientBoardData(data: BoardData): ClientBoardData {
  return {
    board: { id: data.board.id, name: data.board.name },
    columns: data.columns.map(toClientColumn),
    tasks: data.tasks.map(toClientTask),
    labels: data.labels.map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
    })),
    contexts: data.contexts.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
    })),
  };
}
