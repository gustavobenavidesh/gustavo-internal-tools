import {
  AppWindow,
  Compass,
  Folder,
  Globe,
  type LucideIcon,
  Megaphone,
  Monitor,
  Smartphone,
} from "lucide-react";

/**
 * Contexts are user-editable rows, so icons are matched on name with a generic
 * fallback rather than stored — renaming "Website" doesn't need a DB migration
 * to keep its globe. Shared by the sidebar and the pills on cards.
 */
const CONTEXT_ICONS: Array<[RegExp, LucideIcon]> = [
  [/web app/i, AppWindow],
  [/desktop/i, Monitor],
  [/mobile|ios|android/i, Smartphone],
  [/website|site|landing/i, Globe],
  [/marketing|content|social/i, Megaphone],
  [/sidequest|side task|side quest|misc/i, Compass],
];

export function contextIcon(name: string): LucideIcon {
  return CONTEXT_ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? Folder;
}
