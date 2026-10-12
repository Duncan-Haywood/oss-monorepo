// Deterministic regression checks between two sets of saved LLM outputs (baseline vs candidate),
// e.g. before and after a model swap or a prompt edit. No network, no model calls, no dependencies.

export const OUTPUT_KEYS = ["output", "text", "response", "completion", "content", "answer"];

export const DEFAULTS = { maxLengthRatio: 2, minSimilarity: 0.2 };

const REFUSAL = /\b(i can(?:no|')t (?:help|assist|comply)|i(?:'m| am) (?:unable|not able) to|i won't be able to|i(?:'m| am) sorry, but|as an ai(?: language model)?|i cannot (?:help|assist|provide|comply))/i;

// Accepts JSONL (one object per line) or a JSON array. Each record needs an `id` and one of OUTPUT_KEYS.
export function parseRecords(text) {
  const errors = [];
  const records = new Map();
  const trimmed = String(text ?? "").trim();
  let items = [];
  if (trimmed.startsWith("[")) {
    try { items = JSON.parse(trimmed); } catch (e) { return { records, errors: [`not valid JSON: ${e.message}`] }; }
  } else {
    trimmed.split(/\r?\n/).forEach((line, i) => {
      if (!line.trim()) return;
      try { items.push(JSON.parse(line)); } catch { errors.push(`line ${i + 1}: not valid JSON`); }
    });
  }
  items.forEach((it, i) => {
    if (!it || typeof it !== "object" || Array.isArray(it)) { errors.push(`record ${i + 1}: not an object`); return; }
    const id = it.id ?? it.case ?? it.name;
    if (id === undefined || id === null || id === "") { errors.push(`record ${i + 1}: missing "id"`); return; }
    const key = OUTPUT_KEYS.find((k) => typeof it[k] === "string");
    if (!key) { errors.push(`record ${i + 1} (${id}): no string field among ${OUTPUT_KEYS.join(", ")}`); return; }
    if (records.has(String(id))) { errors.push(`record ${i + 1}: duplicate id "${id}"`); return; }
    records.set(String(id), it[key]);
  });
  return { records, errors };
}

const words = (s) => (String(s).toLowerCase().match(/[\p{L}\p{N}']+/gu) || []);

export function similarity(a, b) {
  const A = new Set(words(a)), B = new Set(words(b));
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return Math.round((inter / (A.size + B.size - inter)) * 1000) / 1000;
}

function stripFence(s) {
  const m = /^\s*```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i.exec(s);
  return m ? m[1] : s;
}

export function tryJson(s) {
  const t = stripFence(String(s)).trim();
  if (!/^[\[{]/.test(t)) return { ok: false };
  try { return { ok: true, value: JSON.parse(t) }; } catch { return { ok: false, looksJson: true }; }
}

const numbers = (s) => new Set((String(s).replace(/,(?=\d{3}\b)/g, "").match(/-?\d+(?:\.\d+)?/g) || []).map((n) => String(Number(n))));
const fences = (s) => (String(s).match(/^\s*```/gm) || []).length;
const hasList = (s) => /^\s*(?:[-*]|\d+[.)])\s+\S/m.test(s);
const hasHeading = (s) => /^\s*#{1,6}\s+\S/m.test(s);
const hasFence = (s) => fences(s) > 0;

// Severity: "error" = likely broke a downstream consumer; "warn" = worth a human look.
export function checkCase(base, cand, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const f = [];
  const add = (rule, severity, detail) => f.push({ rule, severity, detail });
  if (!String(cand).trim()) {
    add("empty", "error", "candidate output is empty");
    return f;
  }
  const bj = tryJson(base), cj = tryJson(cand);
  if (bj.ok && !cj.ok) add("json-broken", "error", "baseline parses as JSON, candidate does not");
  if (bj.ok && cj.ok && bj.value && cj.value && typeof bj.value === "object" && typeof cj.value === "object" && !Array.isArray(bj.value) && !Array.isArray(cj.value)) {
    const lost = Object.keys(bj.value).filter((k) => !(k in cj.value));
    const added = Object.keys(cj.value).filter((k) => !(k in bj.value));
    if (lost.length) add("json-keys-lost", "error", `keys missing from candidate: ${lost.join(", ")}`);
    if (added.length) add("json-keys-added", "warn", `new keys in candidate: ${added.join(", ")}`);
    for (const k of Object.keys(bj.value)) {
      if (k in cj.value && typeof bj.value[k] !== typeof cj.value[k]) add("json-type-changed", "error", `"${k}" changed from ${typeof bj.value[k]} to ${typeof cj.value[k]}`);
    }
  }
  if (REFUSAL.test(cand) && !REFUSAL.test(base)) add("new-refusal", "error", "candidate contains refusal or apology wording the baseline did not");
  if (fences(cand) % 2 === 1) add("unclosed-code-fence", "error", "candidate has an unclosed ``` code fence (likely truncated)");
  const bl = String(base).trim().length, cl = String(cand).trim().length;
  if (bl > 0) {
    const r = cl / bl;
    if (r > o.maxLengthRatio || r < 1 / o.maxLengthRatio) add("length-drift", "warn", `length changed ${bl} -> ${cl} characters (x${Math.round(r * 100) / 100})`);
  }
  const sim = similarity(base, cand);
  if (!bj.ok && sim < o.minSimilarity) add("low-similarity", "warn", `word overlap with baseline is only ${sim} (threshold ${o.minSimilarity})`);
  const bn = numbers(base), cn = numbers(cand);
  const lostN = [...bn].filter((n) => !cn.has(n));
  if (bn.size && lostN.length) add("numbers-lost", "warn", `numbers in baseline absent from candidate: ${lostN.slice(0, 8).join(", ")}${lostN.length > 8 ? ", ..." : ""}`);
  const shifts = [];
  if (hasList(base) && !hasList(cand)) shifts.push("list");
  if (hasHeading(base) && !hasHeading(cand)) shifts.push("heading");
  if (hasFence(base) && !hasFence(cand)) shifts.push("code block");
  if (shifts.length) add("format-lost", "warn", `baseline used ${shifts.join(", ")}; candidate does not`);
  const endBase = /[.!?)\]}"'`]$/.test(String(base).trim()), endCand = /[.!?)\]}"'`]$/.test(String(cand).trim());
  if (endBase && !endCand && !cj.ok) add("possibly-truncated", "warn", "baseline ends cleanly, candidate stops mid-sentence");
  return f;
}

export function diff(baseText, candText, opts = {}) {
  const b = parseRecords(baseText), c = parseRecords(candText);
  const inputErrors = [...b.errors.map((e) => `baseline: ${e}`), ...c.errors.map((e) => `candidate: ${e}`)];
  const cases = [];
  for (const [id, base] of b.records) {
    if (!c.records.has(id)) { cases.push({ id, similarity: 0, findings: [{ rule: "missing", severity: "error", detail: "no candidate output for this id" }] }); continue; }
    const cand = c.records.get(id);
    cases.push({ id, similarity: similarity(base, cand), findings: checkCase(base, cand, opts) });
  }
  const extra = [...c.records.keys()].filter((id) => !b.records.has(id));
  const errorCases = cases.filter((x) => x.findings.some((y) => y.severity === "error")).length;
  const warnCases = cases.filter((x) => !x.findings.some((y) => y.severity === "error") && x.findings.length).length;
  return {
    cases, extraIds: extra, inputErrors,
    summary: { total: cases.length, clean: cases.length - errorCases - warnCases, warnCases, errorCases },
  };
}

export function verdict(result, { maxRegressions = 0, failOn = "error" } = {}) {
  const bad = failOn === "warn" ? result.summary.errorCases + result.summary.warnCases : result.summary.errorCases;
  const s = result.summary;
  const text = `${s.total} case(s): ${s.clean} clean, ${s.warnCases} with warnings, ${s.errorCases} regressed` + (bad > maxRegressions ? ` — over the limit of ${maxRegressions}` : ".");
  return { fail: bad > maxRegressions, text };
}
