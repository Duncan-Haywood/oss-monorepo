import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPlan, toCsv } from "../sales-cadence-builder/calc.mjs";
import { runDaily, csvLeftOut, baseSubject } from "./daily.mjs";
import { readMailTexts, describe } from "./mailfile.mjs";

// Your own sent mail is the done list: real cadence builder output, and mail in the shape Gmail Takeout and Thunderbird
// write it (the Sent label, or an --own address).
const PROSPECTS = `first_name,last_name,email,company,phone,state,country
Dana,Reyes,dana@brightline.example,Brightline Logistics,303-555-0101,CO,US
Omar,Khan,omar@harbor.example,Harbor Freight Co,415-555-0102,CA,US`;
const SENDER = { sender_name: "Sam Ortiz", sender_company: "Example Routing Co.", sender_address: "100 Example St, Springfield, IL 62701", sender_phone: "555-0100", topic: "route planning", offer: "builds next-day routes from a spreadsheet", outcome: "plans in minutes instead of hours", proof: "", cta: "a 15 minute call" };
const plan = buildPlan(PROSPECTS, SENDER, { start: "2026-10-26", sellerTz: "America/Denver" });
const tasks = toCsv(plan.tasks);
const emails = (email) => plan.tasks.filter((t) => t.email === email && t.channel === "email");

const msg = ({ from, to, subject, date, labels, body = "Hi", id }) => `From 1700000000000000000@xxx Mon Oct 26 15:00:00 +0000 2026
X-GM-THRID: 1700000000000000000
${labels ? `X-Gmail-Labels: ${labels}\n` : ""}Message-ID: <${id}@example>
Date: ${date}
From: ${from}
To: ${to}
Subject: ${subject}
Content-Type: text/plain; charset=utf-8

${body}
`;

test("baseSubject: reply and forward prefixes, case, spacing and closing punctuation do not matter", () => {
  assert.equal(baseSubject("Re: Fwd:  Route planning at Brightline Logistics"), "route planning at brightline logistics");
  assert.equal(baseSubject("AW: Who owns route planning at X?"), "who owns route planning at x");
  assert.equal(baseSubject(""), "");
});

test("a Takeout mbox: steps you sent are done, a reply still runs, and nothing else changes", () => {
  const [d1, d2] = emails("dana@brightline.example");
  const [o1] = emails("omar@harbor.example");
  const mbox = [
    msg({ id: "s1", labels: "Sent", from: "Sam Ortiz <sam@routing.example>", to: `Dana Reyes <dana@brightline.example>`, subject: d1.subject, date: "Mon, 26 Oct 2026 16:02:00 +0000" }),
    msg({ id: "s2", labels: "Sent,Opened", from: "sam@routing.example", to: "omar@harbor.example", subject: o1.subject, date: "Mon, 26 Oct 2026 16:05:00 +0000" }),
    msg({ id: "s3", labels: "Sent", from: "sam@routing.example", to: "dana@brightline.example", subject: `Re: ${d2.subject}`, date: "Fri, 30 Oct 2026 15:00:00 +0000" }),
    msg({ id: "n1", labels: "Inbox", from: "news@vendor.example", to: "sam@routing.example", subject: "Our November newsletter", date: "Fri, 30 Oct 2026 09:00:00 +0000" }),
  ].join("\n");
  const r = readMailTexts([{ name: "All mail.mbox", text: mbox }]);
  assert.equal(r.stats.own, 3);
  assert.equal(r.sent.length, 3);
  assert.deepEqual(r.sent[0], { date: "2026-10-26", to: ["dana@brightline.example"], subject: d1.subject });
  assert.match(describe(r), /3 of your own \(3 kept as touches already made\)/);

  const without = runDaily({ tasks, prospects: "", today: d2.date, maxOverdueDays: 30 });
  const d = runDaily({ tasks, prospects: "", sent: r.sent, today: d2.date, maxOverdueDays: 30 });
  const due = (x) => x.queue.filter((q) => q.channel === "email").map((q) => `${q.email}|${q.step}`);
  assert.ok(due(without).includes(`dana@brightline.example|${d1.step}`) && due(without).includes(`dana@brightline.example|${d2.step}`));
  assert.ok(!due(d).includes(`dana@brightline.example|${d1.step}`) && !due(d).includes(`dana@brightline.example|${d2.step}`), "both Dana steps were sent");
  assert.ok(!due(d).includes(`omar@harbor.example|${o1.step}`));
  assert.equal(d.summary.alreadySent, 3);
  assert.equal(d.sentMatched.find((x) => x.step === String(d2.step) && x.email === "dana@brightline.example").sent_on, "2026-10-30");
  assert.equal(d.summary.due + 3, without.summary.due, "only the three sent touches leave the queue");
  assert.match(d.brief, /3 email touches are already in your sent mail/);
  assert.match(csvLeftOut(d), /already sent,.*in your sent mail on 2026-10-26/);
  // Calls and LinkedIn are never read off sent mail.
  assert.deepEqual(d.queue.filter((q) => q.channel !== "email").map((q) => q.step), without.queue.filter((q) => q.channel !== "email").map((q) => q.step));
});

test("a message on another subject that week holds the due step; an older one or a planned step does not", () => {
  const [d1, d2] = emails("dana@brightline.example");
  const sent = [{ date: d1.date, to: ["dana@brightline.example"], subject: d1.subject }, { date: d2.date, to: ["dana@brightline.example"], subject: "The pricing sheet you asked for" }];
  const d = runDaily({ tasks, prospects: "", sent, today: d2.date, maxOverdueDays: 30 });
  const h = d.held.find((x) => x.email === "dana@brightline.example" && x.step === String(d2.step));
  assert.ok(h, "the due step is held");
  assert.match(h.reason, /you emailed them on .*pricing sheet/);
  // The same off-plan message two weeks before the step is not a reason to hold it.
  const early = runDaily({ tasks, prospects: "", sent: [{ ...sent[1], date: "2026-10-01" }], today: d2.date, maxOverdueDays: 30 });
  assert.ok(early.queue.some((x) => x.email === "dana@brightline.example" && x.step === String(d2.step)));
  // Sending step 1 late (on step 2's day) marks step 1 done and does not hold step 2.
  const late = runDaily({ tasks, prospects: "", sent: [{ date: d2.date, to: ["dana@brightline.example"], subject: d1.subject }], today: d2.date, maxOverdueDays: 30 });
  assert.ok(late.queue.some((x) => x.email === "dana@brightline.example" && x.step === String(d2.step)));
  assert.ok(late.sentMatched.some((x) => x.step === String(d1.step)));
});

test("a sent CSV (date,to,subject) works like a mail file; a cc counts, and someone else's address does not", () => {
  const [d1] = emails("dana@brightline.example");
  const csvText = `date,to,subject\n${d1.date},boss@brightline.example; dana@brightline.example,"RE: ${d1.subject}"\n${d1.date},nobody@else.example,${d1.subject}\n`;
  const d = runDaily({ tasks, prospects: "", sent: csvText, today: d1.date });
  assert.equal(d.summary.sentRead, 2);
  assert.equal(d.summary.alreadySent, 1);
  assert.ok(!d.queue.some((x) => x.email === "dana@brightline.example" && x.step === String(d1.step)));
  assert.ok(d.queue.some((x) => x.email === "omar@harbor.example" && x.channel === "email"));
});

test("Thunderbird: a Sent mbox with --own, through the CLI, writes the queue without the sent step", () => {
  const dir = mkdtempSync(join(tmpdir(), "sa-sent-"));
  const [d1] = emails("dana@brightline.example");
  const tb = (m) => m.replace(/^From 1700000000000000000@xxx .*\nX-GM-THRID: .*\n/, "From - Mon Oct 26 16:02:00 2026\nX-Mozilla-Status: 0001\n");
  writeFileSync(join(dir, "Sent"), tb(msg({ id: "t1", from: "Sam Ortiz <sam@routing.example>", to: "Dana Reyes <dana@brightline.example>", subject: d1.subject, date: "Mon, 26 Oct 2026 16:02:00 -0600" })));
  writeFileSync(join(dir, "tasks.csv"), tasks);
  const out = join(dir, "out");
  const log = execFileSync(process.execPath, ["cli.mjs", "--mail", join(dir, "Sent"), "--own", "sam@routing.example", "--tasks", join(dir, "tasks.csv"), "--today", d1.date, "--out", out], { cwd: new URL(".", import.meta.url).pathname, encoding: "utf8", env: { ...process.env, LLM_PROVIDER: "", ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "" } });
  assert.match(log, /1 of your own \(1 kept as touches already made\)/);
  assert.match(log, /1 already in your sent mail/);
  const q = readFileSync(join(out, "todays-queue.csv"), "utf8");
  assert.ok(!q.split("\n").some((l) => l.includes("dana@brightline.example") && l.includes(",email,")), "Dana's sent email is not queued");
  assert.ok(q.split("\n").some((l) => l.includes("omar@harbor.example") && l.includes(",email,")));
  assert.ok(q.includes("omar@harbor.example"));
  assert.match(readFileSync(join(out, "left-out.csv"), "utf8"), /already sent/);
});

test("an apostrophe in an address is kept (o'neal@), a quoting one is not (found on Enron sent mail)", () => {
  const mbox = msg({ id: "q1", labels: "Sent", from: "sam@routing.example", to: "O'Neal Winfree <o'neal.winfree@ridge.example>, 'kiske@ridge.example'", subject: "Route planning", date: "Mon, 26 Oct 2026 16:02:00 +0000" });
  const r = readMailTexts([{ name: "a.mbox", text: mbox }]);
  assert.deepEqual(r.sent[0].to, ["o'neal.winfree@ridge.example", "kiske@ridge.example"]);
});
