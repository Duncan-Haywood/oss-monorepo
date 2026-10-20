// LLM Usage Log Analyzer -- arithmetic over a usage log the visitor pastes in.
// No network, no vendor pricing baked in: every rate is supplied by the caller
// (see ../llm-api-pricing-calculator/calc.mjs for the same discipline). What
// this adds over a pricing calculator is that it starts from what the API
// actually reported per request, so it can say where the money went and which
// of a few levers would have saved some of it.
//
// Token semantics follow each API's own usage object, because getting this
// wrong double-counts cached tokens and is the most common error in hand-made
// cost sheets:
//   Anthropic  input_tokens EXCLUDES cache_read_input_tokens and
//              cache_creation_input_tokens (three separate buckets).
//   OpenAI     prompt_tokens / input_tokens INCLUDE
//              (prompt|input)_tokens_details.cached_tokens, so the fresh part
//              is the difference.

const MILLION = 1_000_000;

// ---------------------------------------------------------------- parsing

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function toObjects(text) {
  const body = String(text ?? "").trim();
  if (!body) return { rows: [], errors: 0 };
  if (body[0] === "[" || (body[0] === "{" && !body.includes("\n"))) {
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed)) return { rows: parsed, errors: 0 };
      if (Array.isArray(parsed?.data)) return { rows: parsed.data, errors: 0 };
      return { rows: [parsed], errors: 0 };
    } catch {
      /* fall through to line-by-line */
    }
  }
  if (body[0] === "{") {
    const rows = [];
    let errors = 0;
    for (const line of body.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try { rows.push(JSON.parse(line)); } catch { errors++; }
    }
    return { rows, errors };
  }
  const lines = body.split(/\r?\n/).filter((l) => l.trim());
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((l) => {
    const cells = splitCsvLine(l);
    const obj = {};
    header.forEach((h, i) => { obj[h] = cells[i]; });
    return obj;
  });
  return { rows, errors: 0 };
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function toTimestamp(v) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v))) {
    const n = Number(v);
    return n < 1e11 ? n * 1000 : n; // seconds vs milliseconds
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

function normalize(row) {
  if (!row || typeof row !== "object") return null;
  const inner = row.response ?? row.message ?? row;
  const u = row.usage ?? inner.usage ?? row;
  const model = String(row.model ?? inner.model ?? u.model ?? "").trim();
  const details = u.prompt_tokens_details ?? u.input_tokens_details ?? {};
  const anthropicShape =
    u.cache_read_input_tokens !== undefined || u.cache_creation_input_tokens !== undefined;
  const rawInput = num(u.input_tokens ?? u.prompt_tokens);
  const output = num(u.output_tokens ?? u.completion_tokens);
  let fresh;
  let cacheRead;
  const cacheWrite = num(u.cache_creation_input_tokens);
  if (anthropicShape) {
    fresh = rawInput;
    cacheRead = num(u.cache_read_input_tokens);
  } else {
    cacheRead = Math.min(num(details.cached_tokens ?? u.cached_tokens), rawInput);
    fresh = rawInput - cacheRead;
  }
  if (!model || fresh + cacheRead + cacheWrite + output === 0) return null;
  const ts = toTimestamp(row.created_at ?? row.timestamp ?? row.created ?? row.date ?? row.ts ?? inner.created);
  const label = String(row.label ?? row.feature ?? row.tag ?? row.metadata?.feature ?? "").trim();
  return {
    model,
    fresh,
    cacheRead,
    cacheWrite,
    output,
    ts,
    day: ts === null ? null : new Date(ts).toISOString().slice(0, 10),
    label,
  };
}

export function parseUsageLog(text) {
  const { rows, errors } = toObjects(text);
  const records = [];
  let skipped = errors;
  for (const row of rows) {
    const rec = normalize(row);
    if (rec) records.push(rec);
    else skipped++;
  }
  return { records, skipped };
}

// ---------------------------------------------------------------- pricing

/** Longest rate key that is a prefix of (or equal to) the model id, case-insensitive. */
export function findRate(model, rates) {
  const m = model.toLowerCase();
  let best = null;
  for (const key of Object.keys(rates ?? {})) {
    const k = key.toLowerCase();
    if ((m === k || m.startsWith(k)) && (!best || k.length > best.length)) best = k;
  }
  if (!best) return null;
  return Object.entries(rates).find(([k]) => k.toLowerCase() === best)[1];
}

export function normalizeRate(r) {
  const input = num(r.input);
  return {
    input,
    cachedInput: r.cachedInput === undefined || r.cachedInput === "" ? input : num(r.cachedInput),
    cacheWrite: r.cacheWrite === undefined || r.cacheWrite === "" ? input : num(r.cacheWrite),
    output: num(r.output),
  };
}

export function recordCost(rec, rate) {
  const r = normalizeRate(rate);
  return (
    (rec.fresh * r.input + rec.cacheRead * r.cachedInput + rec.cacheWrite * r.cacheWrite + rec.output * r.output) /
    MILLION
  );
}

// --------------------------------------------------------------- analysis

const round = (n, d = 6) => Math.round(n * 10 ** d) / 10 ** d;

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function group(records, keyOf, rates) {
  const map = new Map();
  for (const rec of records) {
    const key = keyOf(rec);
    if (key === null) continue;
    const g = map.get(key) ?? { key, requests: 0, fresh: 0, cacheRead: 0, cacheWrite: 0, output: 0, cost: 0, unpriced: 0 };
    g.requests++;
    g.fresh += rec.fresh;
    g.cacheRead += rec.cacheRead;
    g.cacheWrite += rec.cacheWrite;
    g.output += rec.output;
    const rate = findRate(rec.model, rates);
    if (rate) g.cost += recordCost(rec, rate);
    else g.unpriced++;
    map.set(key, g);
  }
  return [...map.values()].map((g) => {
    const input = g.fresh + g.cacheRead;
    return { ...g, cost: round(g.cost), cacheHitRate: input ? g.cacheRead / input : null };
  });
}

export function analyze(records, rates, options = {}) {
  const { cacheTarget = 0.7, batchShare = 0, batchDiscount = 0.5, outlierFactor = 5 } = options;
  const byModel = group(records, (r) => r.model, rates).sort((a, b) => b.cost - a.cost);
  const byLabel = group(records, (r) => r.label || null, rates).sort((a, b) => b.cost - a.cost);
  const byDay = group(records, (r) => r.day, rates).sort((a, b) => (a.key < b.key ? -1 : 1));

  const total = byModel.reduce((s, g) => s + g.cost, 0);
  const unpricedRequests = byModel.reduce((s, g) => s + g.unpriced, 0);

  // Most expensive individual requests, and how concentrated spend is.
  const priced = records
    .map((rec) => {
      const rate = findRate(rec.model, rates);
      return rate ? { rec, cost: recordCost(rec, rate) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.cost - a.cost);
  const share = (frac) => {
    if (!priced.length || total === 0) return 0;
    const n = Math.max(1, Math.ceil(priced.length * frac));
    return priced.slice(0, n).reduce((s, p) => s + p.cost, 0) / total;
  };

  let forecast = null;
  if (byDay.length >= 2) {
    const first = Date.parse(byDay[0].key);
    const last = Date.parse(byDay[byDay.length - 1].key);
    const spanDays = Math.round((last - first) / 86_400_000) + 1;
    const dailyAvg = total / spanDays;
    forecast = { spanDays, dailyAvg: round(dailyAvg), projected30Days: round(dailyAvg * 30) };
  }

  const findings = [];

  // 1. Low cache hit rate on models where a cached token is cheaper than a fresh one.
  for (const g of byModel) {
    const rate = findRate(g.key, rates);
    if (!rate || g.cacheHitRate === null) continue;
    const r = normalizeRate(rate);
    const gap = r.input - r.cachedInput;
    if (gap <= 0 || g.cacheHitRate >= cacheTarget) continue;
    const inputTokens = g.fresh + g.cacheRead;
    const moved = cacheTarget * inputTokens - g.cacheRead;
    const savings = (moved * gap) / MILLION;
    if (savings < 0.01) continue;
    findings.push({
      id: "cache-hit-rate",
      model: g.key,
      savings: round(savings, 2),
      title: `${g.key}: only ${(g.cacheHitRate * 100).toFixed(0)}% of input tokens were cache reads`,
      detail:
        `Reaching a ${(cacheTarget * 100).toFixed(0)}% cache-read share on this model's input would have moved ` +
        `${Math.round(moved).toLocaleString()} tokens from the fresh rate to the cached rate. Upper bound: it ignores ` +
        `cache-write cost and assumes the repeated prefix is long and stable enough to cache. ` +
        `Check that stable content (system prompt, tools, documents) comes first and is byte-identical between calls.`,
    });
  }

  // 2. Batch what-if on a share of spend the caller says is not latency-sensitive.
  if (batchShare > 0 && batchDiscount > 0 && total > 0) {
    findings.push({
      id: "batch-discount",
      savings: round(total * batchShare * batchDiscount, 2),
      title: `Moving ${(batchShare * 100).toFixed(0)}% of traffic to a ${(batchDiscount * 100).toFixed(0)}%-off batch tier`,
      detail:
        "Only valid for work that can wait (evals, backfills, nightly summaries) and only where your provider " +
        "actually offers a batch discount; the discount is the figure you entered, not a vendor claim.",
    });
  }

  // 3. Runaway-context outliers: requests whose input dwarfs the median.
  const inputs = records.map((r) => r.fresh + r.cacheRead + r.cacheWrite);
  const med = median(inputs);
  if (med > 0 && priced.length) {
    const big = priced.filter((p) => p.rec.fresh + p.rec.cacheRead + p.rec.cacheWrite > med * outlierFactor);
    const bigCost = big.reduce((s, p) => s + p.cost, 0);
    if (big.length && bigCost / total >= 0.1) {
      findings.push({
        id: "context-outliers",
        savings: null,
        title: `${big.length} request${big.length === 1 ? "" : "s"} sent more than ${outlierFactor}x the median input and cost ${(bigCost / total * 100).toFixed(0)}% of spend`,
        detail:
          `Median input is ${Math.round(med).toLocaleString()} tokens. Look for unbounded conversation history, ` +
          `whole files pasted in place of a retrieved excerpt, or tool results that are never truncated.`,
      });
    }
  }

  findings.sort((a, b) => (b.savings ?? -1) - (a.savings ?? -1));

  return {
    requests: records.length,
    totalCost: round(total, 2),
    unpricedRequests,
    unpricedModels: byModel.filter((g) => g.unpriced > 0).map((g) => g.key),
    byModel,
    byLabel,
    byDay,
    forecast,
    concentration: { top1pct: share(0.01), top5pct: share(0.05) },
    topRequests: priced.slice(0, 5).map((p) => ({ model: p.rec.model, label: p.rec.label, cost: round(p.cost, 4), inputTokens: p.rec.fresh + p.rec.cacheRead + p.rec.cacheWrite, outputTokens: p.rec.output })),
    findings,
  };
}

/**
 * What the same traffic would have cost if `share` (0..1) of `fromModel`'s
 * requests had run on `toModel` at its rates. Same tokens, different price --
 * it says nothing about whether the cheaper model is good enough for the task.
 */
export function modelSwitchSavings(records, rates, fromModel, toModel, share) {
  const to = findRate(toModel, rates);
  if (!to) throw new Error(`No rate entered for ${toModel}.`);
  if (!(share >= 0 && share <= 1)) throw new Error("Share must be between 0 and 1.");
  let now = 0;
  let after = 0;
  for (const rec of records) {
    const rate = findRate(rec.model, rates);
    if (!rate || rec.model.toLowerCase() !== fromModel.toLowerCase()) continue;
    const cost = recordCost(rec, rate);
    now += cost * share;
    after += recordCost(rec, to) * share;
  }
  return { current: round(now, 2), after: round(after, 2), savings: round(now - after, 2) };
}

export function reportText(analysis) {
  const usd = (n) => {
    const format = (n) => `$${n.toFixed(2)}`;
    const text = format(Math.abs(n));
    return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const lines = [`LLM usage: ${analysis.requests.toLocaleString()} requests, ${usd(analysis.totalCost)} at the rates entered.`];
  if (analysis.forecast) {
    lines.push(`Run rate: ${usd(analysis.forecast.dailyAvg)}/day over ${analysis.forecast.spanDays} days, about ${usd(analysis.forecast.projected30Days)} per 30 days.`);
  }
  for (const g of analysis.byModel.slice(0, 5)) lines.push(`  ${g.key}: ${usd(g.cost)} (${g.requests.toLocaleString()} requests)`);
  if (analysis.unpricedRequests) lines.push(`Not priced (no rate entered): ${analysis.unpricedModels.join(", ")}.`);
  for (const f of analysis.findings) lines.push(`- ${f.title}${f.savings ? ` -- up to ${usd(f.savings)}` : ""}`);
  return lines.join("\n");
}
