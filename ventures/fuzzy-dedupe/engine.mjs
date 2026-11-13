// Fuzzy duplicate finder: probabilistic record linkage (Fellegi & Sunter 1969)
// with match weights learned from the file itself by EM (Winkler 1988), Jaro-Winkler
// string comparison (Jaro 1989; Winkler 1990), blocking to avoid comparing every pair,
// and transitive grouping with a merged "golden" record per group.
//
// Pure functions, no DOM, no network, seeded randomness only. The page, the CLI and
// agents all call analyze().

export const PAPERS = [
  {
    authors: "Ivan P. Fellegi and Alan B. Sunter",
    title: "A Theory for Record Linkage",
    venue: "Journal of the American Statistical Association 64(328), 1183-1210",
    year: 1969,
    url: "https://www.jstor.org/stable/2286061",
    doi: "10.1080/01621459.1969.10501049",
    implemented:
      "Match weight log2(m/u) per field agreement level, summed under conditional independence; pairs above an upper threshold are declared duplicates, pairs between the thresholds go to clerical review.",
    deviations:
      "Thresholds are set on the posterior match probability (default 0.9 and 0.5) rather than from target error rates; agreement is graded in two or three levels per field, not just agree/disagree.",
  },
  {
    authors: "William E. Winkler",
    title: "Using the EM Algorithm for Weight Computation in the Fellegi-Sunter Model of Record Linkage",
    venue: "Proceedings of the Section on Survey Research Methods, American Statistical Association, 667-671",
    year: 1988,
    url: "https://www.census.gov/library/working-papers/2000/adrm/rr2000-05.html",
    implemented:
      "m and u probabilities and the match share are estimated by EM on the blocked candidate pairs, assuming fields agree independently given match status; u starts from a seeded sample of random record pairs.",
    deviations:
      "Missing values contribute nothing to either side. A field whose fitted top level is no likelier among matches than non-matches falls back to the starting m and the random-pair u. Holding u fixed at the random-pair estimate (Splink's default) was tried and rejected: on Febrl 2 with name and address only it chained 4,210 of 5,000 rows into one group, because pairs that share a blocking key agree far more often than random pairs.",
  },
  {
    authors: "Matthew A. Jaro",
    title: "Advances in Record-Linkage Methodology as Applied to Matching the 1985 Census of Tampa, Florida",
    venue: "Journal of the American Statistical Association 84(406), 414-420",
    year: 1989,
    url: "https://www.jstor.org/stable/2289924",
    doi: "10.1080/01621459.1989.10478785",
    implemented: "Jaro string similarity (common characters within a window, half the transpositions).",
    deviations: "None.",
  },
  {
    authors: "William E. Winkler",
    title:
      "String Comparator Metrics and Enhanced Decision Rules in the Fellegi-Sunter Model of Record Linkage",
    venue: "Proceedings of the Section on Survey Research Methods, American Statistical Association, 354-359",
    year: 1990,
    url: "https://files.eric.ed.gov/fulltext/ED325505.pdf",
    implemented: "Winkler's common-prefix boost (up to 4 characters, scale 0.1) applied to every Jaro score.",
    deviations: "The boost is applied at every Jaro score, as in most libraries, rather than only above 0.7.",
  },
];

export const DEFAULTS = {
  matchThreshold: 0.9,
  reviewThreshold: 0.5,
  maxBlock: 400,
  uSamples: 20000,
  emIterations: 60,
  seed: 1,
  maxRows: 50000,
  minLearnPairs: 300,
  differentNameGuard: true,
};

// --------------------------------------------------------------------------
// CSV

export function parseCsv(text) {
  const s = String(text ?? "").replace(/^﻿/, "");
  const firstLine = s.split(/\r?\n/, 1)[0] || "";
  const delim = [",", ";", "\t", "|"].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  if (!rows.length) return { header: [], rows: [] };
  const header = rows[0].map((h) => h.trim());
  const body = rows.slice(1).map((r) => header.map((_, j) => (r[j] ?? "").trim()));
  return { header, rows: body };
}

// A cell that a spreadsheet would run as a formula is prefixed with a quote.
export function csvCell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header, rows) {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

// --------------------------------------------------------------------------
// Field types and column guessing

export const FIELD_TYPES = {
  given: "First / given name",
  surname: "Last name / surname",
  fullname: "Full name",
  email: "Email",
  phone: "Phone",
  company: "Company",
  street: "Street address",
  housenumber: "House number",
  city: "City / suburb",
  postcode: "ZIP / postcode",
  state: "State / region",
  date: "Date (e.g. birth date)",
  id: "ID number (customer no., SSN, VAT)",
  text: "Other text",
  ignore: "Ignore",
};

const GUESS = [
  [/^(rec(ord)?[_ ]?id|row[_ ]?id|uuid|contact[_ ]?id|record id|hs_object_id)$/i, "ignore"],
  [/e-?mail/i, "email"],
  [/phone|mobile|cell|tel\b|telephone/i, "phone"],
  [/^(first|given|fore)[_ ]?(name)?$|first[_ ]?name|given[_ ]?name|forename/i, "given"],
  [/^(last|sur|family)[_ ]?(name)?$|last[_ ]?name|surname|family[_ ]?name/i, "surname"],
  [/^(full[_ ]?)?name$|contact[_ ]?name|customer[_ ]?name|full[_ ]?name/i, "fullname"],
  [/company|organi[sz]ation|employer|account[_ ]?name|business/i, "company"],
  [/street[_ ]?(no|num|number)|house[_ ]?(no|num|number)/i, "housenumber"],
  [/address|street|addr/i, "street"],
  [/city|town|suburb|locality/i, "city"],
  [/zip|post[_ ]?code|postal/i, "postcode"],
  [/^state$|province|region|county/i, "state"],
  [/birth|dob|date/i, "date"],
  [/ssn|soc[_ ]?sec|tax[_ ]?id|vat|national|customer[_ ]?(no|num|number)|account[_ ]?(no|num|number)|member/i, "id"],
];

export function guessTypes(header) {
  const used = new Set();
  return header.map((h) => {
    for (const [re, t] of GUESS) {
      if (re.test(h)) {
        // A second "street" column (address line 2) is still useful as text.
        if (used.has(t) && !["text", "ignore"].includes(t)) return t === "street" ? "text" : "ignore";
        used.add(t);
        return t;
      }
    }
    return "ignore";
  });
}

// --------------------------------------------------------------------------
// Normalisation

export function clean(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Common English given-name variants, each mapped to one canonical form. Small and
// conservative on purpose: a wrong pairing here makes two different people agree.
const NICK_GROUPS = [
  "robert bob rob robbie bobby bert", "william bill will billy willy liam", "richard dick rick ricky rich",
  "james jim jimmy jamie", "john jack johnny jon", "joseph joe joey", "thomas tom tommy", "charles charlie chuck chas",
  "michael mike mick mickey", "christopher chris kit", "daniel dan danny", "matthew matt", "anthony tony",
  "andrew andy drew", "edward ed eddie ted ned", "benjamin ben benny", "nicholas nick nicky", "samuel sam sammy",
  "alexander alex alec sandy", "jonathan jon jonny", "timothy tim timmy", "stephen steve steven stevie",
  "kenneth ken kenny", "ronald ron ronnie", "donald don donny", "gregory greg", "patrick pat paddy", "peter pete",
  "lawrence larry laurence", "raymond ray", "gerald gerry jerry", "jeffrey jeff geoffrey", "frederick fred freddie",
  "henry harry hank", "francis frank frankie", "leonard leo len lenny", "douglas doug", "zachary zach zack",
  "nathaniel nathan nate", "joshua josh", "jacob jake", "david dave davey", "philip phil phillip",
  "elizabeth liz lizzie beth betty eliza libby", "margaret maggie meg peggy marge", "katherine kate katie kathy cathy catherine kathryn",
  "jennifer jen jenny", "patricia pat patty trish tricia", "susan sue susie suzanne", "deborah debbie deb debra",
  "rebecca becky becca", "jessica jess jessie", "victoria vicky tori", "christine chris chrissy christina kristina",
  "abigail abby", "alexandra alex alexa sandra", "barbara barb babs", "dorothy dot dottie", "eleanor ellie nora",
  "samantha sam sammie", "pamela pam", "kimberly kim", "cynthia cindy", "jacqueline jackie", "theresa terry tess teresa",
  "judith judy", "frances fran", "virginia ginny", "angela angie", "melissa missy mel", "stephanie steph",
];
const NICK = new Map();
for (const g of NICK_GROUPS) {
  const [canon, ...rest] = g.split(" ");
  for (const n of rest) if (!NICK.has(n)) NICK.set(n, canon);
  NICK.set(canon, canon);
}
export function canonicalGiven(s) {
  const c = clean(s).split(" ")[0] || "";
  return NICK.get(c) || c;
}

const STREET_ABBR = {
  st: "street", rd: "road", ave: "avenue", av: "avenue", blvd: "boulevard", dr: "drive", ln: "lane", ct: "court",
  cres: "crescent", cr: "crescent", pl: "place", hwy: "highway", pde: "parade", tce: "terrace", cct: "circuit",
  cir: "circle", sq: "square", pkwy: "parkway", n: "north", s: "south", e: "east", w: "west", apt: "apartment",
  ste: "suite", fl: "floor",
};
export function normStreet(s) {
  return clean(s).split(" ").filter(Boolean).map((w) => STREET_ABBR[w] || w).join(" ");
}

const COMPANY_SUFFIX = new Set([
  "inc", "incorporated", "llc", "ltd", "limited", "corp", "corporation", "co", "company", "plc", "gmbh", "ag", "sa",
  "pty", "pvt", "bv", "nv", "srl", "the", "and", "group", "holdings", "llp", "lp",
]);
export function normCompany(s) {
  return clean(s).split(" ").filter((w) => w && !COMPANY_SUFFIX.has(w)).join(" ");
}

export function normEmail(s) {
  const e = String(s ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e.replace(/\s+/g, "");
  let local = e.slice(0, at).replace(/\+.*$/, "");
  let domain = e.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

export function normPhone(s) {
  const d = String(s ?? "").replace(/\D+/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

export function normDate(s) {
  const t = String(s ?? "").trim();
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return m[1] + m[2].padStart(2, "0") + m[3].padStart(2, "0");
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return m[3] + m[1].padStart(2, "0") + m[2].padStart(2, "0"); // read as month/day; a swap still scores as near
  const d = t.replace(/\D+/g, "");
  return d;
}

function normalise(type, v) {
  switch (type) {
    case "given": return canonicalGiven(v);
    case "surname": case "city": case "state": case "text": return clean(v);
    case "email": return normEmail(v);
    case "phone": return normPhone(v);
    case "company": return normCompany(v);
    case "street": return normStreet(v);
    case "postcode": case "id": case "housenumber": return String(v ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
    case "date": return normDate(v);
    default: return clean(v);
  }
}

// --------------------------------------------------------------------------
// String similarity

export function jaro(a, b) {
  if (a === b) return a.length ? 1 : 0;
  const la = a.length, lb = b.length;
  if (!la || !lb) return 0;
  const win = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const ma = new Uint8Array(la), mb = new Uint8Array(lb);
  let m = 0;
  for (let i = 0; i < la; i++) {
    const lo = Math.max(0, i - win), hi = Math.min(lb - 1, i + win);
    for (let j = lo; j <= hi; j++) {
      if (!mb[j] && a[i] === b[j]) { ma[i] = mb[j] = 1; m++; break; }
    }
  }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < la; i++) {
    if (!ma[i]) continue;
    while (!mb[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  return (m / la + m / lb + (m - t / 2) / m) / 3;
}

export function jaroWinkler(a, b, p = 0.1) {
  const j = jaro(a, b);
  let l = 0;
  while (l < 4 && l < a.length && l < b.length && a[l] === b[l]) l++;
  return j + l * p * (1 - j);
}

// Damerau (optimal string alignment) distance, capped: returns cap+1 when larger.
export function editDistance(a, b, cap = 2) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const n = a.length, m = b.length;
  let prev2 = null, prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= m; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > cap) return cap + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[m];
}

function tokenJaccard(a, b) {
  const A = new Set(a.split(" ").filter(Boolean)), B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// --------------------------------------------------------------------------
// Comparison levels. Level 0 is the strongest agreement, the last level is
// "disagree"; null means one side is blank and the field is left out.

export const LEVELS = {
  given: ["exact (nicknames joined)", "very close (Jaro-Winkler >= 0.92)", "close (>= 0.80)", "initial only", "different"],
  surname: ["exact", "very close (Jaro-Winkler >= 0.92)", "close (>= 0.80)", "different"],
  email: ["exact (case, Gmail dots, +tags ignored)", "same name before @", "one typo", "different"],
  phone: ["same last 10 digits", "same last 7 digits or one typo", "different"],
  company: ["exact (Inc, LLC, Ltd ignored)", "close (Jaro-Winkler >= 0.90 or most words shared)", "different"],
  street: ["exact (St/Street, Rd/Road joined)", "close (Jaro-Winkler >= 0.90)", "some words shared", "different"],
  housenumber: ["exact", "different"],
  city: ["exact", "close (Jaro-Winkler >= 0.88)", "different"],
  postcode: ["exact", "one typo", "different"],
  state: ["exact", "different"],
  date: ["exact", "one typo or day and month swapped", "same year", "different"],
  id: ["exact", "one typo", "different"],
  text: ["exact", "close (Jaro-Winkler >= 0.90)", "different"],
};

function jwLevel(a, b, cuts) {
  if (a === b) return 0;
  const s = jaroWinkler(a, b);
  for (let i = 0; i < cuts.length; i++) if (s >= cuts[i]) return i + 1;
  return cuts.length + 1;
}

export function compareField(type, a, b) {
  if (!a || !b) return null;
  switch (type) {
    case "given": {
      if (a === b) return 0;
      const s = jaroWinkler(a, b);
      if (s >= 0.92) return 1;
      if (s >= 0.8) return 2;
      if ((a.length === 1 || b.length === 1) && a[0] === b[0]) return 3;
      return 4;
    }
    case "surname": return jwLevel(a, b, [0.92, 0.8]);
    case "email": {
      if (a === b) return 0;
      const la = a.split("@")[0], lb = b.split("@")[0];
      if (la.length >= 4 && la === lb) return 1;
      if (editDistance(a, b, 1) <= 1) return 2;
      return 3;
    }
    case "phone": {
      if (a === b) return 0;
      if ((a.length >= 7 && b.length >= 7 && a.slice(-7) === b.slice(-7)) || (a.length === b.length && editDistance(a, b, 1) <= 1)) return 1;
      return 2;
    }
    case "company": {
      if (a === b) return 0;
      return jaroWinkler(a, b) >= 0.9 || tokenJaccard(a, b) >= 0.5 ? 1 : 2;
    }
    case "street": {
      if (a === b) return 0;
      if (jaroWinkler(a, b) >= 0.9) return 1;
      return tokenJaccard(a, b) >= 0.34 ? 2 : 3;
    }
    case "housenumber": case "state": return a === b ? 0 : 1;
    case "city": return jwLevel(a, b, [0.88]);
    case "postcode": case "id": return a === b ? 0 : editDistance(a, b, 1) <= 1 ? 1 : 2;
    case "date": {
      if (a === b) return 0;
      if (editDistance(a, b, 1) <= 1) return 1;
      if (a.length === 8 && b.length === 8 && a.slice(0, 4) === b.slice(0, 4) && a.slice(4, 6) === b.slice(6, 8) && a.slice(6, 8) === b.slice(4, 6)) return 1;
      if (a.length === 8 && b.length === 8 && a.slice(0, 4) === b.slice(0, 4)) return 2;
      return 3;
    }
    default: return jwLevel(a, b, [0.9]);
  }
}

// --------------------------------------------------------------------------
// Blocking: only pairs sharing at least one key are compared.

export function soundex(s) {
  const w = clean(s).replace(/[^a-z]/g, "");
  if (!w) return "";
  const code = { b: 1, f: 1, p: 1, v: 1, c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2, d: 3, t: 3, l: 4, m: 5, n: 5, r: 6 };
  let out = w[0].toUpperCase();
  let last = code[w[0]] || 0;
  for (let i = 1; i < w.length && out.length < 4; i++) {
    const c = code[w[i]] || 0;
    if (c && c !== last) out += c;
    if (w[i] !== "h" && w[i] !== "w") last = c;
  }
  return out.padEnd(4, "0");
}

function blockKeys(rec) {
  const k = [];
  const v = rec.v;
  if (v.email && v.email.includes("@")) k.push("e:" + v.email);
  if (v.phone && v.phone.length >= 7) k.push("p:" + v.phone.slice(-7));
  if (v.id && v.id.length >= 4) k.push("i:" + v.id);
  if (v.surname) {
    const sx = soundex(v.surname);
    if (v.given) k.push("ns:" + sx + v.given[0]);
    if (v.postcode) k.push("nz:" + v.surname.slice(0, 3) + "|" + v.postcode);
    if (v.date) k.push("nd:" + v.surname[0] + v.date);
  }
  if (v.given) {
    if (v.postcode) k.push("gz:" + v.given.slice(0, 3) + "|" + v.postcode);
    if (v.date) k.push("gd:" + v.given[0] + v.date);
    if (v.surname) k.push("sw:" + soundex(v.given) + (v.surname[0] || "")); // swapped first/last
  }
  if (v.date && v.postcode) k.push("dz:" + v.date + "|" + v.postcode);
  if (v.street) {
    const s = v.street.split(" ").filter((w) => !/^\d+$/.test(w))[0] || "";
    if (s) k.push("st:" + s + "|" + (v.housenumber || "") + "|" + (v.postcode || v.city || ""));
  }
  if (v.company) k.push("c:" + v.company + "|" + (v.given ? v.given[0] : ""));
  if (v.text) k.push("t:" + v.text);
  return k;
}

// --------------------------------------------------------------------------
// Seeded randomness

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// --------------------------------------------------------------------------
// Preparing records

export function prepare(header, rows, types) {
  const fields = [];
  const seen = new Set();
  types.forEach((t, j) => {
    if (t === "fullname") { for (const f of ["given", "surname"]) if (!seen.has(f)) { seen.add(f); fields.push(f); } }
    else if (t && t !== "ignore" && FIELD_TYPES[t] && !seen.has(t)) { seen.add(t); fields.push(t); }
  });
  const recs = rows.map((r, i) => {
    const raw = {};
    types.forEach((t, j) => {
      const val = (r[j] ?? "").trim();
      if (!val || !t || t === "ignore") return;
      if (t === "fullname") {
        let parts;
        if (val.includes(",")) { const [last, first] = val.split(",", 2); parts = [first.trim(), last.trim()]; }
        else { const w = val.split(/\s+/); parts = [w[0], w.length > 1 ? w[w.length - 1] : ""]; }
        if (parts[0] && !raw.given) raw.given = parts[0];
        if (parts[1] && !raw.surname) raw.surname = parts[1];
      } else if (raw[t] === undefined) raw[t] = val;
      else if (t === "text" || t === "street") raw[t] += " " + val;
    });
    const v = {};
    for (const f of fields) v[f] = raw[f] ? normalise(f, raw[f]) : "";
    return { i, v };
  });
  return { fields, recs };
}

export function comparePair(fields, A, B) {
  const g = fields.map((f) => compareField(f, A.v[f], B.v[f]));
  // Swapped first and last name: score both as "very close" rather than different.
  const gi = fields.indexOf("given"), si = fields.indexOf("surname");
  if (gi >= 0 && si >= 0 && g[gi] !== null && g[si] !== null && g[gi] > 1 && g[si] > 1) {
    if (A.v.given === B.v.surname && A.v.surname === B.v.given) { g[gi] = 1; g[si] = 1; }
  }
  return g;
}

function candidatePairs(recs, maxBlock) {
  const blocks = new Map();
  for (const r of recs) {
    for (const k of new Set(blockKeys(r))) {
      let b = blocks.get(k);
      if (!b) blocks.set(k, (b = []));
      b.push(r.i);
    }
  }
  const pairs = new Set();
  let skipped = 0, skippedRows = 0;
  for (const b of blocks.values()) {
    if (b.length < 2) continue;
    if (b.length > maxBlock) { skipped++; skippedRows += b.length; continue; }
    for (let x = 0; x < b.length; x++) for (let y = x + 1; y < b.length; y++) {
      const a = b[x], c = b[y];
      pairs.add(a < c ? a * 1048576 + c : c * 1048576 + a);
    }
  }
  return { pairs: [...pairs].sort((p, q) => p - q).map((p) => [Math.floor(p / 1048576), p % 1048576]), blocks: blocks.size, skipped, skippedRows };
}

// --------------------------------------------------------------------------
// u from random pairs, m and the match share by EM.

export function estimateU(fields, recs, samples, rand) {
  const counts = fields.map((f) => new Array(LEVELS[f].length).fill(0));
  const n = recs.length;
  const total = n * (n - 1) / 2;
  const draws = Math.min(samples, total);
  if (total <= samples) {
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) add(comparePair(fields, recs[a], recs[b]));
  } else {
    for (let s = 0; s < draws; s++) {
      const a = Math.floor(rand() * n);
      let b = Math.floor(rand() * (n - 1));
      if (b >= a) b++;
      add(comparePair(fields, recs[a], recs[b]));
    }
  }
  function add(g) { g.forEach((l, k) => { if (l !== null) counts[k][l]++; }); }
  // Add-half smoothing so an unseen level never gets probability 0.
  return counts.map((c) => { const t = c.reduce((x, y) => x + y, 0) + c.length * 0.5; return c.map((x) => (x + 0.5) / t); });
}

function startM(f) {
  const L = LEVELS[f].length;
  const m = new Array(L).fill(0);
  m[0] = 0.85;
  for (let l = 1; l < L - 1; l++) m[l] = 0.1 / (L - 2);
  m[L - 1] = L > 2 ? 0.05 : 0.15;
  return m;
}

export function emFit(fields, gammas, u0, { iterations = 60, tol = 1e-7, learnU = true } = {}) {
  let m = fields.map(startM);
  let u = u0.map((x) => x.slice());
  let lambda = 0.1;
  const P = gammas.length;
  if (!P) return { m, u, lambda, iterations: 0, converged: true };
  let it = 0, converged = false;
  const post = new Float64Array(P);
  for (; it < iterations; it++) {
    // E step
    let sum = 0;
    for (let p = 0; p < P; p++) {
      const g = gammas[p];
      let lm = Math.log(lambda), lu = Math.log(1 - lambda);
      for (let k = 0; k < g.length; k++) if (g[k] !== null) { lm += Math.log(m[k][g[k]]); lu += Math.log(u[k][g[k]]); }
      const d = lu - lm;
      post[p] = d > 700 ? 0 : 1 / (1 + Math.exp(d));
      sum += post[p];
    }
    // M step
    const nm = fields.map((f) => new Array(LEVELS[f].length).fill(0.01));
    const nu = fields.map((f) => new Array(LEVELS[f].length).fill(0.01));
    for (let p = 0; p < P; p++) {
      const g = gammas[p];
      for (let k = 0; k < g.length; k++) if (g[k] !== null) { nm[k][g[k]] += post[p]; nu[k][g[k]] += 1 - post[p]; }
    }
    if (learnU) u = nu.map((c) => { const t = c.reduce((x, y) => x + y, 0); return c.map((x) => x / t); });
    let delta = 0;
    const next = nm.map((c, k) => {
      const t = c.reduce((x, y) => x + y, 0);
      return c.map((x, l) => { const v = x / t; delta = Math.max(delta, Math.abs(v - m[k][l])); return v; });
    });
    const nl = Math.min(0.999, Math.max(1e-6, sum / P));
    delta = Math.max(delta, Math.abs(nl - lambda));
    m = next;
    lambda = nl;
    if (delta < tol) { converged = true; it++; break; }
  }
  return { m, u, lambda, iterations: it, converged };
}

// --------------------------------------------------------------------------
// Grouping and merging

class UnionFind {
  constructor(n) { this.p = Int32Array.from({ length: n }, (_, i) => i); }
  find(x) { while (this.p[x] !== x) { this.p[x] = this.p[this.p[x]]; x = this.p[x]; } return x; }
  union(a, b) { a = this.find(a); b = this.find(b); if (a !== b) this.p[Math.max(a, b)] = Math.min(a, b); }
}

function mostCommon(values) {
  const c = new Map();
  for (const v of values) if (v) c.set(v, (c.get(v) || 0) + 1);
  let best = "", n = 0;
  for (const [v, k] of c) if (k > n) { best = v; n = k; }
  return best;
}

export function mergeGroup(header, rows, members) {
  // Survivor: the row with the most filled cells; ties go to the earliest row.
  let keep = members[0], most = -1;
  for (const i of members) {
    const filled = rows[i].filter((x) => String(x).trim() !== "").length;
    if (filled > most) { most = filled; keep = i; }
  }
  const merged = header.map((_, j) => {
    const own = rows[keep][j];
    if (String(own).trim() !== "") return own;
    return mostCommon(members.map((i) => rows[i][j]));
  });
  const conflicts = header.filter((_, j) => new Set(members.map((i) => clean(rows[i][j])).filter(Boolean)).size > 1);
  return { keep, merged, conflicts };
}

// --------------------------------------------------------------------------
// Top-level

export function analyze(input = {}) {
  const o = { ...DEFAULTS, ...input };
  let header = o.header, rows = o.rows;
  if (!header && o.csv != null) ({ header, rows } = parseCsv(o.csv));
  if (!header || !header.length) throw new Error("No header row found. Paste a CSV whose first line names the columns.");
  rows = rows || [];
  if (rows.length < 2) throw new Error("Need at least two data rows to look for duplicates.");
  if (rows.length > o.maxRows) throw new Error(`This tool handles up to ${o.maxRows.toLocaleString("en-US")} rows at a time; the file has ${rows.length.toLocaleString("en-US")}.`);
  let types = o.types;
  if (o.columns && !types) {
    types = header.map((h) => o.columns[h] || "ignore");
  }
  if (!types) types = guessTypes(header);
  if (types.length !== header.length) throw new Error("types must name one field type per column.");
  for (const t of types) if (!FIELD_TYPES[t]) throw new Error(`Unknown field type "${t}". Use one of: ${Object.keys(FIELD_TYPES).join(", ")}.`);

  const { fields, recs } = prepare(header, rows, types);
  if (!fields.length) throw new Error("No column is set to compare. Pick a field type (name, email, phone, ...) for at least one column.");
  const rand = rng(o.seed);
  const cand = candidatePairs(recs, o.maxBlock);
  const gammas = cand.pairs.map(([a, b]) => comparePair(fields, recs[a], recs[b]));
  const u = estimateU(fields, recs, o.uSamples, rand);
  const fit = emFit(fields, gammas, u, { iterations: o.emIterations, learnU: o.learnU ?? gammas.length >= o.minLearnPairs });

  // A field whose top agreement level is no likelier among matches than among random pairs
  // carries no evidence; EM can wander there on tiny files, so such fits fall back to the start values.
  const uf0 = fit.u;
  const m = fit.m.map((mk, k) => (mk[0] > uf0[k][0] ? mk : startM(fields[k])));
  const uu = fit.m.map((mk, k) => (mk[0] > uf0[k][0] ? uf0[k] : u[k]));
  const weights = m.map((mk, k) => mk.map((x, l) => Math.log2(x / uu[k][l])));
  // On a small file EM sees too few pairs to learn the match share and pushes it to its bound,
  // which would make every candidate pair a match before any field is looked at. Cap it at even odds.
  const lambda = gammas.length < o.minLearnPairs ? Math.min(fit.lambda, 0.5) : fit.lambda;
  const prior = Math.log2(lambda / (1 - lambda));

  // Colleague and family guard: two rows with clearly different first names share a surname,
  // company and town all the time. Fields like those are correlated, so their weights stack up
  // and can outvote the name. Unless a strong identifier (email, phone, ID number, date) also
  // agrees exactly, such a pair is sent to review instead of being merged.
  const gIdx = fields.indexOf("given");
  const strong = ["email", "phone", "id", "date"].map((f) => fields.indexOf(f)).filter((k) => k >= 0);
  const guarded = (g) => gIdx >= 0 && g[gIdx] === LEVELS.given.length - 1 && !strong.some((k) => g[k] === 0);
  const scored = [];
  for (let p = 0; p < gammas.length; p++) {
    const g = gammas[p];
    let w = prior;
    for (let k = 0; k < g.length; k++) if (g[k] !== null) w += weights[k][g[k]];
    const prob = 1 / (1 + Math.pow(2, -w));
    const held = o.differentNameGuard && prob >= o.matchThreshold && guarded(g);
    if (prob >= o.reviewThreshold || held) scored.push({ a: cand.pairs[p][0], b: cand.pairs[p][1], weight: w, probability: prob, levels: g, held });
  }
  scored.sort((x, y) => y.probability - x.probability || x.a - y.a || x.b - y.b);

  const uf = new UnionFind(rows.length);
  const matches = scored.filter((s) => s.probability >= o.matchThreshold && !s.held);
  for (const s of matches) uf.union(s.a, s.b);
  const groupsMap = new Map();
  for (let i = 0; i < rows.length; i++) {
    const r = uf.find(i);
    if (!groupsMap.has(r)) groupsMap.set(r, []);
    groupsMap.get(r).push(i);
  }
  const best = new Map();
  for (const s of matches) {
    for (const [x, y] of [[s.a, s.b], [s.b, s.a]]) if (!best.has(x) || best.get(x).probability < s.probability) best.set(x, { row: y, probability: s.probability });
  }
  const groups = [...groupsMap.values()].filter((g) => g.length > 1).sort((x, y) => x[0] - y[0]).map((members, gi) => {
    const { keep, merged, conflicts } = mergeGroup(header, rows, members);
    const links = matches.filter((s) => uf.find(s.a) === uf.find(members[0]) && members.includes(s.a));
    const minLink = Math.min(...links.map((s) => s.probability));
    return { id: gi + 1, members, keep, merged, conflicts, minLink, links: links.length };
  });
  const groupOf = new Map();
  for (const g of groups) for (const i of g.members) groupOf.set(i, g);
  const review = scored.filter((s) => (s.probability < o.matchThreshold || s.held) && !(groupOf.has(s.a) && groupOf.get(s.a) === groupOf.get(s.b)));

  const explain = (s) => fields.map((f, k) => ({ field: f, level: s.levels[k] === null ? "blank" : LEVELS[f][s.levels[k]], weight: s.levels[k] === null ? 0 : weights[k][s.levels[k]] }));

  const bigGroups = groups.filter((g) => g.members.length > 10).length;
  const rowsInGroups = groups.reduce((t, g) => t + g.members.length, 0);
  const removable = rowsInGroups - groups.length;
  const summary = groups.length
    ? `${groups.length.toLocaleString("en-US")} group${groups.length === 1 ? "" : "s"} of likely duplicates covering ${rowsInGroups.toLocaleString("en-US")} of ${rows.length.toLocaleString("en-US")} rows; merging them would leave ${(rows.length - removable).toLocaleString("en-US")} rows (${removable.toLocaleString("en-US")} fewer). ${review.length ? `${review.length.toLocaleString("en-US")} more pair${review.length === 1 ? " is" : "s are"} borderline and worth a look.` : "No borderline pairs."}`
    + (bigGroups ? ` ${bigGroups} group${bigGroups === 1 ? " has" : "s have"} more than 10 rows: check those by eye, a chain of near matches can join different people.` : "")
    : `No likely duplicates among ${rows.length.toLocaleString("en-US")} rows at a ${Math.round(o.matchThreshold * 100)}% match probability.${review.length ? ` ${review.length} borderline pair${review.length === 1 ? " is" : "s are"} listed for a look.` : ""}`;

  return {
    summary,
    rows: rows.length,
    fields,
    types,
    header,
    candidatePairs: cand.pairs.length,
    allPairs: rows.length * (rows.length - 1) / 2,
    blocks: cand.blocks,
    blocksSkipped: cand.skipped,
    em: { lambda, learnedU: gammas.length >= o.minLearnPairs, iterations: fit.iterations, converged: fit.converged },
    weights: fields.map((f, k) => ({ field: f, levels: LEVELS[f].map((name, l) => ({ name, m: m[k][l], u: uu[k][l], uRandom: u[k][l], weight: weights[k][l] })) })),
    groups,
    review: review.slice(0, 500).map((s) => ({ a: s.a, b: s.b, probability: s.probability, held: s.held, why: explain(s) })),
    heldCount: review.filter((s) => s.held).length,
    reviewCount: review.length,
    pairs: matches.map((s) => ({ a: s.a, b: s.b, probability: s.probability, why: explain(s) })),
    best: Object.fromEntries(best),
    rowsInGroups,
    removable,
    bigGroups,
    thresholds: { match: o.matchThreshold, review: o.reviewThreshold },
  };
}

// The input rows with group columns appended.
export function annotatedCsv(result, rows) {
  const groupOf = new Map();
  for (const g of result.groups) for (const i of g.members) groupOf.set(i, g);
  const head = [...result.header, "duplicate_group", "group_size", "keep", "best_match_row", "match_probability"];
  const body = rows.map((r, i) => {
    const g = groupOf.get(i);
    const b = result.best[i];
    return [...r, g ? g.id : "", g ? g.members.length : "", g ? (g.keep === i ? "yes" : "no") : "", b ? b.row + 2 : "", b ? b.probability.toFixed(3) : ""];
  });
  return toCsv(head, body);
}

// One row per person: the merged record of each group plus every row in no group, in file order.
export function mergedCsv(result, rows) {
  const groupOf = new Map();
  for (const g of result.groups) for (const i of g.members) groupOf.set(i, g);
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const g = groupOf.get(i);
    if (!g) out.push([...rows[i], "", ""]);
    else if (g.members[0] === i) out.push([...g.merged, g.members.length, g.members.map((x) => x + 2).join(" ")]);
  }
  return toCsv([...result.header, "merged_from_count", "merged_from_rows"], out);
}

export function fmtPct(x) {
  if (x > 0.999 && x < 1) return ">99.9%";
  return (x * 100).toFixed(x >= 0.995 && x < 1 ? 1 : 0) + "%";
}
