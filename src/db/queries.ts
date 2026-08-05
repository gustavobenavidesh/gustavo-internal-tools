import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "./index";
import {
  type Board,
  type Column,
  type Label,
  LOCAL_OWNER_ID,
  type Task,
  boards,
  columns,
  labels,
  taskLabels,
  tasks,
} from "./schema";

export type TaskWithLabels = Task & { labelIds: string[] };

export type BoardData = {
  board: Board;
  columns: Column[];
  tasks: TaskWithLabels[];
  labels: Label[];
};

const DEFAULT_COLUMNS = [
  { name: "Backlog", isDone: false },
  { name: "Today", isDone: false },
  { name: "In progress", isDone: false },
  { name: "Blocked", isDone: false },
  { name: "Done", isDone: true },
];

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

  const links = db
    .select()
    .from(taskLabels)
    .innerJoin(tasks, eq(tasks.id, taskLabels.taskId))
    .where(eq(tasks.boardId, boardId))
    .all();

  const labelsByTask = new Map<string, string[]>();
  for (const { task_labels: link } of links) {
    const list = labelsByTask.get(link.taskId) ?? [];
    list.push(link.labelId);
    labelsByTask.set(link.taskId, list);
  }

  return {
    board,
    columns: boardColumns,
    tasks: boardTasks.map((task) => ({
      ...task,
      labelIds: labelsByTask.get(task.id) ?? [],
    })),
    labels: boardLabels,
  };
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
