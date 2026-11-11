// Exported mail files (.eml, .mbox) into reply blocks: mailfile.mjs and the browser-safe MIME reader mime.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createCollector, MboxSplitter, isMbox, readMailTexts, describe, addressOf } from "./mailfile.mjs";
import { base64Bytes, parseMessage } from "./mime.mjs";
import { runInbox } from "./engine.mjs";

const here = (p) => new URL(p, import.meta.url);
const msg = ({ from, subject = "Re: route planning", id, date = "Thu, 5 Nov 2026 10:00:00 +0000", extra = "", body }) =>
  `From: ${from}\r\nSubject: ${subject}\r\nDate: ${date}\r\n${id ? `Message-ID: <${id}>\r\n` : ""}${extra}\r\n${body}\r\n`;
const mbox = (...msgs) => msgs.map((m, i) => `From ${1000 + i}@xxx Thu Nov 05 10:00:00 +0000 2026\n${m.replace(/\r\n/g, "\n").replace(/^(>*From )/gm, ">$1")}\n`).join("");

const DANA = msg({ from: "Dana Reyes <dana@brightline.example>", id: "a1@x", extra: "In-Reply-To: <out1@me>\r\n", body: "Sounds interesting. Could you send a few times next week?\r\nFrom the desk of Dana" });
const OMAR = msg({ from: "omar@peakdental.example", subject: "RE: route planning", id: "a2@x", date: "Wed, 4 Nov 2026 08:00:00 +0000", extra: "Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n", body: "Please remove me from your list. Caf=C3=A9" });
const SENT = msg({ from: "Sam <sam@me.example>", subject: "route planning", id: "out1@me", extra: "X-Gmail-Labels: Sent,Opened\r\n", body: "Hi Dana" });
const NEWS = msg({ from: "news@shop.example", subject: "Big sale", id: "a3@x", body: "Buy now" });

test("mbox: split, >From unescaped, own and non-replies left out, oldest first, categories as pasted", () => {
  const text = mbox(DANA, SENT, OMAR, NEWS);
  assert.ok(isMbox(text));
  const r = readMailTexts([{ name: "in.mbox", text }]);
  assert.deepEqual([r.stats.messages, r.stats.kept, r.stats.own, r.stats.notReply], [4, 2, 1, 1]);
  assert.match(r.replies, /^From: omar@peakdental\.example[\s\S]*Café[\s\S]*\n---\nFrom: Dana Reyes/); // Wed before Thu
  assert.match(r.replies, /\nFrom the desk of Dana/); // ">From" in the mbox came back as "From"
  const out = runInbox({ replies: r.replies, today: "2026-11-06" });
  assert.deepEqual(out.items.map((i) => [i.from, i.triage.category]), [["omar@peakdental.example", "unsubscribe"], ["dana@brightline.example", "interested"]]);
  assert.equal(describe(r), "4 messages read, 2 kept as replies; left out: 1 of your own, 1 not replies.");
});

test("own addresses, duplicates, repliesOnly off, no text", () => {
  const c = createCollector({ own: ["Sam <SAM@me.example>"], repliesOnly: false });
  for (const m of [DANA, DANA, msg({ from: "sam@me.example", id: "s2@me", body: "follow-up" }), NEWS, msg({ from: "x@y.example", id: "img@x", extra: "Content-Type: image/png\r\n", body: "iVBOR" })]) c.add(m);
  const r = c.finish();
  assert.deepEqual([r.stats.kept, r.stats.duplicates, r.stats.own, r.stats.noText, r.stats.notReply], [2, 1, 1, 1, 0]);
  assert.equal(addressOf("Dana Reyes <Dana@Brightline.example>"), "dana@brightline.example");
});

test("reply signs: References header and reply prefixes in other languages count; a forward does not", () => {
  const r = readMailTexts([
    { name: "a.eml", text: msg({ from: "a@x.example", subject: "Angebot", id: "1", extra: "References: <o@me>\r\n", body: "Kein Interesse." }) },
    { name: "b.eml", text: msg({ from: "b@x.example", subject: "AW: Angebot", id: "2", body: "Bitte entfernen Sie mich." }) },
    { name: "c.eml", text: msg({ from: "c@x.example", subject: "SV: tilbud", id: "3", body: "Nej tak." }) },
    { name: "d.eml", text: msg({ from: "d@x.example", subject: "Fwd: offer", id: "4", body: "see below" }) },
  ]);
  assert.deepEqual([r.stats.kept, r.stats.notReply], [3, 1]);
});

test("delivery failures and auto-replies are kept without a reply sign", () => {
  const files = ["multi_address_bounce1.eml", "report_530.eml"].map((n) => ({ name: n, text: readFileSync(here(`eval/bounce-corpus-mail/${n}`), "latin1") }));
  files.push({ name: "ooo.eml", text: msg({ from: "pat@x.example", subject: "Out of office", id: "o1", extra: "Auto-Submitted: auto-replied\r\n", body: "I am out of the office until Monday 9 November." }) });
  const r = readMailTexts(files);
  assert.equal(r.stats.kept, 3);
  const out = runInbox({ replies: r.replies, today: "2026-11-06" });
  const cats = out.items.map((i) => i.triage.category);
  assert.ok(cats.filter((c) => c === "bounce").length >= 2, cats.join());
  assert.ok(cats.includes("out_of_office"), cats.join());
});

test("chunked pushes split the same as one push, CRLF and chunk edges included", () => {
  const text = mbox(DANA, SENT, OMAR, NEWS).replace(/\n/g, "\r\n");
  const whole = [], parts = [];
  const a = new MboxSplitter((m) => whole.push(m)); a.push(text); a.end();
  const b = new MboxSplitter((m) => parts.push(m)); for (let i = 0; i < text.length; i += 7) b.push(text.slice(i, i + 7)); b.end();
  assert.equal(whole.length, 4);
  assert.deepEqual(parts, whole);
});

test("a From line inside a paragraph does not start a message; an oversized message is cut and counted", () => {
  const got = [];
  const s = new MboxSplitter((m) => got.push(m), { maxBytes: 300 });
  s.push(`From 1@x Thu Nov 05 2026\nFrom: a@x.example\nSubject: Re: hi\n\nline one\nFrom here on we agree.\n\nFrom 2@x Thu Nov 05 2026\nFrom: b@x.example\nSubject: Re: hi\n\n${"long line of text\n".repeat(40)}`);
  s.end();
  assert.equal(got.length, 2);
  assert.match(got[0], /From here on we agree/);
  assert.equal(s.truncated, 1);
  assert.ok(got[1].length < 400);
});

test("base64Bytes matches Buffer, lenient input included", () => {
  const cases = ["", "QQ", "QUI=", "SGVsbG8gd29ybGQ=", "SGVs\r\nbG8g d29y bGQ", "Q2Fmw6k", "Q2Fmw6k=junk", "-_-_", "!!SGk=", "Zm9vYmFy"];
  let seed = 7;
  for (let i = 0; i < 200; i++) { seed = (seed * 1103515245 + 12345) % 2 ** 31; const len = seed % 40; const b = new Uint8Array(len).map((_, j) => (seed >> (j % 24)) & 255); cases.push(Buffer.from(b).toString("base64")); }
  for (const c of cases) assert.deepEqual([...base64Bytes(c)], [...Buffer.from(c, "base64")], JSON.stringify(c));
});

test("mime.mjs needs no Node built-ins (the page imports it)", () => {
  for (const f of ["mime.mjs", "mailfile.mjs"]) assert.doesNotMatch(readFileSync(here(f), "utf8"), /from "node:|\bBuffer\.(?!from\(s)|require\(/, f);
  assert.equal(parseMessage("From: x@y.co\r\nSubject: =?UTF-8?B?Q2Fmw6k=?=\r\n\r\nb").headers.subject, "Café");
});

test("cli --mail runs the inbox on an mbox", () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-mail-"));
  writeFileSync(join(dir, "in.mbox"), mbox(DANA, SENT, OMAR, NEWS));
  const out = execFileSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, "--mail", join(dir, "in.mbox"), "--today", "2026-11-06", "--out", join(dir, "out")], { encoding: "utf8", env: { PATH: process.env.PATH } });
  assert.match(out, /4 messages read, 2 kept as replies/);
  assert.match(out, /2 replies \(rules\)/);
  assert.match(readFileSync(join(dir, "out", "suppression-add.csv"), "utf8"), /omar@peakdental\.example/);
});

test("a word-model guess outside the category list is ignored, not a crash (found on Enron mail, 2026-11-11)", async () => {
  const replies = "From: a@x.example\nSubject: Re: hi\n\nThe gas desk meets at four; bring the curve files.";
  const r = runInbox({ replies, today: "2026-11-06" }, { guessFn: () => ({ category: "wrong_person", margin: 9 }) });
  assert.equal(r.items[0].triage.category, "unclear");
  assert.equal(r.items[0].triage.guess, undefined);
  const { MODEL } = await import("./model.mjs");
  const { CATEGORIES } = await import("./engine.mjs");
  for (const c of Object.keys(MODEL.docs)) assert.ok(CATEGORIES[c], `model class ${c} has no category`);
});
