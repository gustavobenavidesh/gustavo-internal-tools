# Board

A personal kanban for organising my tasks. Local-first, single user, no login.

```bash
npm install
npm run db:push   # creates data/kanban.db from src/db/schema.ts
npm run dev       # http://localhost:3000
```

## What it does

- A sidebar of **contexts** — the product area a card is about (Web App, Desktop
  App, Mobile App, Website, Marketing Content, Sidequests). Each has a colour dot
  and an icon; click the dot to cycle its colour. Pick a context to filter the
  board to it; cards added while it's selected inherit it. Contexts are editable
  rows, so you can rename, add, or delete them, and deleting one leaves its cards
  on the board without a context.
- **A card can sit in several contexts at once** (it's a join table, like
  labels), so it shows up under each of them and counts toward each sidebar row.
- Cards carry their contexts and priority as pills under the title — always
  visible, even when unset. Clicking a pill opens its dropdown right there
  instead of going through the task dialog; the context menu is multi-select.
- Columns can be **dimmed** from their menu ("Dim cards (parked)"), which renders
  their cards flat and dashed. The Backlog column ships that way.
- The board itself sits in a card on the canvas, with the sidebar directly on it.
- Drag cards within and between columns; drag columns to reorder them.
- Click a card to edit title, notes, priority, due date, labels, and column.
- Columns are yours to shape: rename, add, delete, set a WIP limit, or mark one
  as a "done" column — dropping a card there completes it, dragging it out
  un-completes it.
- Filter by text, priority, or label, and hide completed tasks.
- Multiple boards via the switcher at the bottom of the sidebar.
- Archive instead of delete: archived tasks leave the board but stay in the DB.

Shortcuts: `n` new task, `s` focus search (`⌥N` / `⌘K` also work where the
browser doesn't reserve them), `Esc` clear
filters / close, `Enter` save, `Shift+Enter` newline in the composer.

## Layout

| Path                       | What lives there                                        |
| -------------------------- | ------------------------------------------------------- |
| `src/db/schema.ts`         | Drizzle schema — the single source of truth for tables   |
| `src/db/queries.ts`        | Read paths for server components                        |
| `src/app/actions.ts`       | Every write, as server actions                          |
| `src/components/board-state.ts` | Client reducer holding order as id arrays          |
| `src/components/app-sidebar.tsx` | Contexts, board switcher                          |
| `src/components/task-card.tsx` | Card, its pills and their inline dropdowns          |
| `src/components/board-view.tsx` | Drag-and-drop wiring, filters, shortcuts           |

## Notes on the design

**Die Grotesk, loaded from the system.** It's a licensed face, not a webfont, so
`globals.css` pulls it in with `src: local(...)` — one `@font-face` per weight,
because the OTFs ship as separate families (`Die Grotesk A Medium`) that the
browser would otherwise never pick for `font-weight: 500`. Anywhere the font
isn't installed it falls back to Geist. To deploy this for other people, drop
woff2 files in `public/` and add `url()` sources alongside the `local()` ones.

**Warm neutral off-white.** All surface and text colours are theme tokens in
`src/app/globals.css`. The surfaces don't step monotonically: `canvas` holds the
sidebar, `surface` is the board card sitting lighter on top of it, `panel` is the
columns receding inside that card, and `panel-raised` (pure white) is task cards,
inputs and popovers. Text runs `ink` → `ink-soft` → `ink-faint` → `ink-ghost`.
The accent is Apple's system blue, with `accent-ink` as the darker step for
accent-coloured text. Change those tokens and the whole app follows. Label and
priority colours are the one exception — Tailwind only emits classes it can see
literally, so those are spelled out in `src/lib/colors.ts`.

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

**`drizzle-kit push` can fail on an existing database** with `index ... already
exists` — it re-issues `CREATE INDEX` for tables it rebuilds. When that happens,
apply the DDL by hand against `data/kanban.db` (back the file up first) rather
than letting push rebuild the table. The `contexts` table and `tasks.context_id`
were added that way.

**`better-sqlite3` is pinned to v11.** The v13 prebuilt binary segfaults on
Node 22.13 on this machine, including when built from source.

The DB lives at `data/kanban.db` (gitignored) — override with `DATABASE_FILE`.
Back it up by copying that file.
