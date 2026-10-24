#!/usr/bin/env node
// node cli.mjs --replies replies.txt [--prospects prospects.csv] [--suppression suppression.txt] [--offer offer.json]
//              [--today YYYY-MM-DD] [--out DIR]
// Add --tasks cadence-tasks.csv (from sales-cadence-builder) for the daily run: it also reads the replies (if any), then
//   writes todays-queue.csv, left-out.csv and brief.md: what is due today minus anyone stopped, paused or suppressed.
//   [--done done.txt] lists touches already made ("email,step" per line).
// Writes queue.json, prospects.csv, suppression-add.csv, deals.csv and tasks.csv to DIR (default ./sales-agent-out).
// Sends nothing. With LLM_PROVIDER/LLM_MODEL/LLM_API_KEY or ANTHROPIC_API_KEY (etc.) set, a model triages and polishes
// under the same limits; otherwise the rules run.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { csv, iso, runInbox } from "./engine.mjs";
import { runDaily, csvQueue, csvLeftOut } from "./daily.mjs";
import { runInboxWithModel } from "./ai.mjs";
import { configFromEnv } from "./byok.mjs";

const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const read = (k) => (opt(k) ? readFileSync(opt(k), "utf8") : "");
if (!opt("replies") && !opt("tasks")) { console.error("usage: node cli.mjs --replies replies.txt [--prospects p.csv] [--suppression s.txt] [--offer offer.json] [--tasks cadence-tasks.csv] [--done done.txt] [--today YYYY-MM-DD] [--out DIR]"); process.exit(2); }
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
