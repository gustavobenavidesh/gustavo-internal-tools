/**
 * "On this day" is mostly wars, crashes and assassinations, so facts are filtered
 * twice: anything matching a setback is dropped outright, and what's left is
 * ranked rather than merely allowed through.
 *
 * The ranking is the point. An unranked "is this an achievement" test treats the
 * Treaty of Some Town, 1834 as equal to the first powered flight, and since
 * nineteenth-century European diplomacy is what the feed is fullest of, that's
 * what you get nearly every time. Discoveries and inventions are what's actually
 * worth reading in a box this size: the bicycle, the aeroplane, the vaccine, the
 * telescope, the thing somebody made that hadn't existed the day before.
 */
const SETBACK =
  /\b(war|battle|invas|attack|massacre|genocide|holocaust|bomb|shoot|assassinat|murder|kill|died|dies|death|dead|execut|riot|terror|hijack|crash|sank|sink|wreck|earthquake|hurricane|tornado|flood|famine|plague|epidemic|pandemic|covid|lockdown|disaster|collapse|explos|siege|coup|overthrow|rebel|uprising|slaver|apartheid|segregat|missile|troops|military|soldier|casualt|wounded|injur|arrest|prison|convict|scandal|fraud|bankrupt|crisis|recession|resign|impeach|kidnap|hostage|refugee|deport|persecut|torture|abuse|overdose|suicide|poison|contaminat|spill|outbreak|violen|conflict|surrender|defeat|coloni[sz]|annex|raid|dismiss|revoke|banned|abduct|strike|protest|fire|burn|captur|seiz|conquer|besieg|abdicat|exile|flee|fled|hang|torpedo|mutiny)/i;

/**
 * The good stuff: something was discovered, built, flown, cured, computed or sent
 * somewhere nothing had been. This is the tier the card prefers, and most days
 * have at least a couple.
 */
const BREAKTHROUGH =
  /\b(invent|patent|discover|breakthrough|prototype|engineer|telescope|observator|astronom|comet|asteroid|planet|moon|orbit|spacecraft|satellite|probe|rover|space station|spaceflight|rocket|aviat|aircraft|aeroplane|airplane|flight|flew|bicycle|automobile|locomotive|steam engine|electric|electricity|telegraph|telephone|radio|television|broadcast|transistor|semiconductor|computer|microprocessor|software|internet|web|algorithm|laser|x-ray|radioactiv|element|periodic table|atom|nuclear reactor|particle|physics|chemistr|biolog|genome|dna|gene|cell|species|fossil|dinosaur|evolution|vaccine|antibiotic|penicillin|insulin|anaesthe|anesthe|transplant|surger|medicine|cure|microscope|printing press|photograph|camera|film|phonograph|recording|refrigerat|plastic|steel|bridge|tunnel|canal|railway|skyscraper|expedition|summit(?:ed)? of|south pole|north pole|circumnavigat)/i;

/**
 * Ordinary good news — an opening, a founding, a prize, a right won. Worth
 * showing when the day has nothing built or discovered in it.
 */
const ACHIEVEMENT =
  /\b(first|premiere|debut|found(?:ed|ing)|open(?:ed|ing|s)|launch|complet|establish|award|nobel|prize|medal|record|championship|publish|releas|unveil|inaugurat|dedicat|suffrage|reunif|olympic|world cup|festival|museum|university|library|legali[sz]e|freed|liberat|equality|reform|restor|rebuil|conserv)/i;

/**
 * Diplomacy, coronations and parliamentary procedure. Not bad news, and not what
 * anybody wants from this box either — a treaty's significance lives in its
 * consequences, which a one-line feed entry never carries, so "X and Y signed the
 * Treaty of Z" is a date with nothing attached to it.
 *
 * Kept only for the last resort, when a day holds nothing else at all.
 */
const CIVIC =
  /\b(treaty|treaties|concordat|accord|pact|charter|constitution|crowned|coronation|throne|succeed(?:ed|s) to|parliament|congress of|referendum|proclaim|decree|edict|ratif|cede[ds]?|partition|union of|act of)/i;

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
    const ok = all.filter((event) => !SETBACK.test(event.text));

    /**
     * Best tier first, and the next one folded in only while the pool is too thin
     * to shuffle through — a card with one fact in it makes the refresh button a
     * liar. Five is about where a day's rotation stops repeating noticeably.
     */
    const tiers = [
      ok.filter((e) => BREAKTHROUGH.test(e.text)),
      ok.filter((e) => !BREAKTHROUGH.test(e.text) && ACHIEVEMENT.test(e.text) && !CIVIC.test(e.text)),
      ok.filter((e) => !BREAKTHROUGH.test(e.text) && !ACHIEVEMENT.test(e.text) && !CIVIC.test(e.text)),
      ok,
      all,
    ];

    const chosen: typeof all = [];
    for (const tier of tiers) {
      if (chosen.length >= 5) break;
      for (const event of tier) if (!chosen.includes(event)) chosen.push(event);
    }

    return chosen.map((event) => {
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
