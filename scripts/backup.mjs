import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";

/**
 * Snapshots the database with `VACUUM INTO` rather than copying the file.
 * SQLite runs in WAL mode, so most recent writes live in `kanban.db-wal` until
 * a checkpoint — a plain `cp` of the main file can silently miss them.
 * `VACUUM INTO` writes one consistent, already-compacted file.
 */
const KEEP = 30;

const source = resolve(
  process.env.DATABASE_FILE ?? join(homedir(), "kanban", "kanban.db"),
);
const dir = process.env.BACKUP_DIR ?? join(homedir(), "kanban-backups");
mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const target = join(dir, `kanban-${stamp}.db`);

const db = new Database(source, { readonly: true });
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();

// Read the snapshot back before reporting success — a backup nobody verified
// isn't a backup.
const check = new Database(target, { readonly: true });
const { integrity_check: integrity } = check.pragma("integrity_check")[0];
const { c: tasks } = check.prepare("select count(*) c from tasks").get();
check.close();

if (integrity !== "ok") {
  console.error(`✗ snapshot failed its integrity check: ${target}`);
  process.exit(1);
}

const size = (statSync(target).size / 1024).toFixed(0);
console.log(`✓ ${target} — ${tasks} tasks, ${size} KB, integrity ok`);

// Prune oldest, keeping the most recent KEEP snapshots.
const snapshots = readdirSync(dir)
  .filter((name) => /^kanban-.*\.db$/.test(name))
  .sort();
for (const name of snapshots.slice(0, Math.max(0, snapshots.length - KEEP))) {
  unlinkSync(join(dir, name));
  console.log(`  pruned ${name}`);
}
