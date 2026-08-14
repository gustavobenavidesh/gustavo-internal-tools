import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit loads `.env` and stops there; Next reads `.env.local` too, and that's
 * the one the setup steps tell you to make. Left alone, the two disagree on the very
 * first command a new checkout runs: `db:push` sees no `DATABASE_FILE`, falls back to
 * `data/kanban.db` and creates the schema inside the repo, then `dev` opens the path
 * in `.env.local`, finds an empty file, and every query fails on a missing table.
 *
 * Node's own loader, so this costs no dependency. It leaves anything already in the
 * environment alone, so `DATABASE_FILE=… npm run db:push` still wins, and a checkout
 * without the file is fine — that's the throw being swallowed.
 */
try {
  process.loadEnvFile(".env.local");
} catch {}

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_FILE ?? "data/kanban.db",
  },
});
