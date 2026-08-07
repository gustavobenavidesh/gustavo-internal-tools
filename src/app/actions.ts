"use server";

import { and, asc, eq, inArray, max, min } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { contextValues } from "@/db/queries";
import {
  type Priority,
  boards,
  columns,
  contexts,
  labels,
  subtasks,
  taskContexts,
  taskLabels,
  tasks,
} from "@/db/schema";
import { listSlackPins, pinTitle } from "@/lib/slack";
import { positionBefore, positionBetween } from "@/lib/utils";

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
    (db
      .select({ value: max(boards.position) })
      .from(boards)
      .get()?.value ?? 0) + 1000;

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

    tx.insert(contexts).values(contextValues(created.id)).run();

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
  patch: {
    name?: string;
    wipLimit?: number | null;
    isDone?: boolean;
    isMuted?: boolean;
    isFocus?: boolean;
  },
) {
  const next: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error("Column name is required");
    next.name = trimmed;
  }
  if (patch.wipLimit !== undefined) next.wipLimit = patch.wipLimit;
  if (patch.isDone !== undefined) next.isDone = patch.isDone;
  if (patch.isMuted !== undefined) next.isMuted = patch.isMuted;
  if (patch.isFocus !== undefined) next.isFocus = patch.isFocus;
  if (Object.keys(next).length === 0) return;

  db.transaction((tx) => {
    // "Most important" only means something if it's singular, so focusing a
    // column clears the flag from the rest of its board.
    if (patch.isFocus) {
      const boardId = tx
        .select({ boardId: columns.boardId })
        .from(columns)
        .where(eq(columns.id, columnId))
        .get()?.boardId;
      if (boardId) {
        tx.update(columns)
          .set({ isFocus: false })
          .where(eq(columns.boardId, boardId))
          .run();
      }
    }

    tx.update(columns).set(next).where(eq(columns.id, columnId)).run();
  });
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
  contextIds?: string[];
  title: string;
  description?: string;
  priority?: Priority;
  dueDate?: number | null;
  labelIds?: string[];
};

export async function createTask(input: TaskInput) {
  const title = input.title.trim();
  if (!title) throw new Error("Task needs a title");

  // New cards land at the top of the column, so the position goes below the
  // current first rather than above the last.
  const first = db
    .select({ value: min(tasks.position) })
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
        position: positionBefore(first?.value),
      })
      .returning()
      .all();

    if (input.labelIds?.length) {
      tx.insert(taskLabels)
        .values(input.labelIds.map((labelId) => ({ taskId: task.id, labelId })))
        .run();
    }

    if (input.contextIds?.length) {
      tx.insert(taskContexts)
        .values(
          input.contextIds.map((contextId) => ({ taskId: task.id, contextId })),
        )
        .run();
    }

    return {
      ...task,
      labelIds: input.labelIds ?? [],
      contextIds: input.contextIds ?? [],
    };
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
    contextIds?: string[];
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

    // Replace rather than merge: the client always sends the full set.
    if (patch.contextIds) {
      tx.delete(taskContexts).where(eq(taskContexts.taskId, taskId)).run();
      if (patch.contextIds.length) {
        tx.insert(taskContexts)
          .values(patch.contextIds.map((contextId) => ({ taskId, contextId })))
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

// ---------------------------------------------------------------- subtasks

export async function createSubtask(taskId: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Subtask needs a title");

  const last = db
    .select({ value: max(subtasks.position) })
    .from(subtasks)
    .where(eq(subtasks.taskId, taskId))
    .get();

  const [subtask] = db
    .insert(subtasks)
    .values({ taskId, title: trimmed, position: (last?.value ?? 0) + 1000 })
    .returning()
    .all();
  return subtask;
}

export async function updateSubtask(
  subtaskId: string,
  patch: { title?: string; done?: boolean },
) {
  const next: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const trimmed = patch.title.trim();
    if (!trimmed) throw new Error("Subtask needs a title");
    next.title = trimmed;
  }
  if (patch.done !== undefined) next.done = patch.done;
  if (Object.keys(next).length === 0) return;

  db.update(subtasks).set(next).where(eq(subtasks.id, subtaskId)).run();
}

export async function deleteSubtask(subtaskId: string) {
  db.delete(subtasks).where(eq(subtasks.id, subtaskId)).run();
}

// ---------------------------------------------------------------- contexts

export async function createContext(
  boardId: string,
  name: string,
  color: string,
) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Context needs a name");

  const last = db
    .select({ value: max(contexts.position) })
    .from(contexts)
    .where(eq(contexts.boardId, boardId))
    .get();

  const [context] = db
    .insert(contexts)
    .values({
      boardId,
      name: trimmed,
      color,
      position: (last?.value ?? 0) + 1000,
    })
    .returning()
    .all();
  return context;
}

export async function updateContext(
  contextId: string,
  patch: { name?: string; color?: string },
) {
  const next: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error("Context needs a name");
    next.name = trimmed;
  }
  if (patch.color !== undefined) next.color = patch.color;
  if (Object.keys(next).length === 0) return;

  db.update(contexts).set(next).where(eq(contexts.id, contextId)).run();
}

/** Cards keep existing; their `contextId` is nulled by the FK. */
export async function deleteContext(contextId: string) {
  db.delete(contexts).where(eq(contexts.id, contextId)).run();
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

// ---------------------------------------------------------------- slack

/**
 * Pulls 📌-reacted Slack messages onto the board as cards.
 *
 * Import target is the muted column — the one whose cards render dashed and
 * unfilled — since that's the parking lot by definition, and picking it by flag
 * rather than by the name "Backlog" survives a rename.
 *
 * Idempotent by `onConflictDoNothing` against the unique index on
 * (source_type, source_ref): the poll re-sees the same reaction every few
 * minutes and must not pile up duplicates. That also means a card deleted here
 * stays deleted rather than being re-imported on the next tick, which is the
 * behaviour you want — an unpinned-in-Slack message can't delete a card, so the
 * board has to be the side that wins.
 */
export async function syncSlackPins(boardId: string) {
  const pins = await listSlackPins();
  if (pins.length === 0) return { created: 0, skipped: 0 };

  const target = db
    .select()
    .from(columns)
    .where(and(eq(columns.boardId, boardId), eq(columns.isMuted, true)))
    .orderBy(asc(columns.position))
    .get();

  if (!target) {
    throw new Error(
      "No muted column to import into — mark one as 'Dim cards (parked)' first",
    );
  }

  // Oldest first, so that a batch lands with the newest pin at the top of the
  // column: each insert goes above the previous one.
  const ordered = [...pins].reverse();

  let created = 0;
  db.transaction((tx) => {
    for (const pin of ordered) {
      const first = tx
        .select({ value: min(tasks.position) })
        .from(tasks)
        .where(eq(tasks.columnId, target.id))
        .get();

      const inserted = tx
        .insert(tasks)
        .values({
          boardId,
          columnId: target.id,
          title: pinTitle(pin.text),
          // The full message is the card's notes, so a title trimmed to one
          // line never loses anything.
          description: pin.text,
          position: positionBefore(first?.value),
          sourceType: "slack",
          sourceRef: pin.ref,
          sourceUrl: pin.url,
          sourceChannel: pin.channelName,
          sourceAuthor: pin.authorName,
        })
        .onConflictDoNothing()
        .returning()
        .all();

      if (inserted.length > 0) created += 1;
    }
  });

  if (created > 0) revalidatePath("/", "layout");
  return { created, skipped: pins.length - created };
}
