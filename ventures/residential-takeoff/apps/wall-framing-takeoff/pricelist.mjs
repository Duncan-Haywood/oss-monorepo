// @ts-check
// A supplier's price list, read into the plan: the lumberyard's own prices replace the
// placeholder board prices (1 per foot) the cutting-stock order is optimised on, and fill the
// plan's "prices" block the budget reads (sheets, bundles, rolls...).
//
// Input is the CSV a yard sends or a contractor keeps: one row per product, a header row
// naming at least a description and a price. Optional columns: size, length, unit, key.
//
//   description,price,unit
//   2x4-8' SPF #2,4.12,EA
//   2X6X16 SPF,14.80,EA
//   2x4 92-5/8 precut stud,3.98,EA
//   2x4x10 PT ground contact,9.45,EA
//   2x10x12 SYP,610,MBF
//   7/16 OSB 4x8 wall sheathing,17.25,EA
//
// What is read, and how:
//   Lumber    "AxB" then a length, in the description or in size/length columns. A length of
//             24 or under with no inch mark is feet ("2x4x8", "2x4-8'"); a length with a
//             fraction or over 24 is inches ("92-5/8", "104 5/8"). A precut stud length
//             (92-5/8, 104-5/8, 116-5/8) or the word "precut" makes it the precut stud entry.
//             PT, treated, ACQ, CA, MCA, ground contact and GC make it the "AxB PT" size.
//             Units: EA/PC/PCS/each (the default), LF (per foot) and MBF (per 1,000 board feet,
//             nominal size).
//   Prices    a `key` column naming one of the budget's price names wins ("roofSheet"). Without
//             one, a short list of unambiguous words is read: shingle bundles, ridge cap,
//             starter, underlayment, drip edge, ice and water shield, valley flashing, joist
//             hangers. Sheet goods name their use ("roof", "wall", "subfloor", "drywall"), or
//             they are listed as not read: a 7/16 OSB sheet goes on walls and roofs alike, and
//             guessing would price the wrong line.
//
// Nothing is guessed. Every row is either used (and said where) or listed with the reason it
// was not; every board size the order uses that the list does not price is named, because a
// placeholder price left next to real ones would steer the optimiser to it.

import { formatLength, PRECUT } from "./engine.mjs";

/** The budget's price names this reader can fill (budget.mjs `P(...)`), with what a row must say to be read as one without a key column. */
export const PRICE_WORDS = /** @type {const} */ ([
  ["shingleBundle", /\bshingles?\b/i, /\b(ridge|hip|starter)\b/i],
  ["ridgeBundle", /\b(ridge|hip)\s*(and\s*ridge\s*)?cap\b/i, null],
  ["starterBundle", /\bstarter\b/i, null],
  ["iceShieldRoll", /\bice\s*(&|and)?\s*water\b/i, null],
  ["underlaymentRoll", /\b(underlayment|felt)\b/i, /\bice\s*(&|and)?\s*water\b/i],
  ["dripEdgePiece", /\bdrip\s*edge\b/i, null],
  ["valleyFlashingRoll", /\bvalley\b/i, null],
  ["doubleJoistHanger", /\b(double|dbl)\b.*\bhanger\b/i, null],
  ["joistHanger", /\bjoist\s*hanger\b/i, /\b(double|dbl)\b/i],
]);

/** Sheet goods by the use the row names. */
const SHEET = /\b(osb|plywood|ply|cdx|sheathing|zip|advantech|t\s*&\s*g|tongue|drywall|gypsum|sheetrock|wallboard)\b/i;
const SHEET_USE = /** @type {const} */ ([
  ["drywallSheet", /\b(drywall|gypsum|sheetrock|wallboard)\b/i],
  ["floorSheet", /\b(subfloor|sub-floor|floor|t\s*&\s*g|tongue)\b/i],
  ["roofSheet", /\broof/i],
  ["wallSheet", /\bwall/i],
]);

/** Every key a `key` column may name (budget.mjs reads more; these are the ones a supplier sells by the piece). */
export const KNOWN_KEYS = new Set([...PRICE_WORDS.map((p) => p[0]), ...SHEET_USE.map((p) => p[0]), "truss", "sheathingNailBox", "roofingNailBox", "pipeBoot", "floorAdhesiveTube", "floorFastenerBox", "floorNailBox", "hangerNail", "drywallScrewThousand", "drywallTapeRoll", "drywallCompoundPail", "cornerBeadStick", "underlaymentNailBox", "dripEdgeNailBox", "receptacle", "electricalSwitch", "electricalBox", "cableRoll"]);

const TREATED = /\b(pt|p\.t\.|treated|acq|ca-?c|mca|ground\s*contact|gc|cca)\b/i;
const PRECUTS = Object.values(PRECUT);

/**
 * RFC 4180 CSV (quotes, doubled quotes, CRLF), plus a leading BOM and `;` or tab as the separator
 * when the header row has more of those than commas (European spreadsheets).
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const s = String(text ?? "").replace(/^﻿/, "");
  const firstLine = s.split(/\r?\n/, 1)[0] || "";
  const count = (/** @type {string} */ ch) => firstLine.split(ch).length - 1;
  const sep = count(";") > count(",") && count(";") >= count("\t") ? ";" : count("\t") > count(",") ? "\t" : ",";
  /** @type {string[][]} */
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const HEAD = {
  description: /^(description|desc|item|product|name|material|item description)$/i,
  price: /^(price|unit price|unit cost|cost|each|price each|net price|sell|sell price|\$)$/i,
  size: /^(size|dimension|nominal|nominal size)$/i,
  length: /^(length|len|lgth)$/i,
  unit: /^(unit|uom|u\/m|per|price unit|unit of measure)$/i,
  key: /^(key|price key|budget key)$/i,
};

/**
 * A length as a yard writes it. Feet when it is a bare number of 24 or less, or carries ' / ft;
 * inches when it has a fraction, a " / in, or is over 24.
 * @param {string} t
 * @returns {number} inches, NaN when unreadable
 */
export function yardLength(t) {
  const s = String(t ?? "").trim().toLowerCase().replace(/[″”“]/g, '"').replace(/[′’‘]/g, "'");
  if (!s) return NaN;
  let m = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in)?)?$/);
  if (m) return Number(m[1]) * 12 + (m[2] ? Number(m[2]) : 0);
  m = s.match(/^(\d+)(?:[\s-]+(\d+)\/(\d+))\s*(?:"|in|inch|inches)?$/);
  if (m && Number(m[3]) > 0) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = s.match(/^(\d+(?:\.\d+)?)\s*("|in|inch|inches)?$/);
  if (m) { const v = Number(m[1]); return m[2] ? v : v <= 24 ? v * 12 : v; }
  return NaN;
}

/** A price as typed: "$4.12", "4,12" (decimal comma, no other separator), "1,234.50". @param {string} t */
export function yardPrice(t) {
  let s = String(t ?? "").trim().replace(/^\$|\s*(usd|\$)$/i, "").replace(/\s/g, "");
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else s = s.replace(/,(?=\d{3}(\D|$))/g, "");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/**
 * Lumber size and length from a description such as `2x4-8' SPF`, `2X6X16`, `2 x 4 x 92-5/8 PET`.
 * @param {string} desc
 * @param {string} [sizeCol]
 * @param {string} [lengthCol]
 * @returns {{ size: string, length: number } | null}
 */
export function readLumber(desc, sizeCol = "", lengthCol = "") {
  const text = `${sizeCol} ${desc}`.replace(/[″”“]/g, '"').replace(/[′’‘]/g, "'");
  const sm = text.match(/(?:^|[^\d/.])([1-6])\s*[x×]\s*(\d{1,2})(?!\d|\s*\/)/i);
  if (!sm) return null;
  const size = `${sm[1]}x${sm[2]}`;
  let length = lengthCol.trim() ? yardLength(lengthCol) : NaN;
  if (!Number.isFinite(length)) {
    const rest = text.slice((sm.index ?? 0) + sm[0].length);
    const lm = rest.match(/^\s*[x×\-]?\s*(\d+(?:[\s-]+\d+\/\d+)?(?:\.\d+)?)\s*('|ft\b|feet\b|"|in\b)?/i) || rest.match(/(?:^|\s)(\d+(?:[\s-]+\d+\/\d+)?(?:\.\d+)?)\s*('|ft\b|feet\b|"|in\b)/i);
    if (lm) length = yardLength(`${lm[1]}${lm[2] ?? ""}`);
  }
  if (!(length > 0 && length <= 1200)) return null;
  return { size, length };
}

/**
 * Read a price list into rows the plan can use.
 * @param {string} text CSV
 * @returns {{ ok: boolean, errors: string[], boards: { line: number, text: string, size: string, length: number, price: number, precut: boolean }[], prices: { line: number, text: string, key: string, price: number }[], skipped: { line: number, text: string, why: string }[] }}
 */
export function readPriceList(text) {
  const out = { ok: false, errors: /** @type {string[]} */ ([]), boards: /** @type {any[]} */ ([]), prices: /** @type {any[]} */ ([]), skipped: /** @type {any[]} */ ([]) };
  if (typeof text !== "string" || !text.trim()) { out.errors.push("The price list is empty."); return out; }
  if (text.length > 2_000_000) { out.errors.push("The price list is over 2 MB; split it, or keep only the products this job uses."); return out; }
  const rows = parseCsv(text);
  const hi = rows.findIndex((r) => r.some((c) => HEAD.description.test(c.trim())) && r.some((c) => HEAD.price.test(c.trim())));
  if (hi < 0 || hi > 10) { out.errors.push('No header row with a description column and a price column in the first 11 rows (for example "description,price,unit").'); return out; }
  const head = rows[hi].map((c) => c.trim());
  /** @param {RegExp} re */
  const col = (re) => head.findIndex((c) => re.test(c));
  const ci = { description: col(HEAD.description), price: col(HEAD.price), size: col(HEAD.size), length: col(HEAD.length), unit: col(HEAD.unit), key: col(HEAD.key) };
  if (rows.length - hi - 1 > 5000) { out.errors.push("The price list has over 5,000 rows; keep only the products this job uses."); return out; }
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 1;
    const get = (/** @type {number} */ k) => (k >= 0 ? String(r[k] ?? "").trim() : "");
    const desc = get(ci.description).slice(0, 200);
    const shown = desc || r.join(" ").trim().slice(0, 200);
    const priceText = get(ci.price);
    const unitPrice = yardPrice(priceText);
    if (!desc) { out.skipped.push({ line, text: shown, why: "no description" }); continue; }
    if (!(unitPrice >= 0) || unitPrice > 1e6) { out.skipped.push({ line, text: shown, why: priceText ? `price "${priceText.slice(0, 40)}" is not a number` : "no price" }); continue; }
    const unit = get(ci.unit).toLowerCase().replace(/[.\s]/g, "");
    const key = get(ci.key);
    if (key) {
      if (!KNOWN_KEYS.has(key)) { out.skipped.push({ line, text: shown, why: `key "${key.slice(0, 40)}" is not a price name the budget reads (${[...KNOWN_KEYS].slice(0, 6).join(", ")}...)` }); continue; }
      out.prices.push({ line, text: shown, key, price: unitPrice });
      continue;
    }
    const lum = SHEET.test(desc) ? null : readLumber(desc, get(ci.size), get(ci.length));
    if (lum) {
      const treated = TREATED.test(desc) || TREATED.test(get(ci.size));
      const precut = /\b(precut|pre-cut|pet)\b/i.test(desc) || PRECUTS.some((p) => Math.abs(p - lum.length) < 0.07);
      let each;
      if (!unit || /^(ea|each|pc|pcs|piece|pieces|stk|stick)$/.test(unit)) each = unitPrice;
      else if (/^(lf|lft|perft|ft|linft)$/.test(unit)) each = unitPrice * (lum.length / 12);
      else if (/^(mbf|m|perm|mbm|\/m|\/mbf)$/.test(unit)) {
        const [t, w] = lum.size.split("x").map(Number);
        each = (unitPrice * (t * w * (lum.length / 12) / 12)) / 1000;
      } else { out.skipped.push({ line, text: shown, why: `unit "${get(ci.unit).slice(0, 20)}" is not EA, LF or MBF` }); continue; }
      out.boards.push({ line, text: shown, size: treated ? `${lum.size} PT` : lum.size, length: Math.round(lum.length * 1000) / 1000, price: Math.round(each * 100) / 100, precut });
      continue;
    }
    if (SHEET.test(desc)) {
      const use = SHEET_USE.find(([, re]) => re.test(desc));
      if (!use) { out.skipped.push({ line, text: shown, why: 'a sheet with no use named: add "wall", "roof" or "subfloor" to the description, or a key column (wallSheet, roofSheet, floorSheet)' }); continue; }
      out.prices.push({ line, text: shown, key: use[0], price: unitPrice });
      continue;
    }
    const word = PRICE_WORDS.find(([, re, not]) => re.test(desc) && !(not && not.test(desc)));
    if (word) { out.prices.push({ line, text: shown, key: word[0], price: unitPrice }); continue; }
    out.skipped.push({ line, text: shown, why: "not lumber by size and length, and no price name it is plainly for (add a key column to say which)" });
  }
  if (!out.boards.length && !out.prices.length) out.errors.push(`No row of the price list was read (${out.skipped.length} skipped).`);
  out.ok = out.errors.length === 0;
  return out;
}

/**
 * Put a read price list into a plan: a copy with its stock repriced and its prices filled.
 *
 * - A board the list prices replaces the stock entry of the same size and length (within 1/16 in),
 *   or is added: a yard that lists a 20 ft 2x10 sells one, so the optimiser may use it.
 * - A stock board of a size the list prices, but at a length it does not list, is taken off the
 *   lumber list: its placeholder price is not the yard's, and left beside real ones it would be
 *   chosen for being cheap. The precut stud of a size goes the same way unless the list prices it.
 * - A size the list does not price at all keeps its stock, named in `unpricedSizes`.
 * - A price name the list fills replaces the plan's own; the same name twice keeps the later row.
 *
 * @param {any} plan normalised plan (lengths in inches)
 * @param {ReturnType<typeof readPriceList>} list
 * @returns {{ plan: any, notes: string[], replaced: number, added: number, removed: { size: string, length: number, label?: string }[], unpricedSizes: string[], prices: Record<string, number> }}
 */
export function applyPriceList(plan, list) {
  if (!list || typeof list !== "object" || !Array.isArray(list.boards) || !Array.isArray(list.prices) || !Array.isArray(list.skipped)) throw new Error("applyPriceList needs a price list read by readPriceList");
  const stock = Array.isArray(plan?.stock) ? plan.stock.map((/** @type {any} */ s) => ({ ...s })) : [];
  const notes = [];
  let replaced = 0, added = 0;
  const pricedSizes = new Set(list.boards.map((b) => b.size));
  /** @type {Set<any>} */
  const touched = new Set();
  // later rows win when one board is listed twice
  /** @type {Map<string, any>} */
  const byBoard = new Map();
  for (const b of list.boards) byBoard.set(`${b.size}|${b.precut ? "p" : ""}|${b.length}`, b);
  for (const b of byBoard.values()) {
    const hit = stock.find((/** @type {any} */ s) => s.size === b.size && Math.abs(Number(s.length) - b.length) < 0.0625 && (b.precut ? s.label === "precut stud" : !s.label));
    if (hit) { hit.price = b.price; touched.add(hit); replaced++; }
    else { const e = b.precut ? { size: b.size, length: b.length, price: b.price, label: "precut stud" } : { size: b.size, length: b.length, price: b.price }; stock.push(e); touched.add(e); added++; }
  }
  const removed = [];
  const kept = stock.filter((/** @type {any} */ s) => {
    if (touched.has(s) || !pricedSizes.has(s.size)) return true;
    removed.push({ size: s.size, length: s.length, ...(s.label ? { label: s.label } : {}) });
    return false;
  });
  const unpricedSizes = [...new Set(kept.filter((/** @type {any} */ s) => !pricedSizes.has(s.size)).map((/** @type {any} */ s) => String(s.size)))];
  /** @type {Record<string, number>} */
  const prices = {};
  for (const p of list.prices) prices[p.key] = p.price;
  const next = { ...plan, stock: kept, prices: { ...(plan && typeof plan.prices === "object" && !Array.isArray(plan.prices) ? plan.prices : {}), ...prices } };
  if (replaced || added) notes.push(`Price list: ${replaced} board price${replaced === 1 ? "" : "s"} replaced and ${added} board${added === 1 ? "" : "s"} added to the lumber list.`);
  if (removed.length) notes.push(`Price list: taken off the lumber list because the list prices the size but not this length: ${removed.map((r) => `${r.size} ${r.label ? "precut stud " : ""}${formatLength(r.length)}`).join(", ")}.`);
  if (unpricedSizes.length) notes.push(`Price list: no price for ${unpricedSizes.join(", ")}; those boards keep the placeholder (1 per foot), so an order that uses them is not priced by the yard.`);
  const keys = Object.keys(prices);
  if (keys.length) notes.push(`Price list: ${keys.map((k) => `${k} ${prices[k]}`).join(", ")} into the plan's prices.`);
  if (list.skipped.length) notes.push(`Price list: ${list.skipped.length} row${list.skipped.length === 1 ? "" : "s"} not read: ${list.skipped.slice(0, 8).map((s) => `line ${s.line} "${s.text.slice(0, 50)}" (${s.why})`).join("; ")}${list.skipped.length > 8 ? `; and ${list.skipped.length - 8} more` : ""}.`);
  return { plan: next, notes, replaced, added, removed, unpricedSizes, prices };
}
