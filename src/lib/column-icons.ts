import {
  Ban,
  CalendarDays,
  Circle,
  CircleCheck,
  CircleDashed,
  GitPullRequest,
  Lightbulb,
  type LucideIcon,
  Rocket,
  Target,
} from "lucide-react";
import type { ClientColumn } from "./types";

/**
 * A status glyph per column. The flags win over the name, since they carry the
 * actual meaning — a renamed "Done" column keeps its tick. Everything else
 * falls back to matching the name, then to a plain circle.
 */
const BY_NAME: Array<[RegExp, LucideIcon]> = [
  [/block|wait|hold|stuck/i, Ban],
  [/now|doing|progress|current|today/i, Target],
  [/next|up next|soon/i, Circle],
  [/backlog|later|someday|icebox/i, CircleDashed],
  [/review|qa|feedback|check/i, GitPullRequest],
  [/ship|release|launch|live/i, Rocket],
  [/idea|maybe|explor/i, Lightbulb],
  [/week|sprint|cycle|schedule/i, CalendarDays],
];

export function columnIcon(column: {
  name: string;
  isDone: ClientColumn["isDone"];
  isMuted: ClientColumn["isMuted"];
  isFocus?: ClientColumn["isFocus"];
}): LucideIcon {
  if (column.isDone) return CircleCheck;
  if (column.isFocus) return Target;
  const matched = BY_NAME.find(([pattern]) => pattern.test(column.name))?.[1];
  if (matched) return matched;
  return column.isMuted ? CircleDashed : Circle;
}

/** Done is the one state worth colouring; everything else takes the text tone. */
export function columnIconTone(column: {
  name: string;
  isDone: ClientColumn["isDone"];
}): string | undefined {
  return column.isDone ? "text-success" : undefined;
}
