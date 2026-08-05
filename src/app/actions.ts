"use server";

import { eq, inArray, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  type Priority,
  boards,
  columns,
  labels,
  taskLabels,
  tasks,
} from "@/db/schema";
import { positionBetween } from "@/lib/utils";

/**
 * Single-user app: there is no session to check yet, so these run for whoever
 * can reach the server. When auth arrives, this is the one place that changes —
 * resolve the session here and scope every query by `ownerId`.
 */

// ---------------------------------------------------------------- boards

export async function createBoard(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Board name is required");

  const nextPosition =
    (db.select({ value: max(boards.position) }).from(boards).get()?.value ??
      0) + 1000;

  const board = db.transaction((tx) => {
    const [created] = tx
      .insert(boards)
      .values({ name: trimmed, position: nextPosition })
      .returning()
      .all();

    tx.insert(columns)
      .values(
        ["To do", "In progress", "Done"].map((columnName, i) => ({
          boardId: created.id,
          name: columnName,
          position: (i + 1) * 1000,
          isDone: columnName === "Done",
        })),
      )
      .run();

    return created;
  });

  revalidatePath("/", "layout");
  redirect(`/board/${board.id}`);
}

export async function renameBoard(boardId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Board name is required");
  db.update(boards).set({ name: trimmed }).where(eq(boards.id, boardId)).run();
  revalidatePath("/", "layout");
}

export async function deleteBoard(boardId: string) {
  db.delete(boards).where(eq(boards.id, boardId)).run();
  revalidatePath("/", "layout");
  redirect("/");
}

// ---------------------------------------------------------------- columns

export async function createColumn(boardId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Column name is required");

  const last = db
    .select({ value: max(columns.position) })
    .from(columns)
    .where(eq(columns.boardId, boardId))
    .get();

  const [column] = db
    .insert(columns)
    .values({
      boardId,
      name: trimmed,
      position: (last?.value ?? 0) + 1000,
    })
    .returning()
    .all();

  return column;
}

export async function updateColumn(
  columnId: string,
  patch: { name?: string; wipLimit?: number | null; isDone?: boolean },
) {
  const next: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error("Column name is required");
    next.name = trimmed;
  }
  if (patch.wipLimit !== undefined) next.wipLimit = patch.wipLimit;
  if (patch.isDone !== undefined) next.isDone = patch.isDone;
  if (Object.keys(next).length === 0) return;

  db.update(columns).set(next).where(eq(columns.id, columnId)).run();
}

/** Deletes the column and every task in it (FK cascade). */
export async function deleteColumn(columnId: string) {
  db.delete(columns).where(eq(columns.id, columnId)).run();
}

export async function moveColumn(
  columnId: string,
  prevColumnId: string | null,
  nextColumnId: string | null,
) {
  const position = positionBetween(
    prevColumnId ? getColumnPosition(prevColumnId) : undefined,
    nextColumnId ? getColumnPosition(nextColumnId) : undefined,
  );
  db.update(columns).set({ position }).where(eq(columns.id, columnId)).run();
  return position;
}

function getColumnPosition(columnId: string) {
  return db
    .select({ position: columns.position })
    .from(columns)
    .where(eq(columns.id, columnId))
    .get()?.position;
}

// ---------------------------------------------------------------- tasks

export type TaskInput = {
  boardId: string;
  columnId: string;
  title: string;
  description?: string;
  priority?: Priority;
  dueDate?: number | null;
  labelIds?: string[];
};

export async function createTask(input: TaskInput) {
  const title = input.title.trim();
  if (!title) throw new Error("Task needs a title");

  const last = db
    .select({ value: max(tasks.position) })
    .from(tasks)
    .where(eq(tasks.columnId, input.columnId))
    .get();

  return db.transaction((tx) => {
    const [task] = tx
      .insert(tasks)
      .values({
        boardId: input.boardId,
        columnId: input.columnId,
        title,
        description: input.description?.trim() ?? "",
        priority: input.priority ?? "none",
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        position: (last?.value ?? 0) + 1000,
      })
      .returning()
      .all();

    if (input.labelIds?.length) {
      tx.insert(taskLabels)
        .values(input.labelIds.map((labelId) => ({ taskId: task.id, labelId })))
        .run();
    }

    return { ...task, labelIds: input.labelIds ?? [] };
  });
}

export async function updateTask(
  taskId: string,
  patch: {
    title?: string;
    description?: string;
    priority?: Priority;
    dueDate?: number | null;
    labelIds?: string[];
  },
) {
  const next: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.title !== undefined) {
    const trimmed = patch.title.trim();
    if (!trimmed) throw new Error("Task needs a title");
    next.title = trimmed;
  }
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.dueDate !== undefined) {
    next.dueDate = patch.dueDate ? new Date(patch.dueDate) : null;
  }

  db.transaction((tx) => {
    tx.update(tasks).set(next).where(eq(tasks.id, taskId)).run();

    if (patch.labelIds) {
      tx.delete(taskLabels).where(eq(taskLabels.taskId, taskId)).run();
      if (patch.labelIds.length) {
        tx.insert(taskLabels)
          .values(patch.labelIds.map((labelId) => ({ taskId, labelId })))
          .run();
      }
    }
  });
}

/**
 * Moving a task is the hot path during a drag: it writes one row, deriving the
 * new position from the ids of the cards it was dropped between.
 */
export async function moveTask(
  taskId: string,
  columnId: string,
  prevTaskId: string | null,
  nextTaskId: string | null,
) {
  const neighbours = [prevTaskId, nextTaskId].filter(
    (id): id is string => id !== null,
  );
  const positions = neighbours.length
    ? db
        .select({ id: tasks.id, position: tasks.position })
        .from(tasks)
        .where(inArray(tasks.id, neighbours))
        .all()
    : [];

  const positionOf = (id: string | null) =>
    id ? positions.find((p) => p.id === id)?.position : undefined;

  const position = positionBetween(
    positionOf(prevTaskId),
    positionOf(nextTaskId),
  );

  const isDone = db
    .select({ isDone: columns.isDone })
    .from(columns)
    .where(eq(columns.id, columnId))
    .get()?.isDone;

  db.update(tasks)
    .set({
      columnId,
      position,
      updatedAt: new Date(),
      // Dropping into a done column completes the task, and dragging back out
      // un-completes it, so the two never disagree.
      completedAt: isDone ? new Date() : null,
    })
    .where(eq(tasks.id, taskId))
    .run();

  return { position, completedAt: isDone ? Date.now() : null };
}

export async function archiveTask(taskId: string) {
  db.update(tasks)
    .set({ archivedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .run();
}

export async function deleteTask(taskId: string) {
  db.delete(tasks).where(eq(tasks.id, taskId)).run();
}

/** Clears every finished task out of a done column in one go. */
export async function archiveColumnTasks(columnId: string) {
  const archived = db
    .update(tasks)
    .set({ archivedAt: new Date() })
    .where(eq(tasks.columnId, columnId))
    .returning({ id: tasks.id })
    .all();
  return archived.map((t) => t.id);
}

// ---------------------------------------------------------------- labels

export async function createLabel(
  boardId: string,
  name: string,
  color: string,
) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Label needs a name");

  const [label] = db
    .insert(labels)
    .values({ boardId, name: trimmed, color })
    .returning()
    .all();
  return label;
}

export async function updateLabel(
  labelId: string,
  patch: { name?: string; color?: string },
) {
  const next: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error("Label needs a name");
    next.name = trimmed;
  }
  if (patch.color !== undefined) next.color = patch.color;
  if (Object.keys(next).length === 0) return;

  db.update(labels).set(next).where(eq(labels.id, labelId)).run();
}

export async function deleteLabel(labelId: string) {
  db.delete(labels).where(eq(labels.id, labelId)).run();
}
