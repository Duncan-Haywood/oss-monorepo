// Etsy bulk listing CSV checker. Pure functions, no DOM, no network.
// Column names and limits are read from memory of Etsy's public bulk listing
// upload documentation; no Etsy upload was available when this was built.

export const COLUMNS = [
  "TITLE", "DESCRIPTION", "PRICE", "CURRENCY_CODE", "QUANTITY", "TAGS", "MATERIALS",
  "IMAGE1", "IMAGE2", "IMAGE3", "IMAGE4", "IMAGE5", "IMAGE6", "IMAGE7", "IMAGE8", "IMAGE9", "IMAGE10",
  "VARIATION 1 TYPE", "VARIATION 1 NAME", "VARIATION 1 VALUES",
  "VARIATION 2 TYPE", "VARIATION 2 NAME", "VARIATION 2 VALUES", "SKU",
];
const canon = (h) => h.trim().toUpperCase().replace(/[_\s]+/g, " ");
const LOWER = new Map(COLUMNS.map((c) => [canon(c), c]));
export const SEVERITIES = ["error", "warning", "info"];
export const LIMITS = { title: 140, tags: 13, tagLength: 20, materials: 13, images: 10, quantity: 999, minPrice: 0.2 };

const SCI = /^\d(\.\d+)?e\+?\d+$/i;
const isNum = (v) => /^\d+(\.\d+)?$/.test(v);
const splitList = (v) => v.split(",").map((x) => x.trim());
const IMG = /^https?:\/\/\S+\.(jpe?g|png|gif|webp)(\?\S*)?$/i;

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
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  let best = null, bestD = 99;
  for (const c of COLUMNS) {
    const d = distance(n, c.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(2, Math.floor(n.length / 4)) ? best : null;
}

export function cleanPrice(v) {
  let s = v.trim().replace(/^[$€£¥]\s*/, "").replace(/\s*(USD|EUR|GBP|CAD|AUD)$/i, "");
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  return s;
}

function detectDelim(text) {
  const firstLine = text.split("\n", 1)[0];
  const count = (c) => firstLine.split(c).length - 1;
  if (count(",") === 0 && count(";") > 0) return ";";
  if (count(",") === 0 && count("\t") > 0) return "\t";
  return ",";
}

export function validate(input) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const summary = { rows: 0, listings: 0, columns: 0, delimiter: ",", groups: [], currencies: [] };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose an Etsy bulk listing CSV."); return { findings, summary }; }

  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding and read as UTF-8. Re-export as CSV UTF-8 or accents and symbols in titles will upload damaged.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before uploading, or titles and descriptions will show those characters.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== ",") add("error", "delimiter", 1, `The file is ${delim === ";" ? "semicolon" : "tab"}-separated`, 'Etsy reads a comma-separated file. Excel in many European locales saves CSV with semicolons. Re-save as "CSV UTF-8 (Comma delimited)" or use "Apply safe fixes" below.');

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell. An unescaped quote inside a DESCRIPTION is the usual cause: inside a quoted cell a literal quote must be doubled ("").`);
    return { findings, summary };
  }
  const rows = parsed.rows;
  const header = rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  const idx = {};
  header.forEach((h, i) => {
    const fixed = LOWER.get(canon(h));
    if (fixed) {
      if (idx[fixed] !== undefined) add("error", "dup-header", 1, `Column "${fixed}" appears twice`, `Columns ${idx[fixed] + 1} and ${i + 1} are both "${fixed}". Etsy maps only one of them; delete the other.`);
      else idx[fixed] = i;
      if (h !== fixed) add("warning", "header-case", 1, `Column "${h}" is not spelled like the template`, `Use "${fixed}" exactly, in capitals.`);
    } else if (h !== "") {
      const near = closestColumn(h);
      add("warning", "unknown-header", 1, `Unknown column "${h}"`, near ? `Did you mean "${near}"? Etsy skips columns it does not recognise, so this data would not upload.` : "Etsy skips columns it does not recognise, so this data would not upload.");
    }
    if (h === "") add("warning", "blank-header", 1, `Column ${i + 1} has no name`, "An unnamed column is ignored. Often a stray trailing comma.");
  });
  for (const need of ["TITLE", "PRICE", "QUANTITY"]) if (idx[need] === undefined) add("error", "missing-column", 1, `There is no ${need} column`, `Etsy needs ${need} on every listing.`);
  if (idx.TITLE === undefined) return { findings, summary };

  const g = (r, name) => (idx[name] === undefined ? "" : (r.cells[idx[name]] ?? ""));
  const data = [];
  let blank = 0;
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    summary.rows++;
    if (r.cells.every((c) => c.trim() === "")) { blank++; continue; }
    if (r.cells.length > header.length) add("error", "extra-cells", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "An unquoted comma in a TITLE, DESCRIPTION or TAGS pushed the following cells one column to the right. Quote the cell that contains the comma.");
    else if (r.cells.length < header.length) add("warning", "short-row", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "Missing trailing cells are read as blank. Check that no cell was lost.");
    data.push(r);
  }
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");

  const titles = new Map(), skus = new Map(), currencies = new Set();
  for (const r of data) {
    const t = g(r, "TITLE").trim().toLowerCase();
    if (t) { if (!titles.has(t)) titles.set(t, []); titles.get(t).push(r.line); }
    const s = g(r, "SKU").trim();
    if (s) { if (!skus.has(s)) skus.set(s, []); skus.get(s).push(r.line); }
  }

  for (const r of data) {
    const L = r.line;
    const title = g(r, "TITLE").trim();
    const label = title ? `"${title.length > 40 ? title.slice(0, 40) + "…" : title}"` : "this row";
    summary.listings++;

    if (!title) add("error", "title-blank", L, "Row has no TITLE", "Etsy cannot create a listing without a title.");
    else {
      if (title.length > LIMITS.title) add("error", "title-length", L, `TITLE is ${title.length} characters`, `Etsy titles stop at ${LIMITS.title} characters (from memory). The upload rejects the row or cuts the end off.`);
      if (/[A-Z]/.test(title) && title === title.toUpperCase() && title.length > 12) add("warning", "title-caps", L, "TITLE is all capitals", "Etsy search and buyers both read all-capital titles badly; Title Case is the usual choice.");
      if (/^["'].*["']$/.test(title)) add("info", "title-quoted", L, "TITLE is wrapped in quotation marks", "The quote marks become part of the title. Remove them unless you want them shown.");
      if (titles.get(title.toLowerCase()).length > 1 && titles.get(title.toLowerCase())[0] !== L) add("warning", "dup-title", L, `TITLE repeats line ${titles.get(title.toLowerCase())[0]}`, "Two listings with the same title compete with each other in search. Make each title name what is different about it.");
    }
    if (idx.DESCRIPTION !== undefined && !g(r, "DESCRIPTION").trim()) add("warning", "description-blank", L, `${label} has no DESCRIPTION`, "A listing without a description converts poorly and may be rejected on upload.");

    const price = g(r, "PRICE").trim();
    if (idx.PRICE !== undefined) {
      if (!price) add("error", "price-blank", L, `${label} has no PRICE`, "Etsy needs a price on every listing.");
      else if (!isNum(price)) { const c = cleanPrice(price); add("error", "price-format", L, `PRICE "${price}" is not a plain number`, isNum(c) ? `Etsy wants digits and a decimal point only. Use ${c}.` : "Etsy wants digits and a decimal point only, with no currency symbol, thousands separator or text. Put the currency in CURRENCY_CODE."); }
      else if (Number(price) < LIMITS.minPrice) add("error", "price-min", L, `PRICE ${price} is below the minimum`, `Etsy's lowest listing price is 0.20 in US dollars or the equivalent (from memory), so this row is rejected.`);
    }

    const cur = g(r, "CURRENCY_CODE").trim();
    if (idx.CURRENCY_CODE !== undefined) {
      if (cur) {
        currencies.add(cur.toUpperCase());
        if (!/^[A-Z]{3}$/.test(cur)) add(/^[A-Za-z]{3}$/.test(cur) ? "warning" : "error", "currency", L, `CURRENCY_CODE "${cur}" is not a three-letter capital code`, /^[A-Za-z]{3}$/.test(cur) ? `Use ${cur.toUpperCase()}.` : "Use the ISO code such as USD, GBP, EUR, CAD or AUD, not a symbol.");
      } else add("info", "currency-blank", L, `${label} has no CURRENCY_CODE`, "A blank currency falls back to your shop currency. Fine if that is what you intend.");
    }

    const q = g(r, "QUANTITY").trim();
    if (idx.QUANTITY !== undefined) {
      if (!q) add("error", "quantity-blank", L, `${label} has no QUANTITY`, "Etsy needs a stock quantity on every listing.");
      else if (!/^\d+$/.test(q)) add("error", "quantity", L, `QUANTITY "${q}" is not a whole number`, /^\d+\.\d+$/.test(q) ? "Quantities are whole units." : "Use digits only.");
      else if (Number(q) > LIMITS.quantity) add("error", "quantity-max", L, `QUANTITY ${q} is above ${LIMITS.quantity}`, `Etsy caps the quantity at ${LIMITS.quantity} per listing (from memory).`);
      else if (Number(q) === 0) add("info", "quantity-zero", L, `${label} has quantity 0`, "A listing with no stock shows as sold out.");
    }

    const tagsRaw = g(r, "TAGS");
    if (idx.TAGS !== undefined) {
      const tags = tagsRaw.trim() ? splitList(tagsRaw) : [];
      if (!tags.length) add("warning", "tags-blank", L, `${label} has no TAGS`, `Etsy allows ${LIMITS.tags} tags and search leans on them.`);
      if (tags.some((x) => x === "")) add("warning", "tag-empty", L, "TAGS has an empty tag", "Two commas in a row or a trailing comma leaves an empty tag.");
      const live = tags.filter(Boolean);
      if (live.length > LIMITS.tags) add("error", "tags-count", L, `${live.length} tags`, `Etsy allows at most ${LIMITS.tags} tags per listing (from memory).`);
      const seen = new Map();
      for (const t of live) {
        if (t.length > LIMITS.tagLength) add("error", "tag-length", L, `Tag "${t.slice(0, 30)}" is ${t.length} characters`, `Each tag is limited to ${LIMITS.tagLength} characters (from memory).`);
        if (/[^\p{L}\p{N} \-'’™©®]/u.test(t)) add("warning", "tag-chars", L, `Tag "${t}" has punctuation Etsy may refuse`, "Tags take letters, numbers, spaces, hyphens and apostrophes. Other symbols are rejected or stripped.");
        const k = t.toLowerCase();
        if (seen.has(k)) add("warning", "tag-dup", L, `Tag "${t}" appears twice`, "A repeated tag wastes one of the thirteen slots.");
        seen.set(k, 1);
      }
      if (/;/.test(tagsRaw) && !/,/.test(tagsRaw)) add("warning", "tag-semicolon", L, "TAGS is separated by semicolons", "Etsy reads tags separated by commas. A semicolon list is one very long tag.");
    }
    if (idx.MATERIALS !== undefined && g(r, "MATERIALS").trim()) {
      const m = splitList(g(r, "MATERIALS")).filter(Boolean);
      if (m.length > LIMITS.materials) add("error", "materials-count", L, `${m.length} materials`, `Etsy allows at most ${LIMITS.materials} materials per listing (from memory).`);
    }

    let imgs = 0;
    for (let n = 1; n <= LIMITS.images; n++) {
      const v = g(r, `IMAGE${n}`).trim();
      if (!v) continue;
      imgs++;
      if (!/^https?:\/\//i.test(v)) add("error", "image-url", L, `IMAGE${n} is not a web address`, "Etsy fetches each image from a public https:// address. A file name or local path cannot be fetched.");
      else if (!IMG.test(v)) add("warning", "image-type", L, `IMAGE${n} does not end in an image file type`, "Etsy accepts JPG, PNG and GIF. A link to a web page, or a share link that opens a viewer, is not an image.");
      else if (/^http:\/\//i.test(v)) add("info", "image-http", L, `IMAGE${n} uses http, not https`, "Some hosts redirect; use https where you can.");
    }
    if (!imgs && idx.IMAGE1 !== undefined) add("warning", "no-images", L, `${label} has no images`, "Etsy needs at least one photo before a listing can be published.");
    for (let n = 2; n <= LIMITS.images; n++) if (g(r, `IMAGE${n}`).trim() && !g(r, `IMAGE${n - 1}`).trim()) { add("warning", "image-gap", L, `IMAGE${n} is filled but IMAGE${n - 1} is blank`, "Fill the image columns in order; a gap may drop the later photos."); break; }

    for (const n of [1, 2]) {
      const t = g(r, `VARIATION ${n} TYPE`).trim(), nm = g(r, `VARIATION ${n} NAME`).trim(), vals = g(r, `VARIATION ${n} VALUES`).trim();
      if (!(t || nm || vals)) continue;
      if (vals && !t && !nm) add("error", "variation-label", L, `VARIATION ${n} VALUES has no type or name`, "Name the variation (for example Size or Color) so buyers can see what the choices are.");
      else if ((t || nm) && !vals) add("error", "variation-values", L, `Variation ${n} "${nm || t}" has no VALUES`, "A variation needs its list of choices.");
      if (vals) {
        const list = splitList(vals);
        if (list.some((x) => x === "")) add("warning", "variation-empty", L, `VARIATION ${n} VALUES has an empty choice`, "Two commas in a row or a trailing comma leaves an empty option.");
        const s = new Set();
        for (const v of list.filter(Boolean)) { const k = v.toLowerCase(); if (s.has(k)) add("error", "variation-dup", L, `Variation ${n} choice "${v}" is listed twice`, "Each choice must be unique within its variation."); s.add(k); }
        if (list.length > 70) add("warning", "variation-count", L, `Variation ${n} has ${list.length} choices`, "Etsy limits how many options a variation can carry; check the current limit.");
      }
    }
    if (g(r, "VARIATION 2 VALUES").trim() && !g(r, "VARIATION 1 VALUES").trim()) add("warning", "variation-order", L, "Variation 2 is filled but variation 1 is blank", "Fill variation 1 first.");

    const sku = g(r, "SKU").trim();
    if (sku) {
      if (SCI.test(sku)) add("error", "sci-sku", L, `SKU "${sku}" is in scientific notation`, "Excel turned a long number into scientific notation and the original digits are gone. Format the column as Text and re-enter the SKUs.");
      if (skus.get(sku).length > 1 && skus.get(sku)[0] !== L) add("warning", "dup-sku", L, `SKU "${sku}" repeats line ${skus.get(sku)[0]}`, "Two listings with one SKU make inventory and order exports ambiguous.");
    }
    summary.groups.push({ handle: title, line: L, title: price, variants: tagsRaw.trim() ? splitList(tagsRaw).filter(Boolean).length : 0, images: imgs });
  }
  summary.currencies = [...currencies];
  if (currencies.size > 1) add("warning", "mixed-currency", 0, `The file mixes ${[...currencies].join(", ")}`, "One upload normally uses your shop currency. Prices in other currencies are read as that currency, not converted.");
  findings.sort((a, b) => (SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)) || (a.line - b.line));
  return { findings, summary };
}

// Safe fixes only: things with exactly one reasonable reading. Never edits a
// title, description, tag word, material, image address, variation value or SKU.
export function repair(input) {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const changes = [];
  if (!text.trim()) return { text: "", changes, error: "The file is empty." };
  const delim = detectDelim(text);
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) return { text: "", changes, error: `A quote opened on line ${parsed.unterminated} is never closed; fix that first.` };
  const rows = parsed.rows.map((r) => r.cells.slice());
  if (delim !== ",") changes.push(`Converted the ${delim === ";" ? "semicolon" : "tab"} delimiter to commas.`);
  rows[0].forEach((h, i) => {
    const c = LOWER.get(canon(h));
    if (c && h !== c) { changes.push(`Header "${h}" renamed to "${c}".`); rows[0][i] = c; }
  });
  const head = rows[0].map((h) => h.trim());
  const col = (n) => head.indexOf(n);
  const edit = (ri, ci, to, why) => {
    const from = rows[ri][ci];
    if (from === to) return;
    rows[ri][ci] = to;
    changes.push(`Line ${parsed.rows[ri].line}, ${head[ci]}: "${from}" → "${to}" (${why}).`);
  };
  const price = col("PRICE"), cur = col("CURRENCY_CODE"), tags = col("TAGS"), mats = col("MATERIALS"), sku = col("SKU");
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    if (r.every((c) => c.trim() === "")) continue;
    if (price >= 0 && r[price] !== undefined) { const v = r[price].trim(); if (v && !isNum(v)) { const c = cleanPrice(v); if (isNum(c)) edit(ri, price, c, "plain number"); } }
    if (cur >= 0 && r[cur] !== undefined && /^[A-Za-z]{3}$/.test(r[cur].trim())) edit(ri, cur, r[cur].trim().toUpperCase(), "capital ISO code");
    for (const ci of [tags, mats]) if (ci >= 0 && r[ci] !== undefined && r[ci].trim()) {
      const clean = r[ci].split(",").map((x) => x.trim()).filter(Boolean).join(",");
      if (clean !== r[ci]) edit(ri, ci, clean, "spaces and empty entries removed");
    }
    if (tags >= 0 && r[tags] !== undefined && /;/.test(r[tags]) && !/,/.test(r[tags])) edit(ri, tags, r[tags].split(";").map((x) => x.trim()).filter(Boolean).join(","), "semicolons to commas");
    if (sku >= 0 && r[sku] !== undefined && r[sku] !== r[sku].trim()) edit(ri, sku, r[sku].trim(), "stray spaces");
  }
  return { text: toCsv(rows), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])]);
}

const build = (rows) => toCsv([COLUMNS, ...rows.map((o) => COLUMNS.map((h) => o[h] ?? ""))]);
const img = (n) => `https://example.com/photos/${n}.jpg`;

export function sampleFile() {
  return build([
    { TITLE: "Hand-poured Soy Candle in Amber Jar", DESCRIPTION: "Eight ounce soy wax candle, cotton wick, about 45 hours.", PRICE: "18.00", CURRENCY_CODE: "USD", QUANTITY: "40", TAGS: "soy candle,amber jar,hand poured,gift for her,home decor", MATERIALS: "soy wax,cotton wick,glass", IMAGE1: img("candle-1"), IMAGE2: img("candle-2"), "VARIATION 1 TYPE": "Scent", "VARIATION 1 NAME": "Scent", "VARIATION 1 VALUES": "Cedar,Vanilla,Lavender", SKU: "CAN-8" },
    { TITLE: "Linen Tea Towel Set of Two", DESCRIPTION: "Stonewashed linen, 18 by 28 inches.", PRICE: "26.50", CURRENCY_CODE: "USD", QUANTITY: "25", TAGS: "tea towel,linen,kitchen,housewarming", MATERIALS: "linen", IMAGE1: img("towel-1"), SKU: "TOW-2" },
    { TITLE: "Brass Plant Marker Stakes", DESCRIPTION: "Stamped brass garden markers, set of six.", PRICE: "14.00", CURRENCY_CODE: "USD", QUANTITY: "60", TAGS: "plant markers,garden,brass", MATERIALS: "brass", IMAGE1: img("stake-1"), SKU: "STK-6" },
  ]);
}

export function sampleBrokenFile() {
  return build([
    { TITLE: "HAND-POURED SOY CANDLE IN AMBER JAR WITH COTTON WICK", DESCRIPTION: "Eight ounce soy wax candle.", PRICE: "$18.00", CURRENCY_CODE: "usd", QUANTITY: "40", TAGS: "soy candle, amber jar,hand poured,gift for her,home decor,candle,soy,jar,wax,gift,cozy,hygge,decor,home", MATERIALS: "soy wax,cotton wick", IMAGE1: "candle-1.jpg", "VARIATION 1 TYPE": "Scent", "VARIATION 1 NAME": "Scent", "VARIATION 1 VALUES": "Cedar,Vanilla,cedar", SKU: "1.23457E+12" },
    { TITLE: "Linen Tea Towel Set of Two", DESCRIPTION: "", PRICE: "26,50", CURRENCY_CODE: "USD", QUANTITY: "1200", TAGS: "tea towel;linen;kitchen", IMAGE1: img("towel-1"), "VARIATION 2 VALUES": "Large,Small" },
    { TITLE: "Linen Tea Towel Set of Two", DESCRIPTION: "Stonewashed linen.", PRICE: "0.10", CURRENCY_CODE: "USD", QUANTITY: "2.5", TAGS: "tea towel,a tag that is far too long to be accepted,kitchen!", SKU: "TOW-2" },
  ]);
}
