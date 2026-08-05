import {
  type LucideIcon,
  Minus,
  SignalHigh,
  SignalLow,
  SignalMedium,
} from "lucide-react";
import type { Priority } from "@/db/schema";

/**
 * Signal bars rather than arrows: the level reads as a filled amount, so the
 * three levels are distinguishable at 12px even without their colour.
 */
export const PRIORITY_ICONS: Record<Priority, LucideIcon> = {
  none: Minus,
  low: SignalLow,
  medium: SignalMedium,
  high: SignalHigh,
};
