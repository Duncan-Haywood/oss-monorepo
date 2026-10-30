import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeApp, setStatus, nextFollowUp, nextActions, ghostCandidates, funnel, insight,
  toCsv, fromCsv, parseCsv, toIcs, addDays, daysBetween, isIsoDate, firstResponseDays,
} from "./tracker.mjs";

const mk = (o) => normalizeApp({ company: "Acme", role: "Dev", applied: "2026-10-01", status: "applied", ...o });

test("isIsoDate rejects impossible dates", () => {
  assert.ok(isIsoDate("2026-02-28"));
  assert.ok(!isIsoDate("2026-02-30"));
  assert.ok(!isIsoDate("10/01/2026"));
});

test("date helpers cross month and year ends", () => {
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(daysBetween("2026-10-01", "2026-10-15"), 14);
});

test("normalizeApp needs a company or a role and defaults the status", () => {
  assert.equal(normalizeApp({}), null);
  assert.equal(normalizeApp({ company: "  " }), null);
  const a = normalizeApp({ company: " Acme ", status: "bogus", applied: "2026-10-01", salary: "120000" });
  assert.equal(a.company, "Acme");
  assert.equal(a.status, "applied");
  assert.equal(a.salary, 120000);
  assert.deepEqual(a.history, [{ status: "applied", date: "2026-10-01" }]);
});

test("applied follow-up is seven days after applying; interview is three after the last step", () => {
  const a = mk({});
  assert.equal(nextFollowUp(a), "2026-10-08");
  const b = setStatus(a, "interview", "2026-10-10");
  assert.equal(nextFollowUp(b), "2026-10-13");
});

test("an explicit follow-up date wins, and a status change clears it", () => {
  const a = mk({ followUp: "2026-10-20" });
  assert.equal(nextFollowUp(a), "2026-10-20");
  assert.equal(setStatus(a, "screen", "2026-10-05").followUp, "");
});

test("offers, wishlist and closed applications have no follow-up", () => {
  for (const status of ["offer", "wishlist", "rejected", "ghosted", "withdrawn"]) assert.equal(nextFollowUp(mk({ status })), "");
});

test("nextActions orders most overdue first and hides the far future", () => {
  const apps = [mk({ company: "B", applied: "2026-10-06" }), mk({ company: "A", applied: "2026-10-01" }), mk({ company: "C", applied: "2026-10-14" })];
  const out = nextActions(apps, "2026-10-12");
  assert.deepEqual(out.map((x) => x.app.company), ["A", "B"]);
  assert.equal(out[0].daysLate, 4);
});

test("ghostCandidates flags applied-and-silent for 30 days only", () => {
  const old = mk({ applied: "2026-09-01" });
  const fresh = mk({ applied: "2026-10-05" });
  const replied = setStatus(mk({ applied: "2026-09-01" }), "screen", "2026-09-10");
  assert.deepEqual(ghostCandidates([old, fresh, replied], "2026-10-12").map((a) => a.id), [old.id]);
});

test("funnel counts a rejection as a response and splits by source", () => {
  const apps = [
    mk({ source: "LinkedIn" }), mk({ source: "LinkedIn" }), mk({ source: "LinkedIn" }),
    setStatus(mk({ source: "Referral" }), "interview", "2026-10-05"),
    setStatus(mk({ source: "LinkedIn" }), "rejected", "2026-10-04"),
    mk({ status: "wishlist", applied: "" }),
  ];
  const f = funnel(apps, "2026-10-12");
  assert.equal(f.sent, 5);
  assert.equal(f.responded, 2);
  assert.equal(f.interviewed, 1);
  const li = f.sources.find((s) => s.source === "LinkedIn");
  assert.equal(li.sent, 4);
  assert.equal(li.responseRate, 25);
  assert.equal(f.medianDaysToResponse, 3.5);
});

test("funnel handles an empty tracker without dividing by zero", () => {
  const f = funnel([], "2026-10-12");
  assert.equal(f.sent, 0);
  assert.equal(f.responseRate, null);
  assert.equal(f.weeks.length, 4);
  assert.equal(insight(f), "");
});

test("firstResponseDays is null until someone answers", () => {
  assert.equal(firstResponseDays(mk({})), null);
});

test("weekly counts bucket by application date", () => {
  const apps = [mk({ applied: "2026-10-12" }), mk({ applied: "2026-10-11" }), mk({ applied: "2026-10-01" })];
  const f = funnel(apps, "2026-10-12");
  assert.equal(f.weeks.at(-1).sent, 2);
  assert.equal(f.weeks.reduce((s, w) => s + w.sent, 0), 3);
});

test("insight names the best and worst source only with enough data", () => {
  const apps = [];
  for (let i = 0; i < 3; i++) apps.push(setStatus(mk({ source: "Referral" }), "screen", "2026-10-03"));
  for (let i = 0; i < 4; i++) apps.push(mk({ source: "Job board" }));
  const s = insight(funnel(apps, "2026-10-12"));
  assert.match(s, /Referral has drawn replies on 100% of 3/);
  assert.match(s, /Job board on 0% of 4/);
});

test("CSV round-trips commas, quotes and newlines", () => {
  const a = mk({ notes: 'said "call back, Friday"\nsecond line', link: "https://x.test/a,b" });
  const { apps } = fromCsv(toCsv([a]));
  assert.equal(apps.length, 1);
  assert.equal(apps[0].notes, a.notes);
  assert.equal(apps[0].link, a.link);
});

test("CSV export neutralises spreadsheet formulas and import restores them", () => {
  const a = mk({ notes: "=HYPERLINK(\"http://evil.test\")" });
  const csv = toCsv([a]);
  assert.ok(!/,=HYPERLINK/.test(csv) && /'=HYPERLINK/.test(csv));
  assert.equal(fromCsv(csv).apps[0].notes, a.notes);
});

test("CSV import tolerates BOM, CRLF, header case and reports skipped rows", () => {
  const text = "\uFEFFCompany,Role,Applied\r\nAcme,Dev,2026-10-01\r\n,,\r\nBeta,,2026-10-02\r\n";
  const { apps, skipped } = fromCsv(text);
  assert.equal(apps.length, 2);
  assert.equal(skipped, 0);
  assert.equal(parseCsv("a,b\n").length, 1);
});

test("CSV without a company or role column imports nothing", () => {
  assert.deepEqual(fromCsv("foo,bar\n1,2\n"), { apps: [], skipped: 1 });
});

test("ICS lists only pending follow-ups and escapes text", () => {
  const a = mk({ company: "Acme, Inc", id: "x1" });
  const done = mk({ status: "rejected", id: "x2" });
  const ics = toIcs([a, done]);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.match(ics, /DTSTART;VALUE=DATE:20261008/);
  assert.match(ics, /SUMMARY:Follow up: Acme\\, Inc - Dev/);
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
});

test("ICS escapes semicolons and backslashes (RFC 5545 TEXT)", () => {
  const ics = toIcs([mk({ company: "A;B", id: "x3" })]);
  assert.match(ics, /SUMMARY:Follow up: A\\;B - Dev/);
});

test("ghostCandidates counts day 30 as silent, day 29 as not", () => {
  const a = mk({ applied: "2026-09-12" });
  assert.equal(ghostCandidates([a], "2026-10-12").length, 1);
  assert.equal(ghostCandidates([a], "2026-10-11").length, 0);
});

test("insight needs five sent and two rated sources, exactly", () => {
  const mkSet = (n) => {
    const apps = [];
    for (let i = 0; i < 3; i++) apps.push(setStatus(mk({ source: "Referral" }), "screen", "2026-10-03"));
    for (let i = 0; i < n; i++) apps.push(mk({ source: "Job board" }));
    return funnel(apps, "2026-10-12");
  };
  assert.equal(insight(mkSet(1)), "");
  assert.notEqual(insight(mkSet(3)), "");
  const one = [];
  for (let i = 0; i < 5; i++) one.push(setStatus(mk({ source: "Referral" }), "screen", "2026-10-03"));
  assert.equal(insight(funnel(one, "2026-10-12")), "");
});

test("CSV with only a Role column still imports; Company-only too", () => {
  assert.equal(fromCsv("Role\nDev\n").apps.length, 1);
  assert.equal(fromCsv("Company\nAcme\n").apps.length, 1);
});
