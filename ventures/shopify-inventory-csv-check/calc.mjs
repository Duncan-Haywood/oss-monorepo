// Shopify inventory import CSV checker. Pure functions, no DOM, no network.
// Column names and rules are read from memory of Shopify's public help pages on updating inventory
// quantities by CSV; no Shopify store or import was available when this was built. The importer reads
// the "On hand (new)" column (older exports call it "Available (new)") and ignores the columns marked
// "(not editable)"; a blank "new" cell leaves that quantity unchanged.

export const ROLES = {
  handle: ["Handle"],
  title: ["Title"],
  sku: ["SKU"],
  location: ["Location"],
  current: ["On hand (current)", "Available (current)"],
  next: ["On hand (new)", "Available (new)"],
};
export const COLUMNS = ["Handle", "Title", "Option1 Name", "Option1 Value", "SKU", "HS Code", "COO", "Location", "Bin name", "Incoming (not editable)", "Unavailable (not editable)", "Committed (not editable)", "Available (not editable)", "On hand (current)", "On hand (new)"];
export const SEVERITIES = ["error", "warning", "info"];
export const JUMP_FACTOR = 10;

const canon = (h) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const ROLE_OF = new Map();
for (const [role, names] of Object.entries(ROLES)) for (const n of names) ROLE_OF.set(canon(n), role);
const ALL_NAMES = COLUMNS.concat(["Available (new)", "Available (current)"]);
// Spellings people use for the quantity column. An importer that cannot find "On hand (new)" has
// nothing to apply, so a near miss is the costliest header fault in this file.
const NEAR = { onhandnew: "next", availablenew: "next", newquantity: "next", newqty: "next", quantity: "next", qty: "next", stock: "next", inventory: "next", onhand: "next", newonhand: "next", sku: "sku", variantsku: "sku", warehouse: "location", locationname: "location", productid: "handle", producthandle: "handle", url: "handle" };
const NEAR_LABEL = { next: "On hand (new)", sku: "SKU", location: "Location", handle: "Handle" };
const SCI = /^[-+]?\d(\.\d+)?e[-+]?\d+$/i;
const EXCEL_ERR = /^(#(NAME\?|REF!|VALUE!|DIV\/0!|N\/A|NUM!|NULL!)|#{3,})$/i;
const HANDLE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const trunc = (s, n = 40) => (s.length > n ? s.slice(0, n) + "…" : s);

export function decodeBuffer(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return new TextDecoder("utf-8").decode(u8);
}

// RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes. Tracks the
// physical line each record starts on so findings can name it.
export function parseCsv(text, delim = ",") {
  const rows = [];
  let row = [], cell = "", q = false, line = 1, start = 1, i = 0, quoteLine = 0, sawAny = false;
  const push = () => { row.push(cell); cell = ""; };
  const endRow = () => { push(); rows.push({ cells: row, line: start }); row = []; sawAny = false; };
  while (i < text.length) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      if (ch === "\n") line++;
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === "") { q = true; quoteLine = line; sawAny = true; i++; continue; }
    if (ch === delim) { push(); sawAny = true; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") { endRow(); line++; start = line; i++; continue; }
    cell += ch; sawAny = true; i++;
  }
  if (q) return { rows, unterminated: quoteLine };
  if (sawAny || cell !== "" || row.length) endRow();
  return { rows, unterminated: 0 };
}

export function toCsv(rows, delim = ",") {
  const esc = (v) => (/[",\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v);
  return rows.map((r) => r.map(esc).join(delim)).join("\r\n") + "\r\n";
}

function distance(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

export function closestColumn(name) {
  const n = canon(name).replace(/[^a-z0-9]/g, "");
  let best = null, bestD = 99;
  for (const c of ALL_NAMES) {
    const d = distance(n, canon(c).replace(/[^a-z0-9]/g, ""));
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(2, Math.floor(n.length / 4)) ? best : null;
}

function detectDelim(text) {
  const firstLine = text.split("\n", 1)[0];
  const count = (c) => firstLine.split(c).length - 1;
  if (count(",") === 0 && count(";") > 0) return ";";
  if (count(",") === 0 && count("\t") > 0) return "\t";
  return ",";
}



const unapos = (v) => (v.startsWith("'") ? v.slice(1) : v);

export function validate(input) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const summary = { rows: 0, columns: 0, delimiter: ",", locations: [], withNewQty: 0, unchanged: 0, flagged: [] };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose a Shopify inventory CSV."); return { findings, summary }; }

  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding and read as UTF-8. Re-export as CSV UTF-8 or product names and bin names will import damaged.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before importing.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== ",") add("error", "delimiter", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, 'A CSV import expects commas. Excel in many European locales saves CSV with semicolons. Re-save as "CSV UTF-8 (Comma delimited)" or use the safe fixes below.');

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell. Inside a quoted cell a literal quote must be doubled ("").`);
    return { findings, summary };
  }
  const header = parsed.rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  const idx = {}, seen = new Map();
  header.forEach((h, i) => {
    const c = canon(h);
    if (!h) { add("warning", "blank-header", 1, `Column ${i + 1} has no header`, "A column with no name is ignored by the importer."); return; }
    if (seen.has(c)) add("error", "dup-header", 1, `Column "${h}" appears twice`, `Columns ${seen.get(c) + 1} and ${i + 1} are the same once capitals and punctuation are ignored. The importer can read the wrong one; delete or rename one.`);
    else seen.set(c, i);
    const role = ROLE_OF.get(c);
    if (role) {
      if (idx[role] === undefined) idx[role] = i;
      if (!ROLES[role].includes(h)) add("info", "header-case", 1, `Column "${h}" is not spelled "${ROLES[role][0]}"`, `Spell it exactly "${ROLES[role][0]}" so the match does not depend on capitals or spacing. Safe fixes do this.`);
      return;
    }
    const near = NEAR[c];
    if (near && idx[near] === undefined) {
      add("warning", "near-header", 1, `Column "${h}" looks like Shopify's "${NEAR_LABEL[near]}"`, `The importer looks for the exact name, so a column called "${h}" can be ignored and nothing is updated. Rename it to "${NEAR_LABEL[near]}".`);
      idx[near] = i;
    }
  });
  if (idx.handle === undefined) {
    add("error", "missing-column", 1, "No Handle column is present", "Shopify matches each row to a product by its Handle. Check the header row, the delimiter and the encoding.");
    return { findings, summary };
  }
  if (idx.next === undefined) {
    add("error", "missing-column", 1, 'No "On hand (new)" column is present', 'The importer applies the quantity in "On hand (new)" (older exports: "Available (new)"). Without it nothing is updated. Export the inventory from Shopify and edit that column.');
    return { findings, summary };
  }
  if (idx.location === undefined) add("warning", "no-location", 1, "No Location column is present", "Quantities are set per location. Without a Location column the importer cannot tell where each count belongs; export the inventory from Shopify and keep the column.");
  if (idx.sku === undefined) add("info", "no-sku", 1, "No SKU column is present", "Rows are matched by Handle and option values. A SKU column makes mistakes easier to spot.");
  const optIdx = header.map((h, i) => (/^option\d (name|value)$/i.test(h) ? i : -1)).filter((i) => i >= 0);

  const keys = new Map(), skus = new Map(), locs = new Map();
  let blank = 0;
  const get = (r, role) => (idx[role] === undefined ? undefined : r[idx[role]]);
  for (let ri = 1; ri < parsed.rows.length; ri++) {
    const { cells: r, line: L } = parsed.rows[ri];
    if (r.every((c) => c.trim() === "")) { blank++; continue; }
    summary.rows++;
    const before = findings.length;
    if (r.length > header.length) add("error", "extra-cells", L, `Row has ${r.length} cells but the header has ${header.length}`, "An unquoted comma inside a title, bin name or option shifts every later cell, so a quantity lands in the wrong column. Wrap that cell in double quotes.");
    else if (r.length < header.length) add("warning", "short-row", L, `Row has ${r.length} cells but the header has ${header.length}`, "The missing trailing cells are read as empty, which for the quantity column means no change.");

    const handleRaw = get(r, "handle") ?? "", handle = handleRaw.trim();
    const loc = (get(r, "location") ?? "").trim();
    const sku = unapos((get(r, "sku") ?? "").trim());
    const nextRaw = (get(r, "next") ?? ""), next = nextRaw.trim();
    const cur = (get(r, "current") ?? "").trim();
    if (!handle) add("error", "no-handle", L, "Row has no Handle", "Shopify cannot tell which product this row is for; it will be skipped or rejected.");
    else {
      if (handleRaw !== handle) add("info", "handle-space", L, "Handle has spaces around it", "Safe fixes trim them.");
      if (EXCEL_ERR.test(handle)) add("error", "excel-error", L, `Handle is the spreadsheet error "${handle}"`, "A broken formula was exported as text. Fix the source cell.");
      else if (!HANDLE.test(handle)) add("warning", "handle-shape", L, `Handle "${trunc(handle)}" is not lowercase letters, digits and hyphens`, "Shopify handles are lowercase with hyphens. A capital, space or accent here usually means the cell was retyped and will not match a product.");
    }
    if (idx.location !== undefined) {
      if (!loc) add("error", "no-location-value", L, "Row has no Location", "A quantity needs a location to apply to.");
      else { const k = loc.toLowerCase(); if (!locs.has(k)) locs.set(k, new Set()); locs.get(k).add(loc); }
    }
    if (sku) {
      if (SCI.test(sku)) add("error", "sku-excel", L, `SKU "${sku}" was turned into scientific notation`, "Excel stores long digit strings as numbers and the original digits are lost. Re-enter the SKU from the source and format the column as Text.");
    }
    const opts = optIdx.map((i) => (r[i] ?? "").trim().toLowerCase()).join("|");
    if (handle) {
      const key = `${handle.toLowerCase()}|${opts}|${loc.toLowerCase()}`;
      if (keys.has(key)) add("error", "dup-row", L, `Same variant and location as line ${keys.get(key)}`, `"${trunc(handle)}" at "${trunc(loc || "(no location)")}" appears twice, so the importer gets two quantities for one stock record and one of them wins without warning. Keep one row.`);
      else keys.set(key, L);
    }
    if (sku && handle) {
      const prev = skus.get(sku.toLowerCase());
      if (prev && prev.handle !== handle.toLowerCase() ) add("warning", "dup-sku", L, `SKU "${trunc(sku)}" is also on line ${prev.line} for a different product`, "Two products sharing a SKU makes stock counts easy to apply to the wrong item. Shopify does not require unique SKUs, so this is a warning.");
      else if (!prev) skus.set(sku.toLowerCase(), { line: L, handle: handle.toLowerCase() });
    }

    if (next === "") summary.unchanged++;
    else {
      summary.withNewQty++;
      if (EXCEL_ERR.test(next)) add("error", "excel-error", L, `On hand (new) is the spreadsheet error "${next}"`, "A broken formula was exported as text. Fix the source cell.");
      else if (SCI.test(next) && !/^\d+$/.test(next)) add("error", "qty-excel", L, `On hand (new) "${next}" is in scientific notation`, "A quantity this large is almost certainly a mangled SKU or barcode pasted into the wrong column.");
      else if (/^[-+]?\d{1,3}(,\d{3})+$/.test(next)) add("error", "qty-thousands", L, `On hand (new) "${next}" has a thousands separator`, "A comma inside a number is read as text or split into two cells. Use plain digits, for example 1200. Safe fixes do not rewrite it because only you know whether the comma is a thousands mark or a decimal one.");
      else if (!/^[-+]?\d+(\.\d+)?$/.test(next)) add("error", "qty-nan", L, `On hand (new) "${trunc(next)}" is not a number`, "Quantities must be whole numbers. Words such as \"none\" or \"N/A\" and units such as \"12 pcs\" are rejected.");
      else {
        const n = Number(next);
        if (!Number.isInteger(n)) add("error", "qty-fraction", L, `On hand (new) "${next}" is not a whole number`, "Inventory quantities are whole units. Round or fix the source figure; the tool will not guess which way.");
        else if (n < 0) add("warning", "qty-negative", L, `On hand (new) is negative (${n})`, "On hand cannot sensibly be below zero. A negative figure is usually a subtraction pasted in place of a count.");
        else if (cur && /^\d+$/.test(cur)) {
          const c = Number(cur);
          if (c === n) { summary.unchanged++; summary.withNewQty--; add("info", "no-change", L, "On hand (new) equals the current figure", "Nothing changes for this row. Harmless; it only matters if you meant to count it."); }
          else if (c > 0 && n >= c * JUMP_FACTOR && n - c >= 100) add("warning", "qty-jump", L, `On hand goes from ${c} to ${n}`, `That is ${JUMP_FACTOR}x or more the current figure. Typos such as an extra zero, or a SKU or price pasted into the quantity, look like this.`);
        }
      }
    }
    if (findings.length > before) summary.flagged.push({ line: L, email: handle || "(no handle)", issues: findings.length - before });
  }
  summary.locations = [...locs.values()].map((s) => [...s][0]);
  for (const set of locs.values()) if (set.size > 1) add("warning", "location-case", 0, `Location is spelled ${set.size} ways: ${[...set].map((x) => `"${trunc(x, 24)}"`).join(", ")}`, "Differences in capitals or spaces can be read as separate locations, or as one that does not match yours. Use the spelling Shopify shows.");
  if (summary.rows && summary.withNewQty === 0) add("warning", "nothing-to-apply", 0, 'No row has a value in "On hand (new)"', "A blank cell means no change, so importing this file would update nothing.");
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");
  add("info", "scope-note", 0, "Quantities are applied as typed", "The import sets stock to the figures in the file. Sales or receipts since the export are not netted off, so a count taken hours ago can overwrite newer movement. Export fresh just before editing, and import a handful of rows first.");
  return { findings, summary };
}

export function repair(input) {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (!text.trim()) return { text: "", changes: [], error: "The file is empty." };
  const delim = detectDelim(text);
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) return { text: "", changes: [], error: "A quoted cell is never closed; fix that before applying safe fixes." };
  const changes = [];
  const rows = parsed.rows.map((r) => r.cells.slice());
  if (delim !== ",") changes.push(`Converted the ${delim === ";" ? "semicolon" : "tab"} delimiter to commas.`);
  rows[0].forEach((h, i) => {
    const role = ROLE_OF.get(canon(h));
    const exact = role ? ROLES[role].find((n) => canon(n) === canon(h)) : "";
    if (exact && exact !== h.trim()) { changes.push(`Header "${h}" renamed to "${exact}".`); rows[0][i] = exact; }
    else if (exact && h !== h.trim()) rows[0][i] = h.trim();
  });
  const head = rows[0].map((h) => h.trim());
  const edit = (ri, ci, to, why) => {
    const from = rows[ri][ci];
    if (from === to) return;
    rows[ri][ci] = to;
    changes.push(`Line ${parsed.rows[ri].line}, ${head[ci]}: "${from}" → "${to}" (${why}).`);
  };
  const cols = ["handle", "sku", "location", "next"].map((k) => head.findIndex((h) => ROLES[k] && ROLES[k].includes(h)));
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    if (r.every((x) => x.trim() === "")) continue;
    cols.forEach((ci, k) => {
      if (ci < 0 || r[ci] === undefined) return;
      const v = r[ci], t = v.trim();
      if (!t) return;
      if (k === 3 && /^\d+\.0+$/.test(t)) edit(ri, ci, t.replace(/\.0+$/, ""), v === t ? "trailing .0 on a whole number" : "stray spaces and a trailing .0 on a whole number");
      else if (v !== t) edit(ri, ci, t, "stray spaces");
    });
  }
  return { text: toCsv(rows), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])]);
}


const build = (rows) => toCsv([COLUMNS, ...rows.map((o) => COLUMNS.map((h) => o[h] ?? ""))]);
const base = { "Option1 Name": "Title", "Option1 Value": "Default Title", "Incoming (not editable)": "0", "Unavailable (not editable)": "0", "Committed (not editable)": "0" };

export function sampleFile() {
  return build([
    { ...base, Handle: "canvas-tote-bag", Title: "Canvas Tote Bag", SKU: "TOTE-NAT", Location: "Main Warehouse", "Available (not editable)": "42", "On hand (current)": "42", "On hand (new)": "60" },
    { ...base, Handle: "ceramic-mug", Title: "Ceramic Mug", SKU: "MUG-WHT", Location: "Main Warehouse", "Available (not editable)": "18", "On hand (current)": "18", "On hand (new)": "" },
    { ...base, Handle: "ceramic-mug", Title: "Ceramic Mug", SKU: "MUG-WHT", Location: "Pop-up Shop", "Available (not editable)": "6", "On hand (current)": "6", "On hand (new)": "4" },
  ]);
}

export function sampleBrokenFile() {
  return build([
    { ...base, Handle: "canvas-tote-bag", Title: "Canvas Tote Bag", SKU: "TOTE-NAT", Location: "Main Warehouse", "Available (not editable)": "42", "On hand (current)": "42", "On hand (new)": "420" },
    { ...base, Handle: "Canvas Tote Bag", Title: "Canvas Tote Bag", SKU: "TOTE-NAT", Location: "main warehouse", "On hand (current)": "42", "On hand (new)": "1,200" },
    { ...base, Handle: "ceramic-mug", Title: "Ceramic Mug", SKU: "4.01E+12", Location: "Main Warehouse", "On hand (current)": "18", "On hand (new)": "12 pcs" },
    { ...base, Handle: "ceramic-mug", Title: "Ceramic Mug", SKU: "MUG-WHT", Location: "Main Warehouse", "On hand (current)": "18", "On hand (new)": "7.5" },
    { ...base, Handle: "", Title: "Orphan", Location: "Main Warehouse", "On hand (new)": "5" },
  ]);
}
