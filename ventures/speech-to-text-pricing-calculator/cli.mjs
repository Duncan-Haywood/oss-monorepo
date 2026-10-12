#!/usr/bin/env node
// CLI: price speech-to-text services (OpenAI Whisper API, Deepgram, AssemblyAI, Google, AWS, Azure,
// self-hosted faster-whisper) for monthly audio hours, with optional streaming and speaker-label needs,
// project 12 months of volume growth and find the hours where the cheapest provider changes. No network.
// Exit 0 ok, 1 over --budget, 2 bad input.
import { readFileSync } from "node:fs";
import { DEFAULT_PROVIDERS, PRICES_AS_OF, compare, project, cheapestSegments, summarize, fmt } from "./engine.mjs";

const USAGE = `usage: node cli.mjs compare --hours <n> [--streaming] [--diarization] [--growth <pct/month>] [--months <n>] [--provider <key>] [--budget <usd/month>] [--prices file.json] [--json]
       node cli.mjs crossover [--streaming] [--diarization] [--max <hours>] [--prices file.json] [--json]
       node cli.mjs providers

--hours is audio hours transcribed per month. --streaming needs real-time transcription; --diarization needs speaker labels.
--prices is a JSON object of provider overrides, merged over the defaults; a provider's "plans" array replaces its default plans, e.g.
  {"deepgram":{"plans":[{"name":"deal","usd":0,"hours":0,"extraHourUsd":0.2,"streaming":true,"diarization":true}]}}`;

function fail(msg) { console.error(msg); process.exit(2); }

function loadProviders(file) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
  if (!file) return merged;
  let over;
  try { over = JSON.parse(readFileSync(file, "utf8")); } catch (e) { fail(`could not read --prices ${file}: ${e.message}`); }
  for (const [k, v] of Object.entries(over)) merged[k] = { ...(merged[k] || { label: k, url: "", plans: [] }), ...v };
  return merged;
}

const argv = process.argv.slice(2);
const cmd = argv.shift();
const opt = {};
const flags = new Set(["json", "streaming", "diarization"]);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) fail(`unexpected argument "${a}"\n${USAGE}`);
  const k = a.slice(2);
  if (flags.has(k)) opt[k] = true;
  else { if (argv[i + 1] === undefined) fail(`--${k} needs a value`); opt[k] = argv[++i]; }
}
const num = (k, d) => {
  if (opt[k] === undefined) return d;
  const n = Number(opt[k]);
  if (!Number.isFinite(n) || n < 0) fail(`--${k} needs a non-negative number, got "${opt[k]}"`);
  return n;
};
const n0 = (n) => n.toLocaleString("en-US");
const money = (n) => (n == null ? "n/a" : fmt(n));
const need = () => [Boolean(opt.streaming), Boolean(opt.diarization)];

if (cmd === "providers") {
  for (const [k, p] of Object.entries(DEFAULT_PROVIDERS)) {
    console.log(`${k.padEnd(11)} ${p.label}  ${p.url}`);
    for (const pl of p.plans) console.log(`            ${pl.name.padEnd(60)} $${String(pl.usd).padEnd(4)} base, ${String(pl.hours).padStart(5)} h incl, +$${pl.extraHourUsd ?? "-"}/h  streaming: ${pl.streaming ? "yes" : "no"}  speaker labels: ${pl.diarization ? "yes" : "no"}`);
  }
  console.log(`\n${PRICES_AS_OF}`);
} else if (cmd === "compare") {
  if (opt.hours === undefined) fail(`--hours is required\n${USAGE}`);
  const providers = loadProviders(opt.prices);
  const hours = num("hours"), [st, di] = need();
  const rows = compare(hours, st, di, providers);
  const proj = project(hours, st, di, num("growth", 0), num("months", 12), providers);
  const s = summarize(rows, { budget: opt.budget === undefined ? null : num("budget"), provider: opt.provider || null });
  if (s.status === "error" && !s.overBudget) fail(s.text);
  if (opt.json) console.log(JSON.stringify({ hours, streaming: st, diarization: di, rows, projection: proj, summary: s }, null, 2));
  else {
    console.log(`${n0(hours)} audio hours/month${st ? ", real-time streaming" : ""}${di ? ", speaker labels" : ""}\n`);
    for (const r of rows) console.log(`${(r.label + (r.plan ? ` [${r.plan}]` : "")).padEnd(95)} ${r.monthly == null ? "no covering plan".padStart(12) : (fmt(r.monthly) + "/mo").padStart(12)}  ${money(r.annual).padStart(12)}/yr${r.extraVsCheapest ? `  (+${fmt(r.extraVsCheapest)})` : ""}`);
    console.log(`\n${num("months", 12)}-month spend at ${num("growth", 0)}%/mo volume growth (${n0(hours)} -> ${n0(proj.endHours)} hours/month at the end):`);
    for (const t of proj.totals) console.log(`${t.label.padEnd(95)} ${money(t.total).padStart(12)}`);
    console.log(`\n${s.text}\n${PRICES_AS_OF}. Not a quote.`);
  }
  process.exit(s.overBudget ? 1 : 0);
} else if (cmd === "crossover") {
  const [st, di] = need();
  const segs = cheapestSegments(st, di, loadProviders(opt.prices), num("max", 20000));
  if (opt.json) console.log(JSON.stringify(segs, null, 2));
  else for (const s of segs) console.log(`${String(s.from).padStart(6)} - ${String(s.to).padStart(6)} hours/month   cheapest: ${s.label}`);
} else fail(USAGE);
