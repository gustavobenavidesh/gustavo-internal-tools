// The patch shape lives with the form that edits it. A type-only import, so this
// stays a leaf module at runtime and nothing here pulls a component in.
import type { TaskPatch } from "@/components/task-dialog";

/**
 * A copy of what's been typed into a task, kept on the device until the server
 * confirms it landed.
 *
 * The board writes optimistically: an edit goes into local state and is persisted
 * in the background, so what's on screen is what you typed rather than what was
 * stored. That's the right trade for a local app — until the write doesn't happen,
 * at which point the two have silently diverged and only a reload says so. Notes
 * are the worst case: a card's other fields are a click to redo, and a paragraph
 * isn't.
 *
 * So every edit is mirrored here on its way through, and cleared only once the
 * write comes back successful. Anything left behind is by definition something the
 * database never got. It doesn't matter why — a dead server, a crash, a closed lid,
 * a reload in the middle of typing — which is the point of writing it down rather
 * than trying to catch each case.
 *
 * `localStorage` rather than the database for the obvious reason: the database is
 * the thing that isn't reachable. Synchronous and small, so it can be written on
 * every keystroke without a scheduler.
 */
export type Draft = {
  patch: TaskPatch;
  /** When it was last typed into, for telling the user what they're being offered. */
  at: number;
};

const key = (taskId: string) => `janban:draft:${taskId}`;

/**
 * Every call is guarded. `localStorage` throws rather than returning null in more
 * cases than it's given credit for — Safari in private browsing, a full quota, a
 * disabled cookie policy — and none of them are worth taking the sheet down over:
 * failing to keep a backup copy should never be louder than the edit it's backing
 * up. It also doesn't exist at all during a server render.
 */
export function readDraft(taskId: string): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(taskId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    // Anything without a patch is from a version that stored something else.
    return parsed?.patch ? parsed : null;
  } catch {
    return null;
  }
}

export function writeDraft(taskId: string, patch: TaskPatch) {
  if (typeof window === "undefined") return;
  try {
    const draft: Draft = { patch, at: Date.now() };
    window.localStorage.setItem(key(taskId), JSON.stringify(draft));
  } catch {}
}

export function clearDraft(taskId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(taskId));
  } catch {}
}
