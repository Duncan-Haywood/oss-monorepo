#!/usr/bin/env node
// Run the reply rules on real people's email: a sample of the Enron corpus (CMU release, the CC0 copy at
// github.com/asimov-datasets/enron.com, one xz-compressed RFC 822 message per file). Nothing from the corpus is
// committed; eval/README.md ("Real mail: the Enron corpus") says how to fetch the same sample.
//
// Enron mail is internal business mail, not replies to cold outreach, so it cannot say how well the rules sort a
// sales inbox. It can say how often they fire a *stop* (unsubscribe, bounce, left the company, not interested, out
// of office) on real human writing that asks for nothing of the kind, and whether the corpus's real auto-replies
// and delivery failures are caught. That is the error that costs a lead for good.
//
//   node eval/enron.mjs <dir> [--replies] [--show <category>] [--json] [--labels eval/enron-labels/held.json] [--seen a.json,b.json]
//
// Since the away policy (2026-11-11, eval/README.md "The away policy"), an away reply a person wrote (subtype person_away) is
// not a stop: the lead pauses, and the reply goes to a person to read. Those are counted apart as "reached a person". --seen
// takes the --json output of earlier halves and drops every stop whose text (textKey) one of them already fired on, so a round
// is scored on text it has not seen: the corpus files one message under several Message-IDs, across halves.
//
// <dir> is searched recursively for files (plain or .xz). --replies keeps only messages whose subject starts with
// RE:/Re:, the closest thing to a reply. --show prints the stripped body of every message put in that category.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseReplies, triage } from "../engine.mjs";
import { parseMessage, toReplyBlock } from "../self-host/imap.mjs";

/**
 * Read one raw message the way the self-host server does (self-host/imap.mjs parseMessage, toReplyBlock), then the
 * engine's parseReplies (quote stripping, header signals). Returns { headers, reply } or null for a message the
 * server would skip (no text part).
 */
export function readAsServer(raw) {
  const m = parseMessage(raw);
  if (!m.text && !m.dsn) return null;
  const reply = parseReplies(toReplyBlock(m))[0];
  return reply ? { headers: m.headers, reply } : null;
}

const day = (d) => { const t = Date.parse(d || ""); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "2001-06-01"; };

export function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name), st = fs.statSync(p); // follows symlinks, so a dir of links to sample folders works
    if (st.isDirectory()) yield* walk(p);
    else if (st.isFile() && !(p.endsWith(".xz") && fs.existsSync(p.slice(0, -3)))) yield p; // `xz -dk` leaves both; read the plain one
  }
}
export const read = (p) => (p.endsWith(".xz") ? execFileSync("xz", ["-dc", p], { maxBuffer: 1 << 26 }) : fs.readFileSync(p)).toString("latin1");

// Messages that are machine notices by their own headers or subject, for the recall check (not used by the rules).
// Subjects only an auto-responder writes, never with a reply or forward prefix ("Vacation" subjects are people asking for days off).
export const looksAuto = (h) => /^(out of (the )?office|auto(matic)?[- ]?(reply|response)|autoreply|away from (the |my )?(office|desk))\b/i.test(h.subject || "") || /^auto-(replied|generated)/i.test(h.autoSubmitted || "");
export const looksBounce = (h) => /^(mailer-daemon|postmaster)@/i.test((h.from || "").replace(/^.*</, "").trim()) && !looksAuto(h) || /^(undeliverable|undeliverable mail|returned mail|delivery (status notification|failure)|failure notice|mail delivery failed|nondeliverable)/i.test(h.subject || "");

// The first 300 characters of a stripped body, case, punctuation and spacing folded: the same message filed twice has the same key.
export const textKey = (body) => (body || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 300);

export function run(dir, { replies = false } = {}) {
  const STOP = new Set(["unsubscribe", "bounce", "left_company", "not_interested", "out_of_office"]);
  const counts = {}, flagged = [], reached = [], auto = { n: 0, caught: 0, misses: [] }, bounce = { n: 0, caught: 0, misses: [] };
  let n = 0, empty = 0;
  const seen = new Set(); // the corpus files one message in several folders; count it once
  for (const p of walk(dir)) {
    const got = readAsServer(read(p));
    if (!got || !got.headers.messageId || seen.has(got.headers.messageId)) continue;
    seen.add(got.headers.messageId);
    const { headers: h, reply: r } = got;
    const t = triage(r, day(h.date));
    if (looksAuto(h)) { auto.n++; if (t.category === "out_of_office") auto.caught++; else auto.misses.push({ id: h.messageId, got: t.category }); continue; }
    if (looksBounce(h)) { bounce.n++; if (t.category === "bounce") bounce.caught++; else bounce.misses.push({ id: h.messageId, got: t.category }); continue; }
    if (replies && !/^re:/i.test(h.subject || "")) continue;
    n++;
    if (!r.body.trim()) empty++;
    counts[t.category] = (counts[t.category] || 0) + 1;
    const row = { id: h.messageId, file: path.basename(p), category: t.category, subtype: t.subtype, matched: t.matched, evidence: t.evidence, key: textKey(r.body), body: r.body };
    if (t.subtype === "person_away") reached.push(row);
    else if (STOP.has(t.category)) flagged.push(row);
  }
  return { n, empty, counts, flagged, reached, auto, bounce };
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--") && !["--show", "--labels"].includes(args[args.indexOf(a) - 1]));
  if (!dir) { console.error("usage: node eval/enron.mjs <dir> [--replies] [--show <category>] [--json]"); process.exit(2); }
  const show = args.includes("--show") ? args[args.indexOf("--show") + 1] : null;
  const out = run(dir, { replies: args.includes("--replies") });
  if (args.includes("--seen")) {
    const seenKeys = new Set();
    for (const f of args[args.indexOf("--seen") + 1].split(",")) { const o = JSON.parse(fs.readFileSync(f, "utf8")); for (const x of [...o.flagged, ...(o.reached || [])]) seenKeys.add(x.key || textKey(x.body)); }
    const before = out.flagged.length;
    out.flagged = out.flagged.filter((x) => !seenKeys.has(x.key));
    out.reached = out.reached.filter((x) => !seenKeys.has(x.key));
    out.dropped = before - out.flagged.length;
  }
  if (args.includes("--json")) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
  const stops = out.flagged.length;
  console.log(`${out.n} human messages${args.includes("--replies") ? " (RE: subjects)" : ""}, ${out.empty} empty after quote stripping`);
  for (const [k, v] of Object.entries(out.counts).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(15)} ${String(v).padStart(6)}  ${(100 * v / out.n).toFixed(2)}%`);
  console.log(`stop categories fired on ${stops} (${(100 * stops / Math.max(1, out.n)).toFixed(2)}%)${out.dropped != null ? `, after dropping ${out.dropped} whose text an earlier half fired on` : ""}`);
  console.log(`away replies a person wrote, paused and sent to a person: ${out.reached.length}`);
  console.log(`auto-replies by subject/header: ${out.auto.caught}/${out.auto.n} read as out_of_office`);
  console.log(`bounces by sender/subject:      ${out.bounce.caught}/${out.bounce.n} read as bounce`);
  for (const f of out.flagged) if (!show || f.category === show) console.log(`\n--- ${f.category} [${f.matched}] ${f.id}\n${show ? f.body.slice(0, 1200) : f.evidence}`);
  const lf = args.includes("--labels") ? args[args.indexOf("--labels") + 1] : null;
  if (lf) {
    // dev/held rows carry a right/wrong label; fresh.json rows carry the reader's own category (`reader`), which is right
    // when it equals the category fired now.
    const lab = new Map(JSON.parse(fs.readFileSync(lf, "utf8")).rows.map((r) => [r.id, r]));
    const verdict = (r, cat) => r.label || (r.reader === cat ? "right" : r.reader === "ambiguous" ? "ambiguous" : "wrong");
    const tally = { right: 0, wrong: 0, ambiguous: 0, unlabelled: 0 };
    for (const f of out.flagged) tally[lab.has(f.id) ? verdict(lab.get(f.id), f.category) : "unlabelled"]++;
    console.log(`against ${lf}: ${JSON.stringify(tally)}`);
    // What the readers called the away replies that now reach a person: none of these is a silent stop, whatever the label.
    const rt = {};
    for (const f of out.reached) { const r = lab.get(f.id), k = r ? (r.reader || r.label) : "unlabelled"; rt[k] = (rt[k] || 0) + 1; }
    console.log(`reached a person, by label: ${JSON.stringify(rt)}`);
  }
  if (show === "misses") for (const m of [...out.auto.misses, ...out.bounce.misses]) console.log(m);
}
