import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Screenshots go to the server through a server action, and the default cap on
   * one of those is 1MB — which a retina screen-grab passes without trying. The
   * canvas stores images as data URLs, so the base64 adds about a third on top of
   * the file's own size, and the paste died with "Body exceeded 1 MB limit".
   *
   * 24MB is chosen against what the image actually is rather than as a round
   * number: a full 6K retina capture lands around 12–15MB encoded, so this clears
   * the largest thing this board is ever asked to swallow with room over. The
   * limit exists to stop a public app being flooded, and this one listens on
   * localhost for one person.
   *
   * Worth remembering that every megabyte here lands in `kanban.db` and stays
   * there — the database is the backup story, so a habit of pasting 15MB frames
   * would be felt eventually.
   */
  experimental: {
    serverActions: {
      bodySizeLimit: "24mb",
    },
  },
  // The dev-mode route indicator (the circled "N") sits bottom-left, right on
  // top of the sidebar. Compile and runtime errors still surface without it.
  devIndicators: false,
};

export default nextConfig;
