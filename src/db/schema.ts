import { relations } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
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
    /** The column that matters most: raised, wider. At most one per board. */
    isFocus: integer("is_focus", { mode: "boolean" }).notNull().default(false),
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

/** Where a card came from, when it wasn't typed on the board. */
export const SOURCE_TYPES = ["slack"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

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

    /**
     * Provenance, for cards this board didn't originate — all null for anything
     * typed here. `sourceRef` is the upstream item's own id (a Slack message
     * `ts`), which is what makes the importer idempotent: the unique index below
     * lets the poll re-see the same reaction without creating a second card.
     * SQLite treats NULLs as distinct in a unique index, so hand-made cards are
     * unaffected no matter how many there are.
     */
    sourceType: text("source_type", { enum: SOURCE_TYPES }),
    sourceRef: text("source_ref"),
    sourceUrl: text("source_url"),
    sourceChannel: text("source_channel"),
    sourceAuthor: text("source_author"),
  },
  (t) => [
    index("tasks_column_idx").on(t.columnId),
    index("tasks_board_idx").on(t.boardId),
    uniqueIndex("tasks_source_unique").on(t.sourceType, t.sourceRef),
  ],
);

/** Optional checklist on a card; cards have none until one is added. */
export const subtasks = sqliteTable(
  "subtasks",
  {
    id: id(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    position: real("position").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("subtasks_task_idx").on(t.taskId)],
);

/**
 * Screenshots pasted onto a card's visual canvas — a Slack thread, a mock, a
 * graph. Held as data URLs in the row rather than as files beside the database,
 * because this app is one file you can copy: `npm run db:backup` is a
 * `VACUUM INTO`, and anything kept outside the database would quietly stop being
 * backed up. It costs a third in base64 and a heavier file, which for a personal
 * board is the cheaper half of that trade.
 *
 * Never joined into `getBoardData` for the same reason — see `listAttachments`,
 * which a card fetches only when it's opened. Pulling image bytes for every card
 * on the board would make the first paint of the whole thing wait for them.
 *
 * `x`/`y` are where the image sits on the canvas, which pans in both directions —
 * so they're unbounded, and negative on anything dragged up or left of where the
 * view happened to start. `position` is only the stacking order.
 */
export const attachments = sqliteTable(
  "attachments",
  {
    id: id(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** `data:image/png;base64,…` — what the paste handler read off the clipboard. */
    data: text("data").notNull(),
    /** Natural size, which the canvas scales down from to lay the image out. */
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    x: real("x").notNull().default(0),
    y: real("y").notNull().default(0),
    /**
     * How wide it's drawn on the canvas, in canvas units. Zero means "never
     * resized" — the canvas then picks a sensible width from the natural size, so
     * a screenshot doesn't arrive at its full retina width. Height is never stored:
     * it follows from this and the natural aspect, which is what keeps a resize
     * from ever squashing an image.
     */
    displayWidth: real("display_width").notNull().default(0),
    /** Stacking order, and the order they were added in. */
    position: real("position").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("attachments_task_idx").on(t.taskId)],
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
  subtasks: many(subtasks),
  attachments: many(attachments),
}));

export const subtasksRelations = relations(subtasks, ({ one }) => ({
  task: one(tasks, { fields: [subtasks.taskId], references: [tasks.id] }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  task: one(tasks, { fields: [attachments.taskId], references: [tasks.id] }),
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
export type Subtask = typeof subtasks.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
