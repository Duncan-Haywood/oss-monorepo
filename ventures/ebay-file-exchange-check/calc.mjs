// eBay File Exchange / Seller Hub reports listing-file checker.
// Pure functions, no DOM, no network. Column names, codes and limits are read
// from memory of eBay's public bulk-listing documentation; no eBay upload was
// available when this was built, so every rule is stated as "from memory".

export const SEVERITIES = ["error", "warning", "info"];
export const LIMITS = { title: 80, customLabel: 50, pictures: 12, subtitle: 55, description: 500000 };
export const ACTIONS = ["Add", "Revise", "End", "Relist", "VerifyAdd", "Reviseinventorystatus", "ReviseInventoryStatus", "AddToCart"];
export const FORMATS = ["FixedPrice", "Auction", "StoreInventory"];
// ConditionID values read from memory of eBay's condition table.
export const CONDITION_IDS = ["1000", "1500", "1750", "2000", "2010", "2020", "2030", "2500", "2750", "3000", "4000", "5000", "6000", "7000"];
const USED_IDS = ["2750", "3000", "4000", "5000", "6000", "7000"];
export const AUCTION_DURATIONS = ["Days_1", "Days_3", "Days_5", "Days_7", "Days_10"];
export const FIXED_DURATIONS = ["GTC", "Days_30"];

const BASE = ["Action", "Category", "Title", "Subtitle", "ConditionID", "ConditionDescription", "Description", "PicURL", "Quantity", "Format", "StartPrice", "BuyItNowPrice", "Duration", "Location", "CustomLabel", "UPC", "EAN", "ISBN", "ItemID", "ImmediatePayRequired", "ReservePrice", "BestOfferEnabled", "ShippingProfileName", "ReturnProfileName", "PaymentProfileName"];
export const COLUMNS = BASE;
// Header cells carry a leading "*" for required columns, and the Action column carries a parenthesised
// site/currency/version clause: "*Action(SiteID=US|Country=US|Currency=USD|Version=1193)".
export function canonHeader(h) {
  return h.trim().replace(/^\*+/, "").replace(/\(.*\)\s*$/, "").replace(/[_\s]+/g, "").toLowerCase();
}
const LOWER = new Map(BASE.map((c) => [canonHeader(c), c]));

const SCI = /^\d(\.\d+)?e\+?\d+$/i;
const isNum = (v) => /^\d+(\.\d+)?$/.test(v);
const gtinLen = [8, 12, 13, 14];

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
  let best = null, bestD = 99;
  for (const c of BASE) {
    const d = distance(n, canonHeader(c));
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

export function gtinValid(digits) {
  if (!/^\d+$/.test(digits) || !gtinLen.includes(digits.length)) return false;
  const body = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1));
}

// An 11-digit "UPC" is almost certainly a 12-digit UPC whose leading zero Excel removed; only offered when it validates.
export function paddedUpc(v) {
  return /^\d{11}$/.test(v) && gtinValid("0" + v) ? "0" + v : null;
}

function detectDelim(text) {
  const first = text.split("\n", 1)[0];
  const count = (c) => first.split(c).length - 1;
  const comma = count(","), semi = count(";"), tab = count("\t");
  if (tab > comma && tab > semi) return "\t";
  if (semi > comma) return ";";
  return ",";
}
const delimName = (d) => (d === ";" ? "semicolon" : d === "\t" ? "tab" : "comma");

const letters = (s) => s.replace(/[^A-Za-z]/g, "");
const isShouting = (t) => letters(t).length >= 12 && letters(t) === letters(t).toUpperCase();

export function validate(input) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const summary = { rows: 0, listings: 0, columns: 0, delimiter: ",", groups: [] };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose a listing file."); return { findings, summary }; }

  if (text.includes("\u0000")) add("error", "utf16", 0, "The file looks like UTF-16 text", "NUL characters mean the file was saved as Excel's \"Unicode Text\". Save it as \"CSV UTF-8\" instead, or use the file chooser on this page, which reads UTF-16.");
  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding and read as UTF-8. Titles with accents or symbols will upload damaged.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before uploading.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim !== ",") add("error", "delimiter", 1, `The file is ${delimName(delim)}-separated`, `File Exchange reads comma-separated CSV. A ${delimName(delim)}-separated file is read as one column; European Excel saves semicolons. Use "Apply safe fixes" below.`);

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell. HTML descriptions with unescaped quotes are the usual cause.`);
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
    } else if (/^c:/i.test(h)) {
      if (!/^C:/.test(h)) add("warning", "specific-case", 1, `Item specific "${h}" does not start with "C:"`, "Item specifics columns start with an uppercase C and a colon, like C:Brand.");
    } else if (/^\*?(relationship|relationshipdetails|product:)/i.test(h)) {
      // variation and product columns: not modelled, not flagged
    } else if (h !== "") {
      const near = closestColumn(h);
      add("warning", "unknown-header", 1, `Unknown column "${h}"`, near ? `Did you mean "${near}"? File Exchange ignores or rejects columns it does not recognise, so this data would not upload.` : "File Exchange ignores or rejects columns it does not recognise, so this data would not upload. Category item-specific columns (C:Brand) and variation columns are not modelled by this tool.");
    }
    if (h === "") add("warning", "blank-header", 1, `Column ${i + 1} has no name`, "An unnamed column is ignored. Often a stray trailing comma.");
  });
  const actionHeader = header.find((h) => LOWER.get(canonHeader(h)) === "Action");
  if (idx.Action === undefined) add("error", "missing-column", 1, "There is no Action column", "Every File Exchange row starts with an Action column such as *Action(SiteID=US|Country=US|Currency=USD|Version=1193).");
  else if (!/\(.*SiteID=.*\)/i.test(actionHeader)) add("warning", "action-header", 1, "The Action header has no SiteID clause", "File Exchange templates name the site, country, currency and version inside the Action header, like *Action(SiteID=US|Country=US|Currency=USD|Version=1193). Without it eBay may not know which site to list on.");
  if (idx.Title === undefined) add("warning", "missing-column", 1, "There is no Title column", "Add and Revise rows need a Title unless you are only changing price or quantity.");
  if (idx.Action === undefined && idx.Title === undefined) return { findings, summary };

  const g = (r, name) => (idx[name] === undefined ? "" : (r.cells[idx[name]] ?? ""));
  const data = [];
  let blank = 0;
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    summary.rows++;
    if (r.cells.every((c) => c.trim() === "")) { blank++; continue; }
    if (r.cells.length > header.length) add("error", "extra-cells", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "An unquoted comma inside a title or description pushed the following cells one column to the right.");
    else if (r.cells.length < header.length) add("warning", "short-row", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "Missing trailing cells are read as blank. Check that no cell was lost.");
    data.push(r);
  }
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");

  const labels = new Map(), titles = new Map();
  for (const r of data) {
    const s = g(r, "CustomLabel").trim(); if (s) { if (!labels.has(s)) labels.set(s, []); labels.get(s).push(r.line); }
    const t = g(r, "Title").trim().toLowerCase(); if (t) { if (!titles.has(t)) titles.set(t, []); titles.get(t).push(r.line); }
  }

  for (const r of data) {
    const L = r.line;
    const title = g(r, "Title"), label = g(r, "CustomLabel");
    const act = g(r, "Action").trim();
    const actLower = act.toLowerCase();
    const display = title.trim() ? `"${title.trim().length > 30 ? title.trim().slice(0, 30) + "…" : title.trim()}"` : label.trim() ? `SKU ${label.trim()}` : "this row";
    summary.listings++;

    const known = ACTIONS.find((a) => a.toLowerCase() === actLower);
    if (idx.Action !== undefined) {
      if (!act) add("error", "action-blank", L, "Row has no Action", "Every row needs an action: Add, Revise, End, Relist or VerifyAdd (from memory).");
      else if (!known) add("error", "action", L, `Action "${act}" is not one this tool knows`, `Use one of ${ACTIONS.slice(0, 5).join(", ")} (from memory).`);
      else if (known !== act && known === ACTIONS.find((a) => a.toLowerCase() === actLower)) add("warning", "action-case", L, `Action "${act}" is not capitalised like the template`, `Use ${known}.`);
    }
    const adding = ["add", "verifyadd", "relist"].includes(actLower);
    const ending = actLower === "end";
    const itemId = g(r, "ItemID").trim();

    if (itemId) {
      if (SCI.test(itemId)) add("error", "sci-itemid", L, `ItemID "${itemId}" is in scientific notation`, "Excel turned a 12-digit item number into scientific notation and the original digits are gone. Re-copy the ItemIDs with the column formatted as Text.");
      else if (!/^\d{9,14}$/.test(itemId)) add("warning", "itemid", L, `ItemID "${itemId}" is not 9 to 14 digits`, "eBay item numbers are about twelve digits.");
    } else if (["revise", "end", "reviseinventorystatus"].includes(actLower) && !label.trim()) {
      add("error", "itemid-blank", L, `${display} is a ${known || act} with no ItemID or CustomLabel`, "eBay cannot tell which listing to change without an ItemID (or a CustomLabel matched to an active listing).");
    }

    if (label.trim()) {
      if (label.length > LIMITS.customLabel) add("error", "label-length", L, `CustomLabel is ${label.length} characters`, `A custom label (SKU) is limited to ${LIMITS.customLabel} characters (from memory).`);
      if (label !== label.trim()) add("warning", "label-space", L, `CustomLabel "${label}" has leading or trailing spaces`, "eBay keeps the spaces, so this becomes a different SKU from the one in your inventory.");
      if (SCI.test(label.trim())) add("error", "sci-label", L, `CustomLabel "${label.trim()}" is in scientific notation`, "Excel rewrote a long numeric SKU and the original digits are gone. Format the column as Text and re-enter it.");
      const same = labels.get(label.trim());
      if (same && same.length > 1 && same[0] !== L && adding) add("warning", "dup-label", L, `CustomLabel "${label.trim()}" repeats line ${same[0]}`, "Two Add rows with one SKU create duplicate listings, or conflict if you use SKUs to revise later.");
    }

    if (!ending && adding) {
      if (idx.Title !== undefined && !title.trim()) add("error", "title-blank", L, `${display} has no Title`, "An Add row needs a title.");
      if (idx.Category !== undefined && !g(r, "Category").trim()) add("error", "category-blank", L, `${display} has no Category`, "An Add row needs a numeric eBay category ID.");
    }
    if (title.trim()) {
      const len = [...title].length;
      if (len > LIMITS.title) add("error", "title-length", L, `Title is ${len} characters`, `eBay titles are limited to ${LIMITS.title} characters; eBay rejects or truncates the rest.`);
      if (title !== title.trim()) add("warning", "title-space", L, `Title has leading or trailing spaces`, "Trailing spaces count toward the limit and show in search.");
      if (isShouting(title)) add("warning", "title-caps", L, `Title is all capitals: ${display}`, "All-caps titles read as spam and waste the characters that carry keywords.");
      if (/[!]{2,}|\${2,}|\*{3,}/.test(title)) add("warning", "title-punct", L, `Title has repeated punctuation`, "Repeated !, $ or * characters take title space and are discouraged by eBay's title rules.");
      const dup = titles.get(title.trim().toLowerCase());
      if (dup && dup.length > 1 && dup[0] !== L && adding) add("info", "dup-title", L, `Title repeats line ${dup[0]}`, "Identical titles are allowed but compete with each other in search. Consider a variation listing.");
    }
    const sub = g(r, "Subtitle");
    if (sub && [...sub].length > LIMITS.subtitle) add("error", "subtitle-length", L, `Subtitle is ${[...sub].length} characters`, `Limited to ${LIMITS.subtitle} characters (from memory).`);

    const cond = g(r, "ConditionID").trim();
    if (idx.ConditionID !== undefined) {
      if (!cond) { if (adding) add("warning", "condition-blank", L, `${display} has no ConditionID`, "Most categories require a condition. 1000 is New, 3000 is Used (from memory)."); }
      else if (SCI.test(cond) || !/^\d+$/.test(cond)) add("error", "condition", L, `ConditionID "${cond}" is not a number`, "Use the numeric ID, such as 1000 for New or 3000 for Used, not the word.");
      else if (!CONDITION_IDS.includes(cond)) add("warning", "condition", L, `ConditionID "${cond}" is not one this tool knows`, "IDs read from memory: 1000 New, 1500 New other, 1750 New with defects, 2000 to 2030 refurbished, 2500 seller refurbished, 2750 Like New, 3000 Used, 4000 Very Good, 5000 Good, 6000 Acceptable, 7000 For parts. Which IDs a category accepts varies.");
    }
    if (USED_IDS.includes(cond) && !g(r, "ConditionDescription").trim() && adding) add("info", "condition-desc", L, `${display} is not new and has no ConditionDescription`, "A short note about wear or defects reduces returns and 'not as described' cases.");

    const fmt = g(r, "Format").trim();
    let auction = false;
    if (idx.Format !== undefined && fmt) {
      const m = FORMATS.find((f) => f.toLowerCase() === fmt.toLowerCase());
      if (!m) add("error", "format", L, `Format "${fmt}" is not FixedPrice or Auction`, "Use FixedPrice or Auction (from memory).");
      else { auction = m === "Auction"; if (m !== fmt) add("warning", "format-case", L, `Format "${fmt}" is not capitalised like the template`, `Use ${m}.`); }
    } else if (idx.Format !== undefined && adding) add("error", "format-blank", L, `${display} has no Format`, "Use FixedPrice or Auction.");

    const sp = g(r, "StartPrice").trim();
    if (idx.StartPrice !== undefined) {
      if (!sp) { if (adding) add("error", "price-blank", L, `${display} has no StartPrice`, "An Add row needs a price."); }
      else if (!isNum(sp)) { const c = cleanPrice(sp); add("error", "price-format", L, `StartPrice "${sp}" is not a plain number`, isNum(c) ? `eBay wants digits and a decimal point only. Use ${c}.` : "eBay wants digits and a decimal point only, with no currency symbol, thousands separator or text."); }
      else if (Number(sp) <= 0) add("error", "price-zero", L, `StartPrice ${sp} is not above zero`, "A price of zero is rejected.");
      else if (Number(sp) < 0.99 && adding) add("warning", "price-low", L, `StartPrice ${sp} is below 0.99`, "Most sites have a minimum price near 0.99 for fixed price listings (from memory).");
    }
    const bin = g(r, "BuyItNowPrice").trim();
    if (bin && !isNum(bin)) add("error", "price-format", L, `BuyItNowPrice "${bin}" is not a plain number`, "Digits and a decimal point only.");
    if (auction && isNum(bin) && isNum(sp) && Number(bin) <= Number(sp)) add("warning", "bin-under-start", L, `BuyItNowPrice ${bin} is not above StartPrice ${sp}`, "Buy It Now on an auction must be higher than the starting price (it is typically at least 30% higher; from memory).");

    const q = g(r, "Quantity").trim();
    if (idx.Quantity !== undefined) {
      if (!q) { if (adding) add("error", "quantity-blank", L, `${display} has no Quantity`, "An Add row needs a quantity."); }
      else if (!/^\d+$/.test(q)) add("error", "quantity", L, `Quantity "${q}" is not a whole number`, /^-\d+$/.test(q) ? "A negative quantity is rejected. Use End to close a listing." : /^\d+\.\d+$/.test(q) ? "Quantities are whole units." : "Use digits only.");
      else if (auction && Number(q) > 1) add("warning", "auction-quantity", L, `Auction has Quantity ${q}`, "Auctions list one item. Multi-quantity listings are fixed price.");
      else if (Number(q) === 0 && adding) add("warning", "quantity-zero", L, `${display} is added with Quantity 0`, "A listing added with no stock is created out of stock or rejected.");
    }

    const dur = g(r, "Duration").trim();
    if (dur) {
      const ok = auction ? AUCTION_DURATIONS : [...AUCTION_DURATIONS, ...FIXED_DURATIONS];
      if (!ok.some((d) => d.toLowerCase() === dur.toLowerCase())) add("error", "duration", L, `Duration "${dur}" is not valid for ${auction ? "an auction" : "this listing"}`, auction ? `Auctions use ${AUCTION_DURATIONS.join(", ")}.` : `Fixed price listings use GTC, and auctions use ${AUCTION_DURATIONS.join(", ")}.`);
      else if (auction && /^gtc$/i.test(dur)) add("error", "duration", L, "An auction cannot be Good 'Til Cancelled", `Auctions use ${AUCTION_DURATIONS.join(", ")}.`);
    } else if (adding && idx.Duration !== undefined) add("warning", "duration-blank", L, `${display} has no Duration`, "Use GTC for fixed price listings.");

    const desc = g(r, "Description");
    if (/<\s*script\b|javascript:|<\s*iframe\b|<\s*form\b|\bon(click|load|error|mouseover)\s*=/i.test(desc)) add("error", "active-content", L, "Description contains active content", "eBay does not allow JavaScript, iframes, forms or event handlers in a listing description; the listing is removed or the active parts are stripped.");
    if (/https?:\/\/(?!(?:[^"'\s>]*\.)?ebay\.)[^\s"'<>]+/i.test(desc) && /<\s*a\s[^>]*href/i.test(desc)) add("warning", "external-link", L, "Description links to another site", "eBay's linking policy forbids links that take buyers off eBay to sell; links to your own eBay pages are fine.");
    if (desc.length > LIMITS.description) add("error", "desc-length", L, `Description is ${desc.length} characters`, `Limited to ${LIMITS.description} characters (from memory).`);

    const pics = g(r, "PicURL").trim();
    if (idx.PicURL !== undefined) {
      if (!pics) { if (adding) add("warning", "pic-blank", L, `${display} has no PicURL`, "Listings without photos sell poorly and some categories require one."); }
      else {
        const list = pics.split("|").map((p) => p.trim()).filter(Boolean);
        if (list.length > LIMITS.pictures) add("error", "pic-count", L, `${list.length} picture URLs`, `eBay allows up to ${LIMITS.pictures} photos per listing (from memory).`);
        if (pics.includes(",") && !pics.includes("|") && /https?:\/\/.*,\s*https?:\/\//i.test(pics)) add("error", "pic-separator", L, "Picture URLs are separated by commas", "Separate multiple PicURL values with a pipe (|), not a comma.");
        for (const p of list) {
          if (/^http:\/\//i.test(p)) add("warning", "pic-http", L, `Picture URL "${p.slice(0, 40)}" is http, not https`, "eBay requires picture URLs it can fetch over https; plain http images are rejected or dropped.");
          else if (!/^https:\/\//i.test(p)) add("error", "pic-url", L, `Picture URL "${p.slice(0, 40)}" is not a web address`, "A PicURL must start with https://. A file path on your computer cannot be uploaded this way.");
          else if (/\s/.test(p)) add("error", "pic-space", L, "A picture URL contains a space", "Encode spaces as %20.");
        }
        if (new Set(list).size !== list.length) add("info", "pic-dup", L, "The same picture URL appears twice", "Duplicate photos waste a slot.");
      }
    }

    const upc = g(r, "UPC").trim(), ean = g(r, "EAN").trim();
    if (upc && !/^(does not apply|n\/a)$/i.test(upc)) {
      if (SCI.test(upc)) add("error", "sci-upc", L, `UPC "${upc}" is in scientific notation`, "Excel turned a UPC into scientific notation and the original digits are gone. Re-enter it with the column formatted as Text.");
      else {
        const pad = paddedUpc(upc);
        if (pad) add("error", "upc-short", L, `UPC "${upc}" has 11 digits`, `Excel dropped the leading zero. ${pad} passes the check digit. Use "Apply safe fixes".`);
        else if (!/^\d{12}$/.test(upc)) add("error", "upc", L, `UPC "${upc}" is not 12 digits`, "A UPC is exactly 12 digits. If the item has none, use Does not apply.");
        else if (!gtinValid(upc)) add("error", "upc-check", L, `UPC "${upc}" fails its check digit`, "The last digit of a UPC is a checksum, and this one does not match the other eleven. One digit is probably wrong.");
      }
    }
    if (ean && !/^(does not apply|n\/a)$/i.test(ean)) {
      if (SCI.test(ean)) add("error", "sci-ean", L, `EAN "${ean}" is in scientific notation`, "Excel turned an EAN into scientific notation and the original digits are gone.");
      else if (!/^\d{13}$/.test(ean)) add("error", "ean", L, `EAN "${ean}" is not 13 digits`, "An EAN is exactly 13 digits.");
      else if (!gtinValid(ean)) add("error", "ean-check", L, `EAN "${ean}" fails its check digit`, "The last digit of an EAN is a checksum, and this one does not match the other twelve.");
    }
    summary.groups.push({ handle: label.trim() || (itemId || ""), line: L, title: title.trim(), variants: sp });
  }
  findings.sort((a, b) => (SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)) || (a.line - b.line));
  return { findings, summary };
}

// Safe fixes only: things with exactly one reasonable reading. Never edits a title's words, a description, a
// category, a picture URL, or any digit beyond a check-digit-verified UPC leading zero.
export function repair(input) {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const changes = [];
  if (!text.trim()) return { text: "", changes, error: "The file is empty." };
  const delim = detectDelim(text);
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) return { text: "", changes, error: `A quote opened on line ${parsed.unterminated} is never closed; fix that first.` };
  const rows = parsed.rows.map((r) => r.cells.slice());
  if (delim !== ",") changes.push(`Converted the ${delimName(delim)} delimiter to commas.`);
  const head = rows[0].map((h) => h.trim());
  const col = (n) => head.findIndex((h) => LOWER.get(canonHeader(h)) === n);
  const edit = (ri, ci, to, why) => {
    const from = rows[ri][ci];
    if (from === to) return;
    rows[ri][ci] = to;
    changes.push(`Line ${parsed.rows[ri].line}, ${head[ci]}: "${from}" → "${to}" (${why}).`);
  };
  const c = Object.fromEntries(["Action", "Title", "CustomLabel", "ItemID", "StartPrice", "BuyItNowPrice", "Quantity", "Format", "UPC"].map((n) => [n, col(n)]));
  const has = (r, n) => c[n] >= 0 && r[c[n]] !== undefined;
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    if (r.every((x) => x.trim() === "")) continue;
    for (const n of ["Title", "CustomLabel", "ItemID", "UPC"]) if (has(r, n) && r[c[n]] !== r[c[n]].trim()) edit(ri, c[n], r[c[n]].trim(), "stray spaces");
    if (has(r, "UPC")) { const pad = paddedUpc(r[c.UPC].trim()); if (pad) edit(ri, c.UPC, pad, "leading zero restored, check digit verified"); }
    for (const n of ["StartPrice", "BuyItNowPrice"]) if (has(r, n)) { const v = r[c[n]].trim(); if (v && !isNum(v)) { const p = cleanPrice(v); if (isNum(p)) edit(ri, c[n], p, "plain number"); } }
    if (has(r, "Quantity") && /^\d+\.0+$/.test(r[c.Quantity].trim())) edit(ri, c.Quantity, r[c.Quantity].trim().replace(/\.0+$/, ""), "whole number");
    if (has(r, "Action")) { const m = ACTIONS.find((x) => x.toLowerCase() === r[c.Action].trim().toLowerCase()); if (m) edit(ri, c.Action, m, "template capitalisation"); }
    if (has(r, "Format")) { const m = FORMATS.find((x) => x.toLowerCase() === r[c.Format].trim().toLowerCase()); if (m) edit(ri, c.Format, m, "template capitalisation"); }
  }
  return { text: toCsv(rows, ","), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])], ",");
}

const COLS = ["*Action(SiteID=US|Country=US|Currency=USD|Version=1193)", "*Category", "*Title", "*ConditionID", "PicURL", "*Quantity", "*Format", "*StartPrice", "*Duration", "CustomLabel", "UPC"];
const build = (rows) => toCsv([COLS, ...rows]);

export function sampleFile() {
  return build([
    ["Add", "26395", "Soy Candle 8 oz Amber and Sandalwood Hand Poured", "1000", "https://example.com/img/can-8-amb-1.jpg|https://example.com/img/can-8-amb-2.jpg", "40", "FixedPrice", "18.00", "GTC", "CAN-8-AMB", "012345678905"],
    ["Add", "26395", "Linen Tea Towel Set of 2 Natural Oatmeal 18x28 in", "1000", "https://example.com/img/tow-2-lin-1.jpg", "25", "FixedPrice", "26.50", "GTC", "TOW-2-LIN", "Does not apply"],
    ["Add", "26395", "Brass Stick Candle Holder Pair 6 in Vintage Style", "3000", "https://example.com/img/stk-6-brs-1.jpg", "1", "Auction", "9.99", "Days_7", "STK-6-BRS", ""],
  ]);
}

export function sampleBrokenFile() {
  return build([
    ["add ", "26395", "SOY CANDLE 8 OZ AMBER AND SANDALWOOD HAND POURED!!!", "1000", "http://example.com/img/a.jpg,https://example.com/img/b.jpg", "40", "fixedprice", "$18.00", "GTC", "CAN-8-AMB ", "12345678905"],
    ["Add", "26395", "Linen Tea Towel Set of 2 Natural Oatmeal 18x28 in with Free Shipping Fast Dispatch Gift Idea for Home and Kitchen", "Used", "C:\\photos\\towel.jpg", "-3", "FixedPrice", "26,50", "GTC", "1.23457E+12", "012345678906"],
    ["Add", "", "Brass Stick Candle Holder Pair", "99", "", "2.5", "Auction", "0", "GTC", "STK-6-BRS", "0123456789"],
    ["Cancel", "26395", "Brass Stick Candle Holder Pair", "3000", "https://example.com/img/c.jpg", "1", "Auction", "9.99", "Days_8", "STK-6-BRS", ""],
  ]);
}
