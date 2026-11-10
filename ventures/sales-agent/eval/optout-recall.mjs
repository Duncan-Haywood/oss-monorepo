#!/usr/bin/env node
// Opt-out recall on real people's mail: of the Enron replies in which a person asks to be taken off a list, how many
// do the reply rules file as unsubscribe? eval/enron.mjs measures the other direction (stops fired on mail that asks
// for nothing); this one measures the misses, which cost more: an opt-out read as anything else means the next
// follow-up goes to someone who asked us to stop (CAN-SPAM, PECR, CASL).
//
// Candidates are found with a net cast deliberately wider than the rules (NET below: any sentence about lists,
// removal, receiving mail or being sent things), so the rules cannot pick their own test set. Every candidate is then
// read by a person or an agent with the engine's answer hidden (--blind) and labelled in a file of Message-IDs only:
//   optout     the writer asks to stop receiving this mail or to be taken off a list or distribution
//   not        anything else (asking to *add* someone, removing a third party, a list footer, news text)
//   ambiguous  could be read either way
// Then --labels scores the rules: recall = optouts filed unsubscribe / optouts.
//
//   node eval/optout-recall.mjs <dir> [--blind] [--labels eval/enron-labels/optout.json] [--json]
//
// <dir> as for eval/enron.mjs (searched recursively, plain or .xz). Every human message is read, not only RE:
// subjects, because people often ask to come off a distribution list in a new message.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { triage } from "../engine.mjs";
import { readAsServer, looksAuto, looksBounce } from "./enron.mjs";

// The net. Wider than RULES.unsubscribe on purpose: every way a sentence can talk about lists, removal, or not
// receiving things. It finds far more than opt-outs; reading the candidates decides which are.
export const NET = /\b(unsubscrib\w*|opt(ed|ing)?[- ]?out|(take|took|taking|get|getting|remove|removed|removing|drop|dropped|delete|deleted|strike|scratch) (me|us|my (name|address|e-?mail)|our (name|names|address))\b|(off|from) (of )?(the|this|that|your|these|those|all|any|such) (\w+ )?(\w+ )?(list|lists|distribution|mailing|e-?mails?|e-?mail list)\b|no longer (need|want|wish|care|require) to (receive|get|be on|see)|(don'?t|do not|stop|quit) (send|sending|forward|forwarding|e-?mail|e-?mailing|copy|copying|cc|including|include) (me|us|these|this|them|those)\b|not (want|wish|need) to (receive|get|be (on|included|copied))|(stop|quit) (receiving|getting)|(no|not) (more|longer) (e-?mails?|messages?|mail)\b)/i;

// The second, first-person filter: the writer's own removal or mail, minus footer instructions. The labelled set is
// the messages with at least one such sentence (or such a subject).
export const FIRST_PERSON = /\b((remove|removed|take|taken|drop|delete|deleted|strike|scratch|exclude|get|keep|leave) (me|us|myself|my (name|address|e-?mail( address)?)|our (name|names|address|group)) (off|from|out of)\b|(off|from) (of )?(the|this|your|that|these|those|all|any|such|ur) ([\w-]+ ){0,3}(list|lists|distribution|distributions|mailings?|e-?mails?)\b|(stop|quit|don'?t|do not|no longer|never) (send|sending|forward|forwarding|e-?mail|e-?mailing|copy|copying|cc|cc'?ing|including|include|put|putting) (me|us)\b|(please )?unsubscribe (me|us)\b|(no longer|not|never) (need|want|wish|care) (to )?(receive|get|be on|be (included|copied|cc))|(i|we) (no longer|do not|don'?t) (need|want|wish) (these|this|them|those|to receive)|please unsubscribe|(stop|quit) (receiving|getting)|opt (me|us) out)/i;
export const FOOTER = /\b(to|you can|you may|if you (wish|would|do not|don'?t|prefer|no longer)|click|reply (to this|with)|send an? (blank )?e-?mail)\b/i;
const firstPerson = (s) => FIRST_PERSON.test(s) && !FOOTER.test(s);
/** The text a candidate is labelled by: its first-person sentences, or its subject when only the subject has one. */
export const labelText = (c) => (c.core.join(" ") || c.subject).toLowerCase().replace(/\W+/g, " ").trim();

const sentences = (t) => String(t).replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
const day = (d) => { const t = Date.parse(d || ""); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "2001-06-01"; };
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name), st = fs.statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (st.isFile() && !(p.endsWith(".xz") && fs.existsSync(p.slice(0, -3)))) yield p;
  }
}
const read = (p) => (p.endsWith(".xz") ? execFileSync("xz", ["-dc", p], { maxBuffer: 1 << 26 }) : fs.readFileSync(p)).toString("latin1");

/** Every human message whose own text (quotes stripped, first 2,000 characters) has a sentence the net catches. */
export function candidates(dir) {
  const seen = new Set(), out = [];
  let n = 0;
  for (const p of walk(dir)) {
    const got = readAsServer(read(p));
    if (!got || !got.headers.messageId || seen.has(got.headers.messageId)) continue;
    seen.add(got.headers.messageId);
    const { headers: h, reply: r } = got;
    if (looksAuto(h) || looksBounce(h)) continue;
    n++;
    const text = r.body.slice(0, 2000);
    const hit = sentences(text).filter((s) => NET.test(s));
    if (!hit.length && !NET.test(h.subject || "")) continue;
    const t = triage(r, day(h.date));
    const net = hit.slice(0, 4), core = net.filter(firstPerson);
    out.push({ id: h.messageId, subject: h.subject || "", net, core, first: core.length > 0 || firstPerson(h.subject || ""), body: text, category: t.category, evidence: t.evidence });
  }
  return { n, candidates: out };
}

/** Score the rules against labels: { optout: { n, caught, missed: [...] }, not: { n, stopped } }. */
export function score(cands, labels) {
  const lab = new Map(labels.map((r) => [r.id, r.label]));
  const s = { optout: { n: 0, caught: 0, missed: [] }, not: { n: 0, unsubscribed: 0 }, ambiguous: 0, unlabelled: 0 };
  for (const c of cands) {
    const l = lab.get(c.id);
    if (l === "optout") { s.optout.n++; if (c.category === "unsubscribe") s.optout.caught++; else s.optout.missed.push({ id: c.id, got: c.category }); }
    else if (l === "not") { s.not.n++; if (c.category === "unsubscribe") s.not.unsubscribed++; }
    else if (l === "ambiguous") s.ambiguous++;
    else s.unlabelled++;
  }
  return s;
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const args = process.argv.slice(2);
  const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
  const dir = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--labels");
  if (!dir) { console.error("usage: node eval/optout-recall.mjs <dir> [--blind] [--labels file] [--json]"); process.exit(2); }
  const { n, candidates: cands } = candidates(dir);
  if (args.includes("--json")) { console.log(JSON.stringify({ n, candidates: cands }, null, 1)); process.exit(0); }
  const first = cands.filter((c) => c.first), texts = new Map();
  for (const c of first) if (!texts.has(labelText(c))) texts.set(labelText(c), c);
  console.log(`${n} human messages, ${cands.length} caught by the net, ${first.length} with a first-person sentence (${texts.size} distinct texts)`);
  if (args.includes("--blind")) {
    // One line per distinct text, sorted by Message-ID (unrelated to the engine's answer); the category is not printed.
    for (const c of [...texts.values()].sort((a, b) => a.id.localeCompare(b.id))) console.log(`${c.id}\tS: ${c.subject.slice(0, 50)} | ${(c.core.length ? c.core : [c.body.slice(0, 150)]).map((z) => z.slice(0, 180)).join(" || ")}`);
  }
  const lf = opt("--labels");
  if (lf) {
    const s = score(cands, JSON.parse(fs.readFileSync(lf, "utf8")).rows);
    console.log(`against ${lf}: opt-outs ${s.optout.caught}/${s.optout.n} filed unsubscribe (recall ${(100 * s.optout.caught / Math.max(1, s.optout.n)).toFixed(1)}%); ` +
      `not opt-outs filed unsubscribe ${s.not.unsubscribed}/${s.not.n}; ambiguous ${s.ambiguous}; unlabelled ${s.unlabelled}`);
    for (const m of s.optout.missed) console.log(`  missed ${m.id} -> ${m.got}`);
  }
}
