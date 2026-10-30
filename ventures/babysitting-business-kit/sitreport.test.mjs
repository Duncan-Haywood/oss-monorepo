import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as SR from "./sitreport.mjs";
import { exampleDesk } from "./engine.mjs";
import { handler } from "./server.mjs";

const TODAY = "2026-11-02";
const auth = (o = {}) => ({ id: "med_1", child: "Mia", drug: "Amoxicillin", dose: "5 ml", times: "8am, 6pm", parentName: "Ana Rivera", signedOn: "2026-10-30", expires: "2026-11-09", ...o });
const deskWithMeds = () => { const d = exampleDesk(TODAY); d.families[0].medAuths = [auth()]; return d; };
// bk_3 is a done sit three days ago for the Rivera family (exampleDesk)
const SIT = { bookingId: "bk_3", date: "2026-10-30" };

test("clock and dates read the way a parent writes them", () => {
  assert.equal(SR.clock("18:05"), "6:05pm");
  assert.equal(SR.clock("00:30"), "12:30am");
  assert.equal(SR.clock("12:00"), "12pm");
  assert.equal(SR.niceDate("2026-11-03"), "Tue Nov 3");
  assert.deepEqual(SR.parseTimes("8pm, 8am; 13:30 8am"), ["08:00", "13:30", "20:00"]);
});

test("a report is cleaned, stored on its booking by date, and keeps its created time", () => {
  const d = exampleDesk(TODAY);
  const r = SR.saveReport(d, SIT.bookingId, SIT.date, { arrived: "5pm", left: "21:05", meals: " Pasta ", mood: "happy", junk: "x", incident: { happened: false } }, "2026-10-30T21:10:00Z");
  assert.equal(r.arrived, "17:00");
  assert.equal(r.meals, "Pasta");
  assert.equal(r.junk, undefined);
  assert.deepEqual(r.incident, { happened: false });
  const again = SR.saveReport(d, SIT.bookingId, SIT.date, { ...r, meals: "Pasta and peas" }, "2026-10-30T22:00:00Z");
  assert.equal(again.created, "2026-10-30T21:10:00Z");
  assert.equal(d.bookings.find((b) => b.id === "bk_3").sitReports[SIT.date].meals, "Pasta and peas");
  assert.throws(() => SR.saveReport(d, "bk_3", "2026-10-31", {}), /not one of this sit's dates/);
  assert.throws(() => SR.saveReport(d, "nope", SIT.date, {}), /not on the schedule/);
  // a weekly series gets one report per week
  SR.saveReport(d, "bk_4", "2026-11-10", { meals: "soup" });
  assert.equal(SR.getReport(d, "bk_4", "2026-11-10").meals, "soup");
  assert.equal(SR.getReport(d, "bk_4", "2026-11-03"), null);
});

test("the message to the parents is friendly, skips empty sections and spells out an incident", () => {
  const d = exampleDesk(TODAY);
  const fam = d.families[0];
  const plain = SR.reportMessage({ date: SIT.date, arrived: "17:00", left: "21:00", meals: "Mac and cheese", mood: "happy", moodNote: "giggly" }, { family: fam, profile: d.profile });
  assert.match(plain, /^Hi Ana! Here's how it went with Leo and Mia \(Fri Oct 30, 5pm to 9pm\)\./);
  assert.match(plain, /Food: Mac and cheese/);
  assert.match(plain, /Mood: Happy\. giggly/);
  assert.doesNotMatch(plain, /Sleep|INCIDENT|Medicine/);
  assert.match(plain, /Thank you, Grace$/);
  const inc = { date: SIT.date, incident: { happened: true, time: "19:20", what: "Leo tripped on the porch step and scraped his knee.", firstAid: "Washed it, bandage.", parentsTold: "19:30", toldHow: "phone call" } };
  const m = SR.reportMessage(inc, { family: fam, profile: d.profile });
  assert.match(m, /INCIDENT \(in writing, as promised\):\nWhat happened: At 7:20pm: Leo tripped/);
  assert.match(m, /First aid given: Washed it, bandage\./);
  assert.match(m, /When I told you: 7:30pm, phone call/);
  assert.match(SR.reportSubject(inc, { family: fam, profile: d.profile }), /something happened/);
});

test("authorizations: missing parent, unsigned, expired and undated are all flagged", () => {
  assert.deepEqual(SR.authStatus(auth(), TODAY), { valid: true, problems: [] });
  assert.match(SR.authStatus(auth({ parentName: "" }), TODAY).problems.join(), /no parent's name/);
  assert.match(SR.authStatus(auth({ expires: "2026-11-01" }), TODAY).problems.join(), /expired 2026-11-01/);
  assert.match(SR.authStatus(auth({ expires: "" }), TODAY).problems.join(), /no end date/);
  assert.match(SR.authStatus(auth({ signedOn: "2026-11-05" }), TODAY).problems.join(), /not signed until/);
  assert.match(SR.authStatus(auth({ times: "" }), TODAY).problems.join(), /no times/);
  assert.equal(SR.authStatus(auth({ times: "", asNeeded: true }), TODAY).valid, true);
});

test("a dose is checked against the written authorization", () => {
  const fam = deskWithMeds().families[0];
  assert.deepEqual(SR.checkDose({ authId: "med_1", dose: "5 ml", at: "18:20" }, fam, TODAY).warnings, []);
  assert.match(SR.checkDose({ authId: "med_1", dose: "5ml", at: "19:15" }, fam, TODAY).warnings.join(), /7:15pm is outside the authorized times \(8am, 6pm, give or take 30 minutes\)/);
  assert.match(SR.checkDose({ authId: "med_1", dose: "10 ml", at: "18:00" }, fam, TODAY).warnings.join(), /Dose 10 ml is not the authorized 5 ml/);
  assert.match(SR.checkDose({ drug: "Tylenol", at: "18:00" }, fam, TODAY).warnings.join(), /No written authorization/);
  assert.match(SR.checkDose({ authId: "med_1", at: "18:00" }, fam, "2026-11-10").warnings.join(), /expired/);
  assert.match(SR.checkDose({ authId: "med_1", at: "18:10" }, fam, TODAY, [{ id: "a", authId: "med_1", at: "18:00" }]).warnings.join(), /already logged/);
  // found by medicine name when no id is given; a wider window set by the parents
  const wide = { medAuths: [auth({ windowMin: 90 })] };
  assert.deepEqual(SR.checkDose({ drug: "amoxicillin", child: "Mia", at: "19:15" }, wide, TODAY).warnings, []);
});

test("as-needed medicine: spacing and the most doses per sit", () => {
  const fam = { medAuths: [auth({ id: "med_2", drug: "Albuterol inhaler", dose: "2 puffs", times: "", asNeeded: true, minHours: 4, maxDoses: 2 })] };
  assert.deepEqual(SR.checkDose({ authId: "med_2", dose: "2 puffs", at: "17:00" }, fam, TODAY).warnings, []);
  const given = [{ id: "a", authId: "med_2", at: "17:00" }];
  assert.match(SR.checkDose({ authId: "med_2", at: "19:00" }, fam, TODAY, given).warnings.join(), /Only 120 minutes since the last dose; the parents allowed one every 4 hours/);
  assert.match(SR.checkDose({ authId: "med_2", at: "23:00" }, fam, TODAY, [...given, { id: "b", authId: "med_2", at: "21:00" }]).warnings.join(), /dose 3; the parents allowed at most 2/);
});

test("logDose keeps the warnings on the record and fills in from the authorization", () => {
  const d = deskWithMeds(), fam = d.families[0];
  let { report, warnings } = SR.logDose({ date: SIT.date }, { authId: "med_1", at: "18:05" }, fam, SIT.date, "d1");
  assert.deepEqual(warnings, []);
  assert.equal(report.doses[0].drug, "Amoxicillin");
  assert.equal(report.doses[0].dose, "5 ml");
  ({ report, warnings } = SR.logDose(report, { authId: "med_1", at: "21:00" }, fam, SIT.date, "d2"));
  assert.equal(warnings.length, 1);
  const saved = SR.saveReport(d, SIT.bookingId, SIT.date, report);
  assert.equal(saved.doses[1].warnings.length, 1);
  assert.match(SR.reportMessage(saved, { family: fam }), /Medicine given: Mia, Amoxicillin 5 ml at 6:05pm; Mia, Amoxicillin 5 ml at 9pm \(please check: 9pm is outside the authorized times/);
  assert.deepEqual(SR.reportStats(d), { reports: 1, incidents: 0, doses: 2, flagged: 1 });
});

test("family history, reportable sits and authorization alerts", () => {
  const d = deskWithMeds();
  SR.saveReport(d, "bk_1", "2026-10-12", { meals: "pizza" });
  SR.saveReport(d, "bk_3", SIT.date, { incident: { what: "bumped head" } });
  const h = SR.familyReports(d, "fam_a");
  assert.deepEqual(h.map((x) => x.date), ["2026-10-30", "2026-10-12"]);
  assert.equal(SR.hasIncident(h[0].report), true); // writing what happened counts as an incident
  assert.deepEqual(SR.familyReports(d, "fam_b"), []);
  const sits = SR.reportableSits(d, TODAY);
  assert.deepEqual(sits.map((s) => s.date), ["2026-11-03", "2026-10-30"]);
  assert.equal(sits[1].has, true);
  d.families[1].medAuths = [auth({ id: "m3", child: "Sam", expires: "" })];
  const alerts = SR.authAlerts(d, TODAY);
  assert.equal(alerts.length, 2); // Mia's expires within a week; Sam's has no end date
  assert.match(alerts[0].problems[0], /expires 2026-11-09/);
});

test("printable pages carry the clauses and escape what the sitter typed", () => {
  const d = exampleDesk(TODAY);
  const html = SR.incidentReportPage({ date: SIT.date, incident: { happened: true, what: "<script>x</script> fell", firstAid: "ice" } }, { family: d.families[0], profile: d.profile, booking: d.bookings[2] });
  const form = SR.medAuthFormPage(d.families[0], d.profile);
  for (const p of [html, form]) {
    assert.match(p, /No warranty/);
    assert.match(p, /not legal, tax, or financial advice/);
    assert.match(p, /github\.com\/sponsors\/Duncan-Haywood/);
    assert.match(p, /<meta name="robots" content="noindex">/);
    assert.doesNotMatch(p, /href="\/[^/]/);
  }
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt; fell/);
  assert.match(html, /a record, not medical or legal advice/);
  assert.match(form, /A template, not legal or medical advice/);
  assert.match(form, /healthychildren\.org/);
  assert.match(form, /Grace Example, our babysitter/);
});

test("mergeSitReports keeps server-held reports and emailed stamps", () => {
  const server = { bookings: [{ id: "bk_3", sitReports: { "2026-10-30": { meals: "server", emailedAt: "2026-10-30T22:00:00Z" }, "2026-10-23": { meals: "only on server" } } }] };
  const incoming = { bookings: [{ id: "bk_3", sitReports: { "2026-10-30": { meals: "app" } } }, { id: "bk_9" }] };
  SR.mergeSitReports(server, incoming);
  assert.deepEqual(incoming.bookings[0].sitReports, { "2026-10-30": { meals: "app", emailedAt: "2026-10-30T22:00:00Z" }, "2026-10-23": { meals: "only on server" } });
  assert.equal(incoming.bookings[1].sitReports, undefined);
});

// ---- the server route

async function call(h, method, path, { body, auth: key = "k" } = {}) {
  let status, out = "";
  const req = { method, url: path, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, socket: {}, async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(typeof body === "string" ? body : JSON.stringify(body)); } };
  const res = { writeHead: (s) => { status = s; }, end: (b) => { out = String(b ?? ""); } };
  await h(req, res);
  return { status, json: (() => { try { return JSON.parse(out); } catch { return out; } })() };
}

test("POST /api/sitreport/email sends only to the family's own email, and only when email is set up", async () => {
  const desk = exampleDesk(TODAY);
  desk.families[0].contact = "ana@example.com, 555-0111";
  const state = { desk };
  let saved = 0;
  const sent = [];
  const fetchImpl = async (u, init) => { sent.push({ u, body: JSON.parse(init.body) }); return { ok: true }; };
  const now = () => Date.parse("2026-10-30T22:00:00Z");
  const off = handler(state, () => saved++, { ADMIN_KEY: "k" }, now, fetchImpl);
  assert.equal((await call(off, "POST", "/api/sitreport/email", { body: { bookingId: "bk_3", date: SIT.date } })).status, 503);
  const env = { ADMIN_KEY: "k", RESEND_API_KEY: "re_test", FROM_EMAIL: "sitter@example.com" };
  const h = handler(state, () => saved++, env, now, fetchImpl);
  assert.equal((await call(h, "POST", "/api/sitreport/email", { body: { bookingId: "bk_3", date: SIT.date }, auth: "wrong" })).status, 401);
  assert.equal((await call(h, "GET", "/api/sitreport/email")).status, 405);
  assert.equal((await call(h, "POST", "/api/sitreport/email", { body: { bookingId: "bk_3", date: SIT.date } })).status, 404); // no report yet
  assert.equal((await call(h, "POST", "/api/sitreport/email", { body: { bookingId: "nope", date: SIT.date, report: {} } })).status, 404);
  const ok = await call(h, "POST", "/api/sitreport/email", { body: { bookingId: "bk_3", date: SIT.date, report: { meals: "Tacos", to: "attacker@example.com" } } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.to, "a...@example.com");
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].body.to, ["ana@example.com"]);
  assert.match(sent[0].body.text, /Food: Tacos/);
  assert.equal(state.desk.bookings.find((b) => b.id === "bk_3").sitReports[SIT.date].emailedAt, "2026-10-30T22:00:00.000Z");
  assert.ok(saved >= 1);
  // a family with only a phone number cannot be emailed
  assert.equal((await call(h, "POST", "/api/sitreport/email", { body: { bookingId: "bk_2", date: "2026-09-03", report: { meals: "x" } } })).status, 422);
  // the next sync from the app keeps the emailed stamp
  const put = await call(h, "PUT", "/api/desk", { body: { ...exampleDesk(TODAY), knownLeadIds: [] } });
  assert.equal(put.status, 200);
  assert.equal(put.json.desk.bookings.find((b) => b.id === "bk_3").sitReports[SIT.date].emailedAt, "2026-10-30T22:00:00.000Z");
});

test("the app wires the box into the Families tab and the server serves both modules", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /import \{ mountSitReports \} from "\.\/sitreport-ui\.mjs"/);
  assert.match(html, /<section data-panel="families"[\s\S]*?<div id="sitReports"><\/div>[\s\S]*?<\/section>/);
  const server = readFileSync(new URL("./server.mjs", import.meta.url), "utf8");
  assert.match(server, /"\/sitreport\.mjs": "sitreport\.mjs"/);
  assert.match(server, /"\/sitreport-ui\.mjs": "sitreport-ui\.mjs"/);
});

test("a dose the parents gave before the sit spaces the next one but is not the sitter's dose", () => {
  const fam = { medAuths: [auth({ id: "med_2", drug: "Acetaminophen", dose: "5 ml", times: "", asNeeded: true, minHours: 4, maxDoses: 1 })] };
  let { report, warnings } = SR.logDose({}, { authId: "med_2", at: "17:30", beforeSit: true }, fam, TODAY, "p1");
  assert.deepEqual(warnings, []);
  assert.equal(report.doses[0].beforeSit, true);
  // 7pm is only 90 minutes after the parents' 5:30pm dose.
  assert.match(SR.checkDose({ authId: "med_2", at: "19:00" }, fam, TODAY, report.doses).warnings.join(), /Only 90 minutes since the last dose/);
  // The parents' dose does not use up the one dose allowed during the sit.
  assert.doesNotMatch(SR.checkDose({ authId: "med_2", at: "22:00" }, fam, TODAY, report.doses).warnings.join(), /at most 1/);
  // The parent's email lists only what the sitter gave.
  assert.doesNotMatch(SR.reportMessage(report, { family: fam }), /Medicine given/);
});
