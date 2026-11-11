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
  assert.equal(describe(r), "4 messages read, 2 kept as replies; left out: 1 of your own, 1 not a reply.");
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

// Format corners found on real exports published on GitHub, 2026-11-11 (eval/mailfile-public.mjs); rebuilt here by hand.
test("an unescaped body line starting with From after a blank line stays in the message (mboxo writers)", () => {
  const text = `From 1800000000000000004@xxx Sun Sep 14 09:00:00 +0000 2025\nX-GM-THRID: 1800000000000000004\nFrom: Omar <omar@x.example>\nSubject: Re: Monitoring\nIn-Reply-To: <m1@x>\n\nFrom a security standpoint, Datadog is easier for our audit.\n\nOmar\n\nFrom 1800000000000000005@xxx Sun Sep 14 10:00:00 +0000 2025\nX-GM-THRID: 1800000000000000005\nFrom: Priya <priya@x.example>\nSubject: Re: Monitoring\nIn-Reply-To: <m1@x>\n\nAgreed.\n\nFrom the product side, SSO blocks five deals.\n`;
  const got = []; const s = new MboxSplitter((m) => got.push(m)); s.push(text); s.end();
  assert.equal(got.length, 2);
  assert.match(got[0], /From a security standpoint[\s\S]*Omar/);
  assert.match(got[1], /From the product side, SSO blocks five deals\./); // the last line of the file too
  assert.equal(s.unescapedFrom, 2);
  // A URL on the next line is not a header (seven Enron messages written unescaped split on "From the Editor" + "http://...").
  const url = []; const u = new MboxSplitter((m) => url.push(m)); u.push(`From 1@x Thu Nov 05 10:00:00 +0000 2026\nFrom: a@x.example\n\nRead this.\n\nFrom the Editor BY JAMES TARANTO\nhttp://www.example.com/columnists/\n`); u.end();
  assert.equal(url.length, 1);
  const r = readMailTexts([{ name: "x.mbox", text }]);
  assert.deepEqual([r.stats.messages, r.stats.kept, r.stats.noText], [2, 2, 0]);
});

test("Thunderbird 'From - ' envelopes with X-Mozilla headers, Takeout envelopes with CRLF, and a bare dated envelope", () => {
  const tb = `From - Thu Feb 23 19:37:30 2017\r\nX-Mozilla-Status: 0011\r\nFrom: A <a@x.example>\r\nSubject: Re: one\r\n\r\nFirst.\r\n\r\nFrom - Thu Feb 23 19:38:00 2017\r\nX-Mozilla-Status: 0001\r\nFrom: B <b@x.example>\r\nSubject: Re: two\r\n\r\nSecond.\r\n`;
  const takeout = `From 1512584914615853097@xxx Thu Sep 17 18:09:44 +0000 2015\r\nX-GM-THRID: 1512584914615853097\r\nX-Gmail-Labels: Inbox\r\nFrom: C <c@x.example>\r\nSubject: Re: three\r\n\r\nThird.\r\n\r\n`;
  // An envelope followed by a blank line (a message with no headers) still splits when it reads as an envelope.
  const bare = `From a@x.example Mon Jan  1 00:00:00 2001\nFrom: D <d@x.example>\nSubject: Re: four\n\nFourth.\n\nFrom b@x.example Mon Jan  1 00:00:01 2001\n\nheaderless\n`;
  for (const [text, n] of [[tb, 2], [takeout, 1], [bare, 2]]) { const got = []; const s = new MboxSplitter((m) => got.push(m)); s.push(text); s.end(); assert.equal(got.length, n, text.slice(0, 30)); assert.equal(s.unescapedFrom, 0); }
});

test("a multipart message whose declared boundary never appears is read from the boundary its body uses", () => {
  const raw = `From: La French Tech <support@x.example>\r\nSubject: Next steps\r\nContent-type: multipart/alternative; boundary="----------=_144278-1527-31"\r\n\r\nThis is a multi-part message in MIME format.\r\n\r\n------------=_1442425378-1527-31\r\nContent-Transfer-Encoding: quoted-printable\r\nContent-Type: text/plain; charset="utf-8"\r\n\r\nDear participants, caf=C3=A9 at 9.\r\n\r\n------------=_1442425378-1527-31\r\nContent-Type: text/html; charset="utf-8"\r\n\r\n<p>html</p>\r\n------------=_1442425378-1527-31--\r\n`;
  assert.equal(parseMessage(raw).text, "Dear participants, café at 9.");
  // A boundary that does appear is used as declared, even when another "--" line comes first.
  const ok = `Content-Type: multipart/mixed; boundary="b1"\r\n\r\n--not-it\r\nContent-Type: text/plain\r\n\r\nwrong\r\n--b1\r\nContent-Type: text/plain\r\n\r\nright\r\n--b1--\r\n`;
  assert.equal(parseMessage(ok).text, "right");
});

test("a body 'From ...' line followed by a 'Note:'-style line stays in the reply (only a mail header after it splits)", () => {
  const text = ["From 1@xxx Thu Nov 05 10:00:00 +0000 2026", "From: dana@b.example", "Subject: Re: quote", "In-Reply-To: <o@me>", "", "Happy to go ahead.", "", "From our side the only open point is timing.", "Note: we need it live before March.", "", "Dana", ""].join("\n");
  const got = []; const s = new MboxSplitter((m) => got.push(m)); s.push(text); s.end();
  assert.equal(got.length, 1);
  assert.match(got[0], /From our side[\s\S]*Note: we need it live before March\.[\s\S]*Dana/);
  assert.equal(s.unescapedFrom, 1);
  // An envelope that does not read as one still splits when a real first header follows it.
  const odd = []; const o = new MboxSplitter((m) => odd.push(m)); o.push("From a@x\nReturn-Path: <a@x>\nSubject: Re: one\n\nOne.\n\nFrom b@x\nX-Mozilla-Status: 0001\nSubject: Re: two\n\nTwo.\n"); o.end();
  assert.equal(odd.length, 2);
  // A dated "From" body line is only an envelope when a header or a blank line follows it.
  const dated = []; const d = new MboxSplitter((m) => dated.push(m)); d.push("From a@x Mon Jan  1 00:00:00 2001\nSubject: Re: hours\n\nOur hours:\n\nFrom Mon to Fri 9:00 to 17:00, all of 2026\nand Saturdays by appointment.\n"); d.end();
  assert.equal(dated.length, 1);
  assert.match(dated[0], /From Mon to Fri[\s\S]*Saturdays/);
});

test("mutation guards: envelope clock width, second line, byte cap, trailing CR, top sender count, KB label, plurals", () => {
  // A three-digit "clock" is not a time: the line stays body text.
  const clk = []; const k = new MboxSplitter((m) => clk.push(m)); k.push("From a@x Mon Jan  1 00:00:00 2001\nSubject: Re: odds\n\nSee below.\n\nFrom fans: a 100:00 record in 2020\n\nok\n"); k.end();
  assert.equal(clk.length, 1);
  // The line after the file's first envelope is never itself a candidate envelope.
  const two = []; const t = new MboxSplitter((m) => two.push(m)); t.push("From a@x Mon Jan  1 00:00:00 2001\nFrom b@x Mon Jan  1 00:00:01 2001\nSubject: Re: x\n\nbody\n"); t.end();
  assert.deepEqual(two, ["From b@x Mon Jan  1 00:00:01 2001\r\nSubject: Re: x\r\n\r\nbody"]);
  // maxBytes counts each line plus its CRLF: 4 lines of 8 bytes + 2 fill 40 exactly; a fifth is cut.
  const cap = []; const c = new MboxSplitter((m) => cap.push(m), { maxBytes: 40 }); c.push("From a@x Mon Jan  1 00:00:00 2001\nSubject\nAAAAAAAA\nBBBBBBBB\nCCCCCCCC\nDDDDDDDD\n"); c.end();
  assert.equal(cap[0], "Subject\r\nAAAAAAAA\r\nBBBBBBBB\r\nCCCCCCCC");
  assert.equal(c.truncated, 1);
  const fit = []; const f = new MboxSplitter((m) => fit.push(m), { maxBytes: 39 }); f.push("From a@x Mon Jan  1 00:00:00 2001\nAAAAAAAA\nBBBBBBBB\nCCCCCCCC\nDDDDDDDD\n"); f.end();
  assert.equal(fit[0], "AAAAAAAA\r\nBBBBBBBB\r\nCCCCCCCC");
  // A last line with no newline but a trailing CR loses only the CR.
  const cr = []; const e = new MboxSplitter((m) => cr.push(m)); e.push("From a@b Mon Jan  1 10:00:00 2001\r\nSubject: Re: x\r\n\r\nbody\r"); e.end();
  assert.deepEqual(cr, ["Subject: Re: x\r\n\r\nbody"]);
  // topSender carries the count; describe() names the cap in KB and uses singulars.
  const DUP = msg({ from: "dana@b.example", id: "d@x", extra: "In-Reply-To: <o@me>\r\n", body: "Yes." });
  const NOT = msg({ from: "news@shop.example", subject: "Sale", id: "n@x", body: "Buy" });
  const r = readMailTexts([{ name: "a.eml", text: DUP }, { name: "b.eml", text: DUP }, { name: "c.eml", text: NOT }, { name: "d.eml", text: DUP.replace("d@x", "d2@x") + "x".repeat(200001) }]);
  assert.deepEqual(r.topSender, { address: "dana@b.example", count: 3 });
  assert.equal(describe(r), "4 messages read, 2 kept as replies; left out: 1 not a reply, 1 duplicate; 1 cut at 200 KB.");
  assert.equal(describe({ stats: { messages: 1, kept: 0, own: 1, notReply: 0, duplicates: 0, noText: 1, truncated: 0 } }), "1 message read, 0 kept as replies; left out: 1 of your own, 1 with no text.");
});
