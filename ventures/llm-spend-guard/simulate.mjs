// Replay a usage log through a policy: "would this guard have stopped that
// bill?" Each row is checked at its own timestamp with its real token counts
// (so the hold equals the actual cost) and settled if allowed. Pure; shared
// by the CLI and the browser page.

import { costUsd, createGuard, normalisePolicy, priceFor } from './guard.mjs';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

/** Rows from JSONL, a JSON array, or CSV with a header line. */
export function parseLog(text) {
  const t = String(text ?? '').trim();
  if (!t) return [];
  if (t.startsWith('[')) return JSON.parse(t);
  if (t.startsWith('{')) {
    return t.split(/\r?\n/).filter((l) => l.trim()).map((l, i) => {
      try { return JSON.parse(l); } catch { throw new Error(`line ${i + 1} is not JSON`); }
    });
  }
  const lines = t.split(/\r?\n/).filter((l) => l.trim());
  const head = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => Object.fromEntries(splitCsvLine(l).map((v, i) => [head[i], v])));
}

/** One row as { t, model, usage, scope }, accepting Anthropic- and OpenAI-style fields, nested or flat. */
export function normaliseRow(row, i) {
  const u = row.usage && typeof row.usage === 'object' ? row.usage : row;
  const ts = row.created_at ?? row.timestamp ?? row.time ?? row.ts;
  let t = typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : Date.parse(ts);
  if (!Number.isFinite(t)) t = null;
  let usage;
  if (u.prompt_tokens != null || u.completion_tokens != null || u.prompt_tokens_details) {
    const cached = num(u.prompt_tokens_details?.cached_tokens ?? u.cached_tokens);
    usage = { input: Math.max(0, num(u.prompt_tokens) - cached), output: num(u.completion_tokens), cacheRead: cached, cacheWrite: 0 };
  } else {
    usage = {
      input: num(u.input_tokens),
      output: num(u.output_tokens),
      cacheRead: num(u.cache_read_input_tokens ?? u.cache_read_tokens),
      cacheWrite: num(u.cache_creation_input_tokens ?? u.cache_write_tokens),
    };
  }
  return {
    index: i,
    t,
    model: row.model ?? null,
    usage,
    scope: {
      user: row.user ?? row.user_id ?? undefined,
      feature: row.feature ?? row.label ?? undefined,
      run: row.run ?? row.run_id ?? row.trace_id ?? row.session_id ?? undefined,
      key: row.key ?? row.api_key_id ?? undefined,
    },
    // Without a hash in the log every row is distinct: a replay cannot tell
    // two prompts apart from token counts, so it never invents a repeat.
    fingerprint: row.fingerprint ?? row.prompt_hash ?? `row-${i}`,
  };
}

/**
 * Replay rows through a policy. Rows without a timestamp are spaced one
 * second apart after the previous row, so order still drives the breakers.
 * Returns totals, the first refusals, and the end-of-replay budget state.
 */
export function simulate(rawPolicy, rawRows, { maxEvents = 200 } = {}) {
  const policy = normalisePolicy({ ...rawPolicy, mode: 'enforce' });
  const rows = rawRows.map(normaliseRow);
  let last = rows.find((r) => r.t != null)?.t ?? Date.UTC(2026, 0, 1);
  for (const r of rows) {
    if (r.t == null) r.t = last + 1000;
    last = r.t;
  }
  rows.sort((a, b) => a.t - b.t || a.index - b.index);

  let clock = rows[0]?.t ?? 0;
  const events = [];
  const guard = createGuard(policy, { now: () => clock, onEvent: (e) => { if (e.type === 'trip' || e.type === 'alert') events.push(e); } });

  const totals = { rows: rows.length, allowed: 0, blocked: 0, unpriced: 0, actualUsd: 0, allowedUsd: 0, blockedUsd: 0 };
  const byCode = {};
  const refusals = [];
  let firstBlock = null;

  for (const r of rows) {
    clock = r.t;
    const price = priceFor(policy, r.model);
    const actual = price ? costUsd(price, r.usage) : 0;
    if (!price) totals.unpriced++;
    totals.actualUsd += actual;
    const d = guard.check({
      model: r.model,
      // The replay knows the true counts, so the hold is the real cost.
      inputTokens: r.usage.input + r.usage.cacheRead + r.usage.cacheWrite,
      maxOutputTokens: r.usage.output > 0 ? r.usage.output : 1,
      scope: r.scope,
      fingerprint: r.fingerprint,
    });
    if (d.allowed) {
      guard.settle(d.id, r.usage);
      totals.allowed++;
      totals.allowedUsd += actual;
    } else {
      totals.blocked++;
      totals.blockedUsd += actual;
      for (const reason of d.reasons) byCode[reason.code] = (byCode[reason.code] ?? 0) + 1;
      if (!firstBlock) firstBlock = { row: r.index, at: new Date(r.t).toISOString(), reasons: d.reasons };
      if (refusals.length < maxEvents) refusals.push({ row: r.index, at: new Date(r.t).toISOString(), model: r.model, costUsd: actual, codes: d.reasons.map((x) => x.code), message: d.reasons[0].message });
    }
  }
  const round = (x) => Math.round(x * 1e4) / 1e4;
  for (const k of ['actualUsd', 'allowedUsd', 'blockedUsd']) totals[k] = round(totals[k]);
  return {
    totals,
    byCode,
    firstBlock,
    refusals,
    events: events.slice(0, maxEvents),
    span: rows.length ? { from: new Date(rows[0].t).toISOString(), to: new Date(rows[rows.length - 1].t).toISOString() } : null,
    end: guard.status(),
  };
}

/**
 * A synthetic runaway: an agent stuck re-sending the same request, plus
 * ordinary traffic. Labelled as made up wherever it is shown; it exists so the
 * page and the tests demonstrate a trip without anyone's real log.
 */
export function exampleRunawayLog({ start = Date.UTC(2026, 9, 14, 9, 0, 0) } = {}) {
  const rows = [];
  for (let i = 0; i < 40; i++) {
    rows.push({ created_at: new Date(start + i * 90_000).toISOString(), model: 'example-large', user: `u${i % 7}`, feature: 'chat', usage: { input_tokens: 1800, output_tokens: 350 } });
  }
  const loopStart = start + 20 * 60_000;
  for (let i = 0; i < 600; i++) {
    rows.push({ created_at: new Date(loopStart + i * 2_000).toISOString(), model: 'example-large', user: 'u3', feature: 'agent', run_id: 'run-42', prompt_hash: 'retry-same-tool-call', usage: { input_tokens: 24000 + i * 40, output_tokens: 1200 } });
  }
  return rows;
}

export const EXAMPLE_POLICY = Object.freeze({
  _note: 'Example policy. The prices are placeholders named example-*; put your provider\'s current rates in before relying on any figure.',
  mode: 'enforce',
  prices: {
    'example-large': { in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    'example-small': { in: 0.8, out: 4 },
  },
  requireKnownPrice: true,
  defaultMaxOutputTokens: 1024,
  maxOutputTokens: 8192,
  maxCostPerCallUsd: 0.5,
  budgets: [
    { id: 'org-day', scope: 'global', window: 'day', limitUsd: 25, alertAt: [0.5, 0.8, 1] },
    { id: 'org-month', scope: 'global', window: 'month', limitUsd: 400 },
    { id: 'user-day', scope: 'user', window: 'day', limitUsd: 2 },
    { id: 'run-total', scope: 'run', window: 'total', limitUsd: 3, limitCalls: 150 },
  ],
  breakers: [
    { id: 'loop', scope: 'run', maxRepeats: 20, repeatWindowSec: 300, cooldownSec: 900 },
    { id: 'burst', scope: 'global', maxCallsPerMinute: 120, maxSpendPerMinuteUsd: 2, cooldownSec: 120 },
  ],
});
