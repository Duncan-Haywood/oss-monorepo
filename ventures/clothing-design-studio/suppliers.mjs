import { COLOURS } from "./catalogue.mjs";

/**
 * Supplier sheets: what one manufacturer offers and charges.
 *
 * The studio ships no real prices. A designer copies a manufacturer's quote
 * into a sheet (by hand, or as CSV), and every cost on screen comes from it.
 * The sheet below is an EXAMPLE so the page has numbers to show on first
 * open: round placeholder figures, not a quote from anyone, and the page says
 * so wherever they appear.
 */

export const EXAMPLE_SUPPLIER = Object.freeze({
  id: "example",
  name: "Example sheet (placeholder numbers, replace with a real quote)",
  example: true,
  currency: "EUR",
  moq: 50,
  leadTimeDays: 30,
  cutAndSew: { tee: 4, longsleeve: 5, crewneck: 7, hoodie: 9 },
  metresPerGarment: { tee: 1.2, longsleeve: 1.5, crewneck: 1.7, hoodie: 2.1 },
  wastagePct: 8,
  fabrics: {
    "cotton-jersey": 5,
    "heavyweight-cotton": 8,
    "organic-cotton": 7,
    "cotton-poly-jersey": 4.5,
    "french-terry": 9,
    fleece: 10,
    pique: 7,
    "performance-poly": 5.5,
    linen: 12,
  },
  methods: {
    screen: { setup: 25, perUnit: 1.2 },
    "high-density": { setup: 35, perUnit: 2.2 },
    puff: { setup: 30, perUnit: 1.8 },
    dtg: { setup: 0, perUnit: 6 },
    dtf: { setup: 0, perUnit: 3.5 },
    embroidery: { setup: 40, perUnit: 4 },
    "3d-puff-embroidery": { setup: 50, perUnit: 6 },
    sublimation: { setup: 0, perUnit: 5 },
  },
  trimsPerUnit: 0.8,
  packagingPerUnit: 0.6,
  freightPerUnit: 1.5,
  dutyPct: 0,
  // Stock colours: the shades the factory keeps dyed fabric in. Any other
  // colour is dyed to order: a lab dip and a minimum dye lot at the mill.
  // Placeholder list and figures, like the rest of this sheet.
  colours: Object.freeze([
    ...["white", "off white", "black", "charcoal", "heather grey", "navy", "royal blue", "sky blue", "burgundy", "red",
      "forest green", "olive", "sage", "sand", "brown", "mustard"].map(name => ({ name, hex: COLOURS[name], fabrics: ["cotton-jersey", "heavyweight-cotton", "organic-cotton", "cotton-poly-jersey", "french-terry", "fleece", "pique", "performance-poly"] })),
    ...["ecru", "bone", "sand", "khaki", "olive", "navy"].map(name => ({ name, hex: COLOURS[name], fabrics: ["linen"] })),
  ].map(c => Object.freeze({ ...c, fabrics: c.fabrics && Object.freeze(c.fabrics) }))),
  customColour: { setup: 120, minMetres: 300 },
});

export const CSV_HEADER = "kind,key,value";

/**
 * The stock colours a sheet lists for one fabric, as { name: hex }, or null
 * when the sheet lists no colours at all (then every catalogue colour is
 * treated as available and nothing is charged for dyeing). An entry with
 * `fabrics: null` is stocked in every fabric; an entry naming fabrics only
 * in those.
 * A name the catalogue knows takes the catalogue's hex unless `hex` is given.
 */
export function stockColours(sheet, fabric) {
  const list = Array.isArray(sheet?.colours) ? sheet.colours : [];
  if (!list.length) return null;
  const out = {};
  for (const c of list) {
    if (c.fabrics && !c.fabrics.includes(fabric)) continue;
    const hex = (c.hex ?? COLOURS[c.name] ?? "").toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(hex)) out[c.name] = hex;
  }
  return out;
}

/**
 * Read a typed stock list: "navy, sage, bottle green #1d4a33". Each item is
 * a colour name the studio knows, or any name followed by #RRGGBB.
 * Returns { colours: [{ name, hex }], errors: [text] }.
 */
export function parseStockColours(text) {
  const colours = [];
  const errors = [];
  for (const raw of String(text ?? "").split(/[,;\n]/)) {
    const item = raw.trim().toLowerCase();
    if (!item) continue;
    const m = /^(.*?)\s*(#[0-9a-f]{6})$/.exec(item);
    const name = (m ? m[1] : item).trim().slice(0, 40);
    const hex = m ? m[2] : COLOURS[name];
    if (!name || !hex) { errors.push(`"${raw.trim()}" is not a colour the studio knows; add its colour, as in "${raw.trim()} #1d4a33".`); continue; }
    if (!colours.some(c => c.name === name)) colours.push({ name, hex });
  }
  return { colours, errors };
}

/**
 * Replace the stock colours for one fabric, leaving every other fabric's as
 * it was. Entries are merged by name, and a colour stocked in every fabric
 * the sheet prices is written once with `fabrics: null`. Mutates `sheet`.
 */
export function setStockList(sheet, fabric, colours) {
  const all = Object.keys(sheet.fabrics ?? {});
  if (!all.includes(fabric)) all.push(fabric);
  const byName = new Map();
  for (const c of sheet.colours ?? []) {
    const fs = (c.fabrics ?? all).filter(f => f !== fabric);
    const hex = (c.hex ?? COLOURS[c.name] ?? "").toLowerCase();
    if (!fs.length || !hex) continue;
    const e = byName.get(c.name) ?? { name: c.name, hex, fabrics: new Set() };
    fs.forEach(f => e.fabrics.add(f));
    byName.set(c.name, e);
  }
  for (const c of colours) {
    const e = byName.get(c.name) ?? { name: c.name, hex: c.hex.toLowerCase(), fabrics: new Set() };
    e.hex = c.hex.toLowerCase();
    e.fabrics.add(fabric);
    byName.set(c.name, e);
  }
  sheet.colours = [...byName.values()].map(e => ({ name: e.name, hex: e.hex, fabrics: all.every(f => e.fabrics.has(f)) ? null : [...e.fabrics] }));
  return sheet;
}

/**
 * Whether a garment colour is on the sheet's stock list for that fabric.
 * Returns { stocked, name?, listed } where `listed` is false when the sheet
 * has no colour list (nothing to check against).
 */
export function colourStock(sheet, fabric, hex) {
  const pal = stockColours(sheet, fabric);
  if (!pal) return { stocked: true, listed: false };
  const h = String(hex ?? "").toLowerCase();
  const name = Object.keys(pal).find(k => pal[k] === h);
  return name ? { stocked: true, name, listed: true } : { stocked: false, listed: true, count: Object.keys(pal).length };
}

/**
 * A sheet as CSV, one fact per row, so it round-trips through a spreadsheet:
 *   kind,key,value
 *   supplier,name,Atelier Rossi
 *   fabric,heavyweight-cotton,8.40     (price per metre)
 *   method,dtg,0|6                     (setup|per unit)
 *   cutsew,tee,4
 *   colour,navy,#1f2a44|*               (stock colour: hex|fabrics, ";"-separated, * = all)
 *   dye,setup,120                       (custom colour: lab dip and dye set-up)
 *   dye,minMetres,300                   (custom colour: smallest dye lot, metres)
 */
export function supplierToCsv(s) {
  const rows = [CSV_HEADER];
  const q = v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  for (const k of ["name", "currency", "moq", "leadTimeDays", "wastagePct", "trimsPerUnit", "packagingPerUnit", "freightPerUnit", "dutyPct"]) {
    rows.push(["supplier", k, q(s[k])].join(","));
  }
  for (const [k, v] of Object.entries(s.fabrics)) rows.push(`fabric,${k},${v}`);
  for (const [k, v] of Object.entries(s.methods)) rows.push(`method,${k},${v.setup}|${v.perUnit}`);
  for (const [k, v] of Object.entries(s.cutAndSew)) rows.push(`cutsew,${k},${v}`);
  for (const [k, v] of Object.entries(s.metresPerGarment)) rows.push(`metres,${k},${v}`);
  for (const c of s.colours ?? []) rows.push(`colour,${q(c.name)},${(c.hex ?? COLOURS[c.name] ?? "").toLowerCase()}|${c.fabrics ? c.fabrics.join(";") : "*"}`);
  if (s.customColour) for (const k of ["setup", "minMetres"]) if (s.customColour[k] != null) rows.push(`dye,${k},${s.customColour[k]}`);
  return rows.join("\n") + "\n";
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

const num = (v, where) => {
  const cleaned = String(v).replace(/[^0-9.\-]/g, "");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || cleaned === "") throw new Error(`${where}: "${v}" is not a non-negative number`);
  return n;
};

/** Parse a sheet from CSV. Throws with the row number on a bad row. */
export function supplierFromCsv(text) {
  const s = { id: "imported", name: "Imported sheet", example: false, currency: "EUR", moq: 1, leadTimeDays: null,
    cutAndSew: {}, metresPerGarment: {}, wastagePct: 0, fabrics: {}, methods: {}, trimsPerUnit: 0, packagingPerUnit: 0, freightPerUnit: 0, dutyPct: 0 };
  const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || i === 0 && line.toLowerCase().startsWith("kind,")) return;
    const [kind, key, value = ""] = splitCsvLine(line);
    const where = `row ${i + 1}`;
    switch ((kind || "").toLowerCase()) {
      case "supplier":
        if (key === "name") s.name = value.slice(0, 120) || s.name;
        else if (key === "currency") s.currency = /^[A-Z]{3}$/.test(value.toUpperCase()) ? value.toUpperCase() : s.currency;
        else if (["moq", "leadTimeDays", "wastagePct", "trimsPerUnit", "packagingPerUnit", "freightPerUnit", "dutyPct"].includes(key)) s[key] = num(value, where);
        break;
      case "fabric": s.fabrics[key] = num(value, where); break;
      case "cutsew": s.cutAndSew[key] = num(value, where); break;
      case "metres": s.metresPerGarment[key] = num(value, where); break;
      case "method": {
        const [setup, perUnit] = value.split("|");
        s.methods[key] = { setup: num(setup, where), perUnit: num(perUnit ?? "", where) };
        break;
      }
      case "colour": case "color": {
        const [hexRaw = "", fabricsRaw = "*"] = value.split("|");
        const name = key.toLowerCase().slice(0, 40);
        const hex = hexRaw.trim().toLowerCase() || COLOURS[name];
        if (!name || !/^#[0-9a-f]{6}$/.test(hex ?? "")) throw new Error(`${where}: colour "${key}" needs a hex like #1f2a44 (or a colour name the studio knows)`);
        const fabrics = fabricsRaw.trim() === "*" || !fabricsRaw.trim() ? null : fabricsRaw.split(";").map(f => f.trim()).filter(Boolean);
        (s.colours ??= []).push({ name, hex, fabrics });
        break;
      }
      case "dye":
        if (!["setup", "minMetres"].includes(key)) throw new Error(`${where}: dye key "${key}" is not setup or minMetres`);
        (s.customColour ??= { setup: 0, minMetres: 0 })[key] = num(value, where);
        break;
      default: throw new Error(`${where}: kind "${kind}" is not one of supplier, fabric, method, cutsew, metres, colour, dye`);
    }
  });
  return s;
}

/** What a sheet cannot price for a design: missing rows the designer must fill in. */
export function missingPrices(sheet, design) {
  const missing = [];
  if (sheet.fabrics[design.fabric] == null) missing.push(`fabric price per metre for ${design.fabric}`);
  if (sheet.cutAndSew[design.garment] == null) missing.push(`cut and sew price for ${design.garment}`);
  if (sheet.metresPerGarment[design.garment] == null) missing.push(`metres of fabric per ${design.garment}`);
  for (const p of design.placements) if (!sheet.methods[p.method]) missing.push(`price for ${p.method}`);
  return [...new Set(missing)];
}
