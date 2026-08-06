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
    background_color: "#f4f4f1",
    theme_color: "#f4f4f1",
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
