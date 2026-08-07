import type { MetadataRoute } from "next";

/**
 * Makes the board installable, which is the only way to lose the browser's
 * toolbar — a page can't hide browser chrome. `display: standalone` is what
 * gives the installed window no address bar and its own Dock icon.
 *
 * Icons are generated from the Junior mark (`scripts/icons.mjs`).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Janban",
    short_name: "Janban",
    description: "Personal kanban board",
    start_url: "/",
    display: "standalone",
    /**
     * Both are the grained canvas, not the raw canvas token.
     *
     * Safari tints the installed window's title bar with `theme_color`, so this
     * is the only lever on it — there's no way to draw into native chrome, and
     * `window-controls-overlay` is Chromium-only. That means the texture can't
     * continue up there, and matching `--color-canvas` exactly leaves the bar
     * visibly lighter than the app: the grain sits over the canvas and darkens
     * it. Sampled off a screenshot of the running app, three separate patches of
     * empty sidebar all averaged #eeeeeb against a title bar of a flat #f4f4f1 —
     * six points of daylight. This is that measured average, so the flat bar
     * lands on the mean tone of the textured surface below it.
     *
     * `background_color` follows for the same reason: it's what shows before the
     * first paint, so the grained average is what makes the launch seamless.
     */
    background_color: "#eeeeeb",
    theme_color: "#eeeeeb",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
