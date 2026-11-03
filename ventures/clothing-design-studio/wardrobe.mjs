/**
 * Wardrobe planner: a small, complete wardrobe (a capsule) for one kind of
 * person, and a cautious first drop to make of it.
 *
 * Two uses from the same engine:
 *   - a "full wardrobe" service: answer a few questions about a person (age
 *     band, fit, style, climate, season, what they dress for, the quality
 *     tier) and get a set of pieces that combine into many outfits;
 *   - a brand's first drop: the same capsule for a target audience, with
 *     which pieces to make in-house (designed in the studio) and which to
 *     carry from partner brands on commission, and quantities that start
 *     small so unsold stock cannot sink the launch.
 *
 * Deterministic: the same answers give the same wardrobe. Colours combine by
 * a simple rule (neutrals go with anything; at most one accent colour per
 * outfit), so the outfit count is checkable by hand.
 */

import { COLOURS } from "./catalogue.mjs";

export const AGE_BANDS = ["18-24", "25-34", "35-44", "45+"];
export const FITS = { mens: "Men's fit", womens: "Women's fit", unisex: "Unisex" };
export const STYLES = {
  classic: "Classic (timeless, tailored)",
  streetwear: "Streetwear (relaxed, graphic)",
  minimal: "Minimal (quiet, monochrome)",
  statement: "Statement (art and sacred motifs)",
};
export const CLIMATES = { warm: "Warm", temperate: "Temperate", cold: "Cold" };
export const SEASONS = { "spring-summer": "Spring/summer", "autumn-winter": "Autumn/winter", "all-year": "All year" };
export const OCCASIONS = { office: "Office work", active: "Hands-on work", casual: "Weekends and casual", evening: "Evenings out" };

/** Quality tiers change materials, not the shape of the wardrobe. */
export const TIERS = {
  essential: { label: "Essential", fabric: "cotton-jersey", gsm: 180, note: "Everyday weights; lowest cost per piece." },
  premium: { label: "Premium", fabric: "heavyweight-cotton", gsm: 240, note: "Heavier, structured fabrics that look more expensive than they cost." },
  luxury: { label: "Luxury", fabric: "heavyweight-cotton", gsm: 300, note: "The heaviest knits, organic or certified fabrics, embroidery over print." },
};

/**
 * Item types. `studio` names the studio garment that makes it in-house;
 * items without one come from a partner brand, or the brand's own
 * manufacturer outside the studio. Scores say where each item fits.
 */
export const ITEMS = [
  { id: "tee", label: "T-shirt", role: "top", studio: "tee", styles: ["classic", "streetwear", "minimal", "statement"], occasions: ["casual", "active", "evening"], seasons: ["spring-summer", "all-year"], climates: ["warm", "temperate", "cold"] },
  { id: "graphic-tee", label: "Graphic t-shirt", role: "top", studio: "tee", styles: ["streetwear", "statement"], occasions: ["casual", "evening"], seasons: ["spring-summer", "all-year"], climates: ["warm", "temperate"] },
  { id: "longsleeve", label: "Long-sleeve tee", role: "top", studio: "longsleeve", styles: ["streetwear", "minimal", "statement"], occasions: ["casual", "active"], seasons: ["autumn-winter", "all-year"], climates: ["temperate", "cold"] },
  { id: "oxford", label: "Oxford shirt", role: "top", styles: ["classic", "minimal"], occasions: ["office", "casual", "evening"], seasons: ["spring-summer", "autumn-winter", "all-year"], climates: ["warm", "temperate", "cold"] },
  { id: "linen-shirt", label: "Linen shirt", role: "top", styles: ["classic", "minimal", "statement"], occasions: ["casual", "evening", "office"], seasons: ["spring-summer"], climates: ["warm", "temperate"] },
  { id: "polo", label: "Knit polo", role: "top", styles: ["classic"], occasions: ["office", "casual"], seasons: ["spring-summer", "all-year"], climates: ["warm", "temperate"] },
  { id: "work-shirt", label: "Heavy work shirt", role: "top", styles: ["classic", "streetwear"], occasions: ["active", "casual"], seasons: ["autumn-winter", "all-year"], climates: ["temperate", "cold"] },
  { id: "chinos", colours: ["khaki", "navy", "olive", "sand", "charcoal", "beige"],  label: "Chinos", role: "bottom", styles: ["classic", "minimal"], occasions: ["office", "casual", "evening"], seasons: ["spring-summer", "autumn-winter", "all-year"], climates: ["warm", "temperate", "cold"] },
  { id: "jeans", colours: ["indigo", "black", "light wash"],  label: "Jeans", role: "bottom", styles: ["classic", "streetwear", "minimal", "statement"], occasions: ["casual", "evening", "active"], seasons: ["autumn-winter", "all-year", "spring-summer"], climates: ["temperate", "cold", "warm"] },
  { id: "trousers", colours: ["charcoal", "navy", "black", "camel", "sand", "beige"],  label: "Tailored trousers", role: "bottom", styles: ["classic", "minimal", "statement"], occasions: ["office", "evening"], seasons: ["spring-summer", "autumn-winter", "all-year"], climates: ["warm", "temperate", "cold"] },
  { id: "cargo", colours: ["olive", "black", "khaki", "charcoal"],  label: "Cargo or work trousers", role: "bottom", styles: ["streetwear"], occasions: ["active", "casual"], seasons: ["autumn-winter", "all-year"], climates: ["temperate", "cold"] },
  { id: "shorts", colours: ["khaki", "navy", "black", "sand", "olive"],  label: "Shorts", role: "bottom", styles: ["classic", "streetwear", "minimal"], occasions: ["casual"], seasons: ["spring-summer"], climates: ["warm", "temperate"] },
  { id: "crewneck", label: "Crewneck sweatshirt", role: "layer", studio: "crewneck", styles: ["streetwear", "minimal", "statement", "classic"], occasions: ["casual", "active"], seasons: ["autumn-winter", "all-year"], climates: ["temperate", "cold"] },
  { id: "hoodie", label: "Hoodie", role: "layer", studio: "hoodie", styles: ["streetwear", "statement"], occasions: ["casual", "active"], seasons: ["autumn-winter", "all-year"], climates: ["temperate", "cold"] },
  { id: "knit", label: "Merino or cotton knit", role: "layer", styles: ["classic", "minimal"], occasions: ["office", "casual", "evening"], seasons: ["autumn-winter", "all-year"], climates: ["temperate", "cold"] },
  { id: "overshirt", label: "Overshirt", role: "layer", styles: ["classic", "streetwear", "minimal"], occasions: ["casual", "office"], seasons: ["spring-summer", "autumn-winter", "all-year"], climates: ["warm", "temperate"] },
  { id: "blazer", colours: ["navy", "charcoal", "camel", "black", "sand"],  label: "Unstructured blazer", role: "outer", styles: ["classic", "minimal", "statement"], occasions: ["office", "evening"], seasons: ["spring-summer", "autumn-winter", "all-year"], climates: ["warm", "temperate", "cold"] },
  { id: "jacket", label: "Light jacket", role: "outer", styles: ["classic", "streetwear", "minimal", "statement"], occasions: ["casual", "active"], seasons: ["spring-summer", "all-year"], climates: ["warm", "temperate"] },
  { id: "coat", colours: ["camel", "charcoal", "navy", "black"],  label: "Wool coat", role: "outer", styles: ["classic", "minimal", "statement"], occasions: ["office", "evening", "casual"], seasons: ["autumn-winter"], climates: ["temperate", "cold"] },
  { id: "puffer", colours: ["black", "olive", "navy"],  label: "Insulated jacket", role: "outer", styles: ["streetwear", "minimal"], occasions: ["casual", "active"], seasons: ["autumn-winter"], climates: ["cold"] },
  { id: "sunglasses", colours: ["black", "chocolate"],  label: "Sunglasses", role: "accessory", studio: "sunglasses", styles: ["classic", "streetwear", "minimal", "statement"], occasions: ["casual", "evening"], seasons: ["spring-summer", "all-year"], climates: ["warm", "temperate"] },
  { id: "cap", label: "Cap", role: "accessory", styles: ["streetwear"], occasions: ["casual", "active"], seasons: ["spring-summer", "all-year"], climates: ["warm", "temperate"] },
  { id: "beanie", label: "Beanie", role: "accessory", styles: ["streetwear", "minimal"], occasions: ["casual", "active"], seasons: ["autumn-winter"], climates: ["cold", "temperate"] },
  { id: "belt", colours: ["chocolate", "black"],  label: "Leather belt", role: "accessory", styles: ["classic", "minimal", "statement"], occasions: ["office", "evening", "casual"], seasons: ["spring-summer", "autumn-winter", "all-year"], climates: ["warm", "temperate", "cold"] },
];

/** Neutrals first, then the accents; at most one accent per outfit. */
export const PALETTES = {
  classic: { neutrals: ["navy", "white", "heather grey", "camel", "chocolate"], accents: ["burgundy", "forest green"] },
  streetwear: { neutrals: ["black", "white", "heather grey", "olive", "sand"], accents: ["burgundy", "royal blue"] },
  minimal: { neutrals: ["black", "white", "bone", "charcoal", "sand"], accents: ["sage"] },
  statement: { neutrals: ["black", "cream", "charcoal", "chocolate", "bone"], accents: ["burgundy", "gold"] },
};

const ROLE_SHARE = { top: 0.38, bottom: 0.22, layer: 0.16, outer: 0.12, accessory: 0.12 };
const ROLES = ["top", "bottom", "layer", "outer", "accessory"];

export function defaultProfile(overrides = {}) {
  return { ageBand: "25-34", fit: "unisex", style: "statement", climate: "temperate", season: "all-year", occasions: ["casual", "evening"], tier: "premium", size: 12, source: "both", ...overrides };
}

function score(item, p) {
  let s = 0;
  if (item.styles.includes(p.style)) s += 4;
  s += p.occasions.filter(o => item.occasions.includes(o)).length * 2;
  if (item.seasons.includes(p.season)) s += 2;
  if (item.climates.includes(p.climate)) s += 2;
  if (p.source !== "partners" && item.studio) s += 1;
  // Younger bands lean relaxed, older bands lean tailored: a small nudge, not a rule.
  if (["18-24"].includes(p.ageBand) && ["hoodie", "graphic-tee", "cap", "cargo"].includes(item.id)) s += 1;
  if (["35-44", "45+"].includes(p.ageBand) && ["blazer", "knit", "oxford", "trousers", "coat"].includes(item.id)) s += 1;
  return s;
}

function eligible(item, p) {
  const season = p.season === "all-year" || item.seasons.includes(p.season) || item.seasons.includes("all-year");
  const climate = item.climates.includes(p.climate);
  return season && climate && (item.styles.includes(p.style) || p.occasions.some(o => item.occasions.includes(o)));
}

/** A colour for this item: the palette's choice if the item can come in it, else the nearest the item allows. */
function colourFor(item, wanted, palette, taken) {
  if (!item.colours) return wanted;
  const fromPalette = [...palette.neutrals, ...palette.accents].filter(c => item.colours.includes(c));
  const options = [...fromPalette, ...item.colours.filter(c => !fromPalette.includes(c))];
  return options.find(c => !taken.has(`${item.id}|${c}`)) ?? options[0];
}

/**
 * Build the capsule. Returns { items, palette, outfits, outfitCount, notes }.
 * Each item: { id, label, role, colour, colourName, accent, source, studio, material }.
 */
export function planWardrobe(profile) {
  const p = { ...defaultProfile(), ...profile };
  const size = Math.max(5, Math.min(30, Math.round(p.size)));
  const palette = PALETTES[p.style] ?? PALETTES.classic;
  const notes = [];

  // Pieces per role, at least one top and one bottom.
  const counts = Object.fromEntries(ROLES.map(r => [r, Math.max(r === "top" || r === "bottom" ? 1 : 0, Math.round(size * ROLE_SHARE[r]))]));
  if (p.climate === "warm" || p.season === "spring-summer") { counts.top += counts.outer > 1 ? 1 : 0; counts.outer = Math.min(counts.outer, 1); }
  if (p.climate === "cold" || p.season === "autumn-winter") { counts.layer += 1; counts.accessory = Math.max(0, counts.accessory - 1); }
  let total = ROLES.reduce((s, r) => s + counts[r], 0);
  while (total > size) { const r = [...ROLES].sort((a, b) => counts[b] - counts[a])[0]; counts[r]--; total--; }
  while (total < size) { counts.top++; total++; }

  const pools = Object.fromEntries(ROLES.map(role => [role, ITEMS.filter(i => i.role === role && eligible(i, p) && (p.source !== "in-house" || i.studio || role === "bottom" || role === "outer"))
    .map(i => ({ i, s: score(i, p) }))
    .sort((a, b) => b.s - a.s || a.i.id.localeCompare(b.i.id))]));
  // A role with nothing suitable (no layers for a hot summer) gives its pieces to tops.
  for (const role of ROLES) if (!pools[role].length && counts[role]) { counts.top += counts[role]; counts[role] = 0; }
  const items = [];
  for (const role of ROLES) {
    const pool = pools[role];
    if (!pool.length) continue;
    const neutrals = palette.neutrals;
    for (let k = 0; k < counts[role]; k++) {
      // Spread across the best types, then repeat them in other colours.
      const types = pool.slice(0, Math.max(1, Math.min(pool.length, Math.ceil(counts[role] / 2))));
      const { i } = types[k % types.length];
      const sameType = items.filter(x => x.id === i.id).length;
      const accent = role !== "accessory" && role !== "bottom" && k === counts[role] - 1 && counts[role] >= 3;
      const wanted = accent ? palette.accents[(ROLES.indexOf(role)) % palette.accents.length] : neutrals[(sameType + ROLES.indexOf(role) + (role === "bottom" ? 0 : k)) % neutrals.length];
      const colourName = colourFor(i, wanted, palette, new Set(items.map(x => `${x.id}|${x.colourName}`)));
      const source = i.studio && p.source !== "partners" ? "in-house" : p.source === "in-house" ? "in-house (own manufacturer)" : "partner brand";
      items.push({ id: i.id, label: i.label, role, colourName, colour: COLOURS[colourName], accent: accent && colourName === wanted, source, studio: i.studio ?? null, material: materialFor(i, p) });
    }
  }
  // Remove exact duplicates (same item and colour) by shifting colour.
  const seen = new Set();
  for (const it of items) {
    let key = `${it.id}|${it.colourName}`;
    let n = 0;
    const allowed = ITEMS.find(x => x.id === it.id)?.colours ?? palette.neutrals;
    while (seen.has(key) && n < allowed.length) { it.colourName = allowed[(allowed.indexOf(it.colourName) + 1) % allowed.length]; it.colour = COLOURS[it.colourName]; it.accent = false; key = `${it.id}|${it.colourName}`; n++; }
    seen.add(key);
  }

  const { count, sample } = outfits(items, p);
  if (p.source === "both") notes.push("Pieces marked partner brand are carried from other labels on commission: no stock to buy, a wider range for visitors, and a commission on each sale.");
  if (p.tier === "luxury") notes.push("At the luxury tier the fabric and finish carry the price; keep the capsule small and the decoration embroidered or raised rather than printed.");
  notes.push(`${count} outfits from ${items.length} pieces, counting top + bottom (+ an optional layer) with at most one accent colour.`);
  return { profile: p, items, palette, outfitCount: count, outfits: sample, notes };
}

function materialFor(item, p) {
  const t = TIERS[p.tier] ?? TIERS.premium;
  if (item.studio === "sunglasses") return p.tier === "essential" ? "TR90 frame" : "Acetate frame, polarised lenses";
  if (item.studio) return `${t.gsm} gsm ${t.fabric === "heavyweight-cotton" ? "heavyweight cotton" : "cotton jersey"}${p.tier === "luxury" ? ", organic if certified" : ""}`;
  return { essential: "Standard weight", premium: "Heavier cloth, better finishing", luxury: "Best cloth the maker offers" }[p.tier] ?? "";
}

/** Count outfits: top x bottom x (layer or none), at most one accent among them. */
export function outfits(items, profile = defaultProfile()) {
  const tops = items.filter(i => i.role === "top");
  const bottoms = items.filter(i => i.role === "bottom");
  const layers = [null, ...items.filter(i => i.role === "layer")];
  const outers = items.filter(i => i.role === "outer");
  let count = 0;
  const sample = [];
  for (const t of tops) for (const b of bottoms) for (const l of layers) {
    const accents = [t, b, l].filter(x => x && x.accent).length;
    if (accents > 1) continue;
    if (l && l.colourName === t.colourName && l.id !== "overshirt") continue; // same-colour layer over a top reads as one block; skip
    count++;
    if (sample.length < 6 && (sample.length === 0 || !sample.some(s => s.top === t.label + t.colourName || s.bottom === b.label + b.colourName))) {
      const outer = outers[sample.length % Math.max(1, outers.length)] ?? null;
      sample.push({ top: t.label + t.colourName, bottom: b.label + b.colourName, text: [t, b, l, outer && sample.length % 2 === 0 ? outer : null].filter(Boolean).map(x => `${x.colourName} ${x.label.toLowerCase()}`).join(" + "), occasion: profile.occasions[sample.length % profile.occasions.length] });
    }
  }
  return { count, sample: sample.map(({ text, occasion }) => ({ text, occasion })) };
}

/**
 * A cautious first drop: quantities for the in-house pieces that fit a
 * production budget, starting small. `unitCosts` maps item index to a landed
 * cost (from the studio or the supplier); pieces without one are listed as
 * needing a quote. If the budget cannot cover the minimum order of every
 * piece, the drop is cut to the pieces with the most outfits first.
 */
export function firstDrop(plan, { budget = 3000, moq = 50, unitCosts = {}, maxPerPiece = 150 } = {}) {
  const inHouse = plan.items.map((it, idx) => ({ ...it, idx })).filter(it => it.source.startsWith("in-house"));
  const priced = inHouse.filter(it => unitCosts[it.idx] > 0);
  const needQuote = inHouse.filter(it => !(unitCosts[it.idx] > 0));
  // Rank by how many outfits each piece is in.
  const usage = new Map(priced.map(it => [it.idx, outfitsWithout(plan, it.idx)]));
  const base = plan.outfitCount;
  priced.sort((a, b) => (base - usage.get(b.idx)) - (base - usage.get(a.idx)) || a.idx - b.idx);
  const lines = [];
  let left = budget;
  for (const it of priced) {
    const cost = unitCosts[it.idx];
    if (cost * moq > left) continue;
    lines.push({ idx: it.idx, label: `${it.colourName} ${it.label.toLowerCase()}`, quantity: moq, unitCost: cost });
    left -= cost * moq;
  }
  // Spread what is left, in steps of 10, up to the cap.
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of lines) {
      if (l.quantity + 10 <= maxPerPiece && l.unitCost * 10 <= left) { l.quantity += 10; left -= l.unitCost * 10; grew = true; }
    }
  }
  const dropped = priced.filter(it => !lines.some(l => l.idx === it.idx)).map(it => `${it.colourName} ${it.label.toLowerCase()}`);
  return {
    lines,
    spent: Math.round((budget - left) * 100) / 100,
    left: Math.round(left * 100) / 100,
    dropped,
    needQuote: needQuote.map(it => `${it.colourName} ${it.label.toLowerCase()}`),
  };
}

function outfitsWithout(plan, idx) {
  return outfits(plan.items.filter((_, i) => i !== idx), plan.profile).count;
}
