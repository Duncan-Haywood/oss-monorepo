// First article inspection: characteristic accountability check (the kind of
// table AS9102 Form 3 holds). Pure functions, no DOM, no network.
//
// Input: a pasted table, one row per ballooned characteristic: number,
// requirement as written on the drawing, measured result(s), and optionally
// location, designator, tooling and nonconformance number. Each requirement is
// read into lower and upper limits where it can be; each result is judged
// against them. Nothing is guessed: a requirement it cannot read is listed as
// unread, never passed.

const EPS = 1e-9;

const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)`;
const num = (s) => Number(String(s).replace(/^\+/, ""));
const decimals = (s) => { const m = String(s).match(/\.(\d+)/); return m ? m[1].length : 0; };

export const GDT_WORDS = [
  "true position", "position", "flatness", "straightness", "circularity", "roundness", "cylindricity",
  "perpendicularity", "parallelism", "angularity", "profile of a surface", "profile of a line", "profile",
  "total runout", "circular runout", "runout", "concentricity", "symmetry",
];
const GDT_SYMBOLS = "⌖⏥⏤○⌭⊥∥∠⌓⌒↗⌯◎";

function normalise(text) {
  return String(text ?? "")
    .replace(/[−‒–—]/g, "-")
    .replace(/\+\s*\/\s*-|\+\s*-(?=\s*[\d.])|±/g, "±")
    .replace(/[″"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Reads one requirement. general = { linear: {1: tol, 2: tol, 3: tol, 4: tol}, angular: tol }.
// Returns { kind, lower, upper, count, note, reason }.
//   kind: "variable" (numeric limits), "attribute" (pass/fail by inspection),
//         "reference" (basic or reference dimension, not inspected), "unread".
export function readRequirement(raw, general = {}) {
  let t = normalise(raw);
  const out = { text: String(raw ?? "").trim(), kind: "unread", lower: null, upper: null, count: 1, notes: [] };
  if (!t) { out.reason = "empty requirement"; return out; }

  const cnt = t.match(/^(\d+)\s*[xX×]\s+/) || t.match(/^(\d+)\s*(?:PL|PLACES|PLCS)\b\.?\s*/i);
  if (cnt) { out.count = Number(cnt[1]); t = t.slice(cnt[0].length).trim(); }
  const trailCnt = t.match(/\s+(\d+)\s*(?:PL|PLACES|PLCS|X)\.?$/i);
  if (trailCnt) { out.count = Number(trailCnt[1]); t = t.slice(0, trailCnt.index).trim(); }

  // Basic / reference dimensions.
  if (/^\[.*\]$/.test(t) || /\b(BASIC|BSC)\b/i.test(t)) { out.kind = "reference"; out.reason = "basic dimension: its tolerance is in the feature control frame that refers to it"; return out; }
  if (/^\(.*\)$/.test(t) || /\bREF\b/i.test(t)) { out.kind = "reference"; out.reason = "reference dimension: not inspected"; return out; }

  // Geometric tolerance: a symbol or word, an optional diameter sign, the tolerance, then modifiers and datums.
  const lower = t.toLowerCase();
  const gdtWord = GDT_WORDS.find((w) => lower.startsWith(w));
  const gdtSym = GDT_SYMBOLS.includes(t[0]);
  if (gdtWord || gdtSym) {
    const rest = t.slice(gdtWord ? gdtWord.length : 1).replace(/^[\s|:]+/, "").replace(/^(?:Ø|⌀|DIA\b)\s*/i, "");
    const m = rest.match(new RegExp(`^(${NUM})`));
    if (m) {
      out.kind = "variable"; out.lower = 0; out.upper = num(m[1]); out.gdt = gdtWord || t[0];
      if (/Ⓜ|\(M\)|\bMMC\b|Ⓛ|\(L\)|\bLMC\b/i.test(rest)) out.notes.push("material-condition modifier: bonus tolerance is not added here, so the result is judged against the stated tolerance only (stricter than the drawing allows)");
      return out;
    }
    out.reason = "geometric tolerance with no number after it"; return out;
  }

  // Strip a leading feature prefix (diameter, radius, spherical, thread pitch stays).
  const prefix = t.match(/^(?:Ø|⌀|DIA\.?|SØ|SR|R|CR)\s*(?=[\d.])/i);
  if (prefix) t = t.slice(prefix[0].length);
  t = t.replace(/\s*(?:DIA|DIAM|DIAMETER|THRU|TYP|IN|MM)\.?$/i, "").trim();
  const angle = /°|\bDEG\b/i.test(t);
  t = t.replace(/\s*(?:°|DEG)\s*/gi, " ").trim();

  // Surface finish: "32 Ra", "Ra 0.8", "32 RA MAX".
  const ra = t.match(new RegExp(`^(?:Ra|RMS)\\s*(${NUM})(?:\\s*MAX)?$`, "i")) || t.match(new RegExp(`^(${NUM})\\s*(?:Ra|RMS|µin|uin|µm)(?:\\s*MAX)?$`, "i"));
  if (ra) { out.kind = "variable"; out.lower = null; out.upper = num(ra[1]); out.notes.push("surface finish: read as a maximum"); return out; }

  // num ± tol
  let m = t.match(new RegExp(`^(${NUM})\\s*±\\s*(${NUM})$`));
  if (m) { const n = num(m[1]), d = Math.abs(num(m[2])); return { ...out, kind: "variable", lower: n - d, upper: n + d, nominal: n }; }

  // num +a -b  /  num +a/-b  /  num -b +a  (either order)
  m = t.match(new RegExp(`^(${NUM})\\s*([+-]\\s*(?:\\d+\\.?\\d*|\\.\\d+))\\s*/?\\s*([+-]\\s*(?:\\d+\\.?\\d*|\\.\\d+))$`));
  if (m) {
    const n = num(m[1]);
    const a = Number(m[2].replace(/\s/g, "")), b = Number(m[3].replace(/\s/g, ""));
    const up = m[2].trim().startsWith("+") ? a : m[3].trim().startsWith("+") ? b : null;
    const dn = m[2].trim().startsWith("-") ? a : m[3].trim().startsWith("-") ? b : null;
    if (up != null && dn != null) return { ...out, kind: "variable", lower: n + dn, upper: n + up, nominal: n };
    // "+0.002 +0.001" both on one side is unusual but legal (e.g. a press fit)
    return { ...out, kind: "variable", lower: n + Math.min(a, b), upper: n + Math.max(a, b), nominal: n };
  }

  // Limit dimension: "12.000-12.010", "1.005/1.000", "12.00 to 12.05".
  m = t.match(new RegExp(`^(\\d*\\.?\\d+)\\s*(?:-|/|\\bTO\\b)\\s*(\\d*\\.?\\d+)$`, "i"));
  if (m) { const a = num(m[1]), b = num(m[2]); return { ...out, kind: "variable", lower: Math.min(a, b), upper: Math.max(a, b) }; }

  // MAX / MIN
  m = t.match(new RegExp(`^(${NUM})\\s*MAX\\.?$`, "i")) || t.match(new RegExp(`^MAX\\.?\\s*(${NUM})$`, "i"));
  if (m) return { ...out, kind: "variable", lower: null, upper: num(m[1]) };
  m = t.match(new RegExp(`^(${NUM})\\s*MIN\\.?$`, "i")) || t.match(new RegExp(`^MIN\\.?\\s*(${NUM})$`, "i"));
  if (m) return { ...out, kind: "variable", lower: num(m[1]), upper: null };

  // Bare nominal: apply the title block's general tolerance.
  m = t.match(new RegExp(`^(${NUM})$`));
  if (m) {
    const n = num(m[1]);
    const tol = angle ? general.angular : general.linear?.[decimals(m[1])];
    if (tol != null && Number.isFinite(tol) && tol > 0) {
      return { ...out, kind: "variable", lower: n - tol, upper: n + tol, nominal: n, notes: [...out.notes, angle ? `general angular tolerance ±${tol}° applied` : `general tolerance for ${decimals(m[1])} places (±${tol}) applied`] };
    }
    out.reason = angle ? "angle with no tolerance: enter the title block's angular tolerance" : `no tolerance on the dimension and no general tolerance entered for ${decimals(m[1])} decimal places`;
    out.nominal = n; return out;
  }

  // Anything else with no number we could read (threads, notes, "break edges") is an attribute check.
  if (/^(M\d|\d+\/\d+-\d+|#\d+-\d+|\d+-\d+\s*UN)/i.test(t) || /\b(UNC|UNF|UNEF|NPT|THD|THREAD|6H|6G|2B|3B|2A|3A)\b/i.test(t)) {
    out.kind = "attribute"; out.notes.push("thread: checked with a gauge, recorded as accept or reject"); return out;
  }
  if (!/\d/.test(t) || /^(NOTE|NOTES|PER NOTE|FLAG NOTE)\b/i.test(t)) { out.kind = "attribute"; return out; }
  out.reason = "could not read limits from this requirement"; return out;
}

const PASS = /^(PASS|PASSED|OK|ACC|ACCEPT|ACCEPTED|CONFORMS|CONFORMING|YES|GO|✓|✔)$/i;
const FAIL = /^(FAIL|FAILED|REJ|REJECT|REJECTED|NC|NO|NOGO|NO-GO|NCR|✗|✘)$/i;

export function readResults(raw) {
  const parts = String(raw ?? "").replace(/[−]/g, "-").split(/[\s;|]+/).filter(Boolean);
  const values = [], marks = [], unread = [];
  for (const p of parts) {
    const c = p.replace(/[″"°]$/, "").replace(/(mm|in)$/i, "");
    if (new RegExp(`^${NUM}$`).test(c)) values.push(num(c));
    else if (PASS.test(p)) marks.push("pass");
    else if (FAIL.test(p)) marks.push("fail");
    else unread.push(p);
  }
  return { values, marks, unread };
}

// The judged row.
export function judge(row, opts = {}) {
  const near = opts.nearPct ?? 10;
  const req = readRequirement(row.requirement, opts.general);
  const res = readResults(row.results);
  const issues = [];
  let status;
  const hasAny = res.values.length || res.marks.length;
  const usage = [];

  if (req.kind === "reference") status = hasAny ? "reference" : "reference";
  else if (!hasAny && !res.unread.length) { status = "missing"; issues.push("no result recorded"); }
  else if (res.unread.length) { status = "unread"; issues.push(`result not read: ${res.unread.join(" ")}`); }
  else if (req.kind === "unread") { status = "unread"; issues.push(req.reason); }
  else if (req.kind === "attribute") {
    if (res.values.length && !res.marks.length) { status = "unread"; issues.push("a number was recorded for a characteristic with no readable limits"); }
    else status = res.marks.includes("fail") ? "reject" : "accept";
  } else {
    // variable
    if (!res.values.length) {
      status = res.marks.includes("fail") ? "reject" : "accept";
      issues.push("accept/reject recorded where a measured value can be: many customers want the actual value on Form 3");
    } else {
      const bad = res.values.filter((v) => (req.lower != null && v < req.lower - EPS) || (req.upper != null && v > req.upper + EPS));
      status = bad.length || res.marks.includes("fail") ? "reject" : "accept";
      if (bad.length) issues.push(`out of tolerance: ${bad.join(", ")}`);
      const margins = [];
      for (const v of res.values) {
        // Zero-based limits (geometric tolerances, MAX callouts) are one-sided: zero is perfect, not a limit to be near.
        if (req.upper != null && req.upper > 0 && (req.lower == null || req.lower === 0)) {
          usage.push(Math.max(0, v) / req.upper * 100);
          margins.push((req.upper - v) / req.upper * 100);
        } else if (req.lower != null && req.upper != null && req.upper > req.lower) {
          const band = req.upper - req.lower;
          usage.push(Math.abs(v - (req.upper + req.lower) / 2) / (band / 2) * 100);
          margins.push(Math.min(v - req.lower, req.upper - v) / band * 100);
        }
      }
      if (status === "accept" && margins.length && Math.min(...margins) < near - EPS) {
        issues.push(`within ${near}% of the tolerance band from a limit: check gauge capability before production`);
      }
    }
    if (req.count > 1 && res.values.length && res.values.length < req.count) issues.push(`${req.count} places on the drawing, ${res.values.length} result${res.values.length === 1 ? "" : "s"} recorded`);
  }
  if (status === "reject" && !String(row.ncr ?? "").trim()) issues.push("rejected with no nonconformance number");
  for (const n of req.notes) issues.push(n);
  // Tolerance used: share of the half-band (bilateral) or of the maximum (one-sided), worst result.
  const worst = usage.length ? Math.max(...usage) : null;
  return { ...row, req, res, status, issues, tolUsedPct: worst == null ? null : Math.round(worst) };
}

// --- table input ---

function splitLine(line, delim) {
  if (delim === "\t") return line.split("\t");
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur); return out;
}

const HEADS = [
  ["char", /^(char(acteristic)?\.?\s*(no|number|#)?\.?|(balloon|bubble)(\s*(no|number|#))?|item|no\.?|#|ref\s*no)$/i],
  ["location", /(location|zone|sheet|view)/i],
  ["designator", /(designator|key|critical|class|kc)/i],
  ["requirement", /(requirement|spec|dimension|callout|nominal|drawing)/i],
  ["results", /(result|actual|measured|sample|reading|value|pc\s*\d|part\s*\d|s\d)/i],
  ["tooling", /(tool|gauge|gage|instrument|method)/i],
  ["ncr", /(ncr|non-?conformance)/i],
];

export function readTable(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  if (!lines.length) return { rows: [], warnings: ["nothing pasted"], columns: null };
  const delim = lines[0].includes("\t") ? "\t" : ",";
  let cells = lines.map((l) => splitLine(l, delim).map((c) => c.trim()));
  const warnings = [];
  let cols;
  const first = cells[0];
  const looksHeader = first.some((c) => /[a-z]{3,}/i.test(c)) && HEADS.some(([, re]) => first.some((c) => re.test(c))) && !/^\d/.test(first[0]);
  if (looksHeader) {
    cols = first.map((c) => (c.match(/ncr|non-?conformance/i) ? "ncr" : HEADS.find(([, re]) => re.test(c))?.[0] ?? null));
    // A column named "Char No." also matches nothing else; the first result-ish column wins nothing special.
    cells = cells.slice(1);
    if (!cols.includes("requirement")) warnings.push("no requirement column found in the header");
    if (!cols.includes("results")) warnings.push("no result column found in the header");
  } else {
    cols = first.map((_, i) => (i === 0 ? "char" : i === 1 ? "requirement" : "results"));
    warnings.push("no header row: read as characteristic number, requirement, then result columns");
  }
  const rows = cells.map((c, i) => {
    const r = { line: i + (looksHeader ? 2 : 1), char: "", location: "", designator: "", requirement: "", results: "", tooling: "", ncr: "" };
    c.forEach((v, j) => {
      const k = cols[j];
      if (!k || !v) return;
      r[k] = r[k] ? `${r[k]} ${v}` : v;
    });
    return r;
  });
  return { rows, warnings, columns: cols };
}

export function checkFai(text, opts = {}) {
  const t = readTable(text);
  const rows = t.rows.map((r) => judge(r, opts));
  const warnings = [...t.warnings];
  const seen = new Map();
  for (const r of rows) {
    if (!r.char) { r.issues.unshift("no characteristic number"); continue; }
    if (seen.has(r.char)) r.issues.unshift(`characteristic number ${r.char} repeated (also line ${seen.get(r.char)})`);
    else seen.set(r.char, r.line);
  }
  const ints = [...seen.keys()].filter((k) => /^\d+$/.test(k)).map(Number);
  const gaps = [];
  if (ints.length) {
    const have = new Set(ints);
    for (let i = 1; i <= Math.max(...ints); i++) if (!have.has(i)) gaps.push(i);
  }
  const count = (s) => rows.filter((r) => r.status === s).length;
  const summary = {
    total: rows.length, accept: count("accept"), reject: count("reject"), missing: count("missing"),
    unread: count("unread"), reference: count("reference"), gaps,
    rejectWithoutNcr: rows.filter((r) => r.status === "reject" && !r.ncr).length,
  };
  summary.ready = rows.length > 0 && summary.reject === 0 && summary.missing === 0 && summary.unread === 0 && gaps.length === 0
    && rows.every((r) => r.char && !r.issues.some((i) => /repeated/.test(i)));
  return { rows, summary, warnings };
}

// --- output ---

const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s) && !/^-?(?:\d+\.?\d*|\.\d+)$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const fmt = (n) => (n == null ? "" : String(Number(n.toFixed(6))));

export function faiCsv(result) {
  const head = ["Char No.", "Reference Location", "Characteristic Designator", "Requirement", "Lower Limit", "Upper Limit", "Results", "Designed / Qualified Tooling", "Nonconformance Number", "Status", "Tolerance Used %", "Notes"];
  const lines = [head.map(csvCell).join(",")];
  for (const r of result.rows) {
    lines.push([r.char, r.location, r.designator, r.requirement, fmt(r.req.lower), fmt(r.req.upper), r.results, r.tooling, r.ncr, r.status, r.tolUsedPct ?? "", r.issues.join("; ")].map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

export function summaryText(result) {
  const s = result.summary;
  const parts = [`${s.total} characteristics: ${s.accept} accepted, ${s.reject} rejected, ${s.missing} with no result, ${s.unread} not read, ${s.reference} reference.`];
  if (s.gaps.length) parts.push(`Balloon numbers missing from the sequence: ${s.gaps.join(", ")}.`);
  if (s.rejectWithoutNcr) parts.push(`${s.rejectWithoutNcr} rejected without a nonconformance number.`);
  parts.push(s.ready ? "Every characteristic has a result inside its limits as read here. Check the limits against the drawing before you sign." : "Not ready to submit: resolve the items flagged above.");
  return parts.join(" ");
}
