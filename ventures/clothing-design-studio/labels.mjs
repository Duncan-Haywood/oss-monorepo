/**
 * Fibre-content and care labels: what must be sewn in before a garment is sold
 * in the EU or the US, and the label text for it.
 *
 * A new brand's first compliance surprise is the label: wrong fibre names
 * ("Lycra", "nylon" in Europe), percentages that do not add to 100, minor
 * fibres listed the wrong way, no country of origin for the US, no maker
 * address for the EU. This takes the composition as typed
 * ("95% cotton, 5% elastane"), normalises the names for the market, orders
 * and groups fibres the way each market's rule asks, translates the fibre
 * names for the chosen EU language, and lists the other items the market
 * wants on or with the garment, marking each as given or missing.
 *
 * Rules used (summaries, not legal text; the designer or the factory's
 * compliance team confirms against the sources named in `SOURCES`):
 *  - EU Regulation 1007/2011: approved fibre names, descending weight order,
 *    percentages of total fibre weight, a fibre under 3% may be grouped as
 *    "other fibres", 3 percentage points of manufacturing tolerance, label in
 *    the language of the country of sale.
 *  - US Textile Fiber Products Identification Act, 16 CFR 303: generic names
 *    (spandex, nylon, rayon), descending order, a fibre under 5% is "other
 *    fibre" unless it has functional significance (spandex is the usual
 *    case), country of origin, and the maker's name or RN number.
 *  - US Care Labeling Rule, 16 CFR 423: a permanent care label.
 *  - EU General Product Safety Regulation 2023/988: maker name, postal
 *    address and a product identifier on the product; an EU-based
 *    responsible person when the maker is outside the EU.
 * Not covered: wool, fur or leather special rules, flammability, children's
 * garments, state or country-specific rules (e.g. UK, Canada).
 */

export const SOURCES = Object.freeze({
  eu: "Regulation (EU) No 1007/2011 on textile fibre names and labelling; Regulation (EU) 2023/988 (general product safety)",
  us: "16 CFR Part 303 (Textile Fiber Products Identification Act rules); 16 CFR Part 423 (Care Labeling Rule)",
});

/** Fibre catalogue: canonical key, EU approved name, US generic name, and EU names by language. */
const F = (eu, us, tr) => ({ eu, us, tr });
export const FIBRES = Object.freeze({
  cotton: F("cotton", "cotton", { de: "Baumwolle", fr: "coton", es: "algodón", it: "cotone", nl: "katoen", pt: "algodão", pl: "bawełna" }),
  polyester: F("polyester", "polyester", { de: "Polyester", fr: "polyester", es: "poliéster", it: "poliestere", nl: "polyester", pt: "poliéster", pl: "poliester" }),
  elastane: F("elastane", "spandex", { de: "Elasthan", fr: "élasthanne", es: "elastano", it: "elastan", nl: "elastaan", pt: "elastano", pl: "elastan" }),
  wool: F("wool", "wool", { de: "Wolle", fr: "laine", es: "lana", it: "lana", nl: "wol", pt: "lã", pl: "wełna" }),
  viscose: F("viscose", "rayon", { de: "Viskose", fr: "viscose", es: "viscosa", it: "viscosa", nl: "viscose", pt: "viscose", pl: "wiskoza" }),
  polyamide: F("polyamide or nylon", "nylon", { de: "Polyamid", fr: "polyamide", es: "poliamida", it: "poliammide", nl: "polyamide", pt: "poliamida", pl: "poliamid" }),
  acrylic: F("acrylic", "acrylic", { de: "Polyacryl", fr: "acrylique", es: "acrílico", it: "acrilico", nl: "acryl", pt: "acrílico", pl: "akryl" }),
  linen: F("linen", "linen", { de: "Leinen", fr: "lin", es: "lino", it: "lino", nl: "linnen", pt: "linho", pl: "len" }),
  silk: F("silk", "silk", { de: "Seide", fr: "soie", es: "seda", it: "seta", nl: "zijde", pt: "seda", pl: "jedwab" }),
  modal: F("modal", "modal", { de: "Modal", fr: "modal", es: "modal", it: "modal", nl: "modal", pt: "modal", pl: "modal" }),
  lyocell: F("lyocell", "lyocell", { de: "Lyocell", fr: "lyocell", es: "lyocell", it: "lyocell", nl: "lyocell", pt: "lyocell", pl: "lyocell" }),
  hemp: F("hemp", "hemp", { de: "Hanf", fr: "chanvre", es: "cáñamo", it: "canapa", nl: "hennep", pt: "cânhamo", pl: "konopie" }),
  cashmere: F("cashmere", "cashmere", { de: "Kaschmir", fr: "cachemire", es: "cachemira", it: "cashmere", nl: "kasjmier", pt: "caxemira", pl: "kaszmir" }),
});

const ALIASES = {
  cotton: "cotton", "organic cotton": "cotton", polyester: "polyester", poly: "polyester", pet: "polyester", "recycled polyester": "polyester",
  elastane: "elastane", spandex: "elastane", lycra: "elastane", elastan: "elastane",
  wool: "wool", merino: "wool", "merino wool": "wool", viscose: "viscose", rayon: "viscose",
  nylon: "polyamide", polyamide: "polyamide", acrylic: "acrylic", linen: "linen", flax: "linen", silk: "silk",
  modal: "modal", tencel: "lyocell", lyocell: "lyocell", hemp: "hemp", cashmere: "cashmere",
};
/** Brand names people type that are not allowed as the fibre name on a label. */
const BRANDS = { lycra: "Lycra", tencel: "Tencel" };
export const EU_LANGS = Object.freeze({ en: "English", de: "German", fr: "French", es: "Spanish", it: "Italian", nl: "Dutch", pt: "Portuguese", pl: "Polish" });
const OTHER = {
  eu: { en: "other fibres", de: "andere Fasern", fr: "autres fibres", es: "otras fibras", it: "altre fibre", nl: "overige vezels", pt: "outras fibras", pl: "inne włókna" },
  us: "other fiber",
};
const round1 = v => Math.round(v * 10) / 10;

/** "60% cotton, 40% polyester" -> [{key, pct}] with problems listed rather than thrown. */
export function parseComposition(text) {
  const parts = [], problems = [], brands = [];
  const seen = new Map();
  const src = String(text ?? "").replace(/\band\b/gi, ",").replace(/[;\n]/g, ",");
  for (const raw of src.split(",").map(s => s.trim()).filter(Boolean)) {
    const m = raw.match(/^(\d+(?:[.,]\d+)?)\s*%?\s*(.+)$/) || raw.match(/^(.+?)\s*(\d+(?:[.,]\d+)?)\s*%$/);
    if (!m) { problems.push(`Could not read "${raw}". Write it like 95% cotton.`); continue; }
    let pct, name;
    if (/^\d/.test(m[1])) { pct = parseFloat(m[1].replace(",", ".")); name = m[2]; } else { name = m[1]; pct = parseFloat(m[2].replace(",", ".")); }
    name = name.toLowerCase().replace(/\s+/g, " ").trim();
    const key = ALIASES[name];
    if (!key) { problems.push(`"${name}" is not a fibre name this checker knows. Use an approved generic name (cotton, polyester, elastane, ...), not a brand or a blend name.`); continue; }
    if (BRANDS[name]) brands.push(BRANDS[name]);
    if (!(pct > 0) || pct > 100) { problems.push(`${pct}% is not a valid share for ${name}.`); continue; }
    seen.set(key, (seen.get(key) ?? 0) + pct);
  }
  for (const [key, pct] of seen) parts.push({ key, pct: round1(pct) });
  for (const b of brands) problems.push(`${b} is a brand name; the label must carry the generic fibre name (${b === "Lycra" ? "elastane in the EU, spandex in the US" : "lyocell"}).`);
  const total = round1(parts.reduce((s, p) => s + p.pct, 0));
  if (parts.length && Math.abs(total - 100) > 0.05) problems.push(`The shares add to ${total}%, not 100%.`);
  return { parts: parts.sort((a, b) => b.pct - a.pct), total, problems };
}

/** Label wording for one market: fibre order, grouping of minor fibres, names. */
export function compositionLabel(parts, market = "eu", lang = "en") {
  if (!parts.length) return "";
  const name = key => (market === "us" ? FIBRES[key].us : lang === "en" ? FIBRES[key].eu : FIBRES[key].tr[lang]);
  if (parts.length === 1) return `100% ${name(parts[0].key)}`;
  const limit = market === "us" ? 5 : 3;
  const functional = key => market === "us" && key === "elastane"; // spandex keeps its own line in the US
  const main = parts.filter(p => p.pct >= limit || functional(p.key));
  const minor = parts.filter(p => !(p.pct >= limit || functional(p.key)));
  // Grouping is optional in the EU; done here because it is the short, common form. Keep a single minor fibre named.
  const group = minor.length > 1 || (minor.length === 1 && market === "us");
  const items = [...main];
  const out = items.map(p => `${p.pct}% ${name(p.key)}`);
  if (group) out.push(`${round1(minor.reduce((s, p) => s + p.pct, 0))}% ${market === "us" ? OTHER.us : OTHER.eu[lang] ?? OTHER.eu.en}`);
  else minor.forEach(p => out.push(`${p.pct}% ${name(p.key)}`));
  return out.join(", ");
}

const yes = v => typeof v === "string" ? v.trim().length > 0 : !!v;

/** The items each market wants, with what the designer has already given. */
export function requirements(market, info = {}) {
  const i = { name: info.makerName, address: info.makerAddress, origin: info.origin, rn: info.rn, product: info.productId, euRep: info.euRepresentative, outsideEu: !!info.makerOutsideEu, care: info.care };
  if (market === "us") {
    return [
      { item: "Fibre content", given: true, why: "16 CFR 303: generic names, descending order of weight." },
      { item: "Country of origin", given: yes(i.origin), why: "16 CFR 303: \"Made in USA\" or \"Made in <country>\" on the label." },
      { item: "Maker's name or RN number", given: yes(i.name) || yes(i.rn), why: "16 CFR 303: the company's name, or a registered identification number (RN) from the FTC." },
      { item: "Care instructions", given: yes(i.care), why: "16 CFR 423: a permanent care label, legible for the life of the garment." },
    ];
  }
  const rows = [
    { item: "Fibre content in the language of sale", given: true, why: "Regulation 1007/2011, on the garment, permanent and legible." },
    { item: "Maker's name and postal address", given: yes(i.name) && yes(i.address), why: "Regulation 2023/988 (GPSR): on the product, or on the packaging if the product is too small." },
    { item: "Product identifier (type, batch or serial)", given: yes(i.product), why: "Regulation 2023/988: lets a buyer and an authority trace the item." },
  ];
  if (i.outsideEu) rows.push({ item: "EU responsible person (name and address)", given: yes(i.euRep), why: "Regulation 2023/988: a maker outside the EU needs an EU-based responsible person on the product or packaging." });
  rows.push({ item: "Care instructions", given: yes(i.care), why: "Not required by EU law, but expected by buyers and by many retailers." });
  return rows;
}

/** Whole check for one composition, market and set of items. */
export function checkLabel(composition, { market = "eu", lang = "en", ...info } = {}) {
  const p = parseComposition(composition);
  const notes = [];
  if (!p.parts.length && !p.problems.length) p.problems.push("Type the fibre content, for example 95% cotton, 5% elastane.");
  if (market === "eu" && !EU_LANGS[lang]) p.problems.push(`No fibre names for "${lang}" here; type them from Annex I of Regulation 1007/2011.`);
  const label = p.problems.some(x => /add to|valid share/.test(x)) || !p.parts.length ? "" : compositionLabel(p.parts, market, lang);
  if (label && market === "eu" && lang !== "en") notes.push("Fibre names in this language come from the Annex I tables; have the factory or a native reader confirm them before printing.");
  if (label) notes.push(market === "eu" ? "Stated shares may differ from the lab result by up to 3 percentage points (Regulation 1007/2011 tolerance); more than that is a wrong label." : "Stated shares may differ from the lab result by up to 3 percentage points (16 CFR 303); more than that is a wrong label.");
  if (label && p.parts.some(x => x.key === "polyester") && /recycled/i.test(String(composition))) notes.push("\"Recycled\" is a claim, not a fibre name. Keep it off the fibre line unless you can document it, and check the green-claims rules of the market.");
  const req = requirements(market, info);
  return { market, lang, ok: p.problems.length === 0, label, parts: p.parts, problems: p.problems, requirements: req, missing: req.filter(r => !r.given).map(r => r.item), notes, sources: SOURCES[market] };
}

/** Most delicate fibre sets the starting care advice. A starting point; swatch-test the fabric. */
const DELICACY = { silk: 5, cashmere: 5, wool: 5, viscose: 4, modal: 3, lyocell: 3, linen: 2, acrylic: 2, polyamide: 2, polyester: 1, elastane: 1, hemp: 1, cotton: 0 };
export function suggestCare(parts) {
  if (!parts?.length) return null;
  const worst = parts.reduce((b, p) => (DELICACY[p.key] ?? 0) > (DELICACY[b.key] ?? 0) ? p : b);
  const d = DELICACY[worst.key] ?? 0;
  const care = d >= 5 ? { wash: "Hand wash cold or dry-clean", dry: "Do not tumble dry; dry flat", iron: "Iron low, or steam", bleach: "Do not bleach" }
    : d >= 3 ? { wash: "Machine wash cold, gentle cycle", dry: "Do not tumble dry; line dry", iron: "Iron low", bleach: "Do not bleach" }
    : d >= 1 ? { wash: "Machine wash cold", dry: "Tumble dry low", iron: "Iron low", bleach: "Do not bleach" }
    : { wash: "Machine wash warm", dry: "Tumble dry low", iron: "Iron medium", bleach: "Only non-chlorine bleach when needed" };
  const symbols = { "Machine wash warm": "wash tub 40", "Machine wash cold": "wash tub 30", "Machine wash cold, gentle cycle": "wash tub 30 with one bar", "Hand wash cold or dry-clean": "hand wash tub, circle P" }[care.wash];
  return { ...care, text: `${care.wash}. ${care.bleach}. ${care.dry}. ${care.iron}.`, symbols, drivenBy: worst.key, note: "Starting point from the most delicate fibre. Test the finished fabric, print and trims, and use what the factory's wash test confirms." };
}
