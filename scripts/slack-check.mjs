/**
 * Checks a Slack token end to end, without going through the app.
 *
 * `npm run slack:check`
 *
 * Deliberately standalone rather than importing `src/lib/slack.ts`: a diagnostic
 * that shares code with the thing it's diagnosing can only tell you they agree.
 * This talks to Slack directly, so a green run here means the token and scopes
 * are genuinely good and anything still broken is on our side.
 *
 * Reports which scopes are actually granted, which matters because
 * `reactions.list` succeeds with only `reactions:read` — the calls that resolve
 * names fail separately and would otherwise just leave cards unlabelled.
 */
import { readFileSync } from "node:fs";

const PIN = "pushpin";
const NEEDED = ["reactions:read", "users:read", "channels:read"];

// Read .env.local directly so this works without the Next runtime.
function loadEnv() {
  if (process.env.SLACK_USER_TOKEN) return process.env.SLACK_USER_TOKEN;
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const match = line.match(/^\s*SLACK_USER_TOKEN\s*=\s*(.+?)\s*$/);
      if (match) return match[1].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env.local at all */
  }
  return null;
}

async function call(method, token, params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(
    `https://slack.com/api/${method}${query ? `?${query}` : ""}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await res.json();
  // The granted scopes come back in a header, not the body.
  return { body, scopes: res.headers.get("x-oauth-scopes") };
}

const token = loadEnv();
if (!token) {
  console.error("✗ No SLACK_USER_TOKEN — set it in .env.local, then re-run.");
  process.exit(1);
}
if (!token.startsWith("xoxp-")) {
  console.error(
    `✗ That looks like a ${token.slice(0, 5)}… token. reactions.list needs a` +
      " USER token (xoxp-); a bot token only ever sees the bot's own reactions.",
  );
  process.exit(1);
}

const auth = await call("auth.test", token);
if (!auth.body.ok) {
  console.error(`✗ auth.test failed: ${auth.body.error}`);
  process.exit(1);
}
console.log(`✓ authenticated as ${auth.body.user} in ${auth.body.team}`);
console.log(`  workspace host: ${auth.body.url}`);

const granted = (auth.scopes ?? "").split(",").map((s) => s.trim());
for (const scope of NEEDED) {
  const has = granted.includes(scope);
  console.log(`${has ? "✓" : "✗"} scope ${scope}${has ? "" : " — MISSING"}`);
}

const list = await call("reactions.list", token, {
  limit: "100",
  full: "true",
});
if (!list.body.ok) {
  console.error(`✗ reactions.list failed: ${list.body.error}`);
  process.exit(1);
}

const items = list.body.items ?? [];
const pinned = items.filter(
  (item) =>
    item.type === "message" &&
    item.message?.reactions?.some(
      (r) => r.name === PIN && r.users?.includes(auth.body.user_id),
    ),
);

console.log(
  `\n${items.length} reacted item(s) visible, ${pinned.length} with :${PIN}: from you`,
);

for (const item of pinned) {
  const text = (item.message?.text ?? "").replace(/\s+/g, " ").slice(0, 70);
  console.log(`  • [${item.channel}] ${text || "(no text — scope problem?)"}`);
}

if (pinned.length === 0 && items.length > 0) {
  const names = new Set(
    items.flatMap((i) => (i.message?.reactions ?? []).map((r) => r.name)),
  );
  console.log(
    `\n  Reactions found, but none were :${PIN}:. Seen: ${[...names].join(", ")}`,
  );
}
if (pinned.some((i) => !i.message?.text)) {
  console.log(
    "\n  Some messages came back with no text — that's a history scope gap for" +
      " that conversation type (groups:history / im:history).",
  );
}
