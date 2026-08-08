<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# This project

Personal kanban board. See `README.md` for the design decisions; the short
version:

- Writes go through `src/app/actions.ts` only. Reads for server components live
  in `src/db/queries.ts`. Schema in `src/db/schema.ts` is the source of truth —
  after editing it, run `npm run db:push`.
- The client reducer (`src/components/board-state.ts`) stores order as arrays of
  ids. Never compute a `position` on the client: send neighbour ids and let the
  action derive it.
- Every mutation in `board-view.tsx` calls `record(label, run)` with how to undo
  itself, where `run` calls mutation helpers rather than dispatching directly —
  that's what makes ⌘⇧Z work without a second set of inverses. Those helpers read
  `live.current`, never the render's `state`: an undo entry outlives the render
  that made it. New mutations must follow both rules or ⌘Z will silently skip
  them.
- Timestamps cross the boundary as epoch millis (`src/lib/types.ts`), not `Date`.
- Tailwind v4: colour classes must appear literally in source, so palettes are
  written out in `src/lib/colors.ts` rather than built by interpolation.
- `npm install` here runs behind a policy that rejects packages published in the
  last 7 days; pin to an older version rather than disabling the check.
