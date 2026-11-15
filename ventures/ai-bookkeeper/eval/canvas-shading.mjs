// How unevenly each photo is lit, measured as the page measures it (photoocr.mjs
// engine.shading: a 32 x 32 grey canvas thumbnail, lightSpread), plus its size, in
// headless Chromium, so eval/page-readings.mjs can pick each photo's readings as the
// page picks them (SHADED_PASSES at or over SHADED_CUT, the grey copy first for a
// photo 2,000 px or more on its long side):
//   node eval/canvas-shading.mjs <photos> <out.json>
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { lightSpread } from "../photoocr.mjs";

let chromium; // found as eval/srd-canvas-grow.mjs finds it
for (const c of ["playwright", process.env.PLAYWRIGHT_PATH, "/opt/node-tools/node_modules/playwright", "playwright-core"].filter(Boolean).map((c) => (c.startsWith("/") && existsSync(c) && statSync(c).isDirectory() ? join(c, "index.mjs") : c))) {
  try { ({ chromium } = await import(c.startsWith("/") ? "file://" + c : c)); break; } catch {}
}
if (!chromium) { console.error("playwright not installed"); process.exit(2); }
const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error("usage: node eval/canvas-shading.mjs <photos> <out.json>"); process.exit(2); }
const browser = await chromium.launch();
const page = await browser.newPage();
const res = {};
for (const f of readdirSync(dir).filter((x) => /\.(jpe?g|png)$/i.test(x)).sort()) {
  const b64 = readFileSync(join(dir, f)).toString("base64");
  const { grey, w, h } = await page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
    const S = 32, c = document.createElement("canvas");
    c.width = S; c.height = S;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.filter = "grayscale(1)";
    g.drawImage(bmp, 0, 0, S, S);
    const d = g.getImageData(0, 0, S, S).data;
    return { grey: Array.from({ length: S * S }, (_, i) => d[i * 4]), w: bmp.width, h: bmp.height };
  }, b64);
  res[f.replace(/\.[^.]+$/, "")] = { spread: lightSpread(Uint8Array.from(grey)), w, h };
}
writeFileSync(out, JSON.stringify(res, null, 0));
await browser.close();
console.log(`${Object.keys(res).length} photos measured`);
