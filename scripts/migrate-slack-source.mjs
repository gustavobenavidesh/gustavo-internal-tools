/**
 * Adds the provenance columns to `tasks`, by hand — `drizzle-kit push` fails on
 * this database by re-issuing CREATE INDEX for tables it rebuilds. ALTER TABLE
 * ADD COLUMN doesn't rebuild anything, so this is additive and reversible only
 * in the sense that the backup is: take one first.
 */
import Database from "better-sqlite3";
const file = process.env.DATABASE_FILE;
if (!file) throw new Error("DATABASE_FILE is not set");
const db = new Database(file);

const existing = new Set(db.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name));
const columns = [
  ["source_type", "TEXT"],
  ["source_ref", "TEXT"],
  ["source_url", "TEXT"],
  ["source_channel", "TEXT"],
  ["source_author", "TEXT"],
];

db.exec("BEGIN");
try {
  for (const [name, type] of columns) {
    if (existing.has(name)) { console.log(`  = ${name} already present`); continue; }
    db.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${type}`);
    console.log(`  + ${name} ${type}`);
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS tasks_source_unique ON tasks (source_type, source_ref)");
  console.log("  + unique index tasks_source_unique (source_type, source_ref)");
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  throw err;
}

console.log("\ntasks columns now:");
console.log("  " + db.prepare("PRAGMA table_info(tasks)").all().map((c) => c.name).join(", "));
console.log("indexes:", db.prepare("PRAGMA index_list(tasks)").all().map((i) => `${i.name}${i.unique ? " (unique)" : ""}`).join(", "));
console.log("integrity:", db.prepare("PRAGMA integrity_check").get().integrity_check);
console.log("tasks:", db.prepare("SELECT count(*) n FROM tasks").get().n);
