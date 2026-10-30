// Score the inbox agent on REAL delivery-failure messages (flufl.bounce's test data, Apache-2.0; see bounce-corpus/NOTICE).
//   node eval/bounces.mjs        -> summary + every miss
// Path under test: raw RFC 822 -> self-host/imap.mjs parseMessage + toReplyBlock -> engine parseReplies + triage,
// the same path the IMAP poller takes. Ground truth: every file is a bounce unless listed in EXPECTED below.
import { readFileSync, readdirSync } from "node:fs";
import { parseMessage, toReplyBlock } from "../self-host/imap.mjs";
import { parseReplies, triage } from "../engine.mjs";

const DIR = new URL("./bounce-corpus/", import.meta.url);
// Not hard bounces, set by reading each one: DSN Status 4.x.x / "postponed" notices (delivery delayed, no address change),
// a real auto-responder, a human-looking reply to a mailing and a list-moderation hold. Everything else is a failed delivery.
export const EXPECTED = {
  "dsn_02.txt": "out_of_office", "dsn_05.txt": "out_of_office", "dsn_06.txt": "out_of_office", "dsn_07.txt": "out_of_office",
  "dsn_08.txt": "out_of_office", "dsn_17.txt": "out_of_office", "simple_35.txt": "out_of_office", "qmail_08.txt": "out_of_office",
  "groupwise_03.txt": "unclear", "microsoft_03.txt": "unclear",
};

export function score(today = "2026-10-24") {
  const rows = [];
  for (const f of readdirSync(DIR).filter((n) => n.endsWith(".txt")).sort()) {
    const raw = readFileSync(new URL(f, DIR), "latin1").replace(/^From .*\n/, ""); // mbox separator line
    const r = parseReplies(toReplyBlock(parseMessage(raw)))[0];
    rows.push({ file: f, want: EXPECTED[f] || "bounce", got: triage(r, today).category });
  }
  const right = rows.filter((r) => r.want === r.got).length;
  // Harm: a failed delivery read as anything but a bounce keeps mailing a dead address (or pauses instead of stopping).
  const missedBounces = rows.filter((r) => r.want === "bounce" && r.got !== "bounce");
  return { n: rows.length, right, missedBounces, misses: rows.filter((r) => r.want !== r.got) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = score();
  console.log(`real messages: ${s.right}/${s.n} read right; hard bounces missed ${s.missedBounces.length}`);
  for (const m of s.misses) console.log(`  ${m.file}: wanted ${m.want}, got ${m.got}`);
}
