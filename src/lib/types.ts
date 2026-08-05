import type { BoardData, TaskWithLabels } from "@/db/queries";
import type { Board, Column, Label, Priority } from "@/db/schema";

/**
 * Client-side mirrors of the DB rows with timestamps as epoch millis. Dates do
 * survive the RSC boundary, but server actions return plain numbers, and having
 * one representation on the client removes a whole class of `Date | number` bugs.
 */
export type ClientTask = {
  id: string;
  columnId: string;
  title: string;
  description: string;
  priority: Priority;
  dueDate: number | null;
  completedAt: number | null;
  createdAt: number;
  labelIds: string[];
};

export type ClientColumn = {
  id: string;
  name: string;
  wipLimit: number | null;
  isDone: boolean;
};

export type ClientLabel = Pick<Label, "id" | "name" | "color">;

export type ClientBoard = Pick<Board, "id" | "name">;

export type ClientBoardData = {
  board: ClientBoard;
  columns: ClientColumn[];
  tasks: ClientTask[];
  labels: ClientLabel[];
};

export function toClientTask(task: TaskWithLabels): ClientTask {
  return {
    id: task.id,
    columnId: task.columnId,
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueDate: task.dueDate?.getTime() ?? null,
    completedAt: task.completedAt?.getTime() ?? null,
    createdAt: task.createdAt.getTime(),
    labelIds: task.labelIds,
  };
}

export function toClientColumn(column: Column): ClientColumn {
  return {
    id: column.id,
    name: column.name,
    wipLimit: column.wipLimit,
    isDone: column.isDone,
  };
}

export function toClientBoardData(data: BoardData): ClientBoardData {
  return {
    board: { id: data.board.id, name: data.board.name },
    columns: data.columns.map(toClientColumn),
    tasks: data.tasks.map(toClientTask),
    labels: data.labels.map((l) => ({ id: l.id, name: l.name, color: l.color })),
  };
}
