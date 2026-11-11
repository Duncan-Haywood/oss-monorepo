#!/usr/bin/env node
// Does a mail file read the way the self-host server reads a mailbox? Every Enron message under <dir> (eval/README.md,
// "Real mail: the Enron corpus", says how to fetch them; nothing is committed) is written into one mbox (mboxrd escaping),
// read back through mailfile.mjs (MboxSplitter, createCollector) and parsed as pasted replies, then compared item by item
// with the server's own read of each message (replyBlocks, then parseReplies(block)[0]): from, subject, body, signals.
//
//   node --max-old-space-size=8000 eval/mailfile-enron.mjs <dir> [--write out.mbox] [--mboxo]
//
// --mboxo writes the mbox without escaping body lines that start with "From " (as some exporters do) and also reports
// how many messages the splitter recovered whole: added 2026-11-11 with the envelope check in MboxSplitter.
import fs from "node:fs";
import path from "node:path";
import { MboxSplitter, createCollector } from "../mailfile.mjs";
import { parseMessage, replyBlocks } from "../mime.mjs";
import { parseReplies, triage } from "../engine.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node eval/mailfile-enron.mjs <dir of Enron messages> [--write out.mbox]"); process.exit(2); }
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (!p.endsWith(".xz")) files.push(p); } })(dir);
files.sort();
const mboxo = process.argv.includes("--mboxo");
const originals = files.map((f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n"));
const mbox = originals.map((m, i) => `From ${i}@enron Mon Jan 01 00:00:00 2001\n${mboxo ? m : m.replace(/^(>*From )/gm, ">$1")}${m.endsWith("\n") ? "" : "\n"}\n`).join("");
const w = process.argv.indexOf("--write"); if (w > 0) fs.writeFileSync(process.argv[w + 1], mbox);

let t = Date.now();
const raws = [], c = createCollector({ repliesOnly: false }), sp = new MboxSplitter((r) => { raws.push(r); c.add(r); });
sp.push(mbox); sp.end();
const result = c.finish(), got = parseReplies(result.replies), ms = Date.now() - t;

// The server's read of the same raw messages (same 200 KB cut, same duplicate rule, same oldest-first order).
const seen = new Set(), server = [];
raws.forEach((raw, o) => {
  const m = parseMessage(raw.slice(0, 200000)), id = m.headers.messageId.toLowerCase();
  if (id && seen.has(id)) return; if (id) seen.add(id);
  if (!m.text && !m.dsn) return;
  const d = Date.parse(m.headers.date);
  server.push({ k: Number.isFinite(d) ? d : Infinity, o, items: replyBlocks(m).map((b) => parseReplies(b)[0]) });
});
const want = server.sort((a, b) => a.k - b.k || a.o - b.o).flatMap((x) => x.items);
const key = (i) => JSON.stringify([i.from, i.subject, i.body, i.signal || "", i.failed || ""]);
let same = 0, sameCategory = 0;
const diffs = [];
for (let i = 0; i < Math.max(got.length, want.length); i++) {
  if (got[i] && want[i] && key(got[i]) === key(want[i])) { same++; sameCategory++; continue; }
  if (got[i] && want[i] && triage(got[i], "2001-06-01").category === triage(want[i], "2001-06-01").category) sameCategory++;
  if (diffs.length < 5) diffs.push(i);
}
console.log(`${files.length} messages, mbox ${(mbox.length / 1e6).toFixed(1)} MB, read in ${ms} ms: ${result.stats.kept} kept, ${result.stats.truncated} cut at 200 KB`);
console.log(`file items ${got.length}, server items ${want.length}: identical ${same}, same category ${sameCategory}`);
for (const i of diffs) console.log(`  differs at ${i}: ${got[i]?.from} "${got[i]?.subject}"`);
const r = createCollector(); raws.forEach((x) => r.add(x));
console.log(`replies only (the page's default): ${JSON.stringify(r.finish().stats)}`);
if (mboxo) {
  // A split at every "From " line after a blank line (this splitter before 2026-11-11, and Python's mailbox module) would
  // cut each message holding one; count them, and the splits the envelope check still makes.
  const naive = originals.filter((m) => /\n\nFrom /.test(m.slice(m.search(/\n\n/) + 1) || "") || /\n\nFrom /.test(m)).length;
  console.log(`mboxo: ${naive} of ${files.length} messages hold a "From " line after a blank line; split into ${raws.length} messages (${sp.unescapedFrom} candidate lines kept as body); ${raws.length - files.length} extra splits`);
}
