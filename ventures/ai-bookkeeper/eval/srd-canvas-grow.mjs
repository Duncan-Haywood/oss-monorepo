// Draws the grey copy the page reads (photoocr.mjs greyCopy: long side 2,000 px,
// grayscale(1), smoothing "high") for every photo in <in>, in headless Chromium, so
// eval/sroie-tesseractjs.mjs can read exactly what the page reads:
//   node eval/srd-canvas-grow.mjs <photos> <out> [side]
// Photos already at least `side` pixels on the long side are skipped, as the page skips them.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

let chromium; // found as eval/photo-ocr-browser.mjs finds it
for (const c of ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright", "playwright-core"].filter(Boolean).map((c) => (c.startsWith("/") && existsSync(c) && statSync(c).isDirectory() ? join(c, "index.mjs") : c))) {
  try { ({ chromium } = await import(c.startsWith("/") ? "file://" + c : c)); break; } catch {}
}
if (!chromium) { console.error("playwright not installed"); process.exit(2); }

const [dir, out, side = "2000"] = process.argv.slice(2);
if (!dir || !out) { console.error("usage: node eval/srd-canvas-grow.mjs <photos> <out> [side]"); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
let made = 0, skipped = 0;
for (const f of readdirSync(dir).filter((x) => /\.(jpe?g|png)$/i.test(x)).sort()) {
  const b64 = readFileSync(join(dir, f)).toString("base64");
  const png = await page.evaluate(async ({ b64, side }) => {
    const blob = await (await fetch(`data:image/jpeg;base64,${b64}`)).blob();
    const bmp = await createImageBitmap(blob);
    const k = side / Math.max(bmp.width, bmp.height);
    if (k <= 1) return null;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.filter = "grayscale(1)";
    g.drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL("image/png").split(",")[1];
  }, { b64, side: +side });
  if (!png) { skipped++; continue; }
  writeFileSync(join(out, f.replace(/\.[^.]+$/, ".png")), Buffer.from(png, "base64"));
  made++;
}
await browser.close();
console.log(`${made} grey copies drawn, ${skipped} photos already ${side} px or more`);
