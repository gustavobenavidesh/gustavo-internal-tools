/**
 * "On this day" is mostly wars, crashes and assassinations, so facts are
 * filtered to the cheerful end: anything matching a setback is dropped
 * outright, and what's left has to actively look like an achievement — a first,
 * an invention, an opening, a right won. Keyword matching is crude, but it errs
 * toward dropping good facts rather than letting grim ones through.
 */
const SETBACK =
  /\b(war|battle|invas|attack|massacre|genocide|holocaust|bomb|shoot|assassinat|murder|kill|died|dies|death|dead|execut|riot|terror|hijack|crash|sank|sink|wreck|earthquake|hurricane|tornado|flood|famine|plague|epidemic|pandemic|covid|lockdown|disaster|collapse|explos|siege|coup|overthrow|rebel|uprising|slaver|apartheid|segregat|missile|troops|military|soldier|casualt|wounded|injur|arrest|prison|convict|scandal|fraud|bankrupt|crisis|recession|resign|impeach|kidnap|hostage|refugee|deport|persecut|torture|abuse|overdose|suicide|poison|contaminat|spill|outbreak|violen|conflict|surrender|defeat|coloni[sz]|annex|raid|dismiss|revoke|banned|abduct|strike|protest|fire|burn)/i;

const ACHIEVEMENT =
  /\b(first|premiere|debut|found(?:ed|ing)|open(?:ed|ing|s)|invent|discover|launch|complet|establish|award|nobel|prize|medal|record|championship|patent|publish|releas|unveil|inaugurat|dedicat|independence|suffrage|treaty|peace|reunif|summit|orbit|spacecraft|vaccine|cure|breakthrough|olympic|world cup|festival|museum|university|library|bridge|railway|canal|telescope|broadcast|television|telephone|internet|legali[sz]e|freed|liberat|charter|constitution|elected|crowned|restor|rebuil|conserv|acquitted|equality|reform)/i;

function isUplifting(text: string) {
  return !SETBACK.test(text) && ACHIEVEMENT.test(text);
}

export type HistoryFact = {
  year: number;
  text: string;
  source: string;
  sourceUrl: string;
};

type OnThisDay = {
  events?: Array<{
    year: number;
    text: string;
    pages?: Array<{
      titles?: { normalized?: string };
      content_urls?: { desktop?: { page?: string } };
    }>;
  }>;
};

/**
 * Wikipedia's curated "on this day" feed — no key, and every entry carries the
 * article it came from, which is what the source line links to.
 *
 * The pick is derived from the current hour rather than random, so it rotates on
 * the hour and stays put in between — re-rendering the board shouldn't shuffle
 * it. Today's feed holds ~20 events, so an hourly step works through most of
 * them before the date rolls over.
 */
export async function getHistoryFacts(): Promise<HistoryFact[]> {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  try {
    const response = await fetch(
      `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${month}/${day}`,
      {
        headers: { "User-Agent": "personal-kanban (local)" },
        // The feed itself only changes at midnight, but re-checking hourly keeps
        // the cache aligned with the hourly rotation below.
        next: { revalidate: 60 * 60 },
      },
    );
    if (!response.ok) return [];

    const data = (await response.json()) as OnThisDay;

    const all = (data.events ?? []).filter((event) => event.text);
    const uplifting = all.filter((event) => isUplifting(event.text));

    // Fall back to the unfiltered list only if a day somehow has nothing
    // cheerful in it, so the box is never empty.
    return (uplifting.length > 0 ? uplifting : all).map((event) => {
      const page = event.pages?.[0];
      return {
        year: event.year,
        text: event.text,
        source: page?.titles?.normalized ?? "Wikipedia",
        sourceUrl:
          page?.content_urls?.desktop?.page ??
          "https://en.wikipedia.org/wiki/Wikipedia:On_this_day",
      };
    });
  } catch {
    // A missing fact is not worth failing the board over.
    return [];
  }
}

/** The hour's pick: stable within the hour, rotating on it. */
export async function getHistoryFact(): Promise<HistoryFact | null> {
  const facts = await getHistoryFacts();
  if (facts.length === 0) return null;
  const hoursSinceEpoch = Math.floor(Date.now() / 3_600_000);
  return facts[hoursSinceEpoch % facts.length];
}
