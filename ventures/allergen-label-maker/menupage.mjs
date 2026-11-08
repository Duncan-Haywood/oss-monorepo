// A customer-facing allergen page: one self-contained HTML file a cafe can host,
// print or put behind a QR code. The customer ticks the allergens they avoid and each
// dish is sorted into "contains", "ask staff" and "none listed". Built from the same
// analysis as the matrix, so it can only say what the owner typed (or confirmed).
//
// Wording rule: the page never says a dish is "safe" or "free from". The best it says is
// "not listed in our recipe", plus a standing line to tell staff about any allergy.
import { labelsFor, esc } from "./calc.mjs";

const jsonForScript = (v) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/** The data the page embeds: only dishes without errors. */
export function menuData(analysis) {
  return {
    region: analysis.region,
    allergens: analysis.columns.map(([k, label]) => ({ key: k, label })),
    dishes: analysis.results.filter((r) => !r.errors.length).map((r) => ({
      name: r.name,
      contains: r.declaredKeys,
      ask: [...new Set([...r.checkKeys, ...r.mayKeys])],
      may: r.mayKeys,
    })),
    labels: labelsFor(analysis.region),
  };
}

/** Classify one dish for the chosen allergens. The page script carries the same rule; a test keeps them equal. */
export function classify(dish, chosen) {
  const hits = dish.contains.filter((k) => chosen.includes(k));
  if (hits.length) return { status: "contains", keys: hits };
  const asks = dish.ask.filter((k) => chosen.includes(k));
  if (asks.length) return { status: "ask", keys: asks };
  return { status: "none", keys: [] };
}

export function menuPage(analysis, { business = "", updated = "" } = {}) {
  const data = menuData(analysis);
  const name = String(business || "").trim().slice(0, 80);
  const title = name ? `${name}: allergen guide` : "Allergen guide";
  const us = analysis.region === "us";
  return `<!doctype html>
<html lang="${us ? "en-US" : "en-GB"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
body{font:16px/1.5 system-ui,sans-serif;margin:0;color:#111;background:#fafaf7}
main{max-width:40rem;margin:0 auto;padding:1rem}
h1{font-size:1.4rem;margin:.2rem 0}
fieldset{border:1px solid #bbb;border-radius:.5rem;padding:.6rem .8rem;background:#fff}
legend{font-weight:600}
fieldset label{display:inline-block;margin:.2rem .8rem .2rem 0;white-space:nowrap}
.dish{border:1px solid #ccc;border-left-width:.5rem;border-radius:.4rem;padding:.5rem .7rem;margin:.5rem 0;background:#fff}
.dish h2{font-size:1.05rem;margin:0}
.dish p{margin:.15rem 0;font-size:.92rem}
.contains{border-left-color:#b91c1c}.ask{border-left-color:#b45309}.none{border-left-color:#4b5563}
.tag{font-weight:700}
.note{font-size:.88rem;color:#374151}
</style>
</head>
<body>
<main>
<h1>${esc(title)}</h1>
<p><strong>Tell us about any allergy or intolerance before you order.</strong> Staff can answer questions about how food is prepared. Our kitchen handles all of the allergens below, so cross-contact is possible.</p>
<fieldset><legend>Tick the allergens you need to avoid</legend><div id="boxes"></div></fieldset>
<p id="summary" class="note" aria-live="polite"></p>
<div id="dishes"></div>
<p class="note">This guide lists what is in our recipes as we wrote them${updated ? `, last updated ${esc(updated)}` : ""}. Recipes and suppliers change. "Not listed" means we did not list it, not that it is absent: always check with staff. Made with the free Allergen Label Maker.</p>
</main>
<script>
const DATA = ${jsonForScript(data)};
const boxes = document.getElementById("boxes"), out = document.getElementById("dishes"), summary = document.getElementById("summary");
for (const a of DATA.allergens) {
  const l = document.createElement("label"), c = document.createElement("input");
  c.type = "checkbox"; c.value = a.key; c.addEventListener("change", render);
  l.append(c, " " + a.label); boxes.append(l);
}
function classify(dish, chosen) {
  const hits = dish.contains.filter(k => chosen.includes(k));
  if (hits.length) return { status: "contains", keys: hits };
  const asks = dish.ask.filter(k => chosen.includes(k));
  if (asks.length) return { status: "ask", keys: asks };
  return { status: "none", keys: [] };
}
function line(box, tag, text) {
  const p = document.createElement("p"), t = document.createElement("span");
  t.className = "tag"; t.textContent = tag; p.append(t, " " + text); box.append(p);
}
function render() {
  const chosen = [...boxes.querySelectorAll("input:checked")].map(i => i.value);
  const names = k => DATA.labels[k];
  out.textContent = "";
  const order = { none: 0, ask: 1, contains: 2 };
  const rows = DATA.dishes.map(d => ({ d, r: classify(d, chosen) }));
  if (chosen.length) rows.sort((x, y) => order[x.r.status] - order[y.r.status]);
  let n = 0;
  for (const { d, r } of rows) {
    const box = document.createElement("div"), h = document.createElement("h2");
    box.className = "dish " + (chosen.length ? r.status : "none"); h.textContent = d.name; box.append(h);
    if (!chosen.length) {
      line(box, d.contains.length ? "Contains" : "Listed", d.contains.length ? d.contains.map(names).join(", ") : "No allergens listed in the recipe.");
      if (d.may.length) line(box, "May also contain", d.may.map(names).join(", ") + ".");
    } else if (r.status === "contains") line(box, "Contains", r.keys.map(names).join(", "));
    else if (r.status === "ask") line(box, "Ask staff", "May contain or needs checking: " + r.keys.map(names).join(", "));
    else { n++; line(box, "Not listed", "None of your ticked allergens is listed for this dish. Please still tell staff."); }
    out.append(box);
  }
  summary.textContent = chosen.length ? n + " of " + DATA.dishes.length + " dishes list none of the allergens you ticked. Dishes marked contains or ask staff are shown last." : "Showing every dish and what it contains. Tick allergens to filter.";
}
render();
</script>
</body>
</html>
`;
}
