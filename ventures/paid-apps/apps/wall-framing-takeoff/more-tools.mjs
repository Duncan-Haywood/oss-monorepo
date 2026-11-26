// The "More free building calculators" block at the foot of every page, kept
// in one place.
//
// Until 2026-11-18 each page carried a hand-pasted copy of this list, and the
// copies had drifted: the brace, panel, stucco and mulch calculators and the
// stud-per-foot comparison were missing from 43 or 44 of the 45 lists, so the
// venture's own index had no route to them, and the same tool went by two or
// three labels on different pages. Grouping by trade also turns a flat wall of
// 45 links into something a framer can scan.
//
//   node ventures/wall-framing-takeoff/more-tools.mjs          # check, exit 1 on drift
//   node ventures/wall-framing-takeoff/more-tools.mjs --write  # rewrite every page's block
//
// A new calculator page goes into GROUPS below, then run --write. The test
// (more-tools.test.mjs) fails while any page's block differs from this list.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const GROUPS = [
  ["Walls and framing", [
    ["index.html", "Wall framing takeoff"],
    ["how-many-studs-for-a-wall.html", "How many studs for a wall"],
    ["header-calculator.html", "Header size checker"],
    ["opening-schedule-calculator.html", "Door and window schedule"],
    ["sheathing-calculator.html", "Wall sheathing calculator"],
    ["brace-calculator.html", "Wall brace calculator"],
    ["panel-calculator.html", "Wall panel calculator"],
    ["fireblock-calculator.html", "Fireblocking calculator"],
    ["nail-calculator.html", "Framing nail calculator"],
    ["stud-drilling-checker.html", "Can I drill this hole in a stud?"],
    ["board-foot-calculator.html", "Board foot calculator"],
  ]],
  ["Floors, stairs and roofs", [
    ["floor-calculator.html", "Floor joist and subfloor calculator"],
    ["stair-stringer-calculator.html", "Stair stringer calculator"],
    ["roof-calculator.html", "Roof calculator"],
    ["dormer-calculator.html", "Dormer framing calculator"],
    ["deck-lumber-calculator.html", "Deck lumber calculator"],
  ]],
  ["Foundation and concrete", [
    ["foundation-calculator.html", "Foundation calculator"],
    ["concrete-calculator.html", "Concrete calculator"],
    ["cmu-calculator.html", "Concrete block (CMU) wall calculator"],
  ]],
  ["Exterior and envelope", [
    ["siding-calculator.html", "Siding calculator"],
    ["stucco-calculator.html", "Stucco calculator"],
    ["soffit-fascia-calculator.html", "Soffit and fascia calculator"],
    ["gutter-calculator.html", "Gutter calculator"],
    ["ventilation-calculator.html", "Attic ventilation calculator"],
    ["insulation-calculator.html", "Insulation calculator"],
  ]],
  ["Interior finishes", [
    ["drywall-calculator.html", "Drywall calculator"],
    ["paint-calculator.html", "Paint calculator"],
    ["trim-calculator.html", "Baseboard and casing calculator"],
    ["flooring-calculator.html", "Flooring calculator"],
    ["walltile-calculator.html", "Shower and wall tile calculator"],
  ]],
  ["Plumbing, electrical and HVAC", [
    ["plumbing-calculator.html", "Plumbing rough-in calculator"],
    ["water-supply-sizing-calculator.html", "Water supply pipe sizing"],
    ["electrical-calculator.html", "Electrical rough-in calculator"],
    ["hvac-calculator.html", "HVAC duct rough-in calculator"],
  ]],
  ["Site and landscape", [
    ["fence-calculator.html", "Fence calculator"],
    ["retaining-wall-calculator.html", "Retaining wall block calculator"],
    ["paver-calculator.html", "Paver patio calculator"],
    ["mulch-topsoil-gravel-calculator.html", "Mulch, topsoil and gravel calculator"],
  ]],
  ["Schedule, bids and costs", [
    ["schedule-calculator.html", "Construction schedule (critical path)"],
    ["order-by-date-calculator.html", "Order-by date calculator"],
    ["bid-leveling-calculator.html", "Bid leveling calculator"],
    ["change-order-calculator.html", "Change order calculator"],
    ["price-sensitivity-calculator.html", "Bid price sensitivity"],
    ["branded-bid-package-for-framers.html", "Branded bid package for framers"],
  ]],
  ["Measured against the alternatives", [
    ["vs-stud-per-foot-rule.html", "Takeoff vs. the stud-per-foot rule"],
    ["vs-ordering-lumber-by-hand.html", "Takeoff vs. ordering lumber by hand"],
  ]],
];

// Pages that carry no block: the sales page has its own layout and the sample
// proposal is a document, not a tool page.
export const NO_BLOCK = new Set(["branded-bid-package-for-framers.html", "sample-bid-package.html"]);

export const BLOCK_RE = /<nav class="more-tools"[\s\S]*?<\/nav>/;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// The block for one page: every group, minus the page itself.
export function moreTools(page) {
  // Inline styles: each page has its own <style> block, and this keeps the
  // block self-contained. Two or three columns on a wide screen, one on a phone.
  const parts = ['<nav class="more-tools" aria-label="More building calculators"><h2>More free building calculators</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr));gap:0 28px">'];
  for (const [title, links] of GROUPS) {
    const items = links.filter(([href]) => href !== page);
    if (!items.length) continue;
    parts.push(`<div><h3 style="font-size:1rem;margin:16px 0 4px">${esc(title)}</h3><ul style="margin:0;padding-left:1.1em">${items.map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`).join("")}</ul></div>`);
  }
  parts.push("</div></nav>");
  return parts.join("");
}

const DIR = new URL("./", import.meta.url);

export function pagesWithBlock() {
  return readdirSync(DIR).filter((f) => f.endsWith(".html") && !NO_BLOCK.has(f)).sort();
}

// [{ page, problem }] for every page whose block is missing or stale.
export function drift() {
  const out = [];
  for (const page of pagesWithBlock()) {
    const html = readFileSync(new URL(page, DIR), "utf8");
    const m = html.match(BLOCK_RE);
    if (!m) out.push({ page, problem: "no more-tools block" });
    else if (m[0] !== moreTools(page)) out.push({ page, problem: "block differs from GROUPS" });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--write")) {
    let n = 0;
    for (const { page, problem } of drift()) {
      if (problem === "no more-tools block") { console.error(`${page}: no block to replace; add one by hand`); process.exitCode = 1; continue; }
      const file = new URL(page, DIR);
      writeFileSync(file, readFileSync(file, "utf8").replace(BLOCK_RE, moreTools(page)));
      n++;
    }
    console.log(`rewrote ${n} page(s)`);
  } else {
    const d = drift();
    for (const { page, problem } of d) console.log(`${page}: ${problem}`);
    console.log(d.length ? `${d.length} page(s) out of date: run with --write` : "every page's block matches GROUPS");
    process.exitCode = d.length ? 1 : 0;
  }
}
