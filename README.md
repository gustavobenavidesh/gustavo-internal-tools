# Board

A personal kanban for organising my tasks. Local-first, single user, no login.

```bash
npm install
npm run db:push   # creates data/kanban.db from src/db/schema.ts
npm run dev       # http://localhost:3000
```

## What it does

- Drag cards within and between columns; drag columns to reorder them.
- Click a card to edit title, notes, priority, due date, labels, and column.
- Columns are yours to shape: rename, add, delete, set a WIP limit, or mark one
  as a "done" column — dropping a card there completes it, dragging it out
  un-completes it.
- Filter by text, priority, or label, and hide completed tasks.
- Multiple boards via the switcher in the top-left.
- Archive instead of delete: archived tasks leave the board but stay in the DB.

Shortcuts: `n` new task in the first column, `/` focus search, `Esc` clear
filters / close, `Enter` save, `Shift+Enter` newline in the composer.

## Layout

| Path                       | What lives there                                        |
| -------------------------- | ------------------------------------------------------- |
| `src/db/schema.ts`         | Drizzle schema — the single source of truth for tables   |
| `src/db/queries.ts`        | Read paths for server components                        |
| `src/app/actions.ts`       | Every write, as server actions                          |
| `src/components/board-state.ts` | Client reducer holding order as id arrays          |
| `src/components/board-view.tsx` | Drag-and-drop wiring, filters, shortcuts           |

## Notes on the design

**Light, warm beige.** All surface and text colours are theme tokens in
`src/app/globals.css` (`canvas` → `panel` → `panel-raised`, darkest to lightest,
so a card reads as lifted off its column; `ink`, `ink-soft`, `ink-faint`,
`ink-ghost` for text). Change the palette there and the whole app follows. Label
and priority colours are the one exception — Tailwind only emits classes it can
see literally, so those are spelled out in `src/lib/colors.ts`.

**Ordering is fractional.** Rows store a `position` float and a move writes one
row, set to the midpoint of the two cards it landed between. The client never
computes positions — it sends the ids of the new neighbours and the server
derives the number.

**Mutations are optimistic.** The board keeps its own copy of the data and
applies edits locally, then persists in the background. If a write fails you get
a toast and the page re-fetches, rather than an attempt to invert the edit.

**Ready for other people, but not shared yet.** Every table carries an
`ownerId`, currently the constant `LOCAL_OWNER_ID`. To add coworkers: resolve a
session in `src/app/actions.ts` (which is the only place that writes), scope the
queries in `src/db/queries.ts` by owner, and swap the SQLite driver for Postgres
— the Drizzle schema ports over with the dialect change.

**`better-sqlite3` is pinned to v11.** The v13 prebuilt binary segfaults on
Node 22.13 on this machine, including when built from source.

The DB lives at `data/kanban.db` (gitignored) — override with `DATABASE_FILE`.
Back it up by copying that file.
