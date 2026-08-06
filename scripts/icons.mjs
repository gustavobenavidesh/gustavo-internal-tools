import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

/**
 * Builds the app icons from the Junior mark, so the installed web app doesn't
 * fall back to a screenshot of the page. Run with `npm run icons` after changing
 * the mark or the canvas colour.
 */
const CANVAS = "#f4f4f1";
const INK = "#232325";

const source = readFileSync("src/components/junior-mark.tsx", "utf8");
const paths = [...source.matchAll(/d="([^"]+)"/g)].map((match) => match[1]);
if (paths.length === 0) throw new Error("no paths found in junior-mark.tsx");

const art = paths.map((d) => `<path d="${d}" fill="${INK}"/>`).join("\n");

const svg = (scale, offset) => `<svg xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 20 20" width="512" height="512">
  <rect width="20" height="20" rx="4.4" fill="${CANVAS}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${art}</g>
</svg>`;

mkdirSync("public", { recursive: true });
writeFileSync("/tmp/janban-icon.svg", svg(0.76, 2.4));

for (const size of [192, 512]) {
  await sharp(Buffer.from(svg(0.76, 2.4)), { density: 384 })
    .resize(size, size)
    .png()
    .toFile(`public/icon-${size}.png`);
  console.log(`✓ public/icon-${size}.png`);
}

// Maskable needs the art inside the safe circle, so it's drawn smaller.
await sharp(Buffer.from(svg(0.56, 4.4)), { density: 384 })
  .resize(512, 512)
  .png()
  .toFile("public/icon-maskable.png");
console.log("✓ public/icon-maskable.png");

// Safari's "Add to Dock" reads the apple-touch-icon, not the manifest icons, so
// the Dock would fall back to a screenshot of the page without this. Next's
// `apple-icon.png` convention emits the link tag for it.
await sharp(Buffer.from(svg(0.76, 2.4)), { density: 384 })
  .resize(180, 180)
  .png()
  .toFile("src/app/apple-icon.png");
console.log("✓ src/app/apple-icon.png");
