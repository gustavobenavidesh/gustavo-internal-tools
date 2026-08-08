# Board

A personal kanban for organising my tasks. Local-first, single user, no login.

```bash
cp .env.example .env.local   # set DATABASE_FILE to a path outside the repo
npm install
npm run db:push              # creates that file from src/db/schema.ts
npm run dev                  # http://localhost:3000
```

`db:push` only works against a database that doesn't exist yet — see the note on
migrations below — so run it once, before the first `dev`. Nothing else is
required: no account, no server, no API keys. Slack sync is opt-in and off until
`SLACK_USER_TOKEN` is set.

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
- Drag cards within and between columns; drag columns to reorder them. Cards move
  aside to make room, and an accent bar along a card's top or bottom edge marks
  the slot you'd land in.
- **Aim at the middle of a card** and it folds in as a subtask of that card
  instead: the target lights up with the checklist item you're about to add,
  drawn where it will land. The top and bottom quarters of every card stay
  insertion slots, so reordering is unaffected.
- Click a card to edit title, notes, priority, due date, labels, and column.
- Columns are yours to shape: rename, add, delete, set a WIP limit, or mark one
  as a "done" column — dropping a card there completes it, dragging it out
  un-completes it.
- Filter by text, priority, or label, and hide completed tasks.
- Multiple boards via the switcher at the bottom of the sidebar.
- Archive instead of delete: archived tasks leave the board but stay in the DB.

- **⌘Z undoes, ⇧⌘Z redoes**, fifty steps deep, with a line at the bottom of the
  screen saying what just went back. It covers everything that touches a card —
  adding, moving, archiving, folding in, priorities, contexts, dialog edits,
  checklists — plus board and column renames, WIP limits, column flags and order.
  It does *not* cover permanent deletes, which is why those ask first.

Shortcuts: `n` new task, `s` focus search (`⌥N` / `⌘K` also work where the
browser doesn't reserve them), `⌘Z` / `⇧⌘Z` undo and redo, `Esc` clear
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

**Undo is the mutations run backwards, not a second set of them.** Each mutation
in `board-view.tsx` records a closure that calls the same helpers a click would —
undoing a move *is* a move — so the inverse can't drift out of step with the
thing it inverses. Because those helpers record too, the closure an undo runs
files its own inverse on the redo stack: one mechanism, read in both directions.
Two consequences worth knowing. Mutation helpers read `live.current` rather than
the render's `state`, since an entry recorded ten edits ago still has to see
today's board to work out which neighbours a card goes back between. And the
stacks are dropped whenever the server sends fresh rows — including the re-fetch
after a failed write — because at that point they describe cards that may no
longer be there.

Permanent deletes are the one gap: a hard-deleted card, column or context can't
be reconstructed (the join rows and, for Slack cards, the `sourceRef` that keeps
the importer idempotent are gone), so those confirm rather than pretending to be
reversible. Archive is the reversible one, and what everything else uses.

**A folded card flies into the one that took it.** The board removes it on the
drop, so a copy of it (`fold-flight.tsx`) is left travelling to the target and
shrinking to about the size of the tick it becomes — otherwise a card would simply
vanish from one place and a line appear in another, and the two wouldn't read as
the same event. It's a plain fixed-position clone animated with the Web Animations
API rather than the drag overlay, which dnd-kit owns and which still needs its
ordinary release animation for every other drop. Skipped under
`prefers-reduced-motion`.

Four things have to line up or that flight reads as a stutter, and all four are
about handing over cleanly rather than about the curve:

- `DragOverlay` gets `dropAnimation={null}` for a fold-in. When its child goes,
  dnd-kit *clones* it and keeps the clone on screen for the release animation —
  which would fly it back to the slot the card came from while this flies an
  identical card the other way.
- The clone starts in the overlay's exact last state — same tilt, same pulled-back
  scale, same opacity — with the flight's transform applied to a wrapper around
  it. Its first frame is the overlay's last frame. Opacity is in the card's
  transition list for the same reason.
- The checklist row is held back until the card lands. It comes from the server in
  a few milliseconds against a flight of a third of a second, and adding it early
  grows the target and shifts everything under it, out from under the card still
  travelling towards it. The dashed placeholder from the drag stays put instead and
  is swapped for the real row on arrival — same height, so nothing reflows. Undoing
  mid-flight cancels the row rather than letting it arrive afterwards.
- The cards' hand-rolled FLIP remembers where a card *looked*, transform included,
  and stands down whenever dnd-kit is animating a transform itself. A card that
  gives up a transform in the same commit that the layout absorbs it hasn't moved,
  and animating the layout half of that alone is a jump of a full card height.

**A card folded into another is archived, not deleted.** A checklist item is a
title and a tick, so the notes, labels, due date and Slack provenance of the card
it came from have nowhere to go — the row stays in the database, off the board,
where a mis-drop can be recovered from. Its own checklist does come along, in
order, below the item it became.

**The room opens from the far side.** Cards make way for the one being dragged,
as they should — but a sortable list normally does that by sliding the card you're
hovering out of the way, straight out from under the pointer trying to aim at it.
That makes dropping *into* a card essentially unlandable: the target leaves before
it can light up, and chasing it moves the pointer, which picks a new target.

So `roomFor` in `src/lib/drag.ts` replaces `verticalListSortingStrategy`. Given
the slot the dragged card sits in and the slot a drop would open, it moves only
the cards *between* the two: the old slot closes and the new one opens in one
motion, total height unchanged, and the card the new slot is measured from stays
where it is. That holds for the near edge of a card — the one you reach first
travelling towards it — and for aiming into it, which are exactly the states that
have to be aimable. Crossing to the far edge does move it, and by then the pointer
is sitting in the room that opened, so the reading is still unambiguous.

Because the aimed-at card doesn't move, what dnd-kit measured at drag start still
describes it, and hit-testing the pointer against that rect is what the eye sees.
No dwell and no hysteresis are needed to steady it. The insertion slot is drawn as
a bar *inside* the target card's box, two pixels past its edge: a line between
cards would need layout space of its own, and adding space is the one thing this
can't do without moving the target.

Reordering with the keyboard gets the insertion slots but never the fold-in: it
steps from card to card, landing dead centre on each, so "into" would swallow
every stop and leave no way to reorder.

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

**Die Grotesk won't be installed on your machine**, and shouldn't be — it's a
licensed face, loaded with `local()` rather than shipped. Without it the app
falls back to Geist and everything still works; the tone of the type is the only
thing that changes.

The DB path comes from `DATABASE_FILE` and belongs outside the repo, so deleting
a checkout can't take your tickets with it. Back it up with `npm run db:backup`,
which uses `VACUUM INTO` and then reopens the snapshot to verify it — a plain
`cp` would miss the WAL, where the most recent writes still live.
