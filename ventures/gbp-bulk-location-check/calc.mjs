// Google Business Profile bulk-location spreadsheet checker.
// Pure functions, no DOM, no network. Column names, limits and formats are read from memory of Google's
// public bulk-upload help pages; no Google upload was available when this was built, so every rule is
// stated as "from memory". Google may change the template at any time.

export const SEVERITIES = ["error", "warning", "info"];
export const LIMITS = { storeCode: 64, name: 100, addressLine: 80, fromBusiness: 750, labels: 10, label: 50, additionalPhones: 2, additionalCategories: 9, rows: 10000 };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const HOURS_COLUMNS = DAYS.map((d) => `${d} hours`);
// Photo columns: any header containing "photo" is accepted; these are the ones named in the template.
export const PHOTO_COLUMNS = ["Logo photo", "Cover photo", "Other photos"];
export const COLUMNS = [
  "Store code", "Business name", "Address line 1", "Address line 2", "Address line 3", "Address line 4", "Address line 5",
  "Sub-locality", "Locality", "Administrative area", "Country/Region", "Postal code", "Primary phone", "Additional phones",
  "Website", "Primary category", "Additional categories", ...HOURS_COLUMNS, "Special hours", "From the business",
  "Opening date", "Labels", ...PHOTO_COLUMNS, "Latitude", "Longitude",
];
// Missing these is an error; missing these is a warning; everything else is information.
export const REQUIRED = ["Store code", "Business name", "Address line 1", "Country/Region", "Primary category"];
export const EXPECTED = ["Locality", "Administrative area", "Postal code", "Primary phone", "Website", ...HOURS_COLUMNS];

export function canonHeader(h) {
  return String(h).trim().replace(/^\*+/, "").replace(/[^A-Za-z0-9]+/g, "").toLowerCase();
}
const LOWER = new Map(COLUMNS.map((c) => [canonHeader(c), c]));
// Common near-miss header names and what they probably meant.
const NEAR = {
  storeid: "Store code", id: "Store code", locationcode: "Store code", storenumber: "Store code", code: "Store code",
  name: "Business name", businessname: "Business name", locationname: "Business name", title: "Business name",
  address: "Address line 1", address1: "Address line 1", addressline: "Address line 1", street: "Address line 1", streetaddress: "Address line 1",
  address2: "Address line 2", address3: "Address line 3", address4: "Address line 4", address5: "Address line 5",
  city: "Locality", town: "Locality", sublocality: "Sub-locality", neighborhood: "Sub-locality", neighbourhood: "Sub-locality",
  state: "Administrative area", province: "Administrative area", region: "Administrative area", adminarea: "Administrative area", county: "Administrative area",
  country: "Country/Region", countrycode: "Country/Region", countryregion: "Country/Region",
  zip: "Postal code", zipcode: "Postal code", postcode: "Postal code", postalcode: "Postal code",
  phone: "Primary phone", telephone: "Primary phone", phonenumber: "Primary phone", primaryphonenumber: "Primary phone",
  additionalphone: "Additional phones", otherphones: "Additional phones", website: "Website", url: "Website", web: "Website", websiteurl: "Website",
  category: "Primary category", primarycategories: "Primary category", categories: "Additional categories", additionalcategory: "Additional categories",
  specialhour: "Special hours", holidayhours: "Special hours", description: "From the business", frombusiness: "From the business", businessdescription: "From the business",
  openingdate: "Opening date", opendate: "Opening date", label: "Labels", lat: "Latitude", lng: "Longitude", lon: "Longitude", long: "Longitude",
  logo: "Logo photo", logophotos: "Logo photo", cover: "Cover photo", coverphotos: "Cover photo", photos: "Other photos", otherphoto: "Other photos",
};
for (const d of DAYS) { NEAR[d.toLowerCase()] = `${d} hours`; NEAR[`${d.toLowerCase()}hour`] = `${d} hours`; NEAR[d.slice(0, 3).toLowerCase()] = `${d} hours`; }

const ISO = ("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ " +
  "DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM " +
  "PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ " +
  "UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW").split(" ");
export const COUNTRY_CODES = new Set(ISO);
const COUNTRY_NAMES = {
  "united states": "US", "united states of america": "US", usa: "US", america: "US", "united kingdom": "GB", uk: "GB", "great britain": "GB", england: "GB", scotland: "GB", wales: "GB",
  canada: "CA", australia: "AU", germany: "DE", france: "FR", spain: "ES", italy: "IT", netherlands: "NL", ireland: "IE", mexico: "MX", brazil: "BR", india: "IN", japan: "JP",
  "new zealand": "NZ", switzerland: "CH", austria: "AT", belgium: "BE", sweden: "SE", poland: "PL", portugal: "PT", norway: "NO", denmark: "DK", singapore: "SG", "south africa": "ZA",
};

export const US_STATES = new Set(("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY " +
  "AS GU MP PR VI UM AA AE AP").split(" "));
const STATE_NAMES = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "puerto rico": "PR",
};
// First three ZIP digits (as numbers) that each state's ZIP codes with a leading 0 fall in.
const ZERO_ZIP = { MA: [[10, 27], [55, 55]], RI: [[28, 29]], NH: [[30, 38]], ME: [[39, 49]], VT: [[50, 59]], CT: [[60, 69]], NJ: [[70, 89]], PR: [[6, 9]], VI: [[8, 8]], NY: [[5, 5]] };

const POSTAL = {
  US: /^\d{5}(-\d{4})?$/, CA: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/, GB: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/, DE: /^\d{5}$/, FR: /^\d{5}$/, ES: /^\d{5}$/, IT: /^\d{5}$/,
  AU: /^\d{4}$/, NZ: /^\d{4}$/, NL: /^\d{4}\s?[A-Za-z]{2}$/, BE: /^\d{4}$/, CH: /^\d{4}$/, AT: /^\d{4}$/, SE: /^\d{3}\s?\d{2}$/, PL: /^\d{2}-\d{3}$/, MX: /^\d{5}$/,
  BR: /^\d{5}-?\d{3}$/, IN: /^\d{6}$/, JP: /^\d{3}-?\d{4}$/, PT: /^\d{4}-\d{3}$/, DK: /^\d{4}$/, NO: /^\d{4}$/,
};
const POSTAL_HINT = { US: "5 digits, or ZIP+4 like 02134-1234", CA: "A1A 1A1", GB: "like SW1A 1AA", DE: "5 digits", FR: "5 digits", ES: "5 digits", IT: "5 digits", AU: "4 digits", NZ: "4 digits", NL: "1234 AB", BE: "4 digits", CH: "4 digits", AT: "4 digits", SE: "123 45", PL: "12-345", MX: "5 digits", BR: "12345-678", IN: "6 digits", JP: "123-4567", PT: "1234-567", DK: "4 digits", NO: "4 digits" };

const SCI = /^[+-]?\d(\.\d+)?e[+-]?\d+$/i;
const EXCEL_ERR = /^#(NAME\?|REF!|VALUE!|N\/A|DIV\/0!|NUM!|NULL!)$/i;

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
const isShouting = (t, n = 6) => letters(t).length >= n && letters(t) === letters(t).toUpperCase();

export function validDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// ---- hours ----------------------------------------------------------------------------------------------
const ONE_RANGE = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;
const CLOSED = /^(x|closed)$/i;
const OPEN24 = /^(24 ?h(ours?)?|open 24 hours|24\/7)$/i;

// Separator tidy-up only: dash variants, " to ", spaces around the dash, ";" between shifts.
export function normalizeHours(cell) {
  let s = String(cell).trim();
  if (!s) return s;
  s = s.replace(/[‐-―−]/g, "-").replace(/\s+to\s+/gi, "-").replace(/\s*-\s*/g, "-").replace(/\s*[;&]\s*/g, ", ").replace(/\s*,\s*/g, ", ").replace(/\s{2,}/g, " ");
  return s;
}

const toMin = (h, m) => Number(h) * 60 + Number(m);
const to24 = (h, m, ap) => { let x = Number(h) % 12; if (/^p/i.test(ap)) x += 12; return `${String(x).padStart(2, "0")}:${m || "00"}`; };

// Returns { kind, shifts, problems:[{code,msg}] } for an already-normalised cell.
export function parseHours(cell) {
  const s = String(cell).trim();
  const out = { kind: "blank", shifts: [], problems: [] };
  if (!s) return out;
  if (CLOSED.test(s)) return { ...out, kind: "closed" };
  if (OPEN24.test(s)) return { ...out, kind: "24h" };
  out.kind = "shifts";
  const parts = s.split(",").map((p) => p.trim());
  for (const p of parts) {
    if (CLOSED.test(p) || OPEN24.test(p)) { out.problems.push({ code: "hours-mixed", msg: `"${p}" cannot be combined with other shifts in one cell` }); continue; }
    const ap = p.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i);
    if (ap) { out.problems.push({ code: "hours-12h", msg: `"${p}" is 12-hour; use ${to24(ap[1], ap[2], ap[3])}-${to24(ap[4], ap[5], ap[6])}` }); continue; }
    const m = p.match(ONE_RANGE);
    if (!m) { out.problems.push({ code: "hours-format", msg: `"${p}" is not HH:MM-HH:MM` }); continue; }
    const [, h1, m1, h2, m2] = m;
    if (Number(h1) > 23 || Number(m1) > 59 || Number(m2) > 59 || Number(h2) > 24 || (Number(h2) === 24 && Number(m2) !== 0)) { out.problems.push({ code: "hours-range", msg: `"${p}" has an hour or minute out of range (hours 0-23, 24:00 only as a closing time)` }); continue; }
    const a = toMin(h1, m1), b = toMin(h2, m2);
    if (a === b) { out.problems.push({ code: "hours-zero", msg: `"${p}" opens and closes at the same time; use "24 hours" for round-the-clock` }); continue; }
    if (b < a && b !== 0) { out.problems.push({ code: "hours-overnight", warn: true, msg: `"${p}" closes after midnight; confirm the template accepts a shift that crosses it` }); out.shifts.push([a, b + 1440]); continue; }
    out.shifts.push([a, b === 0 ? 1440 : b]);
  }
  const sorted = [...out.shifts].sort((x, y) => x[0] - y[0]);
  for (let i = 1; i < sorted.length; i++) if (sorted[i][0] < sorted[i - 1][1]) { out.problems.push({ code: "hours-overlap", msg: "two shifts in the same cell overlap" }); break; }
  return out;
}

// ---- phones ---------------------------------------------------------------------------------------------
const stripPhone = (v) => v.replace(/\s*(ext\.?|x)\s*\d+$/i, "").replace(/[\s().-]/g, "");
export function checkPhone(v, country) {
  const s = v.trim();
  if (SCI.test(s)) return { code: "sci-phone", severity: "error", title: `Phone "${s}" is in scientific notation`, detail: "Excel rewrote a long number and the original digits are gone. Re-enter it with the column formatted as Text." };
  if (/^\d+\.0+$/.test(s)) return { code: "phone-float", severity: "warning", title: `Phone "${s}" has a trailing .0`, detail: "A spreadsheet stored the number as a decimal. Use Apply safe fixes to drop it." };
  if (/[A-Za-z]/.test(s.replace(/\s*(ext\.?|x)\s*\d+$/i, ""))) return { code: "phone-chars", severity: "error", title: `Phone "${s}" contains letters`, detail: "Use digits, spaces, hyphens, parentheses and a leading +. Put an extension after \"ext\" or \"x\"." };
  if (!/^\+?[\d\s().-]+(\s*(ext\.?|x)\s*\d+)?$/i.test(s)) return { code: "phone-chars", severity: "error", title: `Phone "${s}" has unexpected characters`, detail: "Use digits, spaces, hyphens, parentheses and a leading +." };
  const core = stripPhone(s), plus = core.startsWith("+"), digits = core.replace(/\D/g, "");
  if (plus) {
    if (digits.length < 8 || digits.length > 15) return { code: "phone-length", severity: "error", title: `Phone "${s}" has ${digits.length} digits`, detail: "E.164 numbers have 8 to 15 digits including the country code." };
    if (country === "US" || country === "CA") {
      if (!digits.startsWith("1") || digits.length !== 11) return { code: "phone-country", severity: "warning", title: `Phone "${s}" does not look like a ${country} number`, detail: "A +1 number has 11 digits in all. Check the country code and that the row's country is right." };
    }
    return null;
  }
  if (country === "US" || country === "CA") {
    const nat = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    if (nat.length !== 10) return { code: "phone-length", severity: "error", title: `Phone "${s}" has ${digits.length} digits`, detail: `A ${country} number is 10 digits (area code and seven digits), or 11 with a leading 1.` };
    if (/^[01]/.test(nat)) return { code: "phone-area", severity: "warning", title: `Phone "${s}" has an area code starting 0 or 1`, detail: "North American area codes start with 2 to 9." };
    return null;
  }
  if (digits.length < 6 || digits.length > 15) return { code: "phone-length", severity: "error", title: `Phone "${s}" has ${digits.length} digits`, detail: "A phone number has between 6 and 15 digits." };
  if (country === "GB" && digits.length === 10 && !digits.startsWith("0")) return { code: "phone-zero", severity: "warning", title: `Phone "${s}" may have lost its leading 0`, detail: "UK national numbers have 11 digits starting 0. A spreadsheet removes that zero from a number column." };
  if (country === "FR" && digits.length === 9) return { code: "phone-zero", severity: "warning", title: `Phone "${s}" may have lost its leading 0`, detail: "French national numbers have 10 digits starting 0." };
  return null;
}

// ---- ZIP leading zero -----------------------------------------------------------------------------------
// Pads a US ZIP that lost its leading zeros, only when the row's state is one whose ZIPs start that way
// and the first three digits fall in that state's range. Returns null when it cannot be proven.
export function paddedZip(zip, state) {
  const z = String(zip).trim().replace(/^(\d+)\.0+$/, "$1");
  const st = String(state).trim().toUpperCase();
  const ranges = ZERO_ZIP[st];
  if (!ranges) return null;
  let padded = null;
  if (/^\d{4}$/.test(z)) padded = "0" + z;
  else if (/^\d{4}-\d{4}$/.test(z)) padded = "0" + z;
  else if (/^\d{3}$/.test(z) && (st === "PR" || st === "VI")) padded = "00" + z;
  if (!padded) return null;
  const prefix = Number(padded.slice(0, 3));
  return ranges.some(([lo, hi]) => prefix >= lo && prefix <= hi) ? padded : null;
}

// ---- URLs -----------------------------------------------------------------------------------------------
export function checkUrl(v) {
  const s = v.trim();
  if (/\s/.test(s)) return { code: "url-space", severity: "error", detail: "contains a space; encode it as %20" };
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(s)) return { code: "url-email", severity: "error", detail: "looks like an email address, not a web address" };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return { code: "url-scheme", severity: "error", detail: "has no https:// in front" };
  let u;
  try { u = new URL(s); } catch { return { code: "url-invalid", severity: "error", detail: "is not a valid web address" }; }
  if (!/^https?:$/.test(u.protocol)) return { code: "url-protocol", severity: "error", detail: `uses ${u.protocol} instead of https` };
  if (!u.hostname.includes(".") || /^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(u.hostname)) return { code: "url-host", severity: "warning", detail: "points at a local or numeric address that visitors cannot reach" };
  if (u.protocol === "http:") return { code: "url-http", severity: "warning", detail: "uses http; use https so browsers do not warn visitors" };
  return null;
}

const ABBR = [[/\bstreet\b/g, "st"], [/\bavenue\b/g, "ave"], [/\broad\b/g, "rd"], [/\bboulevard\b/g, "blvd"], [/\bdrive\b/g, "dr"], [/\bsuite\b/g, "ste"], [/\blane\b/g, "ln"], [/\bhighway\b/g, "hwy"]];
const normAddr = (s) => ABBR.reduce((t, [re, to]) => t.replace(re, to), s.toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim());

function nameFlags(name, locality) {
  const f = [];
  if (/https?:\/\/|www\.|\.com\b/i.test(name)) f.push("a web address");
  if (/\d{3}[\s.-]?\d{3,4}[\s.-]?\d{4}/.test(name)) f.push("a phone number");
  if (/\bnear me\b|\bopen now\b|\bopen 24\b|\b24\/7\b|#\s?1\b|\bbest\b|\bcheap(est)?\b|\blowest price\b/i.test(name)) f.push("a promotional phrase such as \"best\", \"cheap\" or \"near me\"");
  if (/[|•·]|[\u{1F300}-\u{1FAFF}☀-➿]/u.test(name)) f.push("separators or emoji");
  if ((name.match(/,/g) || []).length >= 2 || (name.match(/ - /g) || []).length >= 2) f.push("a list of services or places");
  const words = name.toLowerCase().match(/[a-z']{3,}/g) || [];
  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
  if ([...counts.entries()].some(([w, n]) => n >= 3 && !["the", "and"].includes(w))) f.push("a word repeated three times");
  if (/[!?]{2,}|\${2,}/.test(name)) f.push("repeated punctuation");
  return f;
}

export function validate(input) {
  const findings = [];
  const add = (severity, code, line, title, detail) => findings.push({ severity, code, line, title, detail });
  let text = String(input ?? "");
  let hadBom = false;
  if (text.charCodeAt(0) === 0xfeff) { text = text.slice(1); hadBom = true; }
  const summary = { rows: 0, locations: 0, columns: 0, delimiter: ",", groups: [] };
  if (!text.trim()) { add("error", "empty", 0, "The file is empty", "Paste or choose a bulk-location file."); return { findings, summary }; }

  if (text.includes("\u0000")) add("error", "utf16", 0, "The file looks like UTF-16 text", "NUL characters mean the file was saved as Excel's \"Unicode Text\". Save it as \"CSV UTF-8\" or tab-separated text, or use the file chooser on this page, which reads UTF-16.");
  if (text.includes("�")) add("warning", "encoding", 0, "The file contains replacement characters", "Characters such as � mean the file was saved in a legacy encoding and read as UTF-8. Business names with accents will be wrong. Re-save as UTF-8.");
  if (/Ã[\u0080-¿]|â€[™œ"˜]/.test(text)) add("warning", "mojibake", 0, "Text looks double-encoded", "Sequences like Ã© or â€™ usually mean UTF-8 was saved as Windows-1252 and re-read. Fix the encoding before upload.");
  if (hadBom) add("info", "bom", 0, "The file starts with a UTF-8 byte-order mark", "Excel adds it to \"CSV UTF-8\". It is read past here and removed by Apply safe fixes; most importers accept it.");

  const delim = detectDelim(text);
  summary.delimiter = delim;
  if (delim === ";" || delim === "|") add("error", "delimiter", 1, `The file is ${delimName(delim)}-separated`, `The bulk upload reads comma-separated (CSV) or tab-separated files. A ${delimName(delim)}-separated file is read as one column; European Excel saves semicolons. Use Apply safe fixes to convert it.`);
  else if (delim === "\t") add("info", "delimiter", 1, "The file is tab-separated", "Tab-separated text is accepted by the bulk upload from memory of the help page, as is CSV.");

  const parsed = parseCsv(text, delim);
  if (parsed.unterminated) {
    add("error", "quote", parsed.unterminated, "A quoted cell is never closed", `A cell opened with a double quote on line ${parsed.unterminated} has no closing quote, so everything after it is read as one cell. Look for a stray quote in a business name or description.`);
    return { findings, summary };
  }
  const rows = parsed.rows;
  const header = rows[0].cells.map((h) => h.trim());
  summary.columns = header.length;
  const idx = {};
  const photoCols = [];
  header.forEach((h, i) => {
    const fixed = LOWER.get(canonHeader(h));
    if (fixed) {
      if (idx[fixed] !== undefined) add("error", "dup-header", 1, `Column "${fixed}" appears twice`, `Columns ${idx[fixed] + 1} and ${i + 1} are both "${fixed}". Delete the other.`);
      else idx[fixed] = i;
      if (PHOTO_COLUMNS.includes(fixed)) photoCols.push(i);
      if (h !== fixed) add("info", "header-case", 1, `Header "${h}" differs from the template name "${fixed}"`, "The upload matches headers by name; copy the template's spelling to be safe.");
    } else if (/photo/i.test(h)) {
      photoCols.push(i);
    } else if (h === "") {
      add("warning", "blank-header", 1, `Column ${i + 1} has no name`, "An unnamed column is ignored. Often a stray trailing delimiter.");
    } else {
      const near = closestColumn(h);
      add("warning", "unknown-header", 1, `Unknown column "${h}"`, near ? `Did you mean "${near}"? Columns the template does not know are ignored, so this data would not upload.` : "Columns the template does not know are ignored, so this data would not upload. Not in this tool's list; it may be a newer template column.");
    }
  });
  for (const c of COLUMNS) {
    if (idx[c] !== undefined || (PHOTO_COLUMNS.includes(c) && photoCols.length)) continue;
    if (REQUIRED.includes(c)) add("error", "missing-column", 1, `There is no "${c}" column`, `The bulk template has a "${c}" column and locations cannot be created or matched without it (from memory).`);
    else if (EXPECTED.includes(c)) add("warning", "missing-column", 1, `There is no "${c}" column`, "The template has this column; without it the information is not uploaded.");
  }
  const absentOptional = COLUMNS.filter((c) => idx[c] === undefined && !REQUIRED.includes(c) && !EXPECTED.includes(c) && !(PHOTO_COLUMNS.includes(c) && photoCols.length));
  if (absentOptional.length) add("info", "optional-columns", 1, `${absentOptional.length} optional template column${absentOptional.length === 1 ? " is" : "s are"} absent`, `Not in the file: ${absentOptional.join(", ")}. Fine if you are not setting them.`);
  if (idx["Store code"] === undefined && idx["Business name"] === undefined) return { findings, summary };

  const g = (r, name) => (idx[name] === undefined ? "" : (r.cells[idx[name]] ?? ""));
  const data = [];
  let blank = 0;
  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri];
    summary.rows++;
    if (r.cells.every((c) => c.trim() === "")) { blank++; continue; }
    if (r.cells.length > header.length) add("error", "extra-cells", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "An unquoted comma inside a name or address pushed the following cells right, so they land in the wrong columns. Quote the cell.");
    else if (r.cells.length < header.length) add("warning", "short-row", r.line, `Row has ${r.cells.length} cells but the header has ${header.length}`, "Missing trailing cells are read as blank. Check that nothing was lost.");
    data.push(r);
  }
  if (blank) add("info", "blank-rows", 0, `${blank} blank row${blank === 1 ? "" : "s"} skipped`, "Blank rows are harmless but usually mean a spreadsheet range was exported wider than the data.");
  if (data.length > LIMITS.rows) add("warning", "row-count", 0, `${data.length} locations in one file`, `Large files are best uploaded in batches; the bulk editor limit is read from memory as ${LIMITS.rows} locations.`);
  if (!data.length) add("error", "no-rows", 0, "There are no location rows under the header", "Add at least one location.");

  const codes = new Map(), addrs = new Map();
  for (const r of data) {
    const sc = g(r, "Store code").trim();
    if (sc) { if (!codes.has(sc)) codes.set(sc, []); codes.get(sc).push(r.line); }
    const l1 = g(r, "Address line 1").trim();
    if (l1) {
      const key = [1, 2, 3, 4, 5].map((n) => normAddr(g(r, `Address line ${n}`))).join("|") + "#" + g(r, "Locality").trim().toLowerCase() + "#" + g(r, "Postal code").replace(/\s/g, "").toLowerCase() + "#" + g(r, "Country/Region").trim().toUpperCase();
      if (!addrs.has(key)) addrs.set(key, []);
      addrs.get(key).push({ line: r.line, code: sc });
    }
  }
  const numericCodes = [...codes.keys()].filter((c) => /^\d+$/.test(c));
  const width = numericCodes.length >= 3 && numericCodes.length === codes.size ? Math.max(...numericCodes.map((c) => c.length)) : 0;
  const lowerCodes = new Map();
  for (const c of codes.keys()) { const k = c.toLowerCase(); lowerCodes.set(k, [...(lowerCodes.get(k) || []), c]); }

  for (const r of data) {
    const L = r.line;
    const sc = g(r, "Store code"), scT = sc.trim(), name = g(r, "Business name"), nameT = name.trim();
    const country = g(r, "Country/Region").trim().toUpperCase(), state = g(r, "Administrative area").trim(), locality = g(r, "Locality").trim();
    const display = nameT ? `"${nameT.length > 30 ? nameT.slice(0, 30) + "…" : nameT}"` : scT ? `store ${scT}` : "this row";
    summary.locations++;

    for (let ci = 0; ci < r.cells.length; ci++) {
      const c = r.cells[ci].trim();
      if (EXCEL_ERR.test(c)) { add("error", "excel-error", L, `${header[ci] || `Column ${ci + 1}`} contains ${c}`, "A spreadsheet formula failed and its error was saved into the file."); break; }
    }

    // Store code
    if (idx["Store code"] !== undefined) {
      if (!scT) add("warning", "store-blank", L, `${display} has no store code`, "Store codes identify a location across later bulk edits. Without one, Google has nothing stable to match it to (from memory).");
      else {
        if ([...scT].length > LIMITS.storeCode) add("error", "store-length", L, `Store code is ${[...scT].length} characters`, `A store code is limited to ${LIMITS.storeCode} characters (from memory).`);
        if (SCI.test(scT)) add("error", "sci-store", L, `Store code "${scT}" is in scientific notation`, "Excel rewrote a long numeric code and the original digits are gone. Format the column as Text and re-enter it.");
        else if (/^\d+\.0+$/.test(scT)) add("warning", "store-float", L, `Store code "${scT}" has a trailing .0`, "A spreadsheet stored the code as a decimal number. Use Apply safe fixes to drop it.");
        else if (/[^A-Za-z0-9_\-.]/.test(scT)) add("warning", "store-chars", L, `Store code "${scT}" has spaces or unusual characters`, "Stick to letters, digits, hyphens, underscores and periods; other characters have caused mismatches in later uploads (from memory).");
        if (sc !== scT) add("warning", "store-space", L, "Store code has leading or trailing spaces", "A code with a stray space is a different code from the one in your system. Use Apply safe fixes.");
        const same = codes.get(scT);
        if (same && same.length > 1 && same[0] !== L) add("error", "dup-store", L, `Store code "${scT}" repeats line ${same[0]}`, "Each location needs its own store code. Two rows with one code overwrite each other or are rejected.");
        else {
          const ci = lowerCodes.get(scT.toLowerCase());
          if (ci && ci.length > 1 && ci[0] === scT && !same?.slice(1).length) add("warning", "dup-store-case", L, `Store code "${scT}" differs only in capitals from "${ci.find((x) => x !== scT)}"`, "Codes may be compared without regard to case. Make them distinct.");
        }
        if (width && /^\d+$/.test(scT) && scT.length < width && !/^\d+\.0+$/.test(scT)) add("warning", "store-zero", L, `Store code "${scT}" is shorter than the other codes`, `Every code in the file is numeric and the longest has ${width} digits. If these were 0${scT}-style codes Excel removed the leading zeros. Restore them in your source.`);
      }
    }

    // Business name
    if (idx["Business name"] !== undefined) {
      if (!nameT) add("error", "name-blank", L, `Store ${scT || "(no code)"} has no business name`, "Every location needs a business name.");
      else {
        const len = [...nameT].length;
        if (len > LIMITS.name) add("error", "name-length", L, `Business name is ${len} characters`, `Business names are limited to ${LIMITS.name} characters (from memory).`);
        if (name !== nameT) add("warning", "name-space", L, "Business name has leading or trailing spaces", "Use Apply safe fixes to trim them.");
        if (isShouting(nameT)) add("warning", "name-caps", L, `Business name is all capitals: ${display}`, "Google's guidelines ask for the name as it appears on the storefront, and all capitals unless that is the real signage is a common reason for an edit to be reverted or suspended.");
        const flags = nameFlags(nameT, locality);
        if (flags.length) add("warning", "name-stuffing", L, `Business name may be keyword-stuffed: ${display}`, `It contains ${flags.join("; ")}. The name should be your real-world name; added keywords, places, prices or phone numbers are a common cause of a suspended profile. This is a heuristic, not a verdict.`);
        else if (locality.length >= 3 && nameT.toLowerCase().includes(locality.toLowerCase()) && nameT.split(/\s+/).length > 3) add("info", "name-locality", L, `Business name contains the town "${locality}"`, "Fine if it is part of the real name. If it was added for search, remove it.");
      }
    }

    // Address
    for (let n = 1; n <= 5; n++) {
      const v = g(r, `Address line ${n}`);
      if (v && [...v].length > LIMITS.addressLine) add("error", "address-length", L, `Address line ${n} is ${[...v].length} characters`, `An address line is limited to ${LIMITS.addressLine} characters (from memory).`);
    }
    if (idx["Address line 1"] !== undefined && !g(r, "Address line 1").trim()) add("warning", "address-blank", L, `${display} has no Address line 1`, "A storefront location needs a street address. Service-area businesses that hide their address are set up separately and are not covered here.");
    if (idx.Locality !== undefined && !locality && g(r, "Address line 1").trim()) add("warning", "locality-blank", L, `${display} has no Locality (town or city)`, "Add the town or city.");
    for (const n of [1, 2, 3, 4, 5]) { const v = g(r, `Address line ${n}`); if (v && v !== v.trim()) { add("warning", "address-space", L, "An address line has leading or trailing spaces", "Use Apply safe fixes to trim them."); break; } }

    // Country
    let knownCountry = "";
    if (idx["Country/Region"] !== undefined) {
      const raw = g(r, "Country/Region").trim();
      if (!raw) add("error", "country-blank", L, `${display} has no Country/Region`, "Use a two-letter ISO 3166 code such as US.");
      else if (/^[A-Za-z]{2}$/.test(raw) && COUNTRY_CODES.has(raw.toUpperCase())) { knownCountry = raw.toUpperCase(); if (raw !== knownCountry) add("warning", "country-case", L, `Country "${raw}" is not upper case`, `Use ${knownCountry}.`); }
      else {
        const guess = COUNTRY_NAMES[raw.toLowerCase()];
        add("error", "country", L, `Country/Region "${raw}" is not an ISO country code`, guess ? `Use the two-letter code ${guess}. ${raw.toLowerCase() === "uk" ? "UK is not an ISO code; the United Kingdom is GB." : ""}`.trim() : "Use a two-letter ISO 3166 code such as US, CA, GB or AU.");
      }
    }

    // Administrative area
    if (idx["Administrative area"] !== undefined) {
      if (knownCountry === "US") {
        if (!state) add("warning", "state-blank", L, `${display} has no state`, "Use the two-letter state abbreviation.");
        else if (!US_STATES.has(state.toUpperCase())) {
          const guess = STATE_NAMES[state.toLowerCase()];
          add("warning", "state", L, `State "${state}" is not a US state abbreviation`, guess ? `Use ${guess}.` : "Use a two-letter USPS abbreviation such as TX. A non-US region with country US is a mismatch.");
        } else if (state !== state.toUpperCase()) add("warning", "state-case", L, `State "${state}" is not upper case`, `Use ${state.toUpperCase()}.`);
      } else if (!state && knownCountry && ["CA", "AU", "BR", "MX", "IN"].includes(knownCountry)) add("info", "state-blank", L, `${display} has no administrative area`, "Add the province, state or territory.");
    }

    // Postal code
    if (idx["Postal code"] !== undefined) {
      const pcRaw = g(r, "Postal code"), pc = pcRaw.trim();
      if (!pc) { if (knownCountry && knownCountry !== "HK" && knownCountry !== "IE") add("warning", "postal-blank", L, `${display} has no postal code`, "Add the postal code; a match on the address is much less reliable without it."); }
      else if (SCI.test(pc)) add("error", "sci-postal", L, `Postal code "${pc}" is in scientific notation`, "Excel rewrote the code as a number. Format the column as Text and re-enter it.");
      else {
        const zip = knownCountry === "US" ? paddedZip(pc, state) : null;
        const clean = pc.replace(/^(\d+)\.0+$/, "$1");
        if (clean !== pc) add("warning", "postal-float", L, `Postal code "${pc}" has a trailing .0`, "A spreadsheet stored it as a decimal number. Use Apply safe fixes to drop it.");
        if (zip) add("error", "zip-zero", L, `ZIP "${pc}" lost its leading zero`, `Excel removes leading zeros from a number column. ${zip} falls in ${state.toUpperCase()}'s range. Use Apply safe fixes.`);
        else if (knownCountry && POSTAL[knownCountry] && !POSTAL[knownCountry].test(clean)) {
          const short = knownCountry === "US" && /^\d{3,4}$/.test(clean);
          add("error", "postal", L, `Postal code "${pc}" does not fit ${knownCountry}`, short ? `A US ZIP is 5 digits. This has ${clean.length}, which usually means a leading zero was lost, but the state ${state || "(blank)"} does not confirm it, so it is not changed. Check the address.` : `Expected ${POSTAL_HINT[knownCountry]}.`);
        } else if (pcRaw !== pc) add("warning", "postal-space", L, "Postal code has leading or trailing spaces", "Use Apply safe fixes to trim.");
      }
    }

    // Phones
    const pp = g(r, "Primary phone").trim();
    if (idx["Primary phone"] !== undefined) {
      if (!pp) add("warning", "phone-blank", L, `${display} has no primary phone`, "Add a phone number customers can reach.");
      else { const p = checkPhone(pp, knownCountry); if (p) add(p.severity, p.code, L, p.title, p.detail); }
    }
    const ap = g(r, "Additional phones").trim();
    if (ap) {
      const list = ap.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
      if (list.length > LIMITS.additionalPhones) add("warning", "phone-count", L, `${list.length} additional phones`, `The template allows up to ${LIMITS.additionalPhones} additional phone numbers (from memory).`);
      for (const v of list) { const p = checkPhone(v, knownCountry); if (p) add(p.severity, p.code, L, `Additional phone: ${p.title}`, p.detail); if (v === pp) add("info", "phone-dup", L, "An additional phone repeats the primary phone", "Remove the duplicate."); }
    }

    // Website
    if (idx.Website !== undefined) {
      const w = g(r, "Website").trim();
      if (!w) add("info", "website-blank", L, `${display} has no website`, "Optional, but a location page URL helps customers.");
      else { const u = checkUrl(w); if (u) add(u.severity, u.code, L, `Website "${w.length > 50 ? w.slice(0, 50) + "…" : w}" ${u.detail}`, u.code === "url-http" ? "Switch to https." : "Use a full address starting with https://."); }
    }

    // Categories
    if (idx["Primary category"] !== undefined && !g(r, "Primary category").trim()) add("error", "category-blank", L, `${display} has no primary category`, "Every location needs a primary category, using Google's exact category name (for example Plumber).");
    const addl = g(r, "Additional categories").split(",").map((x) => x.trim()).filter(Boolean);
    if (addl.length > LIMITS.additionalCategories) add("warning", "category-count", L, `${addl.length} additional categories`, `The template allows up to ${LIMITS.additionalCategories} additional categories (from memory).`);
    if (addl.some((x) => x.toLowerCase() === g(r, "Primary category").trim().toLowerCase() && x)) add("info", "category-dup", L, "The primary category is repeated in Additional categories", "Remove it from the additional list.");

    // Hours
    let anyHours = false;
    for (const d of HOURS_COLUMNS) {
      if (idx[d] === undefined) continue;
      const raw = g(r, d);
      if (!raw.trim()) continue;
      anyHours = true;
      const norm = normalizeHours(raw);
      const p = parseHours(norm);
      const bad = p.problems.filter((x) => !x.warn);
      if (bad.length) add("error", bad[0].code, L, `${d}: "${raw.trim()}" is not a valid hours entry`, `${bad.map((x) => x.msg).join("; ")}. Use 09:00-17:00 in 24-hour time, "x" or "closed" for a closed day, "24 hours", or split shifts like 09:00-12:00, 13:00-17:00 (from memory).`);
      else {
        for (const x of p.problems) add("warning", x.code, L, `${d}: ${x.msg}`, "Check this against your real opening hours.");
        if (norm !== raw.trim()) add("warning", "hours-separator", L, `${d}: "${raw.trim()}" uses non-standard separators`, `Written as ${norm}. Use Apply safe fixes.`);
      }
    }
    if (!anyHours && HOURS_COLUMNS.some((d) => idx[d] !== undefined)) add("info", "hours-none", L, `${display} has no opening hours`, "Hours are optional, but profiles without them rank and convert worse.");
    const sh = g(r, "Special hours").trim();
    if (sh) {
      const dates = [...sh.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)];
      if (!dates.length) add("warning", "special-format", L, "Special hours has no YYYY-MM-DD date", "Each special-hours entry starts with a date such as 2026-12-25 (from memory of the template). This tool only checks the dates, not the rest of the entry.");
      for (const m of dates) if (!validDate(+m[1], +m[2], +m[3])) add("error", "special-date", L, `Special hours date ${m[0]} does not exist`, "Check the month and day.");
    }

    // From the business
    const fb = g(r, "From the business");
    if (fb) {
      const n = [...fb].length;
      if (n > LIMITS.fromBusiness) add("error", "desc-length", L, `"From the business" is ${n} characters`, `The description is limited to ${LIMITS.fromBusiness} characters (from memory).`);
      if (/https?:\/\/|www\.|<\s*\/?\w+[^>]*>/i.test(fb)) add("warning", "desc-links", L, "\"From the business\" contains a link or HTML", "Descriptions are plain text and links are not allowed (from memory).");
      if (isShouting(fb, 20)) add("warning", "desc-caps", L, "\"From the business\" is all capitals", "Write it as ordinary sentences.");
    }

    // Opening date
    const od = g(r, "Opening date").trim();
    if (od) {
      const iso = od.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (iso) { if (!validDate(+iso[1], +iso[2], +iso[3])) add("error", "date", L, `Opening date "${od}" does not exist`, "Check the month and day."); else if (+iso[1] < 1800) add("warning", "date-old", L, `Opening date "${od}" is before 1800`, "Probably a typo."); }
      else if (/^\d{5}$/.test(od)) add("error", "date-serial", L, `Opening date "${od}" is an Excel date serial number`, "The cell was formatted as a number. Format it as Text and enter 2026-03-15 style dates.");
      else add("error", "date-format", L, `Opening date "${od}" is not YYYY-MM-DD`, "Use the year-month-day form, for example 2026-03-15 (from memory).");
    }

    // Labels
    const lab = g(r, "Labels").trim();
    if (lab) {
      const list = lab.split(",").map((x) => x.trim());
      if (list.some((x) => !x)) add("warning", "label-empty", L, "Labels has an empty entry", "A doubled or trailing comma creates a blank label.");
      const real = list.filter(Boolean);
      if (real.length > LIMITS.labels) add("error", "label-count", L, `${real.length} labels`, `A location can have at most ${LIMITS.labels} labels (from memory).`);
      for (const x of real) if ([...x].length > LIMITS.label) { add("error", "label-length", L, `Label "${x.slice(0, 20)}…" is ${[...x].length} characters`, `A label is limited to ${LIMITS.label} characters (from memory).`); break; }
      if (new Set(real.map((x) => x.toLowerCase())).size !== real.length) add("info", "label-dup", L, "A label appears twice", "Remove the duplicate.");
    }

    // Photos
    for (const ci of photoCols) {
      const v = (r.cells[ci] ?? "").trim();
      if (!v) continue;
      for (const u of v.split(/[,\s]+/).filter(Boolean)) {
        if (/^(file:|[A-Za-z]:\\|\/|~)/.test(u)) { add("error", "photo-local", L, `${header[ci]}: "${u.slice(0, 40)}" is a file on your computer`, "Photos must be web addresses Google can fetch. Upload the image somewhere public first."); break; }
        if (/^http:\/\//i.test(u)) { add("warning", "photo-http", L, `${header[ci]}: "${u.slice(0, 40)}" is http, not https`, "Use https."); break; }
        if (!/^https:\/\//i.test(u)) { add("error", "photo-url", L, `${header[ci]}: "${u.slice(0, 40)}" is not a web address`, "A photo cell holds https:// addresses separated by commas."); break; }
      }
    }

    // Lat / long
    const lat = g(r, "Latitude").trim(), lon = g(r, "Longitude").trim();
    if (lat || lon) {
      const pn = (s) => /^[+-]?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
      if (!lat || !lon) add("error", "latlong-partial", L, "Only one of Latitude and Longitude is filled", "Give both or neither.");
      else if (/^[+-]?\d+,\d+$/.test(lat) || /^[+-]?\d+,\d+$/.test(lon)) add("error", "latlong-comma", L, `Coordinates "${lat}", "${lon}" use a decimal comma`, "Use a decimal point, as in 40.7128.");
      else if (SCI.test(lat) || SCI.test(lon) || Number.isNaN(pn(lat)) || Number.isNaN(pn(lon))) add("error", "latlong-format", L, `Coordinates "${lat}", "${lon}" are not decimal degrees`, "Use plain decimal numbers such as 40.7128 and -74.0060.");
      else {
        const a = pn(lat), b = pn(lon);
        if (Math.abs(a) > 90 && Math.abs(b) <= 90) add("error", "latlong-swapped", L, `Latitude ${lat} is out of range; Longitude ${lon} would fit`, "Latitude and longitude look swapped.");
        else if (Math.abs(a) > 90) add("error", "latitude", L, `Latitude ${lat} is outside -90 to 90`, "Latitude runs from -90 to 90.");
        else if (Math.abs(b) > 180) add("error", "longitude", L, `Longitude ${lon} is outside -180 to 180`, "Longitude runs from -180 to 180.");
        else if (a === 0 && b === 0) add("warning", "latlong-zero", L, "Latitude and Longitude are both 0", "That is a point in the Atlantic Ocean; usually a blank that a spreadsheet filled with zero.");
        else if (knownCountry === "US" && b > 0 && b < 180 && a > 0) add("warning", "latlong-sign", L, `Longitude ${lon} is positive for a US location`, "US longitudes are negative. A dropped minus sign puts the pin in Asia.");
      }
    }

    summary.groups.push({ handle: scT, line: L, title: nameT, variants: [locality, state].filter(Boolean).join(", ") });
  }

  for (const list of addrs.values()) {
    const distinct = new Set(list.map((x) => x.code));
    if (list.length > 1 && distinct.size > 1) {
      const first = list[0];
      for (const x of list.slice(1)) if (x.code !== first.code) add("warning", "dup-address", x.line, `Same address as line ${first.line} under a different store code`, `Store codes "${first.code}" and "${x.code}" share one address. Google treats two profiles at one address as duplicates unless they are different businesses or practitioners.`);
    }
  }
  findings.sort((a, b) => (SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)) || (a.line - b.line));
  return { findings, summary };
}

// Safe fixes only: things with exactly one reasonable reading. Never edits a business name's words, an address,
// a category, a phone number's digits, or any ZIP unless the row's state confirms the leading zero.
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
    for (const n of ["Store code", "Business name", "Address line 1", "Address line 2", "Address line 3", "Address line 4", "Address line 5", "Sub-locality", "Locality", "Administrative area", "Country/Region", "Postal code", "Primary phone", "Additional phones", "Website", "Primary category", "Additional categories", "Opening date"]) {
      if (has(r, n) && r[c[n]] !== r[c[n]].trim()) edit(ri, c[n], r[c[n]].trim(), "stray spaces");
    }
    for (const n of ["Store code", "Primary phone"]) if (has(r, n) && /^\d+\.0+$/.test(r[c[n]])) edit(ri, c[n], r[c[n]].replace(/\.0+$/, ""), "trailing .0 removed");
    if (has(r, "Postal code") && /^\d+\.0+$/.test(r[c["Postal code"]])) edit(ri, c["Postal code"], r[c["Postal code"]].replace(/\.0+$/, ""), "trailing .0 removed");
    if (has(r, "Postal code") && has(r, "Country/Region") && r[c["Country/Region"]].trim().toUpperCase() === "US") {
      const z = paddedZip(r[c["Postal code"]], has(r, "Administrative area") ? r[c["Administrative area"]] : "");
      if (z) edit(ri, c["Postal code"], z, `leading zero restored, ${r[c["Administrative area"]].trim().toUpperCase()} confirms it`);
    }
    for (const d of HOURS_COLUMNS) {
      if (!has(r, d) || !r[c[d]].trim()) continue;
      const norm = normalizeHours(r[c[d]]);
      if (norm !== r[c[d]].trim() && !parseHours(norm).problems.some((x) => !x.warn)) edit(ri, c[d], norm, "separators normalised");
    }
  }
  return { text: toCsv(rows, out), changes, error: null };
}

export function findingsCsv(result) {
  return toCsv([["severity", "line", "code", "title", "detail"], ...result.findings.map((f) => [f.severity, String(f.line || ""), f.code, f.title, f.detail])], ",");
}

const COLS = ["Store code", "Business name", "Address line 1", "Address line 2", "Locality", "Administrative area", "Country/Region", "Postal code", "Primary phone", "Website", "Primary category", "Additional categories",
  ...HOURS_COLUMNS, "From the business", "Opening date", "Labels", "Latitude", "Longitude"];
const wk = ["x", "09:00-17:00", "09:00-17:00", "09:00-17:00", "09:00-17:00", "09:00-17:00", "10:00-14:00"];
const build = (rows) => toCsv([COLS, ...rows]);

export function sampleFile() {
  return build([
    ["MAIN-001", "Harbor Street Plumbing", "120 Harbor Street", "Suite 4", "Boston", "MA", "US", "02110", "+1 617 555 0142", "https://example.com/boston", "Plumber", "Water heater installation service", ...wk, "Family-run plumbers serving the harbor district since 2009.", "2009-04-01", "Boston, Flagship", "42.3601", "-71.0589"],
    ["MAIN-002", "Harbor Street Plumbing", "88 Elm Avenue", "", "Hartford", "CT", "US", "06103", "(860) 555-0177", "https://example.com/hartford", "Plumber", "", ...wk.slice(0, 6), "09:00-12:00, 13:00-17:00", "", "2024-09-15", "Hartford", "41.7658", "-72.6734"],
    ["MAIN-003", "Harbor Street Plumbing", "15 King Street", "", "Toronto", "ON", "CA", "M5H 2N2", "+1 416 555 0119", "https://example.com/toronto", "Plumber", "", "x", "08:00-18:00", "08:00-18:00", "08:00-18:00", "08:00-18:00", "08:00-18:00", "24 hours", "", "2026-01-12", "Toronto", "43.6510", "-79.3470"],
  ]);
}

export function sampleBrokenFile() {
  // Semicolon-separated, as European Excel saves it; the ZIPs have lost their zeros and the dates and hours are malformed.
  const rows = [
    ["MAIN-001", "BEST CHEAP PLUMBER NEAR ME - Boston, Cambridge, Somerville 24/7", "120 Harbor Street", "", "Boston", "Massachusetts", "US", "2110", "6175550142", "www.example.com/boston", "Plumber", "", "x", "9am-5pm", "09:00 – 17:00", "09:00 to 17:00", "09:00-17:00", "09:00-17:00", "10:00-14:00", "", "03/15/2024", "Boston", "42.3601", "-71.0589"],
    ["MAIN-001", "Harbor Street Plumbing", "88 Elm Avenue", "", "Hartford", "CT", "US", "6103", "(860) 555-01", "http://example.com/hartford", "Plumber", "", "x", "09:00-17:00", "09:00-17:00", "09:00-17:00", "09:00-17:00", "09:00-17:00", "10:00-14:00", "", "2024-09-15", "Hartford", "41.7658", "-72.6734"],
    ["1.2346E+09", "Harbor Street Plumbing", "120 Harbor St", "", "Boston", "MA", "UK", "02110", "1.6175550143E+9", "example.com", "Plumber", "", "x", "09:00-17:00", "09:00-17:00", "09:00-17:00", "09:00-17:00", "09:00-17:00", "10:00-14:00", "", "45366", "Boston", "42.3601", "-71.0589"],
  ];
  return toCsv([COLS, ...rows], ";");
}
