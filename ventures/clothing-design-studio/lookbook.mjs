/**
 * Lookbook: a static HTML page that draws every outfit of a capsule wardrobe
 * (top + bottom, with a layer when the rule allows one) as a flat-colour
 * figure, names each piece, and says whose it is (the brand's own design or a
 * partner brand). One self-contained file, no scripts, no trackers; nothing is
 * uploaded. Flat colour blocks show how the colours sit together; they are not
 * a fit or drape preview. Outerwear and accessories are listed as optional
 * extras, not drawn, so the page never claims a look it has not drawn.
 *
 * Links to products appear only where the designer typed an https URL for a
 * piece id (`links: { tee: "https://..." }`); nothing is invented.
 */
import { planWardrobe, enumerateOutfits } from "./wardrobe.mjs";
import { esc } from "./render.mjs";
import { safeHttps } from "./storefront.mjs";

const hex = c => (/^#[0-9a-f]{3,8}$/i.test(String(c)) ? c : "#999999");

/** Pick up to `limit` outfits that use as many different pieces as possible (greedy, deterministic). */
export function pickLooks(all, limit = 24) {
  const chosen = [];
  const used = new Map();
  const pool = all.slice();
  const key = i => (i ? `${i.id}|${i.colourName}` : "");
  while (chosen.length < limit && pool.length) {
    let best = 0, bestScore = Infinity;
    pool.forEach((o, n) => {
      const sc = [o.top, o.bottom, o.layer].filter(Boolean).reduce((a, i) => a + (used.get(key(i)) ?? 0), 0);
      if (sc < bestScore) { bestScore = sc; best = n; }
    });
    const [o] = pool.splice(best, 1);
    chosen.push(o);
    for (const i of [o.top, o.bottom, o.layer]) if (i) used.set(key(i), (used.get(key(i)) ?? 0) + 1);
  }
  return chosen;
}

/** A flat figure: bottom, top, optional layer drawn over the top. */
export function figure(o) {
  const long = o.top.id === "longsleeve";
  const sleeve = long ? 62 : 26;
  const shorts = o.bottom.id === "shorts";
  const legEnd = shorts ? 118 : 180;
  const stroke = 'stroke="rgba(0,0,0,.25)" stroke-width="1"';
  let svg = `<svg viewBox="0 0 120 190" role="img" aria-label="${esc(`${o.top.colourName} ${o.top.label.toLowerCase()}, ${o.bottom.colourName} ${o.bottom.label.toLowerCase()}${o.layer ? `, ${o.layer.colourName} ${o.layer.label.toLowerCase()}` : ""}`)}">`;
  svg += `<circle cx="60" cy="14" r="10" fill="#d9c3ab" ${stroke}/>`;
  svg += `<path d="M38 96 H82 L84 ${legEnd} H62 L60 112 L58 ${legEnd} H36 Z" fill="${hex(o.bottom.colour)}" ${stroke}/>`;
  const body = (c, len, sl) => `<path d="M40 28 H80 L${80 + sl * 0.5} ${28 + sl} L${80 + sl * 0.5 - 8} ${28 + sl + 4} L80 44 V${len} H40 V44 L${40 - sl * 0.5 + 8} ${28 + sl + 4} L${40 - sl * 0.5} ${28 + sl} Z" fill="${hex(c)}" ${stroke}/>`;
  svg += body(o.top.colour, 100, sleeve);
  if (o.layer) svg += body(o.layer.colour, 104, 60);
  return svg + "</svg>";
}

const sourceText = i => (i.source === "partner brand" ? "partner brand" : "own design");

export function lookbook(profileOrPlan, options = {}) {
  const plan = profileOrPlan?.items ? profileOrPlan : planWardrobe(profileOrPlan);
  const brand = String(options.brand ?? "").trim() || "Your brand";
  const warnings = [];
  if (brand === "Your brand") warnings.push("Set your brand name.");
  const links = options.links ?? {};
  const all = enumerateOutfits(plan.items);
  if (!all.length) warnings.push("This wardrobe makes no outfit under the colour rule; add a top, a bottom and a neutral.");
  const looks = pickLooks(all, Math.max(1, Math.min(60, options.limit ?? 24)));
  const extras = plan.items.filter(i => i.role === "outer" || i.role === "accessory");
  const link = i => { const u = safeHttps(links[i.id] ?? ""); return u ? `<a href="${esc(u)}" rel="noopener">${esc(i.label)}</a>` : esc(i.label); };
  const piece = i => `<li>${esc(i.colourName)} ${link(i)} <span class="m">(${sourceText(i)})</span></li>`;
  const cards = looks.map((o, n) => `<figure class="look" id="look-${n + 1}">${figure(o)}<figcaption><b>Look ${n + 1}</b><ul>${[o.top, o.bottom, o.layer].filter(Boolean).map(piece).join("")}</ul></figcaption></figure>`).join("\n");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(brand)}: lookbook</title>
<meta name="description" content="${esc(brand)} lookbook: ${looks.length} of ${all.length} outfits from a ${plan.items.length}-piece capsule.">
<style>
:root{--bg:#faf8f4;--fg:#1c1b19;--m:#6b675f;--line:#ddd8cd}
@media (prefers-color-scheme:dark){:root{--bg:#161513;--fg:#f1eee8;--m:#a39e93;--line:#34312c}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 Georgia,serif}
header,main,footer{max-width:62rem;margin:0 auto;padding:1rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(10rem,1fr));gap:1rem}
.look{margin:0;border:1px solid var(--line);border-radius:10px;padding:.75rem}.look svg{width:100%;height:auto;max-height:15rem}
ul{padding-left:1rem;margin:.25rem 0;font-size:.9rem}.m{color:var(--m)}footer{color:var(--m);font-size:.9rem}
a{color:inherit}
</style></head><body>
<header><h1>${esc(brand)}: lookbook</h1><p>${looks.length} of ${all.length} outfits from a ${plan.items.length}-piece capsule. Each outfit is a top and a bottom, with a layer where the colours allow, and at most one accent colour.</p></header>
<main><div class="grid">
${cards}
</div>
${extras.length ? `<h2>Optional extras (not drawn)</h2><ul>${extras.map(piece).join("")}</ul>` : ""}
</main>
<footer><p>Flat colour blocks show how the colours sit together. They are not a fit, drape or fabric preview. Made with the free Clothing Design Studio; nothing here was uploaded or tracked.</p></footer>
</body></html>
`;
  return { html, warnings, shown: looks.length, total: all.length };
}
