#!/usr/bin/env node
// llm-spend-guard: hard spend caps and runaway-loop breakers for LLM API calls.
//
//   node cli.mjs init [policy.json]                  write an example policy
//   node cli.mjs check-policy policy.json            validate and summarise it
//   node cli.mjs simulate policy.json usage.jsonl    replay a usage log through it
//   node cli.mjs proxy policy.json [--port 8787] [--host 127.0.0.1] [--state state.json]
//
// Proxy environment (all optional):
//   ANTHROPIC_API_KEY, OPENAI_API_KEY   the deployer's upstream keys; when unset, callers' keys pass through
//   ANTHROPIC_UPSTREAM, OPENAI_UPSTREAM  upstream base URLs (default: the providers' public APIs)
//   GUARD_PROXY_TOKENS                  comma-separated tokens callers must send when an upstream key is set
//   GUARD_ADMIN_TOKEN                   bearer token for /guard/status, /guard/halt, /guard/resume
//   GUARD_WEBHOOK_URL                   POST alerts, trips and halts here (Slack-compatible {"text": ...})

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createGuard, normalisePolicy } from './guard.mjs';
import { EXAMPLE_POLICY, parseLog, simulate } from './simulate.mjs';

export const DISCLAIMER = 'No warranty. LLM Spend Guard is free, as-is software, not financial advice and not a billing system: '
  + 'it estimates cost from the prices you configure and the usage providers report, and may differ from your invoice. '
  + 'Set provider-side spend limits too. You are responsible for verifying its configuration and output.';

const HELP = `llm-spend-guard: hard spend caps and runaway-loop breakers for LLM API calls

usage:
  node cli.mjs init [policy.json]
  node cli.mjs check-policy <policy.json>
  node cli.mjs simulate <policy.json> <usage.jsonl|.json|.csv> [--json]
  node cli.mjs proxy <policy.json> [--port 8787] [--host 127.0.0.1] [--state guard-state.json]

${DISCLAIMER}`;

function flag(args, name, fallback = null) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function loadPolicy(path) {
  if (!path || !existsSync(path)) throw new Error(`policy file not found: ${path ?? '(none given)'}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function describePolicy(p) {
  const lines = [`mode: ${p.mode}${p.mode === 'observe' ? ' (dry run: logs what it would refuse, refuses nothing)' : ''}`];
  lines.push(`priced models: ${Object.keys(p.prices).join(', ') || '(none)'}${p.fallbackPrice ? ' + fallback price' : ''}`);
  lines.push(`unpriced model: ${p.requireKnownPrice ? 'refused' : 'allowed at $0 (unbounded)'}`);
  lines.push(`no output cap: ${p.defaultMaxOutputTokens ? `add ${p.defaultMaxOutputTokens}` : p.requireOutputCap ? 'refused' : 'allowed (unbounded)'}${p.maxOutputTokens ? `; ceiling ${p.maxOutputTokens}` : ''}`);
  if (p.maxCostPerCallUsd != null) lines.push(`per-call worst case: at most $${p.maxCostPerCallUsd}`);
  for (const b of p.budgets) {
    lines.push(`budget ${b.id}: per ${b.scope}, per ${b.window}${b.limitUsd != null ? `, $${b.limitUsd}` : ''}${b.limitCalls != null ? `, ${b.limitCalls} calls` : ''}`);
  }
  for (const b of p.breakers) {
    const parts = [];
    if (b.maxCallsPerMinute) parts.push(`>${b.maxCallsPerMinute} calls/min`);
    if (b.maxSpendPerMinuteUsd != null) parts.push(`>$${b.maxSpendPerMinuteUsd}/min`);
    if (b.maxRepeats) parts.push(`>${b.maxRepeats} identical requests in ${b.repeatWindowSec}s`);
    lines.push(`breaker ${b.id}: per ${b.scope}, opens on ${parts.join(' or ')} for ${b.cooldownSec}s`);
  }
  const gaps = [];
  if (!p.budgets.some((b) => b.scope === 'global' && b.limitUsd != null)) gaps.push('no global dollar budget: nothing caps total spend');
  if (!p.breakers.length) gaps.push('no breakers: a loop runs until a budget is gone');
  if (!p.requireKnownPrice && !p.fallbackPrice) gaps.push('unpriced models pass at $0, so budgets do not see them');
  if (!p.requireOutputCap && !p.defaultMaxOutputTokens) gaps.push('calls without an output cap pass with no worst case');
  return { lines, gaps };
}

export function formatSimulation(r) {
  const t = r.totals;
  const out = [];
  out.push(`${t.rows} logged calls${r.span ? ` from ${r.span.from} to ${r.span.to}` : ''}, $${t.actualUsd} at your configured prices`);
  out.push(`allowed ${t.allowed} ($${t.allowedUsd}); refused ${t.blocked} ($${t.blockedUsd} that would not have been spent)`);
  if (t.unpriced) out.push(`${t.unpriced} rows use a model with no price in the policy`);
  if (r.firstBlock) out.push(`first refusal: row ${r.firstBlock.row} at ${r.firstBlock.at}: ${r.firstBlock.reasons[0].message}`);
  for (const [code, n] of Object.entries(r.byCode)) out.push(`  ${code}: ${n}`);
  for (const e of r.events.filter((x) => x.type === 'trip').slice(0, 10)) out.push(`trip ${e.at}: ${e.breaker} (${e.scope}=${e.scopeValue}) ${e.reason}`);
  for (const e of r.events.filter((x) => x.type === 'alert').slice(0, 10)) out.push(`alert ${e.at}: ${e.budget} (${e.scope}=${e.scopeValue}) reached ${Math.round(e.threshold * 100)}% of $${e.limitUsd}`);
  out.push('Replay against your own prices and log; not a forecast and not your invoice.');
  return out.join('\n');
}

function webhookNotifier(url) {
  if (!url) return () => {};
  return (e) => {
    if (!['alert', 'trip', 'halt', 'block'].includes(e.type)) return;
    const text = e.type === 'alert'
      ? `LLM Spend Guard: ${e.budget} (${e.scope}=${e.scopeValue}) at ${Math.round(e.threshold * 100)}% of $${e.limitUsd}`
      : e.type === 'trip' ? `LLM Spend Guard: breaker ${e.breaker} opened for ${e.scope}=${e.scopeValue}: ${e.reason}`
        : e.type === 'halt' ? `LLM Spend Guard: all calls halted: ${e.reason}`
          : null;
    if (!text) return;
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, event: e }) }).catch(() => {});
  };
}

export async function main(argv, { stdout = (s) => process.stdout.write(`${s}\n`), stderr = (s) => process.stderr.write(`${s}\n`), env = process.env } = {}) {
  const [cmd, ...args] = argv;
  try {
    if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') { stdout(HELP); return 0; }

    if (cmd === 'init') {
      const path = args[0] ?? 'guard-policy.json';
      if (existsSync(path)) { stderr(`${path} exists; not overwriting`); return 2; }
      writeFileSync(path, `${JSON.stringify(EXAMPLE_POLICY, null, 2)}\n`);
      stdout(`wrote ${path}. Replace the example-* prices with your models and your provider's current rates.`);
      return 0;
    }

    if (cmd === 'check-policy') {
      const { lines, gaps } = describePolicy(normalisePolicy(loadPolicy(args[0])));
      stdout(lines.join('\n'));
      for (const g of gaps) stdout(`gap: ${g}`);
      return 0;
    }

    if (cmd === 'simulate') {
      const policy = loadPolicy(args[0]);
      if (!args[1] || !existsSync(args[1])) { stderr(`usage log not found: ${args[1] ?? '(none given)'}`); return 2; }
      const result = simulate(policy, parseLog(readFileSync(args[1], 'utf8')));
      stdout(args.includes('--json') ? JSON.stringify(result, null, 2) : formatSimulation(result));
      return 0;
    }

    if (cmd === 'proxy') {
      const { startProxy } = await import('./proxy.mjs');
      const { fileStore } = await import('./store-file.mjs');
      const policy = loadPolicy(args[0]);
      const statePath = flag(args, '--state', 'guard-state.json');
      const store = fileStore(statePath);
      const notify = webhookNotifier(env.GUARD_WEBHOOK_URL);
      const guard = createGuard(policy, { store, onEvent: (e) => { notify(e); if (e.type !== 'settle') stderr(JSON.stringify(e)); } });
      const host = flag(args, '--host', '127.0.0.1');
      const port = Number(flag(args, '--port', env.PORT ?? '8787'));
      await startProxy({
        host,
        port,
        guard,
        upstreams: {
          anthropic: { apiKey: env.ANTHROPIC_API_KEY || null, baseUrl: env.ANTHROPIC_UPSTREAM || undefined },
          openai: { apiKey: env.OPENAI_API_KEY || null, baseUrl: env.OPENAI_UPSTREAM || undefined },
        },
        proxyTokens: (env.GUARD_PROXY_TOKENS ?? '').split(',').map((s) => s.trim()),
        adminToken: env.GUARD_ADMIN_TOKEN || null,
        log: (e) => stderr(JSON.stringify(e)),
      });
      setInterval(() => guard.compact(), 3_600_000).unref();
      const shutdown = () => { store.flush(); process.exit(0); };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      stdout(`llm-spend-guard proxy on http://${host}:${port} (mode ${guard.policy.mode}, state ${statePath})`);
      stdout(`  Anthropic SDK: base URL http://${host}:${port}/anthropic   OpenAI SDK: base URL http://${host}:${port}/openai/v1`);
      stdout(DISCLAIMER);
      return null; // keep running
    }

    stderr(`unknown command "${cmd}"\n\n${HELP}`);
    return 2;
  } catch (e) {
    stderr(`error: ${e.message}`);
    return 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((code) => { if (code != null) process.exitCode = code; });
}
