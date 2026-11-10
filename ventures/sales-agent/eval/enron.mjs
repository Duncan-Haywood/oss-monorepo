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
//   node eval/enron.mjs <dir> [--replies] [--show <category>] [--json]
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

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p); else if (e.isFile()) yield p;
  }
}
const read = (p) => (p.endsWith(".xz") ? execFileSync("xz", ["-dc", p], { maxBuffer: 1 << 26 }) : fs.readFileSync(p)).toString("latin1");

// Messages that are machine notices by their own headers or subject, for the recall check (not used by the rules).
export const looksAuto = (h) => /^(out of (the )?office|auto(matic)?[- ]?(reply|response)|autoreply|away from|on vacation|vacation)/i.test((h.subject || "").replace(/^(re|fw|fwd):\s*/i, "")) || /^auto-/i.test(h.autoSubmitted || "");
export const looksBounce = (h) => /^(mailer-daemon|postmaster)@/i.test((h.from || "").replace(/^.*</, "").trim()) || /^(undeliverable|undeliverable mail|returned mail|delivery (status notification|failure)|failure notice|mail delivery failed|nondeliverable)/i.test(h.subject || "");

export function run(dir, { replies = false } = {}) {
  const STOP = new Set(["unsubscribe", "bounce", "left_company", "not_interested", "out_of_office"]);
  const counts = {}, flagged = [], auto = { n: 0, caught: 0, misses: [] }, bounce = { n: 0, caught: 0, misses: [] };
  let n = 0, empty = 0;
  for (const p of walk(dir)) {
    const got = readAsServer(read(p));
    if (!got || !got.headers.messageId) continue;
    const { headers: h, reply: r } = got;
    const t = triage(r, day(h.date));
    if (looksAuto(h)) { auto.n++; if (t.category === "out_of_office") auto.caught++; else auto.misses.push({ id: h.messageId, got: t.category }); continue; }
    if (looksBounce(h)) { bounce.n++; if (t.category === "bounce") bounce.caught++; else bounce.misses.push({ id: h.messageId, got: t.category }); continue; }
    if (replies && !/^re:/i.test(h.subject || "")) continue;
    n++;
    if (!r.body.trim()) empty++;
    counts[t.category] = (counts[t.category] || 0) + 1;
    if (STOP.has(t.category)) flagged.push({ id: h.messageId, file: path.basename(p), category: t.category, matched: t.matched, evidence: t.evidence, body: r.body });
  }
  return { n, empty, counts, flagged, auto, bounce };
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--show");
  if (!dir) { console.error("usage: node eval/enron.mjs <dir> [--replies] [--show <category>] [--json]"); process.exit(2); }
  const show = args.includes("--show") ? args[args.indexOf("--show") + 1] : null;
  const out = run(dir, { replies: args.includes("--replies") });
  if (args.includes("--json")) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
  const stops = out.flagged.length;
  console.log(`${out.n} human messages${args.includes("--replies") ? " (RE: subjects)" : ""}, ${out.empty} empty after quote stripping`);
  for (const [k, v] of Object.entries(out.counts).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(15)} ${String(v).padStart(6)}  ${(100 * v / out.n).toFixed(2)}%`);
  console.log(`stop categories fired on ${stops} (${(100 * stops / Math.max(1, out.n)).toFixed(2)}%)`);
  console.log(`auto-replies by subject/header: ${out.auto.caught}/${out.auto.n} read as out_of_office`);
  console.log(`bounces by sender/subject:      ${out.bounce.caught}/${out.bounce.n} read as bounce`);
  for (const f of out.flagged) if (!show || f.category === show) console.log(`\n--- ${f.category} [${f.matched}] ${f.id}\n${show ? f.body.slice(0, 1200) : f.evidence}`);
  if (show === "misses") for (const m of [...out.auto.misses, ...out.bounce.misses]) console.log(m);
}
