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
});

export const CSV_HEADER = "kind,key,value";

/**
 * A sheet as CSV, one fact per row, so it round-trips through a spreadsheet:
 *   kind,key,value
 *   supplier,name,Atelier Rossi
 *   fabric,heavyweight-cotton,8.40     (price per metre)
 *   method,dtg,0|6                     (setup|per unit)
 *   cutsew,tee,4
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
  const lines = String(text).replace(/^﻿/, "").split(/\r?\n/);
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
      default: throw new Error(`${where}: kind "${kind}" is not one of supplier, fabric, method, cutsew, metres`);
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
