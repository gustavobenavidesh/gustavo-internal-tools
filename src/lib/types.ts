import type { BoardData, TaskWithLabels } from "@/db/queries";
import type {
  Board,
  Column,
  Context,
  Label,
  Priority,
  SourceType,
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
  /** Set only on imported cards; null for anything typed on the board. */
  source: ClientSource | null;
};

/** Where an imported card came from, enough to badge it and link back. */
export type ClientSource = {
  type: SourceType;
  url: string;
  channel: string | null;
  author: string | null;
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

/**
 * What releasing the drag right now would do, and which card it would do it to.
 *
 * Drives both halves of the feedback — the bar marking an insertion slot, and the
 * highlight on a card about to swallow one — and also which way the rest of the
 * column moves to make room (`roomFor` in `src/lib/drag.ts`), since the card this
 * names is the one that has to stay put to be aimed at.
 */
export type DropHint = {
  targetId: string;
  where: "above" | "below" | "into";
  /** The dragged card's title, drawn in place as the item it would become. */
  title: string;
};

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
    source:
      task.sourceType && task.sourceUrl
        ? {
            type: task.sourceType,
            url: task.sourceUrl,
            channel: task.sourceChannel,
            author: task.sourceAuthor,
          }
        : null,
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
