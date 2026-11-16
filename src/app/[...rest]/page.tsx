import { redirect } from "next/navigation";

/**
 * Anything this app doesn't have a route for goes to the board.
 *
 * Not a convenience: the board is installed as a Dock app, which pins it to
 * `localhost:3001` and gives the window no address bar. Whenever this server is
 * down and another local project claims that port, the window wanders off into
 * that app — and then stays there, because a standalone window has no way to be
 * typed at. The last one landed on a login page and sat on it.
 *
 * A 404 would strand it. A redirect means the window rights itself the next time
 * it reloads, whatever stale URL it's holding.
 *
 * Real misses inside the app are unaffected: `/board/[id]` matches its own route
 * and still calls `notFound()` for a board that was deleted, since a static or
 * dynamic segment always outranks a catch-all.
 */
export default function CatchAll() {
  redirect("/");
}
