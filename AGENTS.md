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
- Timestamps cross the boundary as epoch millis (`src/lib/types.ts`), not `Date`.
- Tailwind v4: colour classes must appear literally in source, so palettes are
  written out in `src/lib/colors.ts` rather than built by interpolation.
- `npm install` here runs behind a policy that rejects packages published in the
  last 7 days; pin to an older version rather than disabling the check.
