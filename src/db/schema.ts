import { relations } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/**
 * Every row carries an `ownerId` so that adding real auth later is additive:
 * swap `LOCAL_OWNER_ID` for the session user id and add a where-clause.
 */
export const LOCAL_OWNER_ID = "local";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const boards = sqliteTable("boards", {
  id: id(),
  ownerId: text("owner_id").notNull().default(LOCAL_OWNER_ID),
  name: text("name").notNull(),
  position: real("position").notNull().default(1000),
  createdAt: createdAt(),
});

export const columns = sqliteTable(
  "columns",
  {
    id: id(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: real("position").notNull(),
    /** Soft cap: the column header turns amber past this many tasks. */
    wipLimit: integer("wip_limit"),
    /** Tasks dropped here are treated as finished. */
    isDone: integer("is_done", { mode: "boolean" }).notNull().default(false),
    /** Cards here render dimmed — for parking lots like a backlog. */
    isMuted: integer("is_muted", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("columns_board_idx").on(t.boardId)],
);

/**
 * What a card is about — the product area it belongs to (Web App, Website,
 * Sidequests…). Rows rather than an enum so the list can be edited without a
 * migration; the sidebar lists these and filters the board by them.
 */
export const contexts = sqliteTable(
  "contexts",
  {
    id: id(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Key into the palette in `src/lib/colors.ts`, not a raw hex value. */
    color: text("color").notNull().default("stone"),
    position: real("position").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("contexts_board_idx").on(t.boardId)],
);

export const PRIORITIES = ["none", "low", "medium", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const tasks = sqliteTable(
  "tasks",
  {
    id: id(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    columnId: text("column_id")
      .notNull()
      .references(() => columns.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    priority: text("priority", { enum: PRIORITIES }).notNull().default("none"),
    position: real("position").notNull(),
    dueDate: integer("due_date", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index("tasks_column_idx").on(t.columnId),
    index("tasks_board_idx").on(t.boardId),
  ],
);

export const labels = sqliteTable(
  "labels",
  {
    id: id(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Key into the palette in `src/lib/colors.ts`, not a raw hex value. */
    color: text("color").notNull().default("stone"),
    createdAt: createdAt(),
  },
  (t) => [index("labels_board_idx").on(t.boardId)],
);

/** A card can belong to several contexts, so the link is its own table. */
export const taskContexts = sqliteTable(
  "task_contexts",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    contextId: text("context_id")
      .notNull()
      .references(() => contexts.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.contextId] }),
    index("task_contexts_context_idx").on(t.contextId),
  ],
);

export const taskLabels = sqliteTable(
  "task_labels",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.labelId] })],
);

export const boardsRelations = relations(boards, ({ many }) => ({
  columns: many(columns),
  tasks: many(tasks),
  labels: many(labels),
  contexts: many(contexts),
}));

export const contextsRelations = relations(contexts, ({ one, many }) => ({
  board: one(boards, { fields: [contexts.boardId], references: [boards.id] }),
  taskContexts: many(taskContexts),
}));

export const taskContextsRelations = relations(taskContexts, ({ one }) => ({
  task: one(tasks, { fields: [taskContexts.taskId], references: [tasks.id] }),
  context: one(contexts, {
    fields: [taskContexts.contextId],
    references: [contexts.id],
  }),
}));

export const columnsRelations = relations(columns, ({ one, many }) => ({
  board: one(boards, { fields: [columns.boardId], references: [boards.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  board: one(boards, { fields: [tasks.boardId], references: [boards.id] }),
  column: one(columns, { fields: [tasks.columnId], references: [columns.id] }),
  taskContexts: many(taskContexts),
  taskLabels: many(taskLabels),
}));

export const labelsRelations = relations(labels, ({ one, many }) => ({
  board: one(boards, { fields: [labels.boardId], references: [boards.id] }),
  taskLabels: many(taskLabels),
}));

export const taskLabelsRelations = relations(taskLabels, ({ one }) => ({
  task: one(tasks, { fields: [taskLabels.taskId], references: [tasks.id] }),
  label: one(labels, { fields: [taskLabels.labelId], references: [labels.id] }),
}));

export type Board = typeof boards.$inferSelect;
export type Column = typeof columns.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Label = typeof labels.$inferSelect;
export type Context = typeof contexts.$inferSelect;
