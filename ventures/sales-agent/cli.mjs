#!/usr/bin/env node
// node cli.mjs --replies replies.txt [--prospects prospects.csv] [--suppression suppression.txt] [--offer offer.json]
//              [--today YYYY-MM-DD] [--out DIR]
// Add --tasks cadence-tasks.csv (from sales-cadence-builder) for the daily run: it also reads the replies (if any), then
//   writes todays-queue.csv, left-out.csv and brief.md: what is due today minus anyone stopped, paused or suppressed.
//   [--done done.txt] lists touches already made ("email,step" per line).
// Research: with --web it also reads each account home page title (robots.txt respected, 1 s apart).
// Research: node cli.mjs --crm crm-export.csv [--icp icp.json] [--prospects p.csv] [--suppression s.txt] [--offer offer.json] [--top 25] [--web]
//   ranks your CRM export against your ICP and writes accounts.csv (with first-touch drafts), research-left-out.csv and
//   research-brief.md. Reads nothing but the file; guesses no addresses; sends nothing.
// Prep: node cli.mjs --prep person@example.com [--replies thread.txt] [--prospects p.csv] [--notes notes.txt] [--crm export.csv] [--suppression s.txt]
//   writes call-prep.md for one person: what is on file, their own words, the discovery fields still unknown. Sends nothing.
// Writes queue.json, prospects.csv, suppression-add.csv, deals.csv and tasks.csv to DIR (default ./sales-agent-out).
// Sends nothing. With LLM_PROVIDER/LLM_MODEL/LLM_API_KEY or ANTHROPIC_API_KEY (etc.) set, a model triages and polishes
// under the same limits; otherwise the rules run.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { csv, iso, runInbox } from "./engine.mjs";
import { runDaily, csvQueue, csvLeftOut } from "./daily.mjs";
import { runResearch, briefOf, csvAccounts, csvLeftOutResearch } from "./research.mjs";
import { runInboxWithModel } from "./ai.mjs";
import { runPrep } from "./prep.mjs";
import { enrich, liveFetch } from "./webfacts.mjs";
import { configFromEnv } from "./byok.mjs";

const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const read = (k) => (opt(k) ? readFileSync(opt(k), "utf8") : "");
if (opt("prep")) {
  const o = opt("out") || "sales-agent-out";
  const d = runPrep({ email: opt("prep"), prospects: read("prospects"), replies: read("replies"), notes: read("notes"), crm: read("crm"), suppression: read("suppression"), today: opt("today") || iso(Date.now()) });
  mkdirSync(o, { recursive: true });
  writeFileSync(join(o, "call-prep.md"), d.brief);
  console.log(`${d.stop ? "Do not chase: " + d.stop + ". " : ""}${d.known.length} of 9 discovery fields known, ${d.unknown.length} to ask. Nothing was sent. Output in ${o}/call-prep.md`);
  process.exit(0);
}
if (opt("crm")) {
  const o = opt("out") || "sales-agent-out";
  const d = runResearch({ crm: read("crm"), icp: opt("icp") ? JSON.parse(read("icp")) : {}, offer: opt("offer") ? JSON.parse(read("offer")) : {}, suppression: read("suppression"), existing: read("prospects"), top: opt("top") ? Number(opt("top")) : undefined, today: opt("today") || iso(Date.now()) });
  if (args.includes("--web")) { await enrich(d.accounts, liveFetch, { gapMs: 1000 }); d.brief = briefOf(d); }
  mkdirSync(o, { recursive: true });
  writeFileSync(join(o, "accounts.csv"), csvAccounts(d));
  writeFileSync(join(o, "research-left-out.csv"), csvLeftOutResearch(d));
  writeFileSync(join(o, "research-brief.md"), d.brief);
  const s = d.summary;
  console.log(`${s.rows} rows: ${s.accounts} accounts ranked (${s.draftsReady} drafts pass the checks), ${s.held} held for consent, ${s.dropped} dropped. Nothing was sent. Output in ${o}/`);
  process.exit(0);
}
if (!opt("replies") && !opt("tasks")) { console.error("usage: node cli.mjs --crm crm.csv [--icp icp.json] | --replies replies.txt [--prospects p.csv] [--suppression s.txt] [--offer offer.json] [--tasks cadence-tasks.csv] [--done done.txt] [--today YYYY-MM-DD] [--out DIR]"); process.exit(2); }
const input = { replies: opt("replies") ? read("replies") : "", prospects: read("prospects"), suppression: read("suppression"), offer: opt("offer") ? JSON.parse(read("offer")) : {}, today: opt("today") || iso(Date.now()) };
const r = input.replies.trim() || !opt("tasks") ? await runInboxWithModel(configFromEnv(process.env), input) : { ...runInbox(input), source: "none", errors: [] };
const out = opt("out") || "sales-agent-out";
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "queue.json"), JSON.stringify({ today: r.today, source: r.source, errors: r.errors, summary: r.summary, items: r.items }, null, 2));
writeFileSync(join(out, "prospects.csv"), csv.prospects(r));
writeFileSync(join(out, "suppression-add.csv"), csv.suppression(r));
writeFileSync(join(out, "deals.csv"), csv.deals(r));
writeFileSync(join(out, "tasks.csv"), csv.tasks(r));
const s = r.summary;
console.log(`${s.replies} replies (${r.source}): ${s.drafts} drafts, ${s.readyToApprove} pass the checks, ${s.suppressed} added to suppression, ${s.paused} paused, ${s.tasks} tasks for you. Nothing was sent. Output in ${out}/`);
for (const e of r.errors) console.error(`note: ${e}`);
if (opt("tasks")) {
  const suppression = [input.suppression, ...r.suppression.map((x) => x.email)].join("\n");
  const d = runDaily({ tasks: read("tasks"), prospects: r.prospects, suppression, done: read("done"), today: r.today });
  writeFileSync(join(out, "todays-queue.csv"), csvQueue(d));
  writeFileSync(join(out, "left-out.csv"), csvLeftOut(d));
  writeFileSync(join(out, "brief.md"), d.brief);
  const q = d.summary;
  console.log(`Today (${d.today}): ${q.due} touches due (${q.email} email, ${q.call} call, ${q.linkedin} LinkedIn, ${q.letter} letter), ${q.dropped} dropped, ${q.held} held, ${q.stale} too old. Nothing was sent.`);
}
