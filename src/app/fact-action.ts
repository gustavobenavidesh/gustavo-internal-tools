"use server";

import {
  type HistoryFact,
  getHistoryFact,
  getHistoryFacts,
} from "@/lib/history-fact";

/**
 * Another fact from today's feed, for the regenerate button. Excludes the one
 * on screen so a click always visibly changes something — the hourly pick is
 * deterministic, so re-rendering alone would return the same fact.
 */
export async function nextHistoryFact(
  currentText?: string,
): Promise<HistoryFact | null> {
  const facts = await getHistoryFacts();
  if (facts.length === 0) return null;

  const options = facts.filter((fact) => fact.text !== currentText);
  const pool = options.length > 0 ? options : facts;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * The hour's pick, for the client's own hourly tick. A long-lived tab never
 * re-renders on the server, so without this the fact would sit still all day —
 * and after a manual shuffle it would sit on that pick indefinitely.
 */
export async function hourlyHistoryFact(): Promise<HistoryFact | null> {
  return getHistoryFact();
}
