/**
 * Lookbook: one static HTML page for a planned wardrobe, every outfit drawn
 * as flat-colour silhouettes, each piece labelled with its colour and source.
 * Same combination rule as wardrobe.outfits (top x bottom x optional layer,
 * at most one accent, no same-colour layer over a top), so the count on the
 * page equals the planner's count. Flat drawings, not a fit or drape preview.
 * Links to pieces are optional and https only; no scripts, no tracking.
 */
import { esc } from "./render.mjs";
import { safeHttps } from "./storefront.mjs";

/** Every outfit the rule allows: { top, bottom, layer|null, outer|null }. */
export function enumerateOutfits(items) {
  const tops = items.filter(i => i.role === "top");
  const bottoms = items.filter(i => i.role === "bottom");
  const layers = [null, ...items.filter(i => i.role === "layer")];
  const outers = items.filter(i => i.role === "outer");
  const acc = items.filter(i => i.role === "accessory");
  const list = [];
  for (const top of tops) for (const bottom of bottoms) for (const layer of layers) {
    if ([top, bottom, layer].filter(x => x && x.accent).length > 1) continue;
    if (layer && layer.colourName === top.colourName && layer.id !== "overshirt") continue;
    list.push({ top, bottom, layer, outer: null, accessory: null });
  }
  // Give outer and accessory pieces out in turn so every piece appears somewhere.
  list.forEach((o, n) => {
    if (outers.length && n % 2 === 0) o.outer = outers[(n / 2) % outers.length];
    if (acc.length) o.accessory = acc[n % acc.length];
  });
  return list;
}

/** Pick `max` outfits spread over the list, preferring ones that show unseen pieces. */
export function pickOutfits(all, max = 12) {
  if (all.length <= max) return all;
  const seen = new Set(), out = [], used = new Set();
  const pieces = o => [o.top, o.bottom, o.layer, o.outer, o.accessory].filter(Boolean);
  while (out.length < max) {
    let best = -1, bestGain = -1;
    all.forEach((o, i) => {
      if (used.has(i)) return;
      const gain = pieces(o).filter(p => !seen.has(p)).length;
      if (gain > bestGain) { best = i; bestGain = gain; }
    });
    if (best < 0) break;
    used.add(best); out.push(all[best]); pieces(all[best]).forEach(p => seen.add(p));
  }
  return out;
}

const SHAPES = {
  top: c => `<path d="M30 14l14-6q10 8 20 0l14 6 16 22-12 8-6-8v62H32V36l-6 8-12-8z" fill="${c}"/>`,
  layer: c => `<path d="M28 12l16-6q10 9 20 0l16 6 18 30-12 8-6-10v66H28V40l-6 10-12-8z" fill="${c}" opacity=".95"/><path d="M44 6q10 9 20 0" fill="none" stroke="#0003" stroke-width="2"/>`,
  outer: c => `<path d="M24 12l20-8 4 6 4-6 20 8 18 34-12 8-4-10v70H22V44l-4 10-12-8z" fill="${c}"/><path d="M52 10v100" stroke="#0003" stroke-width="2"/>`,
  bottom: c => `<path d="M34 6h40l4 32-6 82H58L54 40l-4 80H38l-6-82z" fill="${c}"/>`,
  accessory: c => `<circle cx="54" cy="30" r="14" fill="${c}"/><rect x="38" y="48" width="32" height="6" rx="3" fill="${c}"/>`,
};
const SHORT = c => `<path d="M34 6h40l4 32-4 24H58L54 40l-4 22H38l-4-24z" fill="${c}"/>`;

function shape(piece) {
  const c = /^#[0-9a-f]{3,8}$/i.test(piece.colour ?? "") ? piece.colour : "#999";
  if (piece.id === "shorts") return SHORT(c);
  if (piece.id === "sunglasses") return `<g fill="${c}"><rect x="22" y="22" width="26" height="16" rx="6"/><rect x="60" y="22" width="26" height="16" rx="6"/><rect x="46" y="26" width="16" height="4"/></g>`;
  return (SHAPES[piece.role] ?? SHAPES.top)(c);
}

function figure(o) {
  // top/layer/outer sit in the upper 120px, bottom below; one viewBox 108 x 250.
  const upper = [o.top, o.layer, o.outer].filter(Boolean).map(p => `<g aria-label="${esc(p.colourName + " " + p.label)}">${shape(p)}</g>`).join("");
  return `<svg viewBox="0 0 108 250" role="img" aria-label="${esc(describe(o))}"><g>${upper}</g><g transform="translate(0 124)">${shape(o.bottom)}</g>${o.accessory ? `<g transform="translate(0 4) scale(.5) translate(54 0)">${shape(o.accessory)}</g>` : ""}</svg>`;
}

export function describe(o) {
  return [o.top, o.layer, o.bottom, o.outer, o.accessory].filter(Boolean).map(p => `${p.colourName} ${p.label.toLowerCase()}`).join(" + ");
}

/**
 * lookbook(plan, { brand, title, max, links: { "<item id>|<colour>": "https://..." } })
 * -> { html, count, shown, warnings }
 */
export function lookbook(plan, { brand = "Your brand", title = "Lookbook", max = 12, links = {} } = {}) {
  const warnings = [];
  const all = enumerateOutfits(plan.items);
  const shown = pickOutfits(all, Math.max(1, Math.min(60, max)));
  const unseen = plan.items.filter(p => !shown.some(o => [o.top, o.bottom, o.layer, o.outer, o.accessory].includes(p)));
  if (unseen.length) warnings.push(`${unseen.length} piece(s) not in the ${shown.length} outfits shown: ${unseen.map(p => `${p.colourName} ${p.label.toLowerCase()}`).join(", ")}. Raise max to show them.`);
  if (all.length !== plan.outfitCount) warnings.push(`Outfit count differs from the planner (${all.length} vs ${plan.outfitCount}); the planner's rule may have changed.`);
  const piece = p => {
    const key = `${p.id}|${p.colourName}`;
    const url = links[key] ? safeHttps(links[key]) : null;
    if (links[key] && !url) warnings.push(`Link for ${key} dropped: https only.`);
    const label = `${esc(p.colourName)} ${esc(p.label.toLowerCase())}`;
    return `<li>${url ? `<a href="${esc(url)}" rel="noopener">${label}</a>` : label} <small>${esc(p.source)}</small></li>`;
  };
  const cards = shown.map((o, n) => `<article><h2>Look ${n + 1}</h2>${figure(o)}<ul>${[o.top, o.layer, o.bottom, o.outer, o.accessory].filter(Boolean).map(piece).join("")}</ul></article>`).join("\n");
  const p = plan.profile;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} - ${esc(brand)}</title>
<meta name="description" content="${esc(`${all.length} outfits from ${plan.items.length} pieces: ${p.style} style, ${p.climate} climate.`)}">
<style>:root{--bg:#faf8f4;--fg:#1d1d1f;--card:#fff;--line:#e4dfd6}@media(prefers-color-scheme:dark){:root{--bg:#141416;--fg:#ececec;--card:#1e1e21;--line:#33333a}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;padding:0 16px 40px}header,main{max-width:1000px;margin:0 auto}h1{margin:28px 0 4px}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-top:16px}article{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}article h2{font-size:1rem;margin:0}svg{width:100%;height:230px}ul{list-style:none;padding:0;margin:6px 0 0;font-size:.9rem}small{opacity:.65}a{color:inherit}</style></head>
<body><header><h1>${esc(title)}</h1><p>${esc(brand)}: ${all.length} outfits from ${plan.items.length} pieces. ${shown.length} shown. Flat drawings in the piece colours, not a fit preview.</p></header><main>
${cards}
</main></body></html>`;
  return { html, count: all.length, shown: shown.length, warnings };
}
