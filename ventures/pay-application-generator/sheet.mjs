// Reads the continuation sheet a contractor already keeps: an Excel workbook (.xlsx) or a CSV saved from one, with a
// title block above the table, headers over two or three rows, a row of column letters, division headings, subtotals
// and a totals row. Out comes the plain schedule calc.mjs takes, plus checks on the sheet's own arithmetic (a total
// that no longer equals its parts, a SUM that misses a line), which is where hand-kept Excel pay apps go wrong.
// Everything happens in the browser: the .xlsx is unzipped with the built-in DecompressionStream, no library, no upload.

// ---------- ZIP and XML ----------

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Returns Map(name -> async () => Uint8Array). Only what an .xlsx needs: stored or deflated entries, no ZIP64.
export function unzip(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b.length < 22 || u32(b, 0) !== 0x04034b50) {
    if (b.length >= 8 && u32(b, 0) === 0xe011cfd0) throw new Error("This is an old .xls workbook. Open it in Excel and save it as .xlsx or CSV, then choose that file.");
    throw new Error("This file is not an .xlsx workbook.");
  }
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("The workbook looks cut off (no ZIP directory). Save it again and retry.");
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const dec = new TextDecoder();
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (u32(b, p) !== 0x02014b50) throw new Error("The workbook's ZIP directory is damaged.");
    const method = u16(b, p + 10), csize = u32(b, p + 20), nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), commentLen = u16(b, p + 32);
    const local = u32(b, p + 42);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (csize === 0xffffffff || local === 0xffffffff) throw new Error("This workbook is too large to read here (ZIP64). Save the continuation sheet on its own as CSV.");
    files.set(name, async () => {
      if (u32(b, local) !== 0x04034b50) throw new Error(`The workbook entry ${name} is damaged.`);
      const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
      const data = b.subarray(start, start + csize);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new Error(`The workbook entry ${name} uses a compression this page cannot read.`);
    });
  }
  return files;
}

const codePoint = (n) => (n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "\ufffd");
export function xmlText(s) {
  return String(s)
    .replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (m, e) => (
      e === "lt" ? "<" : e === "gt" ? ">" : e === "amp" ? "&" : e === "quot" ? '"' : e === "apos" ? "'"
        : codePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))))
    .replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
}
const attr = (tag, name) => { const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag); return m ? xmlText(m[1]) : null; };
const tags = (xml, name) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</(?:\\w+:)?${name}>)`, "g"))].map((m) => ({ attrs: m[1], body: m[2] ?? "" }));
const texts = (xml) => tags(xml.replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, ""), "t").map((t) => xmlText(t.body)).join("");

export function colIndex(ref) {
  const m = /^([A-Z]+)/.exec(ref || "");
  if (!m) return null;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}
export const colName = (i) => { let s = ""; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };

// Number formats that show a percentage: built-in 9 and 10, or a custom code with % outside quotes.
function percentStyles(stylesXml) {
  if (!stylesXml) return [];
  const custom = new Map(tags(stylesXml, "numFmt").map((t) => [attr(t.attrs, "numFmtId"), attr(t.attrs, "formatCode") || ""]));
  const xfs = /<(?:\w+:)?cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/.exec(stylesXml);
  if (!xfs) return [];
  return tags(xfs[1], "xf").map((t) => {
    const id = attr(t.attrs, "numFmtId");
    if (id === "9" || id === "10") return true;
    const code = custom.get(id);
    return !!code && /%/.test(code.replace(/"[^"]*"/g, ""));
  });
}

const tidy = (x) => String(Math.round(x * 1e6) / 1e6);

function readSheetXml(xml, shared, pctStyle) {
  const grid = [];
  let rowSeq = 0;
  for (const row of tags(xml, "row")) {
    const r = Number(attr(row.attrs, "r")) || rowSeq + 1;
    rowSeq = r;
    const cells = [];
    let colSeq = -1;
    for (const c of tags(row.body, "c")) {
      const ref = attr(c.attrs, "r");
      const col = ref ? colIndex(ref) : colSeq + 1;
      colSeq = col;
      const t = attr(c.attrs, "t"), s = Number(attr(c.attrs, "s") ?? 0);
      const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(c.body);
      let out = "";
      if (t === "s") out = v ? (shared[Number(v[1])] ?? "") : "";
      else if (t === "inlineStr") out = texts(c.body);
      else if (t === "str" || t === "e") out = v ? xmlText(v[1]) : "";
      else if (t === "b") out = v ? (v[1] === "1" ? "TRUE" : "FALSE") : "";
      else if (!v && /<(?:\w+:)?f\b/.test(c.body)) out = "#UNCALCULATED";
      else if (v) {
        const n = Number(v[1]);
        out = !Number.isFinite(n) ? xmlText(v[1]) : pctStyle[s] ? `${tidy(n * 100)}%` : tidy(n);
      }
      cells[col] = out;
    }
    grid[r - 1] = Array.from(cells, (x) => x ?? "");
  }
  return Array.from(grid, (x) => x ?? []);
}

// Every worksheet in the workbook, in tab order: [{ name, grid }] where grid[i] is spreadsheet row i + 1.
export async function readXlsx(buf) {
  const files = unzip(buf);
  const get = async (name) => { const f = files.get(name); return f ? new TextDecoder().decode(await f()) : null; };
  const wb = await get("xl/workbook.xml");
  if (!wb) throw new Error("This file is not an Excel workbook (no xl/workbook.xml).");
  const rels = (await get("xl/_rels/workbook.xml.rels")) || "";
  const targets = new Map(tags(rels, "Relationship").map((t) => [attr(t.attrs, "Id"), attr(t.attrs, "Target")]));
  const sst = await get("xl/sharedStrings.xml");
  const shared = sst ? tags(sst, "si").map((si) => texts(si.body)) : [];
  const pct = percentStyles(await get("xl/styles.xml"));
  const sheets = [];
  for (const sh of tags(wb, "sheet")) {
    const target = targets.get(attr(sh.attrs, "r:id"));
    if (!target) continue;
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    const xml = await get(path);
    if (xml) sheets.push({ name: attr(sh.attrs, "name") || path, grid: readSheetXml(xml, shared, pct) });
  }
  if (!sheets.length) throw new Error("No worksheets found in this workbook.");
  return sheets;
}

// ---------- Finding the schedule in a sheet ----------

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const low = (s) => clean(s).toLowerCase();

// Order matters: "total completed and stored to date" mentions stored, "from previous application (d+e)" mentions
// previous, so the to-date and balance columns are claimed first.
const RULES = [
  ["pct", (h) => /^%|percent|% complete|\(g ?[÷/] ?c\)|^% \(|^pct\b/.test(h) && !/retain/.test(h)],
  ["retRate", (h) => /retain|retention/.test(h) && /%|percent|\brate\b/.test(h) && !/if variable rate/.test(h)],
  ["retainage", (h) => /retain|retention/.test(h)],
  ["toDate", (h) => /to date|total completed|completed and stored|\(d ?\+ ?e ?\+ ?f\)/.test(h) && !/previous/.test(h)],
  ["balance", (h) => /balance|to finish|remaining/.test(h)],
  ["stored", (h) => /stored/.test(h)],
  ["thisPeriod", (h) => /this (period|application|month|billing|draw)|current (period|billing|application|month)|^current$/.test(h)],
  ["previous", (h) => /previous|prior/.test(h)],
  ["scheduled", (h) => /scheduled value|schedule of values|contract (value|amount|sum)|original (value|amount|contract)|revised (value|amount)|^sov$|^value$|^amount$|^budget$/.test(h)],
  ["desc", (h) => /description|scope|work item|^item description|^task$|^name$/.test(h)],
  ["item", (h) => /^(item|line|code|cost code|no\.?|#|item no\.?|item #|line no\.?|item number|line #|sov line)\b/.test(h)],
  ["type", (h) => /^type\b|^kind$/.test(h)],
];
const classify = (h) => { for (const [k, f] of RULES) if (f(h)) return k; return null; };

const LETTER_ROW = (row) => { const v = row.map(clean).filter(Boolean); return v.length >= 3 && v.every((x) => /^[A-Z]$/i.test(x)); };
const blank = (row) => !row || row.every((x) => clean(x) === "");

// The header block starting at row r, `depth` rows deep: each column's text joined top to bottom.
function headerAt(grid, r, depth) {
  const width = Math.max(...grid.slice(r, r + depth).map((x) => (x || []).length), 0);
  const map = {};
  let hits = 0;
  for (let c = 0; c < width; c++) {
    const h = low(grid.slice(r, r + depth).map((x) => (x || [])[c] ?? "").filter((x) => !/^[A-Z]$/i.test(clean(x))).join(" "));
    if (!h) continue;
    const k = classify(h);
    if (k && map[k] == null) { map[k] = c; hits++; }
  }
  return { map, hits };
}

function findHeader(grid) {
  let best = null;
  const limit = Math.min(grid.length, 60);
  for (let r = 0; r < limit; r++) {
    if (blank(grid[r]) || LETTER_ROW(grid[r])) continue;
    for (let depth = 1; depth <= 3; depth++) {
      if (depth > 1 && LETTER_ROW(grid[r + depth - 1] || [])) break;
      const h = headerAt(grid, r, depth);
      const m = h.map;
      if (m.scheduled == null || (m.desc == null && m.item == null) || (m.previous == null && m.thisPeriod == null)) continue;
      if (!best || h.hits > best.hits) best = { row: r, depth, map: m, hits: h.hits };
    }
  }
  return best;
}

// Money from a cell: the strict reader first, then a plain number with more decimals (an Excel formula result), which
// is rounded to the cent and counted so the page can say so.
function money(s) {
  const t = clean(s);
  if (t === "" || t === "-" || t === "–" || t === "$ -" || t === "$-") return { cents: 0 };
  let neg = false, x = t;
  if (/^\(.*\)$/.test(x)) { neg = true; x = x.slice(1, -1); }
  x = x.replace(/[$\s]/g, "");
  if (x.startsWith("-")) { neg = !neg; x = x.slice(1); }
  // Commas by shape: 1,234.50 is thousands; 1.234,50 or 29,99 is a decimal comma (an EU-locale export); else not money.
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(x)) x = x.split(",").join("");
  else if (/^(\d+|\d{1,3}(\.\d{3})+),\d{1,2}$/.test(x)) x = x.split(".").join("").replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(x)) {
    const exact = Number(x) * 100, cents = Math.round(exact);
    return { cents: neg ? -cents : cents, rounded: Math.abs(exact - cents) > 1e-6 };
  }
  if (t === "#UNCALCULATED") return { error: "is a formula with no saved result (the file was written by a program that does not calculate). Open it in Excel, LibreOffice or Google Sheets, save it, and choose it again" };
  if (/^#/.test(t)) return { error: `shows the Excel error ${t}` };
  return { error: `is not a dollar amount ("${t.slice(0, 30)}")` };
}
const plain = (c) => `${c < 0 ? "-" : ""}${Math.floor(Math.abs(c) / 100)}.${String(Math.abs(c) % 100).padStart(2, "0")}`;
const usd = (c) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

const TOTAL = /^(grand )?totals?\b|^total (contract|this|amount|billed|to date|of)|^totals? \(|^sum$/i;
const SUBTOTAL = /^sub-?\s?totals?\b|\bsubtotal\b|^total (for )?(division|div\.?|section|phase)\b/i;
const CO_HEADING = /^(approved )?change orders?\b|^c\.?o\.?s?\s*$|^changes$/i;

// grid: rows of strings (from readXlsx or parseCsv). rowBase: 1 when grid[i] is spreadsheet row i + 1, which is what
// readXlsx returns; for a CSV, row numbers are lines of the file after blank ones are dropped.
export function findSchedule(grid, { sheet = null } = {}) {
  const h = findHeader(grid);
  if (!h) return { error: "Could not find the table header. The page looks for columns named like Description, Scheduled value, Previous (or From previous application) and This period in the first 60 rows." };
  const m = h.map;
  const at = (row, k) => (m[k] == null ? "" : clean((row || [])[m[k]]));
  const where = (r, k) => `${sheet ? "cell " : "row "}${sheet ? `${colName(m[k])}${r + 1}` : r + 1}`;
  const lines = [], errors = [], notes = [], checks = [];
  let total = null, inCo = false, rounded = 0, skippedSub = 0;
  let r = h.row + h.depth;
  while (r < grid.length && (blank(grid[r]) || LETTER_ROW(grid[r]))) r++;
  for (; r < grid.length; r++) {
    const row = grid[r];
    if (blank(row)) continue;
    const desc = at(row, "desc"), item = at(row, "item"), label = desc || item;
    const nums = ["scheduled", "previous", "thisPeriod", "stored"].filter((k) => at(row, k) !== "");
    const anyNum = nums.length > 0;
    const firstText = clean((row || []).find((x) => clean(x) !== "") ?? "");
    if (TOTAL.test(label) || (!label && TOTAL.test(firstText))) { total = { r, row }; break; }
    if (SUBTOTAL.test(label) || (!label && SUBTOTAL.test(firstText))) { skippedSub++; continue; }
    if (!anyNum) { if (CO_HEADING.test(label || firstText)) inCo = true; continue; }
    const vals = {};
    let bad = false;
    for (const k of ["scheduled", "previous", "thisPeriod", "stored", "toDate", "balance", "retainage"]) {
      const v = money(at(row, k));
      if (v.error) {
        if (["toDate", "balance", "retainage"].includes(k)) { vals[k] = null; continue; }
        errors.push(`${label || "A line"} (${where(r, k)}) ${v.error}.`); bad = true; break;
      }
      if (v.rounded && ["scheduled", "previous", "thisPeriod", "stored"].includes(k)) rounded++;
      vals[k] = at(row, k) === "" && ["toDate", "balance", "retainage"].includes(k) ? null : v.cents;
    }
    if (bad) continue;
    if (!label && vals.scheduled === 0 && !vals.previous && !vals.thisPeriod && !vals.stored) continue;
    const typeCell = at(row, "type");
    const isCo = /^(co|change|change order)$/i.test(typeCell) || /^(co[-\s#]*\d+|change order)/i.test(item) || /^(co[-\s#]*\d+|change order)/i.test(label) || inCo;
    const rateCell = at(row, "retRate");
    lines.push({ r, item, desc: desc || item || `Line ${r + 1}`, isCo, own: rateCell, c: vals.scheduled, d: vals.previous, e: vals.thisPeriod, f: vals.stored, g: vals.toDate, h: vals.balance, i: vals.retainage });
  }
  if (errors.length) return { error: errors[0], errors };
  if (!lines.length) return { error: "Found the header but no lines with numbers under it. Is this a blank template?" };

  // The sheet's own arithmetic, line by line.
  for (const l of lines) {
    const g = l.d + l.e + l.f;
    if (m.toDate != null && l.g != null && Math.abs(l.g - g) > 1) checks.push({ severity: "high", title: `${l.desc} (${where(l.r, "toDate")}): the sheet's total completed and stored is ${usd(l.g)}, but previous + this period + stored is ${usd(g)}. A formula may have been typed over.` });
    if (m.balance != null && l.h != null && Math.abs(l.h - (l.c - g)) > 1) checks.push({ severity: "medium", title: `${l.desc} (${where(l.r, "balance")}): the sheet's balance to finish is ${usd(l.h)}, but scheduled value less completed is ${usd(l.c - g)}.` });
  }
  // The totals row against the lines above it: the classic error is a line inserted outside the SUM range.
  let uncalculated = false;
  if (total) {
    for (const [k, name] of [["scheduled", "scheduled value"], ["previous", "previous"], ["thisPeriod", "this period"], ["stored", "stored"], ["toDate", "total completed and stored"], ["retainage", "retainage"]]) {
      if (m[k] == null || at(total.row, k) === "") continue;
      const v = money(at(total.row, k));
      if (at(total.row, k) === "#UNCALCULATED") { uncalculated = true; continue; }
      if (v.error) { checks.push({ severity: "high", title: `Totals row (${where(total.r, k)}) ${v.error}.` }); continue; }
      const key = { scheduled: "c", previous: "d", thisPeriod: "e", stored: "f", toDate: "g", retainage: "i" }[k];
      if (lines.some((l) => l[key] == null)) continue;
      const sum = lines.reduce((a, l) => a + l[key], 0);
      if (Math.abs(v.cents - sum) > lines.length) checks.push({ severity: "high", title: `Totals row (${where(total.r, k)}): the sheet's ${name} total is ${usd(v.cents)}, but the ${lines.length} lines above it add up to ${usd(sum)}, ${usd(sum - v.cents)} apart. Check the SUM range covers every line.` });
    }
    if (uncalculated) notes.push("The totals row is formulas with no saved results (the file was written by a program that does not calculate), so the sheet's totals were not checked. Open and save it in Excel, LibreOffice or Google Sheets to check them.");
  } else notes.push("No totals row found; every line down to the end of the sheet was read.");
  if (rounded) notes.push(`${rounded} amount${rounded === 1 ? " was" : "s were"} carried to more than two decimals in the sheet (a formula result) and ${rounded === 1 ? "was" : "were"} rounded to the cent.`);
  if (skippedSub) notes.push(`${skippedSub} subtotal row${skippedSub === 1 ? " was" : "s were"} skipped so nothing is counted twice.`);
  if (m.retainage != null) notes.push("The sheet's retainage column is compared with the retainage worked out here from the rates you enter, not used as a rate.");
  const cos = lines.filter((l) => l.isCo).length;
  if (cos) notes.push(`${cos} line${cos === 1 ? " was" : "s were"} read as change orders.`);

  const ownRates = lines.some((l) => l.own);
  if (ownRates) notes.push("The sheet's per-line retainage percentages were read as each line's own rate.");
  const head = ["Item", "Description", "Type", "Scheduled value", "Previous", "This period", "Stored"].concat(ownRates ? ["Retainage"] : []);
  const csv = [head, ...lines.map((l) => [l.item, l.desc, l.isCo ? "CO" : "", plain(l.c), plain(l.d), plain(l.e), plain(l.f)].concat(ownRates ? [l.own] : []))].map((x) => x.map(q).join(",")).join("\n");
  const header = `${sheet ? `sheet "${sheet}", ` : ""}row ${h.row + 1}${h.depth > 1 ? `-${h.row + h.depth}` : ""}`;
  return { csv, lines, checks, notes, header, columns: Object.keys(m) };
}

// The sheet's retainage amounts against the ones worked out by calc.mjs compute(), line for line.
export function retainageChecks(imported, result) {
  if (!imported || !result?.lines || result.lines.length !== imported.lines.length) return [];
  const out = [];
  imported.lines.forEach((l, n) => {
    const mine = result.lines[n].ret;
    if (l.i != null && Math.abs(l.i - mine) > 1) out.push({ severity: "medium", title: `${l.desc}: the sheet holds ${usd(l.i)} retainage, the rates entered here give ${usd(mine)}. Check the rate on this line or the sheet's formula.` });
  });
  return out;
}

// Pick the sheet to read: one named like a continuation sheet first, then the first that has a schedule.
export function pickSheet(sheets) {
  const order = [...sheets].sort((a, b) => Number(/g703|continuation|sov|schedule|detail/i.test(b.name)) - Number(/g703|continuation|sov|schedule|detail/i.test(a.name)));
  let firstError = null;
  for (const s of order) {
    const r = findSchedule(s.grid, { sheet: s.name });
    if (!r.error) return r;
    firstError ??= `Sheet "${s.name}": ${r.error}`;
  }
  return { error: sheets.length > 1 ? `None of the ${sheets.length} sheets has a schedule of values the page can read. ${firstError}` : firstError };
}
