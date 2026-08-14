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

### On Windows

It runs, with two things to get right first.

**Use Node 22 LTS.** `better-sqlite3` is a native module, and this project pins it to
v11, which publishes prebuilt Windows binaries up to Node 23 and no further. On Node
24 or newer there's nothing to download, so `npm install` falls back to compiling it
and asks for Visual Studio Build Tools — which is the wall people hit, and it has
nothing to do with the app. `node --version` should say v22.

**Make the database's folder before `db:push`.** It creates the file, not the
directory above it. So for `DATABASE_FILE=C:/Users/you/kanban/kanban.db`, create
`C:\Users\you\kanban` first. Forward slashes in `.env.local` are correct on Windows —
Node accepts them, and they save escaping every backslash.

Then `npm run dev` and open http://localhost:3000. To get the app-like window, open
it in Edge or Chrome and use Install as app; there's no installer and nothing to
package — it's a local web app that keeps its data in one SQLite file.

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
- Opening a card slides a **sheet in from the right** — full height less the
  gutter it floats in, about 400px wide, over a blurred board rather than a dimmed
  one. A task belongs to the column it's in, so the board stays visible beside it;
  header and footer hold still and only the middle scrolls.
- Each card has a **visual canvas** under its notes: paste or drop screenshots —
  a Slack thread, a mock — then drag them anywhere, resize them by the corner, pan
  in both directions and pinch to zoom, Figma-style, inside a window of its own. A
  dot grid moves with the view so it reads as a canvas. Double-click an image to see
  it full size; the crosshair puts the view back at 1:1 with everything in frame.
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

**Screenshots live in the database, not beside it.** The visual canvas holds each
image as a data URL in an `attachments` row. Files on disk would be the textbook
answer, and it's the wrong one here: this app is one file you can copy, `db:backup`
is a `VACUUM INTO`, and anything kept outside the database would quietly stop being
backed up. Base64 costs a third in size and a heavier file, which for a personal
board is the cheaper half of that trade.

The canvas pans by **scrolling** and zooms by **transform**, and keeping those two
apart is the whole design. It's a real scroll container with an 8000-point surface
inside it and the origin at the middle, so an image can sit at a negative coordinate
and still be somewhere the container can scroll to. The surface is that size at every
zoom: the scale is a `transform` on a layer inside it, taken about the origin rather
than the corner, so the content stays gathered in the middle of the surface however
far in or out the view is.

Zoom used to be a multiplier applied to every coordinate as it was laid out, with the
surface sized by it. It's worth saying why that went, because it looks like the
simpler design and it reads correctly: it puts the zoom on the layout path. Every
event of a pinch relaid out the surface and every image on it, and — worse — moved
the container's own scroll range underneath the gesture, so the offset that holds a
point still under the fingers was being clamped to a surface that was still changing
size. A transform touches neither. What's left per event is a scale and two scroll
offsets.

That choice is about containment. Scrolling the canvas used to scroll the sheet
behind it, and being a scroll container is what stops that: the browser's own
`overscroll-behavior: contain` holds the movement inside the window on both axes,
where a transform-panned canvas has nothing to hold it but a cancelled wheel event.

The scrolling itself is still driven by hand, though, for a different reason: macOS
locks a native trackpad scroll to whichever axis the gesture began in. That's right
for a page and wrong for a canvas, where a diagonal drag should go diagonally, so the
wheel handler applies both deltas itself. Being a scroll container underneath is what
makes that safe — if the cancel it relies on ever fails to take, the native scroll it
was suppressing is still contained, and doubled movement on one axis is a far softer
failure than the whole panel sliding.

That property is about scroll chaining, though, and says nothing about the event —
which still bubbles to React's root, and the sheet has a handler there reading
`deltaX` to slide itself away. So the canvas stops wheel *propagation* as well. Only
propagation: cancelling would take its own scrolling with it. This is why the
vertical axis came right on its own and the horizontal one needed a second fix — it
was the only one with a handler above it. Momentum and rubber-banding come free with it. The cost is that
zoom has to scroll as well as scale, since scaling about the origin moves everything
that isn't the origin — and the scale and the scroll that compensates for it have to
land in the same frame. Left to React's own schedule they don't: the canvas paints
once at its new scale against the old offset and is dragged back afterwards. Once is
a glitch, sixty times a second is a pinch that shakes. So the zoom render is flushed
synchronously and the scroll follows it inside the same event.

Pinch is still hand-attached, because it's the one gesture the container can't
interpret. Only an image's *width* is stored. Its height always follows from that and the
natural aspect ratio, which is what makes squashing one impossible — and a stored
width of zero means "never resized", so a screenshot arrives at a readable size
instead of its full retina width. The resize grip is counter-scaled by the zoom, on
the principle that a handle which shrinks with its image eventually can't be hit.

It's handled twice, because browsers disagree about what a pinch is. Chrome sends a
`wheel` event with `ctrlKey` set; WebKit sends its own non-standard
`gesturestart`/`gesturechange` pair with a cumulative `scale` and no wheel event at
all — so on the browser this board actually runs in, the wheel path never fires.

WebKit raises those gesture events for *any* two-finger gesture, though, a plain
scroll included — and preventing one takes the wheel events after it down with it,
which is how panning came to stop working the moment pinch was added. A gesture is
only claimed once its `scale` has actually moved off 1, which a scroll never does.

That claim then holds until the fingers lift, rather than being re-tested per event.
`scale` is cumulative from the spread the pinch started at, so it passes back through
1 whenever the fingers return to where they began — and re-testing left a dead patch
right there, where the zoom stopped tracking and then jumped once the fingers cleared
it.

Holding the claim does a second job: while a pinch is running, wheel events are
cancelled and otherwise ignored. The two drive the zoom in incompatible ways — the
gesture sets it absolutely from the spread the fingers started at, a wheel nudges it
relatively from wherever it happens to be — so interleaved, every gesture event
discards what the wheels between them just did and the zoom oscillates. Each
oscillation drags the view with it, because holding a point still costs a scroll
correction proportional to how far off centre that point is. Which is exactly how it
presented: steady in the middle of the window, throwing the canvas around at the
edges.

What it does cost is care about reads. Those rows are never joined into
`getBoardData` — a card fetches its own canvas when it's opened, through
`listAttachments`, so the board's first paint never waits on every screenshot it
has ever been given. And the canvas writes on paste rather than on Save, so it
isn't part of the sheet's draft; ⌘Z doesn't reach it yet.

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
