"use client";

import { useEffect, useState } from "react";
import { THEME_KEY, TITLE_BAR, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Light or dark, and nothing else — no system option on purpose. Following the OS
 * means the board changes underneath you when the sun goes down or a meeting room
 * dims the laptop, and a board is a thing you look at all day and form a picture
 * of. One switch, one answer, remembered.
 *
 * Repaints the title bar with the board, since on an installed app the two are
 * the same window — see `TITLE_BAR`.
 */
export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", TITLE_BAR[theme]);
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {}
}

/**
 * One glyph that turns into the other, rather than two that swap.
 *
 * A sun and a moon are the same circle; the only difference is a bite taken out
 * of one side and whether it has rays. So there's a single disc here, a mask
 * circle parked off in the corner, and eight rays around it. Going dark, the
 * rays fold in and spin away while the mask slides across to carve the crescent
 * — and coming back, the same thing in reverse, which is the whole reason to
 * build it as one shape.
 *
 * Driven entirely by the `dark` class on `<html>`, not by React state. That's
 * what makes it free: the component renders identically on the server and the
 * client, so there's nothing to hydrate around, no wrong glyph for a frame on
 * load, and the transition fires exactly when the class flips because that's the
 * only moment any of these values change. On first paint the class is already
 * set, and a starting style doesn't animate, so a reload lands on the right
 * shape without playing the animation at you.
 *
 * The easing overshoots — the disc goes slightly past its size and settles back.
 * A linear tween between two circles reads as a crossfade; the overshoot is what
 * makes it read as something *becoming* something else.
 */
function SunMoon() {
  // Held together by hand, since every piece is on the same clock and the
  // stagger between them is the animation.
  const spring = "duration-500 ease-[cubic-bezier(.34,1.56,.64,1)]";

  return (
    <svg viewBox="0 0 24 24" className="size-4 overflow-visible" aria-hidden>
      <mask id="theme-toggle-crescent">
        {/* White keeps, black cuts. The disc below is drawn through this. */}
        <rect x="0" y="0" width="24" height="24" fill="white" />
        <circle
          cx="12"
          cy="12"
          r="7"
          fill="black"
          className={cn(
            "translate-x-[13px] translate-y-[-13px] transition-transform motion-reduce:transition-none dark:translate-x-[6px] dark:translate-y-[-5px]",
            spring,
          )}
        />
      </mask>

      {/* The body. Smaller as a sun so the rays have somewhere to be, full size
          as a moon — `fill-box` so it scales about its own centre rather than
          the corner of the viewBox. */}
      <circle
        cx="12"
        cy="12"
        r="7"
        fill="currentColor"
        mask="url(#theme-toggle-crescent)"
        className={cn(
          "origin-center scale-[0.62] [transform-box:fill-box] transition-transform motion-reduce:transition-none dark:scale-100",
          spring,
        )}
      />

      {/* Eight rays, folding into the disc and turning an eighth as they go, so
          they look drawn in rather than switched off. A shorter clock than the
          crescent: they're out of the way by the time the bite is taken. */}
      <g
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        className="origin-center scale-100 opacity-100 [transform-box:fill-box] transition-all duration-300 ease-out motion-reduce:transition-none dark:rotate-45 dark:scale-50 dark:opacity-0"
      >
        <line x1="12" y1="1.5" x2="12" y2="3.5" />
        <line x1="12" y1="20.5" x2="12" y2="22.5" />
        <line x1="1.5" y1="12" x2="3.5" y2="12" />
        <line x1="20.5" y1="12" x2="22.5" y2="12" />
        <line x1="4.6" y1="4.6" x2="6.1" y2="6.1" />
        <line x1="17.9" y1="17.9" x2="19.4" y2="19.4" />
        <line x1="4.6" y1="19.4" x2="6.1" y2="17.9" />
        <line x1="17.9" y1="6.1" x2="19.4" y2="4.6" />
      </g>

      {/* Two stars, arriving after the crescent has formed — the little flourish
          that makes it worth animating at all. They pop in on the same overshoot
          as the disc, a beat apart from each other. */}
      <circle
        cx="19.5"
        cy="5"
        r="1"
        fill="currentColor"
        className={cn(
          "origin-center scale-0 opacity-0 [transform-box:fill-box] transition-all delay-200 motion-reduce:transition-none dark:scale-100 dark:opacity-100",
          spring,
        )}
      />
      <circle
        cx="21"
        cy="10"
        r="0.7"
        fill="currentColor"
        className={cn(
          "origin-center scale-0 opacity-0 [transform-box:fill-box] transition-all delay-300 motion-reduce:transition-none dark:scale-100 dark:opacity-100",
          spring,
        )}
      />
    </svg>
  );
}

/**
 * The button around it. Only the label needs to know which theme is on, and a
 * label is not something that can flash — so the state here is read after mount
 * and the glyph pays it no attention.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(
      document.documentElement.classList.contains("dark") ? "dark" : "light",
    );
  }, []);

  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      // The same shape and tones as the Column button beside it: this is a
      // preference, not an action on the board, so it shouldn't be louder than
      // the thing it sits next to.
      className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-tint hover:text-ink-soft"
    >
      <SunMoon />
    </button>
  );
}
