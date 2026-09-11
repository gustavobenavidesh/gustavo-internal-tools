import type { ClientContext } from "@/lib/types";

/**
 * Which contexts a new card's title puts it in.
 *
 * Matched against each context's own *name* rather than a list of keywords, so
 * this needs nothing kept in step: rename "Mobile App" to "iOS" and typing "iOS"
 * starts filing cards there, and a context that's deleted stops matching because
 * it's no longer in the list. The same principle the icons use.
 *
 * Word-bounded, because a bare substring match files "website redesign" under both
 * Website and — via "web" — Web App, and picks up "watch app" inside "smartwatch
 * apps" whether or not that was meant. Names with several words match as a phrase:
 * "desktop app" in a title finds Desktop App, and "desktop" alone doesn't, which is
 * the difference between a guess and a reading.
 */
export function inferContextIds(
  title: string,
  contexts: ClientContext[],
): string[] {
  return contexts
    .filter((context) => {
      const name = context.name.trim();
      if (name.length < 3) return false;
      const pattern = new RegExp(
        `\\b${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&").replace(/\\s+/g, "\\\\s+")}\\b`,
        "i",
      );
      return pattern.test(title);
    })
    .map((context) => context.id);
}
