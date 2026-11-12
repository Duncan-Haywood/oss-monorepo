#!/usr/bin/env node
// node cli.mjs --replies replies.txt [--prospects prospects.csv] [--suppression suppression.txt] [--offer offer.json]
//              [--today YYYY-MM-DD] [--out DIR]
//   or --mail inbox.mbox,a.eml [--own me@x.com] instead of --replies: exported mail files (mailfile.mjs).
// Add --tasks cadence-tasks.csv (from sales-cadence-builder) for the daily run: it also reads the replies (if any), then
//   writes todays-queue.csv, left-out.csv and brief.md: what is due today minus anyone stopped, paused or suppressed.
//   [--done done.txt] lists touches already made ("email,step" per line). Your own sent mail in the --mail files (Gmail's
//   Sent label, or --own addresses; pass Thunderbird's Sent mbox too) also counts: an email step whose subject you already
//   sent to that person is not queued again, and a due step is held if you wrote to them some other way that week.
//   [--sent sent.csv] (date,to,subject) does the same without a mail file.
//   [--calls calls.csv] (email,step,outcome,date; outcome spoke, voicemail, no_answer or done): the self-host page's call
//   outcomes without the server. No answer brings the call back the next business day, up to three tries; --prep reads
//   the same file and lists that person's calls.
//   A call that slips pushes that person's later steps back by the same business days. [--holidays us|us-business|gb-eng|
//   gb-sct|gb-nir|2026-11-27,...] keeps retry and moved dates off those days.
// Research: with --web it also reads each account home page title (robots.txt respected, 1 s apart).
// Research: node cli.mjs --crm crm-export.csv [--icp icp.json] [--prospects p.csv] [--suppression s.txt] [--offer offer.json] [--top 25] [--web]
//   ranks your CRM export against your ICP and writes accounts.csv (with first-touch drafts), research-left-out.csv and
//   research-brief.md. Reads nothing but the file; guesses no addresses; sends nothing.
// Prep: node cli.mjs --prep person@example.com [--replies thread.txt] [--prospects p.csv] [--notes notes.txt] [--crm export.csv] [--suppression s.txt] [--calls calls.csv]
//   writes call-prep.md for one person: what is on file, their own words, the discovery fields still unknown. Sends nothing.
// Follow-up: node cli.mjs --followup person@example.com --notes call-notes.txt [--prospects p.csv] [--offer offer.json] [--suppression s.txt]
//   writes followup.md: a draft recapping only your notes, for you to approve. No draft for anyone who asked to stop.
// Writes queue.json, prospects.csv, suppression-add.csv, deals.csv and tasks.csv to DIR (default ./sales-agent-out).
// Sends nothing. With LLM_PROVIDER/LLM_MODEL/LLM_API_KEY or ANTHROPIC_API_KEY (etc.) set, a model triages and polishes
// under the same limits; otherwise the rules run.
import { readFileSync, writeFileSync, mkdirSync, openSync, readSync, closeSync, createReadStream } from "node:fs";
import { createCollector, MboxSplitter, isMbox, describe } from "./mailfile.mjs";
import { join } from "node:path";
import { csv, iso, runInbox, parseCsv } from "./engine.mjs";
import { runDaily, csvQueue, csvLeftOut, callMarks, callLog } from "./daily.mjs";
import { runResearch, briefOf, csvAccounts, csvLeftOutResearch } from "./research.mjs";
import { runInboxWithModel } from "./ai.mjs";
import { runPrep } from "./prep.mjs";
import { buildInvite } from "./invite.mjs";
import { runFollowUp } from "./followup.mjs";
import { enrich, liveFetch } from "./webfacts.mjs";
import { configFromEnv } from "./byok.mjs";

const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const read = (k) => (opt(k) ? readFileSync(opt(k), "utf8") : "");
// --calls: one row per call made (email,step,outcome,date), the CLI's version of the self-host page's call buttons.
const callRows = () => callLog(read("calls"));
if (opt("followup")) {
  const o = opt("out") || "sales-agent-out";
  const d = runFollowUp({ email: opt("followup"), prospects: read("prospects"), replies: read("replies"), notes: read("notes"), suppression: read("suppression"), offer: opt("offer") ? JSON.parse(read("offer")) : {}, today: opt("today") || iso(Date.now()) });
  mkdirSync(o, { recursive: true });
  writeFileSync(join(o, "followup.md"), `${d.issues.map((i) => `> ${i}`).join("\n")}${d.issues.length ? "\n\n" : ""}${d.draft ? `Subject: ${d.draft.subject}\n\n${d.draft.body}\n\n${d.lint.ok ? "Checks passed." : "Fix first: " + d.lint.errors.join("; ")}\n` : ""}`);
  console.log(`${d.approval}${d.issues.length ? ": " + d.issues.join(" ") : ""} Nothing was sent. Output in ${o}/followup.md`);
  process.exit(0);
}
if (opt("prep")) {
  const o = opt("out") || "sales-agent-out";
  const d = runPrep({ email: opt("prep"), prospects: read("prospects"), replies: read("replies"), notes: read("notes"), crm: read("crm"), calls: callRows().filter((c) => c.email === String(opt("prep")).trim().toLowerCase()), suppression: read("suppression"), today: opt("today") || iso(Date.now()) });
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
// Exported mail: --mail inbox.mbox,reply.eml [--own me@x.com,me2@x.com] reads the files the way the self-host server reads a
// mailbox (mailfile.mjs), keeps the replies, bounces and auto-replies, and runs them as --replies would.
let mailReplies = "", mailSent = [];
if (opt("mail")) {
  const c = createCollector({ own: (opt("own") || "").split(",").filter(Boolean) });
  let cut = 0;
  for (const f of opt("mail").split(",").filter(Boolean)) {
    const fd = openSync(f, "r"), head = Buffer.alloc(1000), n = readSync(fd, head, 0, 1000, 0); closeSync(fd);
    if (!isMbox(head.subarray(0, n).toString("utf8"))) { c.add(readFileSync(f, "utf8").replace(/^\uFEFF/, "")); continue; }
    const sp = new MboxSplitter((raw) => c.add(raw));
    for await (const chunk of createReadStream(f, { encoding: "utf8" })) sp.push(chunk);
    sp.end(); cut += sp.truncated;
  }
  const m = c.finish();
  m.stats.truncated += cut;
  console.log(describe(m));
  mailReplies = m.replies; mailSent = m.sent;
}
if (!opt("replies") && !opt("tasks") && !opt("mail")) { console.error("usage: node cli.mjs --crm crm.csv [--icp icp.json] | --replies replies.txt | --mail inbox.mbox,reply.eml [--own me@x.com] [--prospects p.csv] [--suppression s.txt] [--offer offer.json] [--tasks cadence-tasks.csv] [--done done.txt] [--calls calls.csv] [--holidays us] [--sent sent.csv] [--today YYYY-MM-DD] [--out DIR]"); process.exit(2); }
const input = { replies: [opt("replies") ? read("replies") : "", mailReplies].filter((x) => x.trim()).join("\n---\n"), prospects: read("prospects"), suppression: read("suppression"), offer: opt("offer") ? JSON.parse(read("offer")) : {}, today: opt("today") || iso(Date.now()) };
const r = input.replies.trim() || !opt("tasks") ? await runInboxWithModel(configFromEnv(process.env), input) : { ...runInbox(input), source: "none", errors: [] };
const out = opt("out") || "sales-agent-out";
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "queue.json"), JSON.stringify({ today: r.today, source: r.source, errors: r.errors, summary: r.summary, items: r.items }, null, 2));
writeFileSync(join(out, "prospects.csv"), csv.prospects(r));
writeFileSync(join(out, "suppression-add.csv"), csv.suppression(r));
writeFileSync(join(out, "deals.csv"), csv.deals(r));
writeFileSync(join(out, "tasks.csv"), csv.tasks(r));
// Calendar files for exact times prospects proposed (invite.mjs): tentative, no time zone, nothing sent.
const invites = [], noInvite = [];
for (const it of r.items) {
  if (it.triage.category !== "interested" || !it.triage.slots?.length) continue;
  const k = r.prospects?.find?.((x) => x.email?.toLowerCase() === String(it.from).toLowerCase());
  const v = buildInvite({ email: it.from, name: it.name, company: k?.company, slot: it.triage.slots[0], today: r.today, offer: input.offer });
  if (v.ok) invites.push(v); else noInvite.push(`${it.from}: ${v.why}`);
}
if (invites.length) { mkdirSync(join(out, "invites"), { recursive: true }); for (const v of invites) writeFileSync(join(out, "invites", v.filename), v.ics); }
const s = r.summary;
if (invites.length) console.log(`${invites.length} calendar file(s) in ${out}/invites/ (tentative, no time zone: confirm theirs, then send the invite yourself).`);
for (const n of noInvite) console.log(`no calendar file for ${n}`);
console.log(`${s.replies} replies (${r.source}): ${s.drafts} drafts, ${s.readyToApprove} pass the checks, ${s.suppressed} added to suppression, ${s.paused} paused, ${s.tasks} tasks for you. Nothing was sent. Output in ${out}/`);
for (const e of r.errors) console.error(`note: ${e}`);
if (opt("tasks")) {
  const suppression = [input.suppression, ...r.suppression.map((x) => x.email)].join("\n");
  // Your own sent mail in the --mail files (or a --sent CSV of date,to,subject) is the done list for email touches.
  const sent = [...mailSent, ...(opt("sent") ? [read("sent")] : [])].flatMap((x) => (typeof x === "string" ? parseCsv(x) : [x]));
  const marks = callMarks(callRows(), 3, { holidays: opt("holidays") });
  const d = runDaily({ tasks: read("tasks"), prospects: r.prospects, suppression, done: [read("done"), ...marks.done].filter(Boolean).join("\n"), retry: marks.retry, moved: marks.moved, holidays: opt("holidays"), sent, today: r.today });
  writeFileSync(join(out, "todays-queue.csv"), csvQueue(d));
  writeFileSync(join(out, "left-out.csv"), csvLeftOut(d));
  writeFileSync(join(out, "brief.md"), d.brief);
  const q = d.summary;
  console.log(`Today (${d.today}): ${q.due} touches due (${q.email} email, ${q.call} call, ${q.linkedin} LinkedIn, ${q.letter} letter), ${q.dropped} dropped, ${q.held} held, ${q.stale} too old${q.alreadySent ? `, ${q.alreadySent} already in your sent mail` : ""}. Nothing was sent.`);
}
