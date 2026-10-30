import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { newCheckin, checkinAction, checkinDue, alertMessage, mergeSafety, sharedPlace, townOf, streetOf, normalizeCheckin, safetyToken, emergencyCard, emergencyCardData, checklistState, setChecklistItem, HOUSE_CHECKLIST, POISON_HELP, deadline, MAX_ALERT_TRIES } from "./safety.mjs";
import { runSafety, safetyRoutes, canAlert } from "./safety-server.mjs";
import { handler } from "./server.mjs";
import { exampleDesk, normalizeDesk } from "./engine.mjs";
import { mergeIntake, parseIntake } from "./intake.mjs";

const T0 = Date.parse("2026-11-07T03:00:00Z"); // 10pm in Chicago, inside default quiet hours
const TOKEN = safetyToken(Array.from({ length: 16 }, (_, i) => i * 7));
const SMS_ENV = { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM: "+15550100", TZ: "America/Chicago", ADMIN_KEY: "admin", PUBLIC_URL: "https://grace.example" };

function fakeFetch(ok = true) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, body: String(init.body || "") }); return { ok, status: ok ? 200 : 500, text: async () => "nope" }; };
  f.calls = calls;
  return f;
}
const start = (over = {}) => newCheckin({ contactName: "Mom", contactPhone: "555-555-0199", place: "Springfield", homeBy: new Date(T0).toISOString(), graceMin: 30, ...over }, { id: "chk_1", token: TOKEN, nowMs: T0 - 4 * 36e5 });

test("the place a contact sees is the town, the street without a number, or nothing", () => {
  const fam = { address: "12 Oak St, Springfield, IL 62704" };
  assert.equal(townOf(fam), "Springfield, IL");
  assert.equal(streetOf(fam), "Oak St");
  assert.equal(sharedPlace(fam, {}, "street"), "Oak St, Springfield, IL");
  assert.equal(sharedPlace(fam, {}, "none"), "");
  assert.equal(sharedPlace({ address: "48 Elm Ave" }, { city: "Riverside" }, "town"), "Riverside");
  assert.equal(sharedPlace(null, { city: "Riverside" }, "town"), "");
});

test("a check-in needs a contact who can be reached, a time and a random token", () => {
  assert.equal(start().ok, true);
  assert.match(start({ contactPhone: "", contactEmail: "" }).why, /mobile number or email/);
  assert.match(start({ homeBy: "soon" }).why, /time/);
  assert.equal(normalizeCheckin({ ...start().checkin, token: "short" }).ok, false);
  assert.equal(start({ graceMin: 1 }).checkin.graceMin, 10);
  assert.equal(start({ graceMin: 9999 }).checkin.graceMin, 240);
  assert.throws(() => safetyToken([1, 2, 3]));
});

test("on a fake clock: nothing before home-by, a reminder at home-by, an alert after the grace period", () => {
  const c = start().checkin;
  assert.equal(checkinDue(c, T0 - 60000), null);
  assert.equal(checkinDue(c, T0), "remind");
  assert.equal(checkinDue({ ...c, reminded: true }, T0 + 29 * 60000), null);
  assert.equal(checkinDue({ ...c, reminded: true }, T0 + 30 * 60000), "alert");
  assert.equal(checkinDue({ ...c, alertTries: MAX_ALERT_TRIES }, T0 + 31 * 60000), null);
  for (const s of ["home", "cancelled", "alerted"]) assert.equal(checkinDue({ ...c, status: s }, T0 + 99 * 60000), null, s);
});

test("extend, cancel and home change the timer and keep a log", () => {
  const c = start().checkin;
  const ext = checkinAction(c, "extend", T0 - 36e5, 45).checkin;
  assert.equal(Date.parse(ext.homeBy), T0 + 45 * 60000);
  assert.equal(deadline(ext), T0 + 75 * 60000);
  const late = checkinAction(c, "extend", T0 + 20 * 60000, 30).checkin; // from now when already past home-by
  assert.equal(Date.parse(late.homeBy), T0 + 50 * 60000);
  assert.equal(late.reminded, false);
  assert.equal(checkinAction(c, "cancel", T0).checkin.status, "cancelled");
  assert.equal(checkinAction({ ...c, status: "cancelled" }, "extend", T0).ok, false);
  const home = checkinAction({ ...c, status: "alerted" }, "home", T0).checkin;
  assert.equal(home.status, "home");
  assert.match(home.log.at(-1).what, /after the alert/);
  assert.equal(checkinAction(c, "explode", T0).ok, false);
});

test("the alert names the sitter, her phone, the time and the chosen place, never the children", () => {
  const desk = exampleDesk("2026-11-06");
  const c = start().checkin;
  const m = alertMessage(c, desk.profile, "America/Chicago");
  assert.match(m, /Grace Example/);
  assert.match(m, /555-0100/);
  assert.match(m, /9:00\s?PM/);
  assert.match(m, /Springfield/);
  assert.match(m, /911/);
  for (const kid of ["Leo", "Mia", "Sam", "peanut", "Rivera", "Oak"]) assert.doesNotMatch(m, new RegExp(kid, "i"), kid);
  assert.doesNotMatch(alertMessage({ ...c, place: "" }, desk.profile), /sitting in/);
});

test("the server reminds the sitter, then texts the contact during quiet hours, once", async () => {
  const state = { desk: exampleDesk("2026-11-06") };
  state.desk.profile.automations = { quietStart: "20:00", quietEnd: "08:00" };
  state.desk.safety = { checkins: [start().checkin] };
  const f = fakeFetch();
  const told = [];
  const notify = async (s, t) => { told.push(`${s}\n${t}`); return true; };
  let saves = 0;
  const save = () => saves++;
  assert.deepEqual(await runSafety(state, save, SMS_ENV, T0 - 60000, f, notify), { reminded: 0, alerted: 0, failed: 0 });
  assert.equal((await runSafety(state, save, SMS_ENV, T0, f, notify)).reminded, 1);
  assert.match(told[0], /https:\/\/grace\.example\/safe\/[a-f0-9]{32}/);
  assert.equal(f.calls.length, 0, "the contact hears nothing at home-by");
  assert.equal((await runSafety(state, save, SMS_ENV, T0 + 10 * 60000, f, notify)).reminded, 0, "one reminder");
  const r = await runSafety(state, save, SMS_ENV, T0 + 30 * 60000, f, notify);
  assert.equal(r.alerted, 1, "quiet hours do not hold a safety alert");
  assert.equal(f.calls.length, 1);
  assert.match(f.calls[0].url, /api\.twilio\.com/);
  const body = new URLSearchParams(f.calls[0].body);
  assert.equal(body.get("To"), "+15555550199");
  assert.match(body.get("Body"), /has not checked in/);
  assert.doesNotMatch(body.get("Body"), /Leo|Mia|peanut/);
  assert.equal(state.desk.safety.checkins[0].status, "alerted");
  await runSafety(state, save, SMS_ENV, T0 + 60 * 60000, f, notify);
  assert.equal(f.calls.length, 1, "alerted once");
  assert.equal(saves, 2);
});

test("a failed alert is retried each tick, up to five tries, and email works too", async () => {
  const state = { desk: exampleDesk("2026-11-06") };
  state.desk.safety = { checkins: [start({ contactPhone: "", contactEmail: "mom@example.com" }).checkin] };
  const env = { RESEND_API_KEY: "re", FROM_EMAIL: "grace@example.com" };
  const bad = fakeFetch(false);
  for (let i = 0; i < 7; i++) await runSafety(state, () => {}, env, T0 + (31 + i) * 60000, bad);
  assert.equal(bad.calls.length, 5);
  assert.match(bad.calls[0].url, /api\.resend\.com/);
  assert.equal(state.desk.safety.checkins[0].status, "active");
  assert.match(state.desk.safety.checkins[0].log.at(-1).what, /alert failed \(try 5\)/);
  assert.equal(canAlert({}, state.desk.safety.checkins[0]), false);
  assert.equal(canAlert(env, state.desk.safety.checkins[0]), true);
});

async function serve(state, env, f, now) {
  const srv = http.createServer(handler(state, () => {}, env, now, f));
  await new Promise((r) => srv.listen(0, r));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) };
}

test("through server.mjs: the app starts a check-in, the private link extends it and sends the all-clear", async () => {
  const state = { desk: exampleDesk("2026-11-06") };
  let clock = T0 - 36e5;
  const f = fakeFetch();
  const s = await serve(state, SMS_ENV, f, () => clock);
  const put = (body, key = "admin") => fetch(`${s.base}/api/safety/checkin`, { method: "PUT", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    assert.equal((await put(start().checkin, "wrong")).status, 401);
    assert.equal((await put({ id: "x" })).status, 400);
    const r = await put(start().checkin);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).link, `https://grace.example/safe/${TOKEN}`);
    assert.equal((await put({ ...start().checkin, token: "f".repeat(32) })).status, 409, "an id cannot be taken over with another token");

    const g = await fetch(`${s.base}/safe/${TOKEN}`);
    assert.equal(g.headers.get("cache-control"), "no-store");
    const html = await g.text();
    assert.match(html, /I&#39;m home safe/);
    assert.equal(state.desk.safety.checkins[0].status, "active", "a GET changes nothing");
    assert.equal((await fetch(`${s.base}/safe/${"0".repeat(32)}`)).status, 404);

    await fetch(`${s.base}/safe/${TOKEN}`, { method: "POST", body: new URLSearchParams({ action: "extend", minutes: "60" }) });
    assert.equal(Date.parse(state.desk.safety.checkins[0].homeBy), T0 + 60 * 60000);

    clock = T0 + 91 * 60000;
    await runSafety(state, () => {}, SMS_ENV, clock, f);
    assert.equal(state.desk.safety.checkins[0].status, "alerted");
    const home = await (await fetch(`${s.base}/safe/${TOKEN}`, { method: "POST", body: new URLSearchParams({ action: "home" }) })).text();
    assert.match(home, /home safe/);
    assert.equal(f.calls.length, 2);
    assert.match(new URLSearchParams(f.calls[1].body).get("Body"), /All clear/);

    // A sync from an app that has not seen the alert or the tap keeps the server's newer copy.
    const stale = { ...JSON.parse(JSON.stringify(state.desk)), safety: { checkins: [start().checkin] } };
    const sync = await fetch(`${s.base}/api/desk`, { method: "PUT", headers: { authorization: "Bearer admin", "content-type": "application/json" }, body: JSON.stringify(stale) });
    assert.equal(sync.status, 200);
    assert.equal(state.desk.safety.checkins[0].status, "home");
  } finally { await s.close(); }
});

test("a check-in is refused when the server cannot reach the contact (off until configured)", async () => {
  const state = { desk: exampleDesk("2026-11-06") };
  const s = await serve(state, { ADMIN_KEY: "admin" }, fakeFetch(), () => T0 - 36e5);
  try {
    const r = await fetch(`${s.base}/api/safety/checkin`, { method: "PUT", headers: { authorization: "Bearer admin" }, body: JSON.stringify(start().checkin) });
    assert.equal(r.status, 409);
    assert.match((await r.json()).why, /Twilio/);
    assert.equal(state.desk.safety, undefined);
  } finally { await s.close(); }
});

test("mergeSafety keeps the newer copy of each check-in and both sides' new ones", () => {
  const a = start().checkin;
  const newer = { ...a, status: "home", updatedAt: new Date(T0 + 1000).toISOString() };
  const other = { ...a, id: "chk_2", createdAt: new Date(T0).toISOString() };
  const m = mergeSafety({ checkins: [newer] }, { checkins: [a, other] }, T0);
  assert.deepEqual(m.checkins.map((c) => [c.id, c.status]), [["chk_1", "home"], ["chk_2", "active"]]);
  assert.equal(mergeSafety({ checkins: [{ ...newer, updatedAt: "2026-01-01T00:00:00Z" }] }, undefined, T0).checkins.length, 0, "old closed ones drop off");
  assert.ok(normalizeDesk({ safety: m }).safety.checkins.length === 2, "normalizeDesk keeps the safety key");
});

test("the house checklist is stored per family and its notes print on the card", () => {
  let fam = { id: "f1", name: "Rivera family" };
  assert.equal(checklistState(fam).total, HOUSE_CHECKLIST.length);
  fam = setChecklistItem(fam, "firstaid", { done: true, note: "hall closet, top shelf" }, "2026-10-30");
  fam = setChecklistItem(fam, "crossStreets", { note: "Oak St and 5th Ave" });
  fam = setChecklistItem(fam, "nonsense", { done: true });
  const cl = checklistState(fam);
  assert.equal(cl.done, 1);
  assert.equal(cl.crossStreets, "Oak St and 5th Ave");
  assert.equal(cl.checkedOn, "2026-10-30");
  assert.equal(emergencyCardData({ families: [fam] }, "f1").where.firstaid, "hall closet, top shelf");
});

test("the emergency card is built from the family and its info sheet, with 911 first and Poison Help", () => {
  const desk = exampleDesk("2026-10-30");
  const intake = parseIntake({ parent: "Ana Rivera", kid1_name: "Mia", kid1_allergies: "peanuts: EpiPen in the kitchen drawer", kid1_meds: "none", ec1_name: "Rosa", ec1_relation: "grandma", ec1_phone: "555-0112", doctor: "Dr. Patel 555-0190", hospital: "Springfield General" });
  desk.families[0] = setChecklistItem(mergeIntake(desk.families[0], intake, "2026-10-30"), "crossStreets", { note: "Oak St and 5th Ave" });
  const html = emergencyCard(desk, "fam_a", "2026-10-30");
  for (const want of ["12 Oak St", "Oak St and 5th Ave", "555-0111", "Rosa (grandma)", "Dr. Patel", "Springfield General", "EpiPen in the kitchen drawer", "Leo", POISON_HELP, "Call 911 first", "No warranty", "github.com/sponsors/Duncan-Haywood", "poison.org"]) assert.ok(html.includes(want), want);
  assert.match(html, /Leo<\/strong> \(5 yr\)/);
  assert.doesNotMatch(html, /href="\/"/);
  assert.deepEqual(emergencyCardData(desk, "fam_a").missing, []);
  assert.deepEqual(emergencyCardData(desk, "fam_b").missing, ["cross streets", "an emergency contact", "the doctor"]);
  assert.equal(emergencyCard(desk, "nope"), "");
  const evil = { families: [{ id: "x", name: "<script>alert(1)</script>", kids: [{ name: "<img src=x>" }] }] };
  assert.doesNotMatch(emergencyCard(evil, "x"), /<script>alert|<img src=x>/);
});

test("the app wires the Safety tab, and the server serves and ships the modules", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /data-tab="safety"/);
  assert.match(html, /data-panel="safety"/);
  assert.match(html, /import \{ mountSafety \} from "\.\/safety-ui\.mjs"/);
  const docker = readFileSync(new URL("./Dockerfile", import.meta.url), "utf8");
  for (const f of ["safety.mjs", "safety-server.mjs", "safety-ui.mjs"]) assert.match(docker, new RegExp(` ${f.replace(".", "\\.")} `));
  const guide = readFileSync(new URL("./self-host.html", import.meta.url), "utf8");
  const code = readFileSync(new URL("./safety-server.mjs", import.meta.url), "utf8");
  for (const m of code.matchAll(/env\.([A-Z][A-Z0-9_]+)/g)) assert.ok(guide.includes(`<code>${m[1]}</code>`), m[1]);
  assert.match(guide, /safe\//, "the guide explains the check-in link");
});

test("the door and alarm note never prints on the emergency card the sitter carries", () => {
  const desk = exampleDesk("2026-10-30");
  desk.families[0] = setChecklistItem(desk.families[0], "doors", { note: "alarm 4321" });
  assert.doesNotMatch(emergencyCard(desk, "fam_a", "2026-10-30"), /4321/);
});
