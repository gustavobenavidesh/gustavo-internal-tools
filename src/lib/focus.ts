/**
 * Which cards are being worked on right now.
 *
 * Kept on the device rather than in the database, which is a judgement about what
 * this *is*: not a property of a task — nothing about the card changes — but a note
 * about what the person in front of the board is doing at this moment. It needs to
 * survive a reload, since a mark that vanishes when the server hiccups is worse
 * than no mark; it does not need to survive being read on another machine, because
 * there isn't one.
 *
 * That also keeps it out of the undo stack. ⌘Z is for edits to the board, and
 * having it wander back through what you were looking at half an hour ago would be
 * noise — focus is always one click from where you want it.
 */
const KEY = "board:focus";

/**
 * Three, and the oldest gives way.
 *
 * A cap is the whole point: focus that can be spent on everything isn't focus, and
 * every marked card is running an animation, so a board of them won't sit still.
 * Three is enough for the real case — a thing you're doing, a thing you're waiting
 * on, a thing you keep meaning to get back to — and small enough that the ring
 * still means something.
 *
 * Focusing a fourth drops the one you marked first rather than refusing the click.
 * A refusal would need explaining at the moment you're least interested in reading
 * it, and the eviction says the same thing by doing it: this is a fixed number of
 * slots, and you've just reused one.
 */
export const FOCUS_LIMIT = 3;

/**
 * Oldest first, so the front of the list is what falls off. Pure, and separate from
 * storage, so the rule can be checked without a browser.
 */
export function toggleFocused(current: string[], taskId: string): string[] {
  if (current.includes(taskId)) return current.filter((id) => id !== taskId);
  return [...current, taskId].slice(-FOCUS_LIMIT);
}

/** Guarded like the drafts store — see `src/lib/drafts.ts` for why. */
export function readFocused(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    // A bare id is what the first version of this wrote, before focus could be
    // held by more than one card. Read it rather than dropping it on the floor.
    const parsed: unknown = raw.startsWith("[") ? JSON.parse(raw) : [raw];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((id): id is string => typeof id === "string")
      .slice(-FOCUS_LIMIT);
  } catch {
    return [];
  }
}

export function writeFocused(taskIds: string[]) {
  if (typeof window === "undefined") return;
  try {
    if (taskIds.length) window.localStorage.setItem(KEY, JSON.stringify(taskIds));
    else window.localStorage.removeItem(KEY);
  } catch {}
}
