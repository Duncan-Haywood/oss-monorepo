// Regenerates trade-bid-calculators.html: one crawlable index of every
// `*-bid-calculator` venture, so a contractor who lands on Estimate Maker can
// reach the calculator that prices their trade. Run `node build-trades.mjs`
// after a bid calculator is added; trades.test.mjs fails if the page is stale.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function listTrades() {
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.endsWith("-bid-calculator"))
    .map((d) => {
      const yaml = readFileSync(new URL(`${d.name}/VENTURE.yaml`, root), "utf8");
      const m = yaml.match(/^description:\s*(.+)$/m);
      let blurb = (m ? m[1] : "").replace(/^>-?$/, "").trim();
      blurb = blurb.replace(/^A private browser calculator for /, "For ");
      if (blurb.length > 190) blurb = blurb.slice(0, 187).replace(/\s+\S*$/, "") + "…";
      const trade = d.name.replace(/-bid-calculator$/, "").split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
      return { slug: d.name, trade, blurb };
    })
    .sort((a, b) => a.trade.localeCompare(b.trade));
}

export function renderPage(trades) {
  const items = trades.map((t) =>
    `<li data-t="${esc((t.trade + " " + t.blurb).toLowerCase())}"><a href="../${t.slug}/">${esc(t.trade)} bid calculator</a><span>${esc(t.blurb)}</span></li>`).join("\n");
  const ld = JSON.stringify({
    "@context": "https://schema.org", "@type": "ItemList", name: "Free bid calculators by trade",
    numberOfItems: trades.length,
    itemListElement: trades.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: `${t.trade} bid calculator`, url: `../${t.slug}/` })),
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='7'%20fill='%231b7b7e'/%3E%3Ctext%20x='16'%20y='23'%20font-size='20'%20font-family='system-ui,sans-serif'%20font-weight='700'%20text-anchor='middle'%20fill='%23fff'%3EE%3C/text%3E%3C/svg%3E">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Free Bid Calculators by Trade — ${trades.length} Job-Pricing Tools, No Signup</title>
<meta name="description" content="${trades.length} free bid calculators for contractors and service trades. Pick your trade, price the job from labor, materials and overhead, and see the walk-away price. Private, in your browser, no account.">
<link rel="canonical" href="./trade-bid-calculators.html">
<script type="application/ld+json">${ld}</script>
<style>
:root { font: 16px system-ui, sans-serif; color: #1b1f2a; background: #f3f5f2; }
body { max-width: 920px; margin: auto; padding: 24px 16px; }
a { color: #1d6b4f; }
h1 { font-size: clamp(1.6rem, 4.5vw, 2.4rem); color: #14503a; margin: 0 0 10px; }
input { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #aebfb6; border-radius: 7px; font: 16px system-ui, sans-serif; }
ul { list-style: none; padding: 0; }
li { background: #fff; border: 1px solid #d8e0db; border-radius: 10px; padding: 12px 14px; margin: 8px 0; }
li a { font-weight: 700; display: block; }
li span, footer { font-size: .88rem; color: #4a5a52; }
</style>
</head>
<body>
<h1>Free bid calculators by trade</h1>
<p>Not sure which one fits, or your trade is not listed? <a href="../bid-price-engine/">Bid Price Engine</a> prices any job at the margin you choose, with starting inputs for each trade.</p>
<p>Each calculator below prices one kind of job from labor hours, materials, overhead and the margin you want, and shows the walk-away price under which the job loses money. They run in your browser: nothing you type is uploaded. When the number is settled, put it on a quote with <a href="./">Estimate Maker</a>.</p>
<label for="q">Find your trade (${trades.length} calculators)</label>
<input id="q" type="search" placeholder="e.g. roofing, HVAC, cleaning" autocomplete="off">
<p id="count" class="note" aria-live="polite"></p>
<ul id="list">
${items}
</ul>
<footer>
<p>No warranty. Figures are estimates from the inputs you enter, not legal, tax, or financial advice, and not a quote of record. Check local licensing and written-estimate rules. MIT licensed, <a href="https://github.com/sponsors/Duncan-Haywood">support the creator</a>.</p>
<p><a href="./">Back to Estimate Maker</a></p>
</footer>
<script>
const q = document.getElementById("q"), items = [...document.querySelectorAll("#list li")], count = document.getElementById("count");
function filter() {
  const terms = q.value.toLowerCase().split(/\\s+/).filter(Boolean);
  let n = 0;
  for (const li of items) { const ok = terms.every((t) => li.dataset.t.includes(t)); li.hidden = !ok; if (ok) n++; }
  count.textContent = n === items.length ? "" : n + " of " + items.length + " match";
}
q.addEventListener("input", filter);
</script>
</body>
</html>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL("./trade-bid-calculators.html", import.meta.url), renderPage(listTrades()));
}
