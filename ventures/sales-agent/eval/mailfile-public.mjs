// The mail-file reader (mailfile.mjs, mime.mjs) on mbox files other people published on GitHub: real Gmail Takeout and
// Thunderbird exports, and exporter test fixtures. The files are fetched at run time and not kept in this repository
// (their licences are not ours to grant); only counts are printed, never message text. Run: node eval/mailfile-public.mjs
// Written 2026-11-11; results and what they changed: eval/README.md, "Public mbox files".
//
// Chosen to publish deliberately (an archive's sample, a book's example, a relicensing record, test fixtures). A personal
// mailbox someone appears to have pushed by mistake turned up in the same search and is left out on purpose.
import { createHash } from "node:crypto";
import { MboxSplitter, createCollector } from "../mailfile.mjs";

const FILES = [
  // [kind, repository, path, sha256 prefix when read on 2026-11-11]
  ["Takeout", "UAlbanyArchives/mailbagit", "data/sample1.mbox", "5a08f655f84723cb"],
  ["Takeout, CRLF", "mark-watson/power-java", "knowledge_management/GoogleTakeout/Mail/bookexample.mbox", "58b1dc9d795aa442"],
  ["Thunderbird", "the8472/mldht", "docs/relicense.mbox", "45a4f28d9970bf48"],
  ["Thunderbird, CRLF", "johannes-riecken/mailman", ".mailman/romainguy/Inbox.mbox", "826b27baf303941f"],
  ["Takeout-shaped fixture", "Unberant/InboxQA", "raw_data/data.mbox", "62f73fb62e1f5d90"],
  ["fixture", "dxos/dxos", "packages/plugins/plugin-google/scripts/fixtures/sample.mbox", null],
  ["fixture", "xingminw/gmail-takeout-viewer", "examples/sample_10.mbox", null],
  ["fixture", "jeswr/solid-sdk", "apps/suite/public/samples/sample-mailbox.mbox", null],
  ["fixture", "BigCactusLabs/dead-letter", "docs/recipes/takeout-sample/Takeout/Mail/All mail Including Spam and Trash.mbox", null],
  ["fixture", "nalediym/hypha", "packages/adapters/gmail-mbox/fixtures/small.mbox", null],
  ["fixture", "ContinuMail/continumail-converter", "fixtures/mbox-with-flags.mbox", null],
];

const rows = [];
for (const [kind, repo, path, sha] of FILES) {
  const url = `https://raw.githubusercontent.com/${repo}/HEAD/${path.split("/").map(encodeURIComponent).join("/")}`;
  let text;
  try { const res = await fetch(url); if (!res.ok) throw new Error(`HTTP ${res.status}`); text = await res.text(); }
  catch (e) { rows.push({ kind, repo, error: String(e.message || e) }); continue; }
  const got = createHash("sha256").update(text).digest("hex").slice(0, 16);
  const c = createCollector({ repliesOnly: false }), s = new MboxSplitter((raw) => c.add(raw));
  s.push(text); s.end();
  const r = c.finish().stats;
  rows.push({ kind, repo, chars: text.length, changed: sha && got !== sha ? got : "", messages: r.messages, noText: r.noText, unescapedFrom: s.unescapedFrom, envelopes: (text.match(/^From \S+.*$/gm) || []).length });
}
console.table(rows);
