/**
 * The scratch list in the board's bottom corner.
 *
 * Free text rather than rows, and kept on the device rather than in the database.
 * It's a note to self about what's waiting to be shown, not board data: it has no
 * order, no column and no life of its own, and turning it into records would mean
 * inventing all three. `localStorage` is durable across reloads and restarts,
 * which is the only persistence this needs on a single-user, single-machine board.
 */
const KEY = "board:pending-demos";

export const BULLET = "• ";

/**
 * Puts a bullet on every line that hasn't got one.
 *
 * Applied on the way out of storage rather than only as you type, because
 * otherwise the rule reaches nothing already written: the note this was added to
 * had two lines in it, and they stayed bare while everything typed afterwards got
 * a marker. Blank lines are left alone — a bullet on an empty line is a bullet on
 * nothing.
 */
export function bulleted(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim() && !line.startsWith(BULLET) ? BULLET + line : line))
    .join("\n");
}

/** Guarded like the drafts store — see `src/lib/drafts.ts` for why. */
export function readDemos(): string {
  if (typeof window === "undefined") return "";
  try {
    return bulleted(window.localStorage.getItem(KEY) ?? "");
  } catch {
    return "";
  }
}

export function writeDemos(text: string) {
  if (typeof window === "undefined") return;
  try {
    if (text.trim()) window.localStorage.setItem(KEY, text);
    else window.localStorage.removeItem(KEY);
  } catch {}
}
