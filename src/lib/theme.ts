/**
 * The theme's constants, in a module of their own so both sides can have them.
 *
 * They started out next to the toggle, which is a `"use client"` file — and a
 * server component importing a plain value across that boundary gets a client
 * reference rather than the value itself. The symptom was quiet: `<meta
 * name="theme-color">` rendered with no `content` at all, because the object it
 * read from was undefined on the server. Nothing here is a component or touches
 * the DOM, so nothing here needs to be client-only.
 */
export type Theme = "light" | "dark";

export const THEME_KEY = "board:theme";

/**
 * What the installed window's title bar is painted with, per theme.
 *
 * Safari tints an installed app's title bar from `theme-color`, and that's the
 * only lever on it — native chrome can't be drawn into. The manifest carries one
 * value, decided at install time and static ever after, so the bar stayed light
 * while the board went dark. A `<meta>` overrides the manifest and Safari
 * repaints when its content changes, which is what lets the bar follow the
 * switch.
 *
 * The two values aren't simply the two canvases, and the reason is the grain. In
 * the light theme the texture sits over the canvas and darkens it, so a flat bar
 * set to `--color-canvas` reads about six points lighter than the app under it —
 * `#eeeeeb` is the measured average of the grained surface, and it's the same
 * value the manifest carries. The dark theme turns the grain off entirely, so
 * there's nothing to average and the bar is the canvas exactly.
 */
export const TITLE_BAR: Record<Theme, string> = {
  light: "#eeeeeb",
  dark: "#131313",
};

/**
 * The script that runs before the first paint, inlined at the top of the body.
 *
 * Without it the page renders light and corrects itself once React has hydrated —
 * a white flash on every load, which is worse in the dark theme than having no
 * dark theme at all. It's a string because it has to be in the HTML itself:
 * anything imported arrives too late to matter.
 *
 * It sets the class and the title-bar colour together, so the window's chrome is
 * right from the first frame rather than flicking from light to dark a moment
 * after the board does. Wrapped because `localStorage` throws rather than
 * returning null in a few cases — a board that failed to open is a worse outcome
 * than one that opened light.
 */
export const THEME_SCRIPT = `(function(){try{var d=localStorage.getItem("${THEME_KEY}")==="dark";if(d)document.documentElement.classList.add("dark");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",d?"${TITLE_BAR.dark}":"${TITLE_BAR.light}")}catch(e){}})()`;
