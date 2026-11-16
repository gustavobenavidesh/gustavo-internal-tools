import {
  AppWindow,
  AudioLines,
  Compass,
  Folder,
  Globe,
  type LucideIcon,
  Megaphone,
  Monitor,
  Smartphone,
  Watch,
} from "lucide-react";

/**
 * Contexts are user-editable rows, so icons are matched on name with a generic
 * fallback rather than stored — renaming "Website" doesn't need a DB migration
 * to keep its globe. Shared by the sidebar and the pills on cards.
 */
const CONTEXT_ICONS: Array<[RegExp, LucideIcon]> = [
  [/web app/i, AppWindow],
  [/desktop/i, Monitor],
  /* Ahead of the phone, since a watch is the more specific claim and "watchOS"
     would otherwise be caught by neither — and a watch app is a phone app's
     companion often enough that the two names sit together. */
  [/watch/i, Watch],
  [/mobile|ios|android/i, Smartphone],
  [/website|site|landing/i, Globe],
  /* A waveform rather than a microphone: a mic is what you talk *into*, and this
     one is the thing that talks back. Matched on what it does as well as on its
     name, so a context renamed from "Athena" to something plainer keeps it. */
  [/athena|voice|speech|audio|dictat/i, AudioLines],
  [/marketing|content|social/i, Megaphone],
  [/sidequest|side task|side quest|misc/i, Compass],
];

export function contextIcon(name: string): LucideIcon {
  return CONTEXT_ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? Folder;
}
