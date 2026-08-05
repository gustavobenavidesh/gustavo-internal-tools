import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "./index";
import {
  type Board,
  type Column,
  type Context,
  type Label,
  LOCAL_OWNER_ID,
  type Task,
  boards,
  columns,
  contexts,
  labels,
  type Subtask,
  subtasks,
  taskContexts,
  taskLabels,
  tasks,
} from "./schema";

export type TaskWithLabels = Task & {
  labelIds: string[];
  contextIds: string[];
  subtasks: Subtask[];
};

export type BoardData = {
  board: Board;
  columns: Column[];
  tasks: TaskWithLabels[];
  labels: Label[];
  contexts: Context[];
};

const DEFAULT_COLUMNS = [
  { name: "Backlog", isDone: false },
  { name: "Today", isDone: false },
  { name: "In progress", isDone: false },
  { name: "Blocked", isDone: false },
  { name: "Done", isDone: true },
];

/** The product areas a card can be about. Seeded per board, editable after. */
export const DEFAULT_CONTEXTS = [
  { name: "Web App", color: "sky" },
  { name: "Desktop App", color: "violet" },
  { name: "Mobile App", color: "teal" },
  { name: "Website", color: "olive" },
  { name: "Marketing Content", color: "amber" },
  { name: "Side Tasks", color: "clay" },
];

export function contextValues(boardId: string) {
  return DEFAULT_CONTEXTS.map((context, i) => ({
    boardId,
    ...context,
    position: (i + 1) * 1000,
  }));
}

const DEFAULT_LABELS = [
  { name: "deep work", color: "violet" },
  { name: "quick win", color: "olive" },
  { name: "meeting", color: "sky" },
  { name: "waiting on someone", color: "amber" },
];

export function listBoards(): Board[] {
  return db
    .select()
    .from(boards)
    .where(eq(boards.ownerId, LOCAL_OWNER_ID))
    .orderBy(asc(boards.position), asc(boards.createdAt))
    .all();
}

/** First run has no board at all — create one so the app is never empty. */
export function ensureDefaultBoard(): Board {
  const existing = listBoards();
  if (existing.length > 0) return existing[0];

  return db.transaction((tx) => {
    const [board] = tx
      .insert(boards)
      .values({ name: "My tasks" })
      .returning()
      .all();

    tx.insert(columns)
      .values(
        DEFAULT_COLUMNS.map((c, i) => ({
          boardId: board.id,
          name: c.name,
          isDone: c.isDone,
          position: (i + 1) * 1000,
        })),
      )
      .run();

    tx.insert(labels)
      .values(DEFAULT_LABELS.map((l) => ({ boardId: board.id, ...l })))
      .run();

    tx.insert(contexts).values(contextValues(board.id)).run();

    return board;
  });
}

export function getBoardData(boardId: string): BoardData | null {
  const board = db
    .select()
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.ownerId, LOCAL_OWNER_ID)))
    .get();
  if (!board) return null;

  const boardColumns = db
    .select()
    .from(columns)
    .where(eq(columns.boardId, boardId))
    .orderBy(asc(columns.position))
    .all();

  const boardTasks = db
    .select()
    .from(tasks)
    .where(and(eq(tasks.boardId, boardId), isNull(tasks.archivedAt)))
    .orderBy(asc(tasks.position))
    .all();

  const boardLabels = db
    .select()
    .from(labels)
    .where(eq(labels.boardId, boardId))
    .orderBy(asc(labels.createdAt))
    .all();

  const boardContexts = ensureContexts(boardId);

  const links = db
    .select()
    .from(taskLabels)
    .innerJoin(tasks, eq(tasks.id, taskLabels.taskId))
    .where(eq(tasks.boardId, boardId))
    .all();

  const contextLinks = db
    .select()
    .from(taskContexts)
    .innerJoin(tasks, eq(tasks.id, taskContexts.taskId))
    .where(eq(tasks.boardId, boardId))
    .all();

  const labelsByTask = new Map<string, string[]>();
  for (const { task_labels: link } of links) {
    const list = labelsByTask.get(link.taskId) ?? [];
    list.push(link.labelId);
    labelsByTask.set(link.taskId, list);
  }

  const boardSubtasks = db
    .select()
    .from(subtasks)
    .innerJoin(tasks, eq(tasks.id, subtasks.taskId))
    .where(eq(tasks.boardId, boardId))
    .orderBy(asc(subtasks.position))
    .all();

  const subtasksByTask = new Map<string, Subtask[]>();
  for (const { subtasks: row } of boardSubtasks) {
    const list = subtasksByTask.get(row.taskId) ?? [];
    list.push(row);
    subtasksByTask.set(row.taskId, list);
  }

  const contextsByTask = new Map<string, string[]>();
  for (const { task_contexts: link } of contextLinks) {
    const list = contextsByTask.get(link.taskId) ?? [];
    list.push(link.contextId);
    contextsByTask.set(link.taskId, list);
  }

  return {
    board,
    columns: boardColumns,
    tasks: boardTasks.map((task) => ({
      ...task,
      labelIds: labelsByTask.get(task.id) ?? [],
      contextIds: contextsByTask.get(task.id) ?? [],
      subtasks: subtasksByTask.get(task.id) ?? [],
    })),
    labels: boardLabels,
    contexts: boardContexts,
  };
}

/**
 * Boards created before contexts existed have none, so seed them on first read
 * rather than requiring a manual migration step.
 */
function ensureContexts(boardId: string): Context[] {
  const existing = db
    .select()
    .from(contexts)
    .where(eq(contexts.boardId, boardId))
    .orderBy(asc(contexts.position))
    .all();
  if (existing.length > 0) return existing;

  return db.insert(contexts).values(contextValues(boardId)).returning().all();
}

/** Archived tasks are hidden from the board but kept so nothing is truly lost. */
export function getArchivedTasks(boardId: string): Task[] {
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.boardId, boardId), isNotNull(tasks.archivedAt)))
    .orderBy(desc(tasks.archivedAt))
    .all();
}
