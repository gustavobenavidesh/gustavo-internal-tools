import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

// The ignore comment keeps Turbopack's dependency tracer from treating this
// runtime path as an import and pulling the whole project into the bundle.
const file =
  process.env.DATABASE_FILE ??
  join(/* turbopackIgnore: true */ process.cwd(), "data", "kanban.db");

// The dev server tears down and re-creates modules on every edit; without this
// each reload would open (and leak) another handle on the same file.
const globalForDb = globalThis as unknown as {
  __kanbanDb?: ReturnType<typeof create>;
};

function create() {
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export const db = (globalForDb.__kanbanDb ??= create());
export { schema };
