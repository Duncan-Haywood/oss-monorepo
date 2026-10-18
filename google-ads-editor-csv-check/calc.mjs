// Google Ads Editor import CSV checker (campaigns, ad groups, keywords, responsive search ads).
// Pure functions, no DOM, no network. Column names, limits and values are read from memory of Google's
// public Google Ads Editor documentation; no Editor import was available when this was built, so every
// rule is stated as "from memory".

export const SEVERITIES = ["error", "warning", "info"];
export const LIMITS = { headline: 30, description: 90, path: 15, campaign: 128, adGroup: 255, keyword: 80, keywordWords: 10, url: 2048, headlines: 15, descriptions: 4, minHeadlines: 3, minDescriptions: 2 };
export const COLUMNS = ["Campaign", "Ad group", "Keyword", "Criterion Type", "Max CPC", "Final URL", "Status", "Campaign Daily Budget", "Campaign Type", "Bid Strategy Type", "Path 1", "Path 2", "Labels", "Tracking template", "Final URL suffix", "Ad type"]
  .concat(Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`), Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`));
export const CRITERION_TYPES = ["Broad", "Phrase", "Exact", "Negative Broad", "Negative Phrase", "Negative Exact", "Campaign Negative Broad", "Campaign Negative Phrase", "Campaign Negative Exact"];
export const STATUSES = ["Enabled", "Paused", "Removed"];

export function canonHeader(h) {
  return String(h).trim().replace(/[_\-\s.]+/g, "").toLowerCase();
}
const LOWER = new Map(COLUMNS.map((c) => [canonHeader(c), c]));
// Headers people paste from a report instead of an Editor export.
const ALIASES = new Map([["adgroupname", "Ad group"], ["campaignname", "Campaign"], ["keywordtext", "Keyword"], ["matchtype", "Criterion Type"], ["finalurls", "Final URL"], ["finalurl", "Final URL"], ["maxcpc", "Max CPC"], ["cpcbid", "Max CPC"], ["budget", "Campaign Daily Budget"], ["dailybudget", "Campaign Daily Budget"]]);
const resolve = (h) => LOWER.get(canonHeader(h)) || ALIASES.get(canonHeader(h)) || null;

const SCI = /^\d(\.\d+)?e\+?\d+$/i;
const isNum = (v) => /^\d+(\.\d+)?$/.test(v);

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
  for (const c of COLUMNS) {
    const d = distance(n, canonHeader(c));
    if (d < bestD) { bestD = d; best = c; }
  }
  return bestD <= Math.max(2, Math.floor(n.length / 4)) ? best : null;
}

// Google counts full-width (CJK, Hangul, kana) characters as two toward ad text limits.
export function adWidth(s) {
  let w = 0;
  for (const ch of String(s)) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(ch) ? 2 : 1;
  return w;
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
const isShouting = (t) => letters(t).length >= 8 && letters(t) === letters(t).toUpperCase();
const KW_BAD = /[!@%^()={};~`<>?\\|]/;

// "[red shoes]" -> Exact, "\"red shoes\"" -> Phrase; used to compare the typed brackets with the Criterion Type.
export function keywordShape(kw) {
  const t = kw.trim();
  if (/^\[.*\]$/.test(t)) return { text: t.slice(1, -1).trim(), type: "Exact" };
  if (/^".*"$/.test(t)) return { text: t.slice(1, -1).trim(), type: "Phrase" };
  return { text: t, type: null };
}
const matchBase = (t) => t.replace(/^(Campaign )?Negative /, "");

export function validate(input) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const summary = { rows: 0, listings: 0, columns: 0, delimiter: ",", groups: [], keywords: 0, ads: 0 };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose an export from Google Ads Editor."); return { findings, summary }; }

  if (text.includes("\u0000")) add("error", "utf16", 0, "The file looks like UTF-16 text", "NUL characters mean the file was saved as Excel's \"Unicode Text\". Editor exports UTF-16 tab-separated files by default, and Excel's CSV does not. Use the file chooser on this page, which reads UTF-16, or save as CSV UTF-8.");
  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding and read as UTF-8. Accented ad text will import damaged.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before importing.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim === ";") add("warning", "delimiter", 1, "The file is semicolon-separated", "European Excel saves semicolons. Editor's importer reads comma or tab separated text; a semicolon file is read as one column. Use \"Apply safe fixes\" below.");

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell. A headline containing a quote mark is the usual cause.`);
    return { findings, summary };
  }
  const rows = parsed.rows;
  const header = rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  const idx = {};
  header.forEach((h, i) => {
    const fixed = resolve(h);
    if (fixed) {
      if (idx[fixed] !== undefined) add("error", "dup-header", 1, `Column "${fixed}" appears twice`, `Columns ${idx[fixed] + 1} and ${i + 1} both map to "${fixed}". Delete one.`);
      else {
        idx[fixed] = i;
        if (h !== fixed && !LOWER.has(canonHeader(h))) add("warning", "report-header", 1, `Column "${h}" is a report name, not an Editor column`, `Editor's import expects "${fixed}". This tool read it as "${fixed}", but Editor may ignore it.`);
      }
    } else if (h !== "") {
      const near = closestColumn(h);
      add("warning", "unknown-header", 1, `Unknown column "${h}"`, near ? `Did you mean "${near}"? Editor ignores columns it does not recognise, so this data would not import.` : "Editor ignores columns it does not recognise, so this data would not import. Columns this tool does not model (location, schedule, audience, extensions) are not checked.");
    } else add("warning", "blank-header", 1, `Column ${i + 1} has no name`, "An unnamed column is ignored. Often a stray trailing comma.");
  });
  if (idx.Campaign === undefined) add("error", "missing-column", 1, "There is no Campaign column", "Every Editor row belongs to a campaign, so the Campaign column is required.");
  if (idx.Campaign === undefined) return { findings, summary };

  const hCols = Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`).filter((c) => idx[c] !== undefined);
  const dCols = Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`).filter((c) => idx[c] !== undefined);
  const g = (r, name) => (idx[name] === undefined ? "" : (r.cells[idx[name]] ?? ""));
  const data = [];
  let blank = 0;
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    summary.rows++;
    if (r.cells.every((c) => c.trim() === "")) { blank++; continue; }
    if (r.cells.length > header.length) add("error", "extra-cells", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "An unquoted comma inside a headline or description pushed the following cells one column to the right.");
    else if (r.cells.length < header.length) add("warning", "short-row", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "Missing trailing cells are read as blank. Check that no cell was lost.");
    data.push(r);
  }
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");

  const seenKw = new Map();
  const campaigns = new Set(), adGroups = new Set();
  for (const r of data) {
    const L = r.line;
    const camp = g(r, "Campaign"), grp = g(r, "Ad group"), kw = g(r, "Keyword");
    const hasAd = hCols.some((c) => g(r, c).trim()) || dCols.some((c) => g(r, c).trim());
    const type = g(r, "Criterion Type").trim();
    const display = kw.trim() ? `keyword "${kw.trim()}"` : hasAd ? `ad in ${grp.trim() || camp.trim() || "this row"}` : camp.trim() ? `campaign "${camp.trim()}"` : "this row";
    summary.listings++;

    if (!camp.trim()) add("error", "campaign-blank", L, `${display} has no Campaign`, "Every row needs the campaign it belongs to, including keyword and ad rows.");
    else {
      if (camp !== camp.trim()) add("warning", "campaign-space", L, `Campaign "${camp}" has leading or trailing spaces`, "Editor treats \"Spring Sale\" and \"Spring Sale \" as the same name on import but the spaces break matching against an account you already have.");
      if ([...camp].length > LIMITS.campaign) add("error", "campaign-length", L, `Campaign name is ${[...camp].length} characters`, `A campaign name is limited to ${LIMITS.campaign} characters (from memory).`);
      campaigns.add(camp.trim());
    }
    if (grp.trim()) {
      if ([...grp].length > LIMITS.adGroup) add("error", "adgroup-length", L, `Ad group name is ${[...grp].length} characters`, `An ad group name is limited to ${LIMITS.adGroup} characters (from memory).`);
      adGroups.add(`${camp.trim()}\u0000${grp.trim()}`);
    }
    if ((kw.trim() || hasAd) && idx["Ad group"] !== undefined && !grp.trim() && !/^campaign /i.test(type)) add("error", "adgroup-blank", L, `${display} has no Ad group`, "Keywords and ads live in an ad group. Only campaign-level negative keywords can leave it blank.");
    if ((kw.trim() || hasAd) && idx["Ad group"] === undefined) add("error", "missing-column", L, `${display} but there is no Ad group column`, "Add an Ad group column so Editor knows where the row belongs.");

    const status = g(r, "Status").trim();
    if (status && !STATUSES.some((s) => s.toLowerCase() === status.toLowerCase())) add("error", "status", L, `Status "${status}" is not valid`, `Use ${STATUSES.join(", ")} (from memory).`);
    else if (status && !STATUSES.includes(status)) add("warning", "status-case", L, `Status "${status}" is not capitalised like Editor's export`, `Use ${STATUSES.find((s) => s.toLowerCase() === status.toLowerCase())}.`);

    const bud = g(r, "Campaign Daily Budget").trim();
    if (bud) {
      const clean = bud.replace(/^[$€£]\s*/, "").replace(/,(?=\d{3}\b)/g, "");
      if (SCI.test(bud) || !isNum(clean)) add("error", "budget", L, `Campaign Daily Budget "${bud}" is not a number`, "Use digits and a decimal point only, in the account's currency, with no symbol or text.");
      else if (!isNum(bud)) add("warning", "budget-format", L, `Campaign Daily Budget "${bud}" has a currency symbol or thousands separator`, `Use ${clean}.`);
      else if (Number(bud) <= 0) add("error", "budget", L, "Campaign Daily Budget is not above zero", "A zero budget is rejected or leaves the campaign unable to serve.");
    }
    const cpc = g(r, "Max CPC").trim();
    if (cpc) {
      const clean = cpc.replace(/^[$€£]\s*/, "");
      if (SCI.test(cpc) || !isNum(clean)) add("error", "cpc", L, `Max CPC "${cpc}" is not a number`, "Use digits and a decimal point only, in the account's currency.");
      else if (!isNum(cpc)) add("warning", "cpc-format", L, `Max CPC "${cpc}" has a currency symbol`, `Use ${clean}.`);
      else if (Number(cpc) === 0) add("warning", "cpc-zero", L, "Max CPC is 0", "A zero bid means the keyword will not serve.");
    }

    if (kw.trim()) {
      summary.keywords++;
      const shape = keywordShape(kw);
      const words = shape.text.split(/\s+/).filter(Boolean).length;
      if (idx["Criterion Type"] !== undefined) {
        if (!type) add("error", "criterion-blank", L, `${display} has no Criterion Type`, "Set Broad, Phrase, Exact, Negative Broad, Negative Phrase or Negative Exact so Editor knows the match type.");
        else {
          const m = CRITERION_TYPES.find((t) => t.toLowerCase() === type.toLowerCase());
          if (!m) add("error", "criterion", L, `Criterion Type "${type}" is not one this tool knows`, `Use one of ${CRITERION_TYPES.slice(0, 6).join(", ")} (from memory).`);
          else if (m !== type) add("warning", "criterion-case", L, `Criterion Type "${type}" is not capitalised like Editor's export`, `Use ${m}.`);
        }
        const base = matchBase(CRITERION_TYPES.find((t) => t.toLowerCase() === type.toLowerCase()) || "");
        if (shape.type && base && base !== shape.type) add("warning", "match-mismatch", L, `${display} is typed as ${shape.type} but its Criterion Type is ${type}`, "Brackets or quotes in the Keyword cell are not used to set the match type here; the Criterion Type column decides, and the brackets can end up as part of the keyword text.");
        if (shape.type && base === shape.type) add("info", "match-brackets", L, `${display} still has its ${shape.type === "Exact" ? "brackets" : "quote marks"}`, "When Criterion Type is set, remove the brackets or quotes from the Keyword cell.");
      }
      const k = shape.text;
      if (SCI.test(k)) add("error", "sci-keyword", L, `Keyword "${k}" is in scientific notation`, "Excel rewrote a numeric keyword and the original digits are gone. Format the column as Text.");
      if (KW_BAD.test(k)) add("error", "keyword-symbol", L, `Keyword "${k}" contains a symbol Google rejects`, "Keywords cannot contain ! @ % ^ ( ) = { } ; ~ ` < > ? \\ | (from memory), apart from a leading minus on a negative.");
      if (/^\+|\s\+/.test(k)) add("warning", "bmm", L, `Keyword "${k}" uses broad match modifier plus signs`, "Broad match modifier was retired in 2021; plus signs are read as broad match or rejected. Use Phrase for the old behaviour.");
      if ([...k].length > LIMITS.keyword) add("error", "keyword-length", L, `Keyword is ${[...k].length} characters`, `Limited to ${LIMITS.keyword} characters (from memory).`);
      if (words > LIMITS.keywordWords) add("error", "keyword-words", L, `Keyword is ${words} words`, `Limited to ${LIMITS.keywordWords} words (from memory).`);
      if (k !== k.trim() || kw !== kw.trim()) add("warning", "keyword-space", L, `Keyword "${kw}" has leading or trailing spaces`, "Spaces inside the cell are trimmed by Editor but cause duplicate-looking keywords in your sheet.");
      const mt = (CRITERION_TYPES.find((t) => t.toLowerCase() === type.toLowerCase()) || type || "").toLowerCase();
      const key = `${camp.trim().toLowerCase()}\u0000${grp.trim().toLowerCase()}\u0000${mt}\u0000${k.toLowerCase().replace(/\s+/g, " ")}`;
      if (seenKw.has(key)) add("warning", "dup-keyword", L, `Keyword "${k}" repeats line ${seenKw.get(key)}`, "The same keyword and match type twice in one ad group is imported once and wastes the row.");
      else seenKw.set(key, L);
      if (hasAd) add("warning", "mixed-row", L, "Row has both a keyword and ad text", "Editor expects a keyword and an ad on separate rows. Both on one row imports one and silently drops the other.");
      if (/^negative|^campaign negative/i.test(type) && cpc) add("info", "negative-cpc", L, `Negative keyword has a Max CPC`, "Negative keywords have no bid; the value is ignored.");
    } else if (/negative/i.test(type)) add("error", "negative-blank", L, "Negative Criterion Type with no Keyword", "A negative row needs the keyword text.");

    const furl = g(r, "Final URL").trim();
    if (furl) {
      if (SCI.test(furl)) add("error", "url", L, "Final URL is in scientific notation", "Excel damaged the cell.");
      else if (!/^https?:\/\//i.test(furl)) add("error", "url", L, `Final URL "${furl.slice(0, 40)}" does not start with http:// or https://`, "A final URL must be a full web address. A bare domain or a file path is rejected.");
      else if (/\s/.test(furl)) add("error", "url-space", L, "Final URL contains a space", "Encode spaces as %20 or remove them.");
      else if (furl.length > LIMITS.url) add("error", "url-length", L, `Final URL is ${furl.length} characters`, `Limited to ${LIMITS.url} characters (from memory).`);
      else if (/^http:\/\//i.test(furl)) add("warning", "url-http", L, "Final URL is http, not https", "Google may disapprove ads that lead to a page with no secure connection and most sites redirect anyway; use https.");
      if (/[?&]utm_[a-z]+=\{?[^&]*$/i.test(furl) && /\{/.test(furl) && !/\}/.test(furl)) add("warning", "url-valuetrack", L, "A ValueTrack parameter in the Final URL is missing its closing brace", "A {param} that is never closed is sent literally.");
    }

    if (hasAd) {
      summary.ads++;
      if (!furl) add("error", "url-blank", L, `${display} has no Final URL`, "An ad needs a final URL.");
      const hs = hCols.map((c) => ({ c, v: g(r, c) })).filter((x) => x.v.trim());
      const ds = dCols.map((c) => ({ c, v: g(r, c) })).filter((x) => x.v.trim());
      if (hs.length < LIMITS.minHeadlines) add("error", "headline-count", L, `${display} has ${hs.length} headline${hs.length === 1 ? "" : "s"}`, `A responsive search ad needs at least ${LIMITS.minHeadlines} headlines (from memory), and up to ${LIMITS.headlines}. Fewer than ${LIMITS.minHeadlines} is not imported as a complete ad.`);
      if (ds.length < LIMITS.minDescriptions) add("error", "description-count", L, `${display} has ${ds.length} description${ds.length === 1 ? "" : "s"}`, `A responsive search ad needs at least ${LIMITS.minDescriptions} descriptions (from memory), and up to ${LIMITS.descriptions}.`);
      const seen = new Map();
      for (const { c, v } of hs) {
        const w = adWidth(v);
        if (w > LIMITS.headline) add("error", "headline-length", L, `${c} is ${w} characters`, `A headline is limited to ${LIMITS.headline} characters (full-width characters count double): "${v.trim().slice(0, 40)}${v.trim().length > 40 ? "…" : ""}".`);
        if (/!/.test(v)) add("error", "headline-bang", L, `${c} contains an exclamation mark`, "Headlines cannot contain exclamation marks (from memory); the ad is disapproved or the headline dropped.");
        if (isShouting(v)) add("warning", "headline-caps", L, `${c} is all capitals`, "Gimmicky capitalisation is a policy violation and is often disapproved.");
        if (/(.)\1{3,}/.test(v) || /[?.,;:]{2,}/.test(v)) add("warning", "headline-punct", L, `${c} has repeated characters or punctuation`, "Repeated punctuation is a gimmicky-format violation.");
        if (v !== v.trim()) add("warning", "headline-space", L, `${c} has leading or trailing spaces`, "Trailing spaces count toward the limit in some imports.");
        const k = v.trim().toLowerCase();
        if (seen.has(k)) add("error", "headline-dup", L, `${c} repeats ${seen.get(k)}`, "Two identical headlines in one responsive search ad are rejected.");
        else seen.set(k, c);
      }
      const seenD = new Map();
      for (const { c, v } of ds) {
        const w = adWidth(v);
        if (w > LIMITS.description) add("error", "description-length", L, `${c} is ${w} characters`, `A description is limited to ${LIMITS.description} characters (full-width characters count double): "${v.trim().slice(0, 40)}${v.trim().length > 40 ? "…" : ""}".`);
        if ((v.match(/!/g) || []).length > 1) add("warning", "description-bang", L, `${c} has more than one exclamation mark`, "One exclamation mark is allowed in a description (from memory); more is a policy violation.");
        if (isShouting(v)) add("warning", "description-caps", L, `${c} is all capitals`, "Gimmicky capitalisation is a policy violation and is often disapproved.");
        const k = v.trim().toLowerCase();
        if (seenD.has(k)) add("error", "description-dup", L, `${c} repeats ${seenD.get(k)}`, "Identical descriptions are rejected.");
        else seenD.set(k, c);
      }
      for (const p of ["Path 1", "Path 2"]) {
        const v = g(r, p).trim();
        if (v && adWidth(v) > LIMITS.path) add("error", "path-length", L, `${p} is ${adWidth(v)} characters`, `A display path is limited to ${LIMITS.path} characters (from memory).`);
        if (v && /[\s/?#]/.test(v)) add("warning", "path-chars", L, `${p} contains a space, slash or question mark`, "Display paths are plain words; use a hyphen or underscore instead of a space.");
      }
      if (g(r, "Path 2").trim() && !g(r, "Path 1").trim()) add("error", "path-order", L, "Path 2 is filled but Path 1 is blank", "Path 2 can only be used when Path 1 is set.");
    }
    summary.groups.push({ handle: grp.trim() || camp.trim(), line: L, title: kw.trim() || (hasAd ? "responsive search ad" : "campaign row"), variants: type || (hasAd ? "ad" : "") });
  }
  if (!summary.keywords && !summary.ads && data.length) add("info", "no-content", 0, "No keywords or ads found", "The file has campaign rows but no Keyword or headline/description cells. That is fine for a budget or bid-only import.");
  findings.sort((a, b) => (SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)) || (a.line - b.line));
  return { findings, summary };
}

// Safe fixes only: things with exactly one reasonable reading. Never edits a keyword's words, a headline, a
// description, a URL's content, or a budget beyond removing a currency symbol or thousands separator.
export function repair(input) {
  let text = String(input ?? "");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const changes = [];
  if (!text.trim()) return { text: "", changes, error: "The file is empty." };
  const delim = detectDelim(text);
  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) return { text: "", changes, error: `A quote opened on line ${parsed.unterminated} is never closed; fix that first.` };
  const rows = parsed.rows.map((r) => r.cells.slice());
  if (delim === ";") changes.push("Converted the semicolon delimiter to commas.");
  else if (delim === "\t") changes.push("Converted the tab delimiter to commas.");
  const head = rows[0].map((h) => h.trim());
  const col = (n) => head.findIndex((h) => resolve(h) === n);
  const edit = (ri, ci, to, why) => {
    const from = rows[ri][ci];
    if (from === to) return;
    rows[ri][ci] = to;
    changes.push(`Line ${parsed.rows[ri].line}, ${head[ci]}: "${from}" → "${to}" (${why}).`);
  };
  const c = Object.fromEntries(["Campaign", "Ad group", "Keyword", "Criterion Type", "Status", "Campaign Daily Budget", "Max CPC"].map((n) => [n, col(n)]));
  const has = (r, n) => c[n] >= 0 && r[c[n]] !== undefined;
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    if (r.every((x) => x.trim() === "")) continue;
    for (const n of ["Campaign", "Ad group", "Keyword"]) if (has(r, n) && r[c[n]] !== r[c[n]].trim()) edit(ri, c[n], r[c[n]].trim(), "stray spaces");
    if (has(r, "Criterion Type")) { const m = CRITERION_TYPES.find((x) => x.toLowerCase() === r[c["Criterion Type"]].trim().toLowerCase()); if (m) edit(ri, c["Criterion Type"], m, "Editor capitalisation"); }
    if (has(r, "Status")) { const m = STATUSES.find((x) => x.toLowerCase() === r[c.Status].trim().toLowerCase()); if (m) edit(ri, c.Status, m, "Editor capitalisation"); }
    for (const n of ["Campaign Daily Budget", "Max CPC"]) if (has(r, n)) {
      const v = r[c[n]].trim();
      const clean = v.replace(/^[$€£]\s*/, "").replace(/,(?=\d{3}\b)/g, "");
      if (v && !isNum(v) && isNum(clean)) edit(ri, c[n], clean, "plain number");
    }
    // Brackets or quotes that duplicate the Criterion Type are removed; a mismatch is left for the owner to decide.
    if (has(r, "Keyword") && has(r, "Criterion Type")) {
      const sh = keywordShape(r[c.Keyword]);
      const base = matchBase(CRITERION_TYPES.find((x) => x.toLowerCase() === r[c["Criterion Type"]].trim().toLowerCase()) || "");
      if (sh.type && base === sh.type) edit(ri, c.Keyword, sh.text, "brackets or quotes already set by Criterion Type");
    }
  }
  return { text: toCsv(rows, ","), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])], ",");
}

const COLS = ["Campaign", "Ad group", "Keyword", "Criterion Type", "Max CPC", "Final URL", "Campaign Daily Budget", "Status", "Headline 1", "Headline 2", "Headline 3", "Description 1", "Description 2", "Path 1"];
const build = (rows) => toCsv([COLS, ...rows.map((r) => COLS.map((_, i) => r[i] ?? ""))]);

export function sampleFile() {
  return build([
    ["Spring Boiler Service", "", "", "", "", "", "25.00", "Enabled"],
    ["Spring Boiler Service", "Boiler Service", "boiler service near me", "Phrase", "2.40", "", "", "Enabled"],
    ["Spring Boiler Service", "Boiler Service", "annual boiler servicing", "Exact", "3.10", "", "", "Enabled"],
    ["Spring Boiler Service", "Boiler Service", "free boiler", "Negative Phrase", "", "", "", "Enabled"],
    ["Spring Boiler Service", "Boiler Service", "", "", "", "https://example.com/boiler-service", "", "Enabled", "Gas Safe Boiler Service", "Fixed Price From £69", "Book Online in 2 Minutes", "Annual service by a Gas Safe engineer. Same-week appointments across the county.", "Fixed price, no call-out fee. Certificate included with every service.", "boiler-service"],
  ]);
}

export function sampleBrokenFile() {
  return build([
    ["Spring Boiler Service ", "", "", "", "", "", "£25.00", "enabled"],
    ["Spring Boiler Service", "Boiler Service", "[boiler service near me]", "Exact", "$2.40", "", "", "Enabled"],
    ["Spring Boiler Service", "Boiler Service", "boiler service near me", "Phrase", "2.40", "", "", "Enabled"],
    ["Spring Boiler Service", "Boiler Service", "boiler service near me", "Phrase", "2.40", "", "", "Enabled"],
    ["Spring Boiler Service", "Boiler Service", "+cheap +boiler +service (offer)", "Broad", "0", "", "", "Enabled"],
    ["Spring Boiler Service", "", "boiler repair", "Fuzzy", "2.0", "", "", "Live"],
    ["Spring Boiler Service", "Boiler Service", "", "", "", "example.com/boiler-service", "", "Enabled", "BEST BOILER SERVICE IN THE COUNTY NOW!!!", "Fixed Price From £69", "Fixed Price From £69", "Annual service by a Gas Safe engineer. Same-week appointments across the whole county, with a certificate, no call-out fee, and a free safety check included. Book today!!", "", "boiler service/spring"],
  ]);
}
