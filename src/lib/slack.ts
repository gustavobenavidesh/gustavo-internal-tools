/**
 * Slack pins, read by polling rather than by webhook.
 *
 * The obvious route is the Events API with a `reaction_added` subscription, but
 * that needs Slack to reach a public HTTPS endpoint, and this board is localhost
 * with its database in `~/kanban`. It would mean running a tunnel permanently
 * just to catch a reaction.
 *
 * `reactions.list` inverts the direction: called with a *user* token it returns
 * the items that user reacted to, so the board can pull instead of being pushed
 * to. No tunnel, no inbound route, and no dependency — three `fetch` calls
 * against a documented JSON API, which also keeps this clear of the install
 * policy. Slack rates it Tier 2 (20+/min), so a poll every few minutes isn't
 * remotely near the limit.
 *
 * Consequence of pulling: this is one-way. Removing the reaction later can't
 * delete the card, because a poll can't tell "un-reacted" from "never seen".
 */

const API = "https://slack.com/api";

/** 📌 is `:pushpin:`. 📍 is `:round_pushpin:`, and is deliberately ignored. */
const PIN = "pushpin";

/** Module-level so the "not configured" note isn't repeated on every poll. */
let warnedNoToken = false;

export type SlackPin = {
  /** `channel:ts` — the dedupe key. `ts` alone repeats across channels. */
  ref: string;
  channelId: string;
  channelName: string | null;
  authorName: string | null;
  text: string;
  url: string;
};

type SlackResponse<T> = { ok: boolean; error?: string } & T;

async function call<T>(
  method: string,
  token: string,
  params: Record<string, string> = {},
): Promise<SlackResponse<T>> {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API}/${method}${query ? `?${query}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Slack ${method} returned HTTP ${res.status}`);

  const body = (await res.json()) as SlackResponse<T>;
  if (!body.ok) throw new Error(`Slack ${method} failed: ${body.error}`);
  return body;
}

type ReactionsListItem = {
  type: string;
  channel?: string;
  message?: {
    ts?: string;
    text?: string;
    user?: string;
    permalink?: string;
    reactions?: { name: string; users?: string[] }[];
  };
};

/**
 * Slack's own markup, made readable. `<https://x|label>` becomes `label`,
 * a bare `<https://x>` becomes the url, and the three XML entities Slack escapes
 * come back. Mentions are left as raw ids: resolving each one would be a
 * `users.info` per mention, which isn't worth it for a card title.
 */
function unwrap(text: string): string {
  return text
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<(https?:\/\/[^>]+)>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Everything the caller needs, or an empty list when the integration isn't
 * configured — an absent token means "off", not an error, so the board runs
 * untouched without one.
 */
export async function listSlackPins(): Promise<SlackPin[]> {
  const token = process.env.SLACK_USER_TOKEN;
  if (!token) {
    // Once per process, not once per poll. Silence here is indistinguishable
    // from "pinned and it didn't work", which is worth one line to rule out.
    if (!warnedNoToken) {
      warnedNoToken = true;
      console.info(
        "Slack sync is off: SLACK_USER_TOKEN is not set in .env.local",
      );
    }
    return [];
  }

  // Whose reactions these are, and the workspace host for permalinks. Slack
  // returns both from one unauthenticated-scope call.
  const me = await call<{ user_id: string; url: string }>("auth.test", token);
  const host = me.url.replace(/\/+$/, "");

  // `full: true` matters: without it Slack truncates each reaction's user list,
  // and on a busy message ours may be the name that got cut — which would read
  // as "someone else pinned this".
  const list = await call<{ items?: ReactionsListItem[] }>(
    "reactions.list",
    token,
    { limit: "100", full: "true" },
  );

  const pinned = (list.items ?? []).filter((item) => {
    if (item.type !== "message" || !item.channel || !item.message?.ts) {
      return false;
    }
    return item.message.reactions?.some(
      (r) => r.name === PIN && r.users?.includes(me.user_id),
    );
  });

  // One lookup per distinct id rather than per message, since a channel or a
  // person usually appears more than once in a batch.
  const channelNames = await resolveNames(
    token,
    "conversations.info",
    "channel",
    new Set(pinned.map((i) => i.channel as string)),
    (body: { channel?: { name?: string } }) => body.channel?.name,
  );
  const authorNames = await resolveNames(
    token,
    "users.info",
    "user",
    new Set(
      pinned.map((i) => i.message?.user).filter((u): u is string => Boolean(u)),
    ),
    (body: {
      user?: { profile?: { display_name?: string }; real_name?: string };
    }) => body.user?.profile?.display_name || body.user?.real_name,
  );

  return pinned.map((item) => {
    const channelId = item.channel as string;
    const ts = item.message?.ts as string;
    return {
      ref: `${channelId}:${ts}`,
      channelId,
      channelName: channelNames.get(channelId) ?? null,
      authorName: authorNames.get(item.message?.user ?? "") ?? null,
      text: unwrap(item.message?.text ?? ""),
      // Built rather than fetched: `chat.getPermalink` would be another call and
      // another scope for a URL whose shape is stable and documented.
      url:
        item.message?.permalink ??
        `${host}/archives/${channelId}/p${ts.replace(".", "")}`,
    };
  });
}

/**
 * Names for a set of ids, tolerating failures one at a time: a missing scope or
 * a channel we're not in shouldn't lose the whole batch, it should just leave
 * that card without a name.
 */
async function resolveNames<T>(
  token: string,
  method: string,
  param: string,
  ids: Set<string>,
  pick: (body: T) => string | undefined,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const id of ids) {
    try {
      const body = await call<T>(method, token, { [param]: id });
      const name = pick(body);
      if (name) names.set(id, name);
    } catch (cause) {
      console.warn(`Slack ${method} failed for ${id}`, cause);
    }
  }
  return names;
}

/**
 * A card title from a message body: its first non-empty line, cut at a word
 * boundary. The full text still lands in the card's notes, so nothing is lost by
 * being strict here.
 */
export function pinTitle(text: string, limit = 90): string {
  const firstLine = text.split("\n").find((l) => l.trim()) ?? "";
  const line = firstLine.trim();
  if (line.length <= limit) return line || "Pinned Slack message";

  const cut = line.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
