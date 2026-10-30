// Renders icon.svg into the PNG icons the manifest and iOS need. Run it after
// editing icon.svg (needs Playwright; the PNGs are committed, so nothing else does):
//   node make-icons.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const req = createRequire(import.meta.url);
let pw;
try { pw = req("playwright"); } catch { pw = req("/opt/node-tools/node_modules/playwright/index.js"); }
const svg = readFileSync(new URL("./icon.svg", import.meta.url), "utf8");
// file, size in px, share of the canvas the artwork fills (maskable keeps it inside the safe zone)
const OUT = [["icon-192.png", 192, 1], ["icon-512.png", 512, 1], ["icon-maskable-512.png", 512, 0.8], ["apple-touch-icon.png", 180, 1]];
const browser = await pw.chromium.launch();
const page = await browser.newPage();
for (const [name, size, scale] of OUT) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * scale), pad = (size - inner) / 2;
  await page.setContent(`<html><body style="margin:0;background:#9b3f68"><div style="padding:${pad}px">${svg.replace("<svg ", `<svg width="${inner}" height="${inner}" style="display:block" `)}</div></body></html>`);
  await page.screenshot({ path: new URL(`./${name}`, import.meta.url).pathname, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(name, size);
}
await browser.close();
