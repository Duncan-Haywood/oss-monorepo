// Zero-dependency, deterministic static scan of source text for LLM API call
// sites that quietly cost money: no output cap, a call inside a loop, a
// premium-tier model hard-coded where a cheaper sibling usually does the job,
// and model names a vendor has retired. Pure string in, findings out -- no
// filesystem or network here (cli.mjs and index.html supply the text).
//
// This is a linter, not a bill. It never sees your traffic, so any dollar
// figure is "calls/day x tokens x list price you can override", labelled as
// an estimate everywhere it is shown.

// Per-million-token USD list prices. ILLUSTRATIVE and dated: vendors reprice
// often, so every number is overridable (`--prices file.json`, or the price
// boxes in the browser page) and an unpriced model reports "no price" rather
// than guessing. Matched by longest prefix.
export const PRICES_AS_OF = "2025-01 list prices; verify against the vendor's pricing page";
export const DEFAULT_PRICES = {
  "gpt-4o-mini": { in: 0.15, out: 0.6, tier: "small", vendor: "openai" },
  "gpt-4o": { in: 2.5, out: 10, tier: "premium", vendor: "openai" },
  "gpt-4-turbo": { in: 10, out: 30, tier: "premium", vendor: "openai" },
  "gpt-3.5-turbo": { in: 0.5, out: 1.5, tier: "small", vendor: "openai" },
  "claude-3-5-haiku": { in: 0.8, out: 4, tier: "small", vendor: "anthropic" },
  "claude-3-haiku": { in: 0.25, out: 1.25, tier: "small", vendor: "anthropic" },
  "claude-3-5-sonnet": { in: 3, out: 15, tier: "mid", vendor: "anthropic" },
  "claude-3-opus": { in: 15, out: 75, tier: "premium", vendor: "anthropic" },
  "gemini-1.5-flash": { in: 0.075, out: 0.3, tier: "small", vendor: "google" },
  "gemini-1.5-pro": { in: 1.25, out: 5, tier: "mid", vendor: "google" },
};

// Names the vendors have publicly retired. Deliberately short and limited to
// ones that are unambiguous; the report says to confirm on the vendor's
// deprecations page rather than treating this list as complete.
const RETIRED = [
  "text-davinci-003", "text-davinci-002", "code-davinci-002",
  "gpt-3.5-turbo-0301", "gpt-3.5-turbo-0613", "gpt-4-0314", "gpt-4-0613",
  "claude-v1", "claude-instant-1", "claude-2.0", "claude-2.1",
];

const CALL_SITES = [
  { vendor: "openai", re: /\.chat\.completions\.create\s*\(/ },
  { vendor: "openai", re: /\.responses\.create\s*\(/ },
  { vendor: "anthropic", re: /\.messages\.(?:create|stream)\s*\(/ },
  { vendor: "google", re: /\.generate_?[cC]ontent(?:_?[sS]tream)?\s*\(/ },
];
const CAP_PARAM = /\b(?:max_tokens|max_completion_tokens|max_output_tokens|maxOutputTokens|maxTokens|max_tokens_to_sample)\b/;
const MODEL_LITERAL = /\bmodel\s*[:=]\s*["']([A-Za-z0-9][A-Za-z0-9._:/-]*)["']/;
const LOOP_HEAD = /^\s*(?:for\b|while\b|async\s+for\b)|\.(?:map|forEach|flatMap)\s*\(|\bPromise\.all\s*\(/;

const WINDOW = 25; // lines after a call site searched for its own arguments
const LOOP_LOOKBACK = 12;

export function priceFor(model, prices = DEFAULT_PRICES) {
  const name = String(model || "").toLowerCase().replace(/^(?:models\/|openai\/|anthropic\/|google\/)/, "");
  let best = null;
  for (const key of Object.keys(prices)) {
    if (name.startsWith(key.toLowerCase()) && (!best || key.length > best.length)) best = key;
  }
  return best ? { key: best, ...prices[best] } : null;
}

function indentOf(line) {
  return line.length - line.trimStart().length;
}

/** Finds the sibling-tier suggestion for a premium/mid model: the cheapest priced model of the same vendor. */
export function cheaperSibling(model, prices = DEFAULT_PRICES) {
  const p = priceFor(model, prices);
  if (!p || p.tier === "small") return null;
  let best = null;
  for (const [key, v] of Object.entries(prices)) {
    if (v.vendor === p.vendor && v.tier === "small" && (!best || v.in + v.out < best.in + best.out)) best = { key, ...v };
  }
  return best;
}

/**
 * Scans one file's text. Returns { calls: [...], findings: [...] }.
 * A "call" is a recognised SDK call site; its model is the first
 * `model: "literal"` / `model="literal"` within WINDOW lines (a model passed
 * via a variable is reported as `model: null` and never flagged for tier --
 * the scan cannot see through it and says so).
 */
export function scanSource(text, file = "", prices = DEFAULT_PRICES) {
  const lines = String(text ?? "").split(/\r?\n/);
  const calls = [];
  const findings = [];

  lines.forEach((line, i) => {
    const site = CALL_SITES.find((s) => s.re.test(line));
    if (!site) return;
    if (/^\s*(?:#|\/\/|\*)/.test(line)) return; // a commented-out call costs nothing

    const end = Math.min(lines.length, i + WINDOW);
    let model = null;
    let modelLine = i + 1;
    let capped = false;
    let depth = 0;
    let started = false;
    for (let j = i; j < end; j += 1) {
      const l = lines[j];
      if (!model) {
        const m = MODEL_LITERAL.exec(l);
        if (m) { model = m[1]; modelLine = j + 1; }
      }
      if (CAP_PARAM.test(l)) capped = true;
      for (const ch of l) {
        if (ch === "(") { depth += 1; started = true; }
        else if (ch === ")") depth -= 1;
      }
      if (started && depth <= 0) break; // end of this call's argument list
    }

    // Loop check: a loop head at a shallower indent within LOOP_LOOKBACK lines.
    let inLoop = false;
    const here = indentOf(line);
    for (let j = i - 1; j >= Math.max(0, i - LOOP_LOOKBACK); j -= 1) {
      const l = lines[j];
      if (!l.trim()) continue;
      if (indentOf(l) < here && LOOP_HEAD.test(l)) { inLoop = true; break; }
      if (indentOf(l) < here && /^\s*(?:def|function|class|async\s+function)\b/.test(l)) break;
    }

    const call = { file, line: i + 1, vendor: site.vendor, model, modelLine, capped, inLoop };
    calls.push(call);
    const at = { file, line: i + 1 };

    if (!capped) {
      findings.push({ ...at, rule: "no-output-cap", severity: "warn", model,
        message: "no max-tokens parameter in this call: a runaway or adversarial prompt can generate the model's full output limit on every call" });
    }
    if (inLoop) {
      findings.push({ ...at, rule: "call-in-loop", severity: "warn", model,
        message: "LLM call inside a loop: cost scales with the loop's length, so check what bounds it and whether items can be batched into one prompt" });
    }
    if (model) {
      const lower = model.toLowerCase();
      if (RETIRED.some((r) => lower === r || lower.startsWith(`${r}-`))) {
        findings.push({ file, line: modelLine, rule: "retired-model", severity: "error", model,
          message: `"${model}" is on this tool's list of names vendors have retired -- confirm on the vendor's deprecations page; calls to a retired name fail` });
      }
      const sibling = cheaperSibling(model, prices);
      if (sibling) {
        const p = priceFor(model, prices);
        findings.push({ file, line: modelLine, rule: "premium-model-hardcoded", severity: "info", model,
          message: `"${model}" is a ${p.tier}-tier model (${p.in}/${p.out} USD per M tokens in/out); ${sibling.key} (${sibling.in}/${sibling.out}) is the same vendor's small tier -- worth an eval on your own prompts before assuming you need the larger one` });
      }
    } else {
      findings.push({ ...at, rule: "model-not-literal", severity: "info", model: null,
        message: "model is not a string literal within this call, so the scan cannot price it; pass --prices or inspect where the name is set" });
    }
  });

  return { calls, findings };
}

export function mergeScans(scans) {
  return { calls: scans.flatMap((s) => s.calls), findings: scans.flatMap((s) => s.findings) };
}

/**
 * Monthly cost estimate for the priced calls found. `assume` is the user's
 * own traffic guess; the result is arithmetic on it, never a measurement.
 */
export function estimateMonthly(calls, { callsPerDay = 1000, inTokens = 1000, outTokens = 300, days = 30 } = {}, prices = DEFAULT_PRICES) {
  const rows = [];
  let total = 0;
  for (const c of calls) {
    const p = c.model ? priceFor(c.model, prices) : null;
    if (!p) { rows.push({ ...c, monthly: null }); continue; }
    const monthly = ((inTokens * p.in + outTokens * p.out) / 1e6) * callsPerDay * days;
    total += monthly;
    rows.push({ ...c, monthly, price: p });
  }
  return { rows, total, pricedCount: rows.filter((r) => r.monthly !== null).length };
}

export function summarize({ calls, findings }) {
  const errors = findings.filter((f) => f.severity === "error").length;
  const warns = findings.filter((f) => f.severity === "warn").length;
  const infos = findings.filter((f) => f.severity === "info").length;
  if (calls.length === 0) return { status: "none", errors, warns, infos, text: "No LLM SDK call sites recognised in the scanned source." };
  const status = errors ? "error" : warns ? "warn" : "ok";
  return { status, errors, warns, infos, text: `${calls.length} LLM call site(s): ${errors} error, ${warns} warning, ${infos} note.` };
}

export const CHECKED_PATTERNS = [
  { vendor: "OpenAI", examples: "client.chat.completions.create(, client.responses.create(" },
  { vendor: "Anthropic", examples: "client.messages.create(, client.messages.stream(" },
  { vendor: "Google", examples: "model.generate_content(, model.generateContent(" },
];
