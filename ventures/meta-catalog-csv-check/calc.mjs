// Meta (Facebook and Instagram) catalog feed checker, for a CSV or TSV product feed uploaded in Commerce Manager.
// Pure functions, no DOM, no network. Field names, limits and value lists are read from memory of Meta's public
// catalog-feed help pages; no Commerce Manager upload was available when this was built, so every rule is
// stated as "from memory". Meta may change the specification at any time.

export const SEVERITIES = ["error", "warning", "info"];
export const LIMITS = { id: 100, title: 200, description: 9999, brand: 100, mpn: 70, color: 200, size: 200, additionalImages: 20, rows: 100000 };

export const COLUMNS = [
  "id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand",
  "sale_price", "sale_price_effective_date", "additional_image_link", "item_group_id", "gtin", "mpn",
  "google_product_category", "fb_product_category", "product_type", "color", "size", "gender", "age_group", "material", "pattern",
  "quantity_to_sell_on_facebook", "inventory", "shipping_weight", "status", "visibility",
];
// Missing these is an error; missing these is a warning.
export const REQUIRED = ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand"];
export const EXPECTED = ["item_group_id", "gtin", "google_product_category"];
export const AVAILABILITY = ["in stock", "out of stock", "preorder", "available for order", "discontinued"];
export const CONDITIONS = ["new", "refurbished", "used"];
// Newer condition values the commerce docs mention; accepted without a finding, since this list is from memory.
const NEWER_CONDITIONS = ["cpo", "used_like_new", "used_good", "used_fair"];
export const GENDERS = ["male", "female", "unisex"];
export const AGE_GROUPS = ["newborn", "infant", "toddler", "kids", "adult"];
export const CURRENCIES = new Set(("USD EUR GBP CAD AUD NZD JPY CHF SEK NOK DKK PLN CZK HUF RON BGN HRK ISK TRY ILS AED SAR QAR KWD BHD OMR EGP ZAR NGN KES GHS MAD " +
  "INR PKR BDT LKR NPR CNY HKD TWD KRW SGD MYR THB IDR PHP VND MXN BRL ARS CLP COP PEN UYU BOB PYG CRC GTQ DOP JMD TTD RUB UAH KZT").split(" "));

const SCI = /^[+-]?\d(\.\d+)?e[+-]?\d+$/i;
const EXCEL_ERR = /^#(NAME\?|REF!|VALUE!|N\/A|DIV\/0!|NUM!|NULL!)$/i;

export function canonHeader(h) {
  return String(h).trim().replace(/[^A-Za-z0-9]+/g, "").toLowerCase();
}
const LOWER = new Map(COLUMNS.map((c) => [canonHeader(c), c]));
// Common near-miss header names (Google Merchant, Shopify and plain-English spellings) and the Meta field they probably meant.
const NEAR = {
  sku: "id", productid: "id", itemid: "id", name: "title", producttitle: "title", producttitle2: "title", desc: "description", productdescription: "description",
  stock: "availability", stockstatus: "availability", availabilitystatus: "availability", producturl: "link", url: "link", productlink: "link", imageurl: "image_link",
  imagelink: "image_link", image: "image_link", imagesrc: "image_link", picture: "image_link", manufacturer: "brand", vendor: "brand", cost: "price", salesprice: "sale_price",
  saleprice: "sale_price", upc: "gtin", ean: "gtin", barcode: "gtin", isbn: "gtin", itemgroupid: "item_group_id", group: "item_group_id", parentsku: "item_group_id",
  googleproductcategory: "google_product_category", category: "google_product_category", producttype: "product_type", colour: "color", sex: "gender", agegroup: "age_group",
  quantity: "quantity_to_sell_on_facebook", qty: "quantity_to_sell_on_facebook", additionalimagelink: "additional_image_link", additionalimages: "additional_image_link",
};

export function decodeBuffer(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8.subarray(2));
  return new TextDecoder("utf-8").decode(u8);
}

// Quoted fields, doubled quotes, newlines inside quotes. Each record carries the physical line it starts on.
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
  const esc = (v) => (v.includes(delim) || /[\r\n"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
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
  const n = canonHeader(name);
  if (NEAR[n]) return NEAR[n];
  let best = null, bestD = 99;
  for (const c of COLUMNS) {
    const d = distance(n, canonHeader(c));
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(2, Math.floor(n.length / 4)) ? best : null;
}

// Delimiter of the header row, counting only characters outside double quotes.
export function detectDelim(text) {
  const counts = { ",": 0, "\t": 0, ";": 0, "|": 0 };
  let q = false;
  for (const ch of text) {
    if (ch === '"') q = !q;
    else if (!q && ch === "\n") break;
    else if (!q && ch in counts) counts[ch]++;
  }
  let best = ",";
  for (const d of ["\t", ";", "|"]) if (counts[d] > counts[best]) best = d;
  return best;
}
const delimName = (d) => (d === ";" ? "semicolon" : d === "\t" ? "tab" : d === "|" ? "pipe" : "comma");

const letters = (s) => s.replace(/[^A-Za-z]/g, "");
const isShouting = (t, n = 8) => letters(t).length >= n && letters(t) === letters(t).toUpperCase();

// GS1 mod-10 check digit over a 8, 12, 13 or 14 digit GTIN.
export function gtinValid(g) {
  if (!/^\d+$/.test(g) || ![8, 12, 13, 14].includes(g.length)) return false;
  const d = g.split("").map(Number);
  const check = d.pop();
  let sum = 0;
  d.reverse().forEach((n, i) => { sum += n * (i % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}
// A GTIN that lost leading zeros to Excel: the shortest zero-padding that gives a valid length and check digit, or null.
export function paddedGtin(g) {
  if (!/^\d+$/.test(g) || gtinValid(g)) return null;
  for (const n of [8, 12, 13, 14]) if (g.length < n) { const p = g.padStart(n, "0"); return gtinValid(p) ? p : null; }
  return null;
}

// "9.99 USD" is the shape; returns { amount, currency, problem, fix } where fix is a safe rewrite or null.
export function parsePrice(v) {
  const s = v.trim();
  if (!s) return { problem: "empty" };
  let m = /^(\d+(?:\.\d+)?)\s?([A-Za-z]{3})$/.exec(s) || /^([A-Za-z]{3})\s?(\d+(?:\.\d+)?)$/.exec(s);
  if (m) {
    const [amount, currency] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
    const out = { amount: Number(amount), currency: currency.toUpperCase(), raw: amount };
    const canon = `${amount} ${currency.toUpperCase()}`;
    if (canon !== s) out.fix = canon;
    if (!CURRENCIES.has(out.currency)) out.problem = "currency";
    return out;
  }
  if (/^[$€£¥₹]\s?\d/.test(s) || /\d\s?[$€£¥₹]$/.test(s)) return { problem: "symbol" };
  if (/^\d{1,3}(,\d{3})+(\.\d+)?\s?[A-Za-z]{3}$/.test(s)) return { problem: "thousands" };
  if (/^\d+,\d{1,2}\s?[A-Za-z]{3}$/.test(s)) return { problem: "comma-decimal" };
  if (/^\d+(\.\d+)?$/.test(s)) return { problem: "no-currency", amount: Number(s) };
  return { problem: "shape" };
}

export function checkUrl(v) {
  const s = v.trim();
  if (/\s/.test(s)) return "contains a space";
  if (!/^https?:\/\//i.test(s)) return /^www\./i.test(s) || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(s) ? "has no http:// or https:// at the start" : "is not a web address";
  try { new URL(s); } catch { return "is not a valid web address"; }
  return null;
}

const IMAGE_OK = /\.(jpe?g|png|gif|bmp|tiff?)(\?.*)?$/i;
const IMAGE_BAD = /\.(webp|svg|heic|avif|pdf)(\?.*)?$/i;
const PROMO = /\b(free shipping|\d{1,2}\s?% off|on sale|best price|cheap(est)?|buy now|limited time|click here|sale!)\b/i;

const AVAIL_FIX = { instock: "in stock", outofstock: "out of stock", preorder: "preorder", preorders: "preorder", availablefororder: "available for order", backorder: "available for order", discontinued: "discontinued" };
const fixAvailability = (v) => AVAIL_FIX[v.trim().toLowerCase().replace(/[^a-z]/g, "")] || null;

export function validate(input) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  let hadBom = false;
  if (text.charCodeAt(0) === 0xfeff) { text = text.slice(1); hadBom = true; }
  const summary = { rows: 0, locations: 0, products: 0, columns: 0, delimiter: ",", groups: [] };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose a catalog feed file."); return { findings, summary }; }

  if (text.includes("\u0000")) add("error", "utf16", 0, "The file looks like UTF-16 text", "NUL characters mean the file was saved as Excel's \"Unicode Text\". Save it as \"CSV UTF-8\" or tab-separated text, or use the file chooser on this page, which reads UTF-16.");
  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding and read as UTF-8. Product titles with accents will be wrong. Re-save as UTF-8.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before upload.");
  if (hadBom) add("info", "bom", 0, "The file starts with a UTF-8 byte-order mark", "Excel adds it to \"CSV UTF-8\". It is read past here and removed by Apply safe fixes; most importers accept it.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim === ";" || delim === "|") add("error", "delimiter", 1, `The file is ${delimName(delim)}-separated`, `A catalog feed file is read as comma-separated (CSV) or tab-separated text. A ${delimName(delim)}-separated file is read as one column; European Excel saves semicolons. Use Apply safe fixes to convert it.`);
  else if (delim === "\t") add("info", "delimiter", 1, "The file is tab-separated", "Tab-separated text is accepted for catalog feeds from memory of the help page, as is CSV.");

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell. Look for a stray quote in a product title or description (a stray opening quote is the usual cause).`);
    return { findings, summary };
  }
  const rows = parsed.rows;
  const header = rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  const idx = {};
  header.forEach((h, i) => {
    const fixed = LOWER.get(canonHeader(h));
    if (fixed) {
      if (idx[fixed] !== undefined) add("error", "dup-header", 1, `Column "${fixed}" appears twice`, `Columns ${idx[fixed] + 1} and ${i + 1} are both "${fixed}". Delete the other.`);
      else idx[fixed] = i;
      if (h !== fixed) add("warning", "header-case", 1, `Header "${h}" differs from the field name "${fixed}"`, "Field names in a feed file are lowercase with underscores; copy the spelling exactly so the column is read.");
    } else if (h === "") {
      add("warning", "blank-header", 1, `Column ${i + 1} has no name`, "An unnamed column is ignored. Often a stray trailing delimiter.");
    } else {
      const near = closestColumn(h);
      add("warning", "unknown-header", 1, `Unknown column "${h}"`, near ? `Did you mean "${near}"? Columns the feed specification does not know are ignored, so this data would not import.` : "Columns the feed specification does not know are ignored, so this data would not import. Not in this tool's list; it may be a newer field.");
    }
  });
  for (const c of COLUMNS) {
    if (idx[c] !== undefined) continue;
    if (REQUIRED.includes(c)) add("error", "missing-column", 1, `Required column "${c}" is missing`, `A catalog feed needs ${REQUIRED.join(", ")}. Without "${c}" every row is rejected.`);
    else if (EXPECTED.includes(c)) add("warning", "missing-column", 1, `Column "${c}" is missing`, c === "item_group_id" ? "Without item_group_id, size and color variants show as separate products instead of one product with options." : c === "gtin" ? "Without GTINs, matching to Meta's product catalog and some dynamic-ad features are weaker." : "Without a product category, products are harder to classify for ads and Shops.");
  }
  if (REQUIRED.some((c) => idx[c] === undefined) && idx.id === undefined && idx.title === undefined) return { findings, summary };

  const data = rows.slice(1).filter((r) => !r.cells.every((x) => x.trim() === ""));
  summary.rows = data.length;
  summary.products = data.length;
  summary.locations = data.length;
  if (!data.length) { add("error", "no-rows", 1, "There are no product rows", "The file has a header and nothing under it."); return { findings, summary }; }
  if (data.length > LIMITS.rows) add("warning", "many-rows", 0, `${data.length} rows is a very large file`, `Uploads past about ${LIMITS.rows.toLocaleString("en-US")} items per file are slow and often split; check the feed size limit in Commerce Manager.`);

  const get = (r, n) => (idx[n] === undefined ? "" : (r.cells[idx[n]] ?? "").trim());
  const seenId = new Map();
  const groups = new Map();
  const domains = new Map();
  const currencies = new Map();
  let imageHttp = 0, linkHttp = 0;

  for (const r of data) {
    const line = r.line;
    if (r.cells.length !== header.length) add("warning", "ragged", line, `Row has ${r.cells.length} cells, the header has ${header.length}`, "An unquoted comma in a title or description shifts every later column. Quote the cell or remove the comma.");
    const id = get(r, "id"), title = get(r, "title"), desc = get(r, "description");
    for (const n of Object.keys(idx)) {
      const v = (r.cells[idx[n]] ?? "");
      if (EXCEL_ERR.test(v.trim())) add("error", "excel-error", line, `${n} is the Excel error ${v.trim()}`, "A formula failed in the spreadsheet and the error text was exported. Re-export after fixing the formula, or fill the cell.");
    }
    // id
    if (idx.id !== undefined) {
      if (!id) add("error", "id-blank", line, "id is blank", "Every item needs an id; a row without one is rejected.");
      else {
        if (SCI.test(id)) add("error", "id-sci", line, `id "${id}" is Excel scientific notation`, "Excel turned a long number into 1.2346E+09, which loses digits. Format the column as Text and re-enter the values, or export from the source system.");
        else if (/^\d+\.0+$/.test(id)) add("warning", "id-dot0", line, `id "${id}" ends in .0`, "A numeric id passed through Excel gained .0, so it no longer matches the id used in your pixel events and earlier uploads. Apply safe fixes removes it.");
        if (id.length > LIMITS.id) add("error", "id-long", line, `id is ${id.length} characters`, `ids are limited to ${LIMITS.id} characters from memory of the spec.`);
        if (seenId.has(id)) add("error", "id-dup", line, `Duplicate id "${id}"`, `The same id is on line ${seenId.get(id)}. Only one row per id is kept; the other is dropped or overwrites it.`);
        else seenId.set(id, line);
      }
    }
    // title
    if (idx.title !== undefined) {
      if (!title) add("error", "title-blank", line, "title is blank", "A title is required.");
      else {
        if (title.length > LIMITS.title) add("error", "title-long", line, `title is ${title.length} characters`, `Titles are limited to ${LIMITS.title} characters from memory; the rest is cut or the row rejected. The first 40 or so are what shoppers see.`);
        if (isShouting(title)) add("warning", "title-caps", line, "title is in all capitals", "Meta's guidance is not to use all capitals in titles; they can be rejected or shown poorly.");
        if (PROMO.test(title)) add("warning", "title-promo", line, `title contains promotional text ("${PROMO.exec(title)[0]}")`, "Ads policy dislikes prices, shipping offers and sale wording inside titles. Put offers in sale_price, not the title.");
        if (/<\/?[a-z][^>]*>/i.test(title)) add("warning", "title-html", line, "title contains HTML tags", "Titles are plain text; tags are shown literally.");
      }
    }
    // description
    if (idx.description !== undefined) {
      if (!desc) add("error", "desc-blank", line, "description is blank", "A description is required.");
      else {
        if (desc.length > LIMITS.description) add("error", "desc-long", line, `description is ${desc.length} characters`, `Descriptions are limited to ${LIMITS.description} characters from memory of the spec.`);
        if (isShouting(desc, 20)) add("warning", "desc-caps", line, "description is in all capitals", "All-capital descriptions are rejected or flagged by Meta's guidance.");
        if (/<\/?[a-z][^>]*>/i.test(desc)) add("warning", "desc-html", line, "description contains HTML tags", "Descriptions are plain text; tags and entities such as &nbsp; show up literally.");
        if (title && desc.trim().toLowerCase() === title.toLowerCase()) add("info", "desc-same", line, "description is identical to the title", "Meta recommends a description that adds detail; a copy of the title is accepted but weak.");
      }
    }
    // availability, condition
    if (idx.availability !== undefined) {
      const a = get(r, "availability");
      if (!a) add("error", "avail-blank", line, "availability is blank", `Use one of: ${AVAILABILITY.join(", ")}.`);
      else if (!AVAILABILITY.includes(a)) {
        const fix = fixAvailability(a);
        add(fix ? "warning" : "error", "avail-value", line, `availability "${a}" is not an accepted value`, fix ? `Use "${fix}" exactly (lowercase, spaces). Apply safe fixes does it.` : `Use one of: ${AVAILABILITY.join(", ")}.`);
      }
    }
    if (idx.condition !== undefined) {
      const c = get(r, "condition");
      if (!c) add("error", "cond-blank", line, "condition is blank", "Use new, refurbished or used.");
      else if (!CONDITIONS.includes(c) && !NEWER_CONDITIONS.includes(c)) add(c.toLowerCase() === c ? "error" : "warning", "cond-value", line, `condition "${c}" is not an accepted value`, c.toLowerCase() === c ? "Use new, refurbished or used." : `Use "${c.toLowerCase()}" in lowercase. Apply safe fixes does it.`);
    }
    // price, sale_price
    let main = null;
    if (idx.price !== undefined) {
      const p = get(r, "price");
      if (!p) add("error", "price-blank", line, "price is blank", "A price with its currency is required, like 19.99 USD.");
      else {
        main = parsePrice(p);
        const msg = {
          symbol: ["error", `price "${p}" uses a currency symbol`, "Write the amount, a space, then the ISO code: 19.99 USD. A symbol like $ is ambiguous (US, Canadian and Australian dollars) so it is not rewritten for you."],
          thousands: ["error", `price "${p}" has a thousands separator`, "Remove the comma: 1299.00 USD."],
          "comma-decimal": ["error", `price "${p}" uses a decimal comma`, "Use a decimal point: 12.50 EUR. A comma-decimal price often comes from European Excel and is not rewritten for you because 1,5 could be misread."],
          "no-currency": ["error", `price "${p}" has no currency`, "Add the ISO 4217 code after a space: 19.99 USD. The currency is not guessed."],
          shape: ["error", `price "${p}" is not an amount and currency`, "Use the form 19.99 USD."],
          currency: ["error", `price "${p}" has an unknown currency code`, `"${main.currency}" is not a currency code this tool knows. Use the three-letter ISO 4217 code, for example USD, EUR, GBP.`],
        }[main.problem];
        if (msg) add(msg[0], `price-${main.problem}`, line, msg[1], msg[2]);
        else {
          if (main.fix) add("warning", "price-format", line, `price "${p}" is not in the 19.99 USD form`, `Write it as "${main.fix}". Apply safe fixes does it.`);
          if (main.amount === 0) add("error", "price-zero", line, "price is zero", "A price of 0 is rejected for normal items; use the real price, or sale_price for a discount.");
          if (main.amount > 0) {
            if (!currencies.has(main.currency)) currencies.set(main.currency, line);
          }
        }
      }
    }
    if (idx.sale_price !== undefined && get(r, "sale_price")) {
      const sp = get(r, "sale_price");
      const s = parsePrice(sp);
      if (s.problem) add("error", `sale-${s.problem}`, line, `sale_price "${sp}" is not in the 19.99 USD form`, "Use the amount, a space, then the three-letter currency code.");
      else {
        if (s.fix) add("warning", "sale-format", line, `sale_price "${sp}" is not in the 19.99 USD form`, `Write it as "${s.fix}". Apply safe fixes does it.`);
        if (main && !main.problem) {
          if (s.currency !== main.currency) add("error", "sale-currency", line, `sale_price currency ${s.currency} differs from price currency ${main.currency}`, "Both must use the same currency.");
          else if (s.amount >= main.amount) add("error", "sale-not-lower", line, `sale_price ${sp} is not lower than price ${get(r, "price")}`, "The sale price must be below the regular price or the item is rejected or shows no discount.");
          else if (s.amount < main.amount * 0.2) add("warning", "sale-deep", line, `sale_price is under 20% of price`, "A discount this deep is often a typo (a dropped digit); check it.");
        }
      }
    }
    if (idx.sale_price_effective_date !== undefined && get(r, "sale_price_effective_date")) {
      const d = get(r, "sale_price_effective_date");
      const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)\/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)$/.exec(d);
      if (!m) add("error", "sale-date-format", line, `sale_price_effective_date "${d}" is not a start/end pair`, "Use two ISO 8601 date-times separated by a slash: 2026-11-20T00:00-08:00/2026-11-30T23:59-08:00.");
      else if (new Date(m[1].replace(/([+-]\d{2})(\d{2})$/, "$1:$2")) >= new Date(m[2].replace(/([+-]\d{2})(\d{2})$/, "$1:$2"))) add("error", "sale-date-order", line, "sale price ends before it starts", "The second date-time must be after the first.");
      if (idx.sale_price !== undefined && !get(r, "sale_price")) add("info", "sale-date-orphan", line, "sale_price_effective_date is set but sale_price is empty", "The dates have nothing to apply to.");
    }
    // link, image_link
    if (idx.link !== undefined) {
      const l = get(r, "link");
      if (!l) add("error", "link-blank", line, "link is blank", "Each item needs the product page address.");
      else {
        const bad = checkUrl(l);
        if (bad) add("error", "link-bad", line, `link ${bad}`, `"${l.slice(0, 80)}" must be the full product page address starting with https://.`);
        else {
          if (/^http:\/\//i.test(l)) linkHttp++;
          const host = new URL(l).hostname.replace(/^www\./, "");
          domains.set(host, (domains.get(host) || 0) + 1);
        }
      }
    }
    if (idx.image_link !== undefined) {
      const l = get(r, "image_link");
      if (!l) add("error", "image-blank", line, "image_link is blank", "Each item needs a main image address.");
      else {
        const bad = checkUrl(l);
        if (bad) add("error", "image-bad", line, `image_link ${bad}`, `"${l.slice(0, 80)}" must be the full image address starting with https://.`);
        else {
          if (/^http:\/\//i.test(l)) imageHttp++;
          if (IMAGE_BAD.test(l)) add("warning", "image-format", line, `image_link ends in ${IMAGE_BAD.exec(l)[1]}`, "From memory, catalog images should be JPEG, PNG, GIF (non-animated), BMP or TIFF; WebP, SVG and HEIC are often rejected. Serve a JPEG or PNG.");
          else if (!IMAGE_OK.test(l)) add("info", "image-ext", line, "image_link has no image file extension", "That can be fine for image CDNs; check that the address opens a JPEG or PNG directly.");
        }
      }
    }
    if (idx.additional_image_link !== undefined && get(r, "additional_image_link")) {
      const urls = get(r, "additional_image_link").split(",").map((u) => u.trim()).filter(Boolean);
      if (urls.length > LIMITS.additionalImages) add("warning", "extra-images", line, `${urls.length} additional images`, `Only the first ${LIMITS.additionalImages} are used.`);
      const badOne = urls.find((u) => checkUrl(u));
      if (badOne) add("error", "extra-image-bad", line, "additional_image_link has an invalid address", `"${badOne.slice(0, 80)}" ${checkUrl(badOne)}. Separate several addresses with commas and no spaces.`);
    }
    // brand
    if (idx.brand !== undefined) {
      const b = get(r, "brand");
      if (!b) add("error", "brand-blank", line, "brand is blank", "Brand is required. For unbranded or handmade goods use your store name; \"n/a\" is not accepted.");
      else {
        if (b.length > LIMITS.brand) add("error", "brand-long", line, `brand is ${b.length} characters`, `Brand is limited to ${LIMITS.brand} characters.`);
        if (/^(n\/?a|none|null|unbranded|generic|-)$/i.test(b)) add("warning", "brand-placeholder", line, `brand "${b}" is a placeholder`, "Use the real brand or your store name; placeholders are weak for matching and are sometimes rejected.");
        if (/^https?:\/\//i.test(b)) add("warning", "brand-url", line, "brand is a web address", "Use the brand name, not a URL.");
      }
    }
    // gtin, mpn
    if (idx.gtin !== undefined && get(r, "gtin")) {
      const g = get(r, "gtin");
      if (SCI.test(g)) add("error", "gtin-sci", line, `gtin "${g}" is Excel scientific notation`, "Excel replaced the barcode with 1.2346E+11 and dropped digits. Format the column as Text and re-enter, or re-export from the source.");
      else if (/^\d+\.0+$/.test(g)) add("warning", "gtin-dot0", line, `gtin "${g}" ends in .0`, "A barcode passed through Excel as a number. Apply safe fixes removes the .0.");
      else if (!/^\d+$/.test(g)) add("error", "gtin-chars", line, `gtin "${g}" is not all digits`, "A GTIN (UPC, EAN, ISBN-13, JAN) is 8, 12, 13 or 14 digits with nothing else.");
      else if (!gtinValid(g)) {
        const p = paddedGtin(g);
        if (p) add("warning", "gtin-zero", line, `gtin "${g}" lost leading zeros`, `Padding to "${p}" gives a valid check digit. Excel dropped the zeros; Apply safe fixes restores them.`);
        else add("error", "gtin-check", line, `gtin "${g}" is not a valid barcode number`, [8, 12, 13, 14].includes(g.length) ? "The check digit does not match, so a digit is wrong or transposed." : `A GTIN has 8, 12, 13 or 14 digits; this has ${g.length}.`);
      }
    }
    if (idx.mpn !== undefined && get(r, "mpn")) {
      const m = get(r, "mpn");
      if (m.length > LIMITS.mpn) add("error", "mpn-long", line, `mpn is ${m.length} characters`, `mpn is limited to ${LIMITS.mpn} characters.`);
      if (SCI.test(m)) add("error", "mpn-sci", line, `mpn "${m}" is Excel scientific notation`, "Excel mangled a part number made of digits and an E. Format the column as Text.");
    }
    // enumerations and numbers
    if (idx.gender !== undefined && get(r, "gender") && !GENDERS.includes(get(r, "gender"))) add("warning", "gender-value", line, `gender "${get(r, "gender")}" is not accepted`, `Use ${GENDERS.join(", ")} in lowercase.`);
    if (idx.age_group !== undefined && get(r, "age_group") && !AGE_GROUPS.includes(get(r, "age_group"))) add("warning", "age-value", line, `age_group "${get(r, "age_group")}" is not accepted`, `Use ${AGE_GROUPS.join(", ")} in lowercase.`);
    for (const f of ["color", "size"]) if (idx[f] !== undefined && get(r, f).length > LIMITS[f]) add("warning", `${f}-long`, line, `${f} is ${get(r, f).length} characters`, `${f} is limited to ${LIMITS[f]} characters.`);
    if (idx.status !== undefined && get(r, "status") && !["active", "archived"].includes(get(r, "status"))) add("warning", "status-value", line, `status "${get(r, "status")}" is not accepted`, "Use active or archived.");
    if (idx.visibility !== undefined && get(r, "visibility") && !["staging", "published"].includes(get(r, "visibility"))) add("warning", "visibility-value", line, `visibility "${get(r, "visibility")}" is not accepted`, "Use staging or published. Items left in staging do not appear in ads or Shops.");
    for (const f of ["quantity_to_sell_on_facebook", "inventory"]) {
      if (idx[f] === undefined || !get(r, f)) continue;
      const q = get(r, f);
      if (!/^\d+$/.test(q) && !/^\d+\.0+$/.test(q)) add("error", `${f}-value`, line, `${f} "${q}" is not a whole number`, "Use a whole number of 0 or more.");
      else if (Number(q) === 0 && get(r, "availability") === "in stock") add("warning", "stock-conflict", line, `availability is "in stock" but ${f} is 0`, "The two disagree; one of them is wrong, and shoppers can be sent to sold-out items.");
    }
    if (idx.shipping_weight !== undefined && get(r, "shipping_weight") && !/^\d+(\.\d+)?\s?(lb|oz|g|kg)$/i.test(get(r, "shipping_weight"))) add("warning", "weight-format", line, `shipping_weight "${get(r, "shipping_weight")}" has no unit`, "Use a number, a space and lb, oz, g or kg: 1.5 lb.");
    if (idx.google_product_category !== undefined && get(r, "google_product_category") && !/^\d+$/.test(get(r, "google_product_category")) && !get(r, "google_product_category").includes(">")) add("info", "category-shape", line, "google_product_category is neither an ID nor a full path", "Use the numeric taxonomy ID, or the full path with > between levels, such as Apparel & Accessories > Clothing > Shirts & Tops.");
    // groups
    const gid = get(r, "item_group_id");
    if (gid) {
      const key = ["color", "size", "material", "pattern", "gender", "age_group"].map((n) => get(r, n).toLowerCase()).join("|");
      if (!groups.has(gid)) groups.set(gid, []);
      groups.get(gid).push({ line, key, title, id });
    }
    summary.groups.push({ line, handle: id, title, variants: gid });
  }

  for (const [gid, members] of groups) {
    const seen = new Map();
    for (const m of members) {
      if (m.key.replace(/\|/g, "") !== "" && seen.has(m.key)) add("warning", "variant-dup", m.line, `Two variants in group "${gid}" share the same options`, `Lines ${seen.get(m.key)} and ${m.line} have identical color, size, material, pattern, gender and age group, so shoppers cannot tell them apart.`);
      else seen.set(m.key, m.line);
    }
    if (members.length > 1 && members.every((m) => m.key.replace(/\|/g, "") === "")) add("warning", "variant-nokey", members[0].line, `Group "${gid}" has ${members.length} items and none of them has color, size, material or pattern`, "Variants need at least one option column that differs between them, or Meta cannot build the options picker.");
  }
  if (domains.size > 1) {
    const top = [...domains.entries()].sort((a, b) => b[1] - a[1]);
    add("info", "domains", 0, `Product links use ${domains.size} different domains`, `${top.slice(0, 4).map(([d, n]) => `${d} (${n})`).join(", ")}. Meta wants links on the domain you verified for the catalog; items on other domains can be rejected.`);
  }
  if (currencies.size > 1) add("warning", "mixed-currency", 0, `The file mixes ${currencies.size} currencies`, `${[...currencies.keys()].join(", ")}. A feed is normally one currency per country; mixed currencies in one file are often a paste error.`);
  if (linkHttp) add("warning", "link-http", 0, `${linkHttp} product link${linkHttp === 1 ? " uses" : "s use"} http://`, "Use https:// links; plain http pages are flagged as insecure and some are rejected.");
  if (imageHttp) add("info", "image-http", 0, `${imageHttp} image address${imageHttp === 1 ? " uses" : "es use"} http://`, "Use https:// image addresses.");
  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.line - b.line);
  return { findings, summary };
}

export function repair(input) {
  let text = String(input ?? "");
  const changes = [];
  if (text.charCodeAt(0) === 0xfeff) { text = text.slice(1); changes.push("Removed the UTF-8 byte-order mark."); }
  if (!text.trim()) return { text: "", changes, error: "The file is empty." };
  const delim = detectDelim(text);
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) return { text: "", changes, error: `A quote opened on line ${parsed.unterminated} is never closed; fix that first.` };
  const rows = parsed.rows.map((r) => r.cells.slice());
  const out = delim === "\t" ? "\t" : ",";
  if (delim === ";" || delim === "|") changes.push(`Converted the ${delimName(delim)} delimiter to commas.`);
  const head = rows[0].map((h) => h.trim());
  const col = (n) => head.findIndex((h) => LOWER.get(canonHeader(h)) === n);
  const edit = (ri, ci, to, why) => {
    const from = rows[ri][ci];
    if (from === to) return;
    rows[ri][ci] = to;
    changes.push(`Line ${parsed.rows[ri].line}, ${head[ci]}: "${from}" → "${to}" (${why}).`);
  };
  const c = Object.fromEntries(COLUMNS.map((n) => [n, col(n)]));
  const has = (r, n) => c[n] >= 0 && r[c[n]] !== undefined;
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    if (r.every((x) => x.trim() === "")) continue;
    for (const n of ["id", "title", "availability", "condition", "price", "sale_price", "link", "image_link", "brand", "gtin", "mpn", "item_group_id", "color", "size"]) {
      if (has(r, n) && r[c[n]] !== r[c[n]].trim()) edit(ri, c[n], r[c[n]].trim(), "stray spaces");
    }
    for (const n of ["id", "gtin", "mpn", "item_group_id"]) if (has(r, n) && /^\d+\.0+$/.test(r[c[n]])) edit(ri, c[n], r[c[n]].replace(/\.0+$/, ""), "trailing .0 removed");
    if (has(r, "gtin")) { const p = paddedGtin(r[c.gtin]); if (p) edit(ri, c.gtin, p, "leading zeros restored, the check digit confirms it"); }
    if (has(r, "availability") && !AVAILABILITY.includes(r[c.availability])) { const f = fixAvailability(r[c.availability]); if (f) edit(ri, c.availability, f, "value spelled as Meta expects"); }
    if (has(r, "condition") && r[c.condition] && !CONDITIONS.includes(r[c.condition]) && [...CONDITIONS, ...NEWER_CONDITIONS].includes(r[c.condition].toLowerCase())) edit(ri, c.condition, r[c.condition].toLowerCase(), "lowercase");
    for (const n of ["price", "sale_price"]) {
      if (!has(r, n) || !r[c[n]].trim()) continue;
      const p = parsePrice(r[c[n]]);
      if (p.fix && !p.problem) edit(ri, c[n], p.fix, "amount, space, ISO currency code");
    }
    for (const n of ["gender", "age_group", "status", "visibility"]) if (has(r, n) && r[c[n]] && r[c[n]] !== r[c[n]].toLowerCase()) edit(ri, c[n], r[c[n]].toLowerCase(), "lowercase");
  }
  return { text: toCsv(rows, out), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])], ",");
}

const COLS = ["id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand", "sale_price", "item_group_id", "gtin", "color", "size", "google_product_category", "quantity_to_sell_on_facebook"];
const build = (rows, d = ",") => toCsv([COLS, ...rows], d);

export function sampleFile() {
  return build([
    ["TEE-RED-S", "Harbor Tee, Red, Small", "Soft cotton crew-neck tee in harbor red, preshrunk, made in Portugal.", "in stock", "new", "24.00 USD", "https://example.com/products/harbor-tee?v=red-s", "https://example.com/img/harbor-tee-red.jpg", "Harbor Street", "19.00 USD", "TEE", "036000291452", "Red", "S", "Apparel & Accessories > Clothing > Shirts & Tops", "14"],
    ["TEE-RED-M", "Harbor Tee, Red, Medium", "Soft cotton crew-neck tee in harbor red, preshrunk, made in Portugal.", "in stock", "new", "24.00 USD", "https://example.com/products/harbor-tee?v=red-m", "https://example.com/img/harbor-tee-red.jpg", "Harbor Street", "", "TEE", "", "Red", "M", "Apparel & Accessories > Clothing > Shirts & Tops", "9"],
    ["MUG-01", "Harbor Street Enamel Mug", "12 oz enamel camp mug with a steel rim, dishwasher safe.", "out of stock", "new", "16.50 USD", "https://example.com/products/enamel-mug", "https://example.com/img/mug.png", "Harbor Street", "", "", "", "White", "", "Home & Garden > Kitchen & Dining", "0"],
  ], ",");
}

export function sampleBrokenFile() {
  // Semicolon-separated, as European Excel saves it; ids and barcodes are damaged, prices lack currency or use symbols.
  const rows = [
    ["1.2346E+09", "BEST CHEAP HARBOR TEE - FREE SHIPPING SALE", "<p>Soft cotton tee</p>", "In Stock", "New", "$24.00", "www.example.com/products/harbor-tee", "https://example.com/img/harbor-tee.webp", "n/a", "30.00 USD", "TEE", "36000291452", "Red", "S", "", "14"],
    ["TEE-RED-S", "Harbor Tee Red Small", "Soft cotton tee", "instock", "used", "24,00 EUR", "http://example.com/products/harbor-tee-2", "https://example.com/img/harbor-tee.jpg", "Harbor Street", "", "TEE", "123456789012", "Red", "S", "", "0"],
    ["TEE-RED-S", "Harbor Tee Red Small", "Soft cotton tee", "in stock", "new", "24", "https://example.com/products/harbor-tee-3", "", "Harbor Street", "", "TEE", "4006381333931.0", "Red", "S", "", "-2"],
  ];
  return toCsv([COLS, ...rows], ";");
}
