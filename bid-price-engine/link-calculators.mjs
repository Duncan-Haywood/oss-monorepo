// Adds one line to every `*-bid-calculator` page pointing at the shared engine
// with that trade preselected (`../bid-price-engine/#trade=<slug>`), so the
// 120+ specialist pages pass visitors and link equity to the common spine.
// Idempotent: run `node link-calculators.mjs` after build-trades.mjs; the
// marker comment makes a second run replace the line rather than add another.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { TRADES } from "./trades.mjs";

const MARK = "<!-- bid-price-engine-link -->";

export function engineLine(t) {
  return `  ${MARK}<p style="max-width:1060px;margin:0 auto;padding:0 18px 12px;font-size:.85rem;color:#5c5147">Want the margin, walk-away price and overrun headroom as well, or pricing a different trade? <a href="../bid-price-engine/#trade=${t.slug}">Price this job in the Bid Price Engine</a>, one calculator for ${TRADES.length} trades.</p>\n`;
}

export function linkAll(root = new URL("../", import.meta.url)) {
  let changed = 0;
  for (const t of TRADES) {
    const file = new URL(`${t.calculator}/index.html`, root);
    if (!existsSync(file)) continue;
    const html = readFileSync(file, "utf8");
    const line = engineLine(t);
    const old = new RegExp(`^ *${MARK}.*\\n`, "m");
    let next;
    if (old.test(html)) next = html.replace(old, () => line);
    else if (html.includes("<footer>")) next = html.replace("<footer>", () => line + "  <footer>");
    else continue;
    if (next === html) continue;
    writeFileSync(file, next);
    changed++;
  }
  return changed;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(`linked ${linkAll()} calculators`);
