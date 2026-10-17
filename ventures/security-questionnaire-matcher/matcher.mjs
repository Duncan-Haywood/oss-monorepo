// Security-questionnaire answer matcher. Pure functions, no I/O, no network.
// Matches the questions of an incoming customer security questionnaire
// (SIG, CAIQ, a bespoke spreadsheet) against the answers a vendor has already
// given, and says how far to trust each match.

const STOP = new Set(("a an the of to in on for and or is are be been being do does did you your we our us it its this that these those " +
  "with by as at from any all such please provide describe state explain if how what which who whom when where there their them they " +
  "can could would should will shall may might have has had having not no yes").split(" "));

// Fold the many spellings of one control onto one token.
const PHRASES = [
  [/multi[- ]?factor|two[- ]?factor|2fa\b|\bmfa\b|2-step|two[- ]step/g, " mfa "],
  [/single sign[- ]?on|\bsso\b|\bsaml\b/g, " sso "],
  [/penetration test\w*|pen[- ]?test\w*/g, " pentest "],
  [/vulnerabilit\w+ (scan|assess)\w*/g, " vulnscan "],
  [/disaster recovery|business continuity|\bdr\b|\bbcp\b|\bbcdr\b/g, " continuity "],
  [/at[- ]rest/g, " atrest "],
  [/in[- ]transit/g, " intransit "],
  [/\btls\b|\bssl\b|https/g, " tls "],
  [/personally identifiable|personal data|\bpii\b|personal information/g, " pii "],
  [/role[- ]based|\brbac\b|least privilege|need[- ]to[- ]know/g, " rbac "],
  [/security incident|data breach|\bbreach\w*|incident response|\bir plan/g, " incident "],
  [/background (check|screen)\w*/g, " bgcheck "],
  [/sub[- ]?processor\w*|vendor management|supplier\w*/g, " subprocessor "],
  [/staff|personnel|workforce|employees?|workers?/g, " employee "],
  [/sent|transmi\w+|public networks?|over the internet|transfer\w*/g, " intransit "],
  [/how (often|frequently)|frequency|frequently|how many times|periodic\w*|annual\w*|yearly/g, " frequency "],
  [/notify|notif\w+|tell us|inform\w*|disclos\w+/g, " notify "],
  [/\bwithin\b|\bno later than\b/g, " within "],
  [/\brequire\w*|\benforc\w*|\bmandat\w*/g, " enforce "],
  [/\bcarry|\bmaintain|\bhave\b|\bhold\b|\buse\b/g, " have "],
  [/soc ?2|iso ?27001|iso 27001/g, " attestation "],
  [/anti[- ]?virus|anti[- ]?malware|endpoint protection|\bedr\b/g, " endpoint "],
  [/log(s|ging)? retention|audit log\w*|audit trail\w*/g, " auditlog "],
];

export function normalize(text) {
  let t = String(text || "").toLowerCase().replace(/[‘’]/g, "'");
  for (const [re, rep] of PHRASES) t = t.replace(re, rep);
  return t;
}

function stem(w) {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 5 && w.endsWith("ion")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function tokens(text) {
  const words = normalize(text).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const out = [];
  for (const w of words) {
    if (STOP.has(w) || /^\d+$/.test(w)) continue;
    out.push(stem(w));
  }
  return out;
}

function features(text) {
  const t = tokens(text);
  return [...new Set(t)];
}

// ---------- CSV ----------
export function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  const s = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === "\t") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

function csvCell(v) {
  const s = String(v ?? "");
  // Neutralise spreadsheet formula injection from pasted text.
  const safe = /^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? "'" + s : s;
  return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

function headerIndex(header, names) {
  return header.findIndex((h) => names.includes(h.trim().toLowerCase()));
}

// ---------- parsing inputs ----------
const NUM_PREFIX = /^\s*(?:q(?:uestion)?\s*)?(\d+(?:\.\d+)*[.)]?|[a-z]{1,4}[-.]\d+(?:\.\d+)*)[:.)\s]\s*/i;

export function parseQuestions(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  const rows = parseCsv(raw);
  const header = rows[0] || [];
  const qCol = headerIndex(header, ["question", "questions", "control", "requirement", "query"]);
  const idCol = headerIndex(header, ["id", "ref", "#", "number", "no", "question id"]);
  let list;
  if (qCol >= 0 && rows.length > 1) {
    list = rows.slice(1).map((r, i) => ({ id: (idCol >= 0 && r[idCol]?.trim()) || String(i + 1), question: (r[qCol] || "").trim() }));
  } else {
    list = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l, i) => {
      const m = l.match(NUM_PREFIX);
      return { id: m ? m[1].replace(/[.)]$/, "") : String(i + 1), question: (m ? l.slice(m[0].length) : l).trim() };
    });
  }
  return list.filter((q) => q.question.length >= 8);
}

export function parseLibrary(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0];
  let qCol = headerIndex(header, ["question", "q", "prompt"]);
  let aCol = headerIndex(header, ["answer", "a", "response"]);
  let start = 1;
  if (qCol < 0 || aCol < 0) { qCol = 0; aCol = 1; start = 0; }
  const tagCol = headerIndex(header, ["tags", "tag", "category", "topic"]);
  const out = [];
  for (const r of rows.slice(start)) {
    const question = (r[qCol] || "").trim(), answer = (r[aCol] || "").trim();
    if (question && answer) out.push({ question, answer, tags: tagCol >= 0 ? (r[tagCol] || "").trim() : "" });
  }
  return out;
}

// ---------- domains and kinds ----------
const DOMAINS = [
  ["Access control", /\b(mfa|sso|rbac|password|access|privilege|authenticat|authoriz|account|offboard|onboard)\w*/],
  ["Encryption", /\b(encrypt|atrest|intransit|tls|key manag|cryptograph|hash)\w*/],
  ["Incident response", /\b(incident|notify|notification|breach|forensic)\w*/],
  ["Vulnerability management", /\b(pentest|vulnscan|patch|vulnerabilit|cve|remediat)\w*/],
  ["Business continuity", /\b(continuity|backup|restor|rto|rpo|failover|redundan|availability)\w*/],
  ["Data privacy", /\b(pii|gdpr|ccpa|retention|deletion|delete|residency|privacy|dpa|consent)\w*/],
  ["Third parties", /\b(subprocessor|supplier|outsourc)\w*/],
  ["Compliance & audit", /\b(attestation|audit|certif|compliance|policy|policies|hipaa|pci)\w*/],
  ["People", /\b(bgcheck|training|awareness|employee|personnel|contractor)\w*/],
  ["Logging & monitoring", /\b(auditlog|logging|monitor|siem|alert|log)\w*/],
  ["Endpoint & network", /\b(endpoint|firewall|network|segment|device|laptop|mdm|waf)\w*/],
  ["Software development", /\b(sdlc|code review|source code|secure develop|deploy|change management|staging|production)\w*/],
];

export function categorize(question) {
  const t = normalize(question);
  for (const [name, re] of DOMAINS) if (re.test(t)) return name;
  return "Other";
}

export function answerKind(question) {
  const q = question.trim().toLowerCase();
  if (/^(do|does|did|is|are|was|were|can|will|has|have|would|could)\b/.test(q)) return "yes/no";
  if (/^(list|name|identify|which)\b/.test(q)) return "list";
  return "describe";
}

// ---------- index and matching ----------
export function buildIndex(library) {
  const docs = library.map((e) => {
    const f = features(e.question + " " + (e.tags || ""));
    return { entry: e, tf: count(f) };
  });
  const df = new Map();
  for (const d of docs) for (const k of d.tf.keys()) df.set(k, (df.get(k) || 0) + 1);
  const n = Math.max(docs.length, 1);
  const idf = (k) => Math.log(1 + n / (1 + (df.get(k) || 0))) + 1;
  for (const d of docs) { d.vec = weigh(d.tf, idf); d.norm = norm(d.vec); }
  return { docs, idf };
}

function count(list) { const m = new Map(); for (const x of list) m.set(x, (m.get(x) || 0) + 1); return m; }
function weigh(tf, idf) { const v = new Map(); for (const [k, c] of tf) v.set(k, (1 + Math.log(c)) * idf(k)); return v; }
function norm(v) { let s = 0; for (const x of v.values()) s += x * x; return Math.sqrt(s); }

// Only figures with a unit are compared; "SOC 2" or "TLS 1.2" are names, not limits.
const numbers = (t) => [...String(t).matchAll(/\b(\d+(?:\.\d+)?)\s*(%|percent|hours?|hrs?|days?|weeks?|months?|years?|minutes?|mins?|characters?|chars?)\b/gi)]
  .map((m) => `${m[1]} ${m[2].toLowerCase().replace(/^(hrs?|hours?)$/, "hours").replace(/^(days?)$/, "days").replace(/^(months?)$/, "months").replace(/^(years?)$/, "years").replace(/^(minutes?|mins?)$/, "minutes").replace(/^(weeks?)$/, "weeks").replace(/^percent$/, "%")}`);
const negated = (t) => /\b(not|never|cannot|can't|don't|doesn't|isn't|aren't|won't)\b/i.test(t);

export function match(question, index, { top = 3 } = {}) {
  const f = features(question);
  const qv = weigh(count(f), index.idf), qn = norm(qv);
  const scored = [];
  if (qn > 0) {
    for (const d of index.docs) {
      if (!d.norm) continue;
      let dot = 0;
      for (const [k, w] of qv) { const dw = d.vec.get(k); if (dw) dot += w * dw; }
      if (dot > 0) scored.push({ entry: d.entry, score: dot / (qn * d.norm) });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, top).map((s) => ({ ...s, score: Math.round(s.score * 1000) / 1000 }));
}

export const THRESHOLDS = { strong: 0.62, review: 0.34 };

export function tierOf(score) {
  return score >= THRESHOLDS.strong ? "strong" : score >= THRESHOLDS.review ? "review" : "none";
}

// Things that make a good textual match a wrong answer.
export function riskFlags(question, entry) {
  const flags = [];
  const qn = numbers(question), an = numbers(entry.question), ans = numbers(entry.answer);
  const known = [...an, ...ans];
  if (qn.length) {
    if (!known.length) flags.push(`asks ${qn.join(", ")}; the saved answer states no figure`);
    else if (!qn.every((x) => known.includes(x))) flags.push(`figures differ: asks ${qn.join(", ")}, saved answer says ${known.join(", ")}`);
  }
  if (negated(question) !== negated(entry.question)) flags.push("one question is negated and the other is not: yes/no may flip");
  return flags;
}

export function fill(questions, library) {
  const index = buildIndex(library);
  const seen = new Map();
  const rows = questions.map((q) => {
    const key = tokens(q.question).join(" ");
    const dupOf = seen.get(key);
    if (!dupOf) seen.set(key, q.id);
    const m = library.length ? match(q.question, index) : [];
    const best = m[0];
    const tier = best ? tierOf(best.score) : "none";
    const flags = best && tier !== "none" ? riskFlags(q.question, best.entry) : [];
    if (dupOf) flags.push(`same question as ${dupOf}`);
    const kind = answerKind(q.question);
    return {
      id: q.id, question: q.question, category: categorize(q.question), kind,
      tier: tier === "strong" && flags.some((x) => !x.startsWith("same question")) ? "review" : tier,
      score: best ? best.score : 0,
      answer: tier === "none" ? "" : best.entry.answer,
      source: tier === "none" ? "" : best.entry.question,
      alternatives: m.slice(1).filter((x) => x.score >= THRESHOLDS.review).map((x) => ({ question: x.entry.question, answer: x.entry.answer, score: x.score })),
      flags, status: tier === "none" ? "Write answer" : "Review",
    };
  });
  const counts = { total: rows.length, strong: 0, review: 0, none: 0 };
  for (const r of rows) counts[r.tier]++;
  const gaps = {};
  for (const r of rows) if (r.tier === "none") (gaps[r.category] ||= []).push(r.id);
  return { rows, counts, gaps, librarySize: library.length };
}

export const COLUMNS = ["ID", "Question", "Category", "Answer type", "Match", "Score", "Suggested answer", "Matched saved question", "Flags", "Status"];

export function toCsv(result) {
  const lines = [COLUMNS.map(csvCell).join(",")];
  for (const r of result.rows) {
    lines.push([r.id, r.question, r.category, r.kind, r.tier, r.score.toFixed(2), r.answer, r.source, r.flags.join("; "), r.status].map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
export function toMarkdown(result) {
  const out = [`| ${COLUMNS.join(" | ")} |`, `| ${COLUMNS.map(() => "---").join(" | ")} |`];
  for (const r of result.rows) out.push(`| ${[r.id, r.question, r.category, r.kind, r.tier, r.score.toFixed(2), r.answer, r.source, r.flags.join("; "), r.status].map(mdCell).join(" | ")} |`);
  return out.join("\n") + "\n";
}

// Export the library in the format parseLibrary reads, so it round-trips.
export function libraryToCsv(library) {
  return ["question,answer,tags", ...library.map((e) => [e.question, e.answer, e.tags || ""].map(csvCell).join(","))].join("\r\n") + "\r\n";
}

// New library entries from answers the user typed into the filled sheet.
export function learn(library, answered) {
  const known = new Set(library.map((e) => tokens(e.question).join(" ")));
  const added = [];
  for (const a of answered) {
    const q = (a.question || "").trim(), ans = (a.answer || "").trim();
    if (!q || !ans || known.has(tokens(q).join(" "))) continue;
    known.add(tokens(q).join(" "));
    added.push({ question: q, answer: ans, tags: a.tags || "" });
  }
  return [...library, ...added];
}
