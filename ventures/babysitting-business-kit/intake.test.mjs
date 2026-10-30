import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import * as I from "./intake.mjs";
import { exampleDesk, emptyDesk, leadFromForm } from "./engine.mjs";
import { handler } from "./server.mjs";

const TODAY = "2026-11-02";
const TOKEN = "0123456789abcdef0123456789abcdef";

test("the meet-and-greet kit covers every topic the sitter needs to ask about", () => {
  const topics = I.MEET_AND_GREET.map((s) => s.topic.toLowerCase()).join(" | ");
  for (const t of ["routines", "discipline", "screens", "allergies", "medications", "emergencies", "pick-up", "pets", "house rules"]) assert.ok(topics.includes(t), t);
  const n = I.MEET_AND_GREET.reduce((a, s) => a + s.questions.length, 0);
  assert.equal(n, 31);
  assert.equal(I.meetAndGreetQuestions({ showFaith: false, faithActivities: "prayers" }).length, I.MEET_AND_GREET.length);
  assert.equal(I.meetAndGreetQuestions({ showFaith: true, faithActivities: "prayers" }).at(-1), I.FAITH_QUESTION);
  assert.match(I.FAITH_QUESTION.questions[0], /or none\?/);
});

test("red flags are about safety and payment only, never beliefs or demographics", () => {
  assert.equal(I.RED_FLAGS.length, 13);
  for (const f of I.RED_FLAGS) {
    assert.ok(["safety", "payment"].includes(f.kind), f.id);
    assert.ok(f.why.length > 20, f.id);
    assert.doesNotMatch(`${f.label} ${f.why}`, /relig|church|faith|christian|race|ethnic|income|married|single (mom|dad|parent)|immigra|nationality|gay|lesbian|politic/i, f.id);
  }
  assert.ok(I.RED_FLAGS.filter((f) => f.kind === "payment").every((f) => !/ftc/i.test(f.why) || /consumer\.ftc\.gov\/articles\//.test(f.why)));
});

test("notes hint at flags; the family record adds missing contacts and money owed", () => {
  const ids = (x) => I.leadFlags(x).map((f) => f.id);
  assert.deepEqual(ids({ notes: "We can pay you later, and no car seat needed, it's 5 minutes" }), ["car_seat", "pay_later"]);
  assert.deepEqual(ids({ notes: "No need to meet first, just come Friday" }), ["refuses_meet"]);
  assert.deepEqual(ids({ notes: "I'll send a check, please send back the difference" }), ["overpay"]);
  assert.deepEqual(ids({ notes: "Church family, would love bedtime prayers" }), []);
  const d = exampleDesk(TODAY);
  const [rivera, chen] = d.families.map((f) => I.leadFlags(f, d, TODAY, true).map((x) => x.id));
  assert.deepEqual(rivera, ["unpaid_history"]); // bk_3 is done and unpaid
  assert.deepEqual(chen, ["no_emergency"]);
  assert.match(I.leadFlags(d.families[0], d, TODAY, true)[0].label, /\$92\.00/);
});

test("tokens are 128-bit hex and need real random bytes", () => {
  const t = I.intakeToken(new Uint8Array(16).map((_, i) => i * 17));
  assert.equal(t.length, 32);
  assert.ok(I.isIntakeToken(t));
  assert.throws(() => I.intakeToken([1, 2, 3]));
  for (const bad of ["", "abc", "../../etc/passwd", "Z".repeat(32), TOKEN + "<"]) assert.equal(I.isIntakeToken(bad), false, bad);
});

test("an info sheet parses, caps lengths and merges into the family once", () => {
  const fam = { id: "fam_x", name: "Brooks family", contactName: "Hannah Brooks", contact: "555-0133", kids: [{ name: "", allergies: "age 3" }, { name: "", allergies: "age 6" }], notes: "met at church", intakeToken: TOKEN };
  const intake = I.parseIntake({
    parent: "Hannah Brooks", contact: "should not overwrite", address: "9 Pine Rd",
    kid1_name: "Ella", kid1_birth: "2023-05-01", kid1_allergies: "tree nuts: hives, EpiPen in the kitchen drawer", kid1_bedtime: "19:30, two books",
    kid2_name: "Ben", kid2_birth: "not a date", kid2_meds: "x".repeat(5000),
    kid3_allergies: "no name, dropped",
    ec1_name: "Ruth Brooks", ec1_relation: "grandma", ec1_phone: "555-0144",
    pickup: "Grandma Ruth only", doctor: "Dr. Example 555-0155", pets: "a cat", screens: "30 minutes, none after dinner",
    consentName: "Hannah Brooks", consentDate: "2026-11-02", evil: "<script>",
  });
  assert.equal(intake.kids.length, 2);
  assert.equal(intake.kids[1].birth, undefined);
  assert.equal(intake.kids[1].meds.length, 500);
  assert.equal(intake.evil, undefined);
  const out = I.mergeIntake(fam, intake, TODAY);
  assert.deepEqual(out.kids.map((k) => k.name), ["Ella", "Ben"]); // placeholders replaced
  assert.equal(out.contact, "555-0133");
  assert.equal(out.address, "9 Pine Rd");
  assert.equal(out.emergency, "Ruth Brooks (grandma) 555-0144");
  assert.equal(out.care.pickup, "Grandma Ruth only");
  assert.match(out.notes, /^met at church\nFrom the family's info sheet \(2026-11-02\):\nWho else may pick up/);
  assert.equal(out.medicalConsent.name, "Hannah Brooks");
  assert.equal(out.intakeReceived, TODAY);
  assert.equal(out.intakeToken, undefined);
  assert.equal(fam.intakeToken, TOKEN, "the input is not mutated");
  // a second sheet updates a named child rather than duplicating it
  const again = I.mergeIntake(out, I.parseIntake({ kid1_name: "ella", kid1_bedtime: "20:00" }), TODAY);
  assert.equal(again.kids.length, 2);
  assert.equal(again.kids[0].bedtime, "20:00");
  assert.match(again.kids[0].allergies, /tree nuts/);
});

test("the form page escapes everything, prefills and carries the template and clause", () => {
  const d = exampleDesk(TODAY);
  const fam = { ...d.families[0], name: `<img src=x onerror=alert(1)>`, care: { pets: `"><script>alert(1)</script>` } };
  const html = I.intakeFormPage(d, fam, { action: `/intake/${TOKEN}` });
  assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.match(html, /&lt;img src=x/);
  assert.match(html, /action="\/intake\/0123456789abcdef/);
  assert.match(html, /value="Leo"/);
  assert.match(html, /A TEMPLATE, NOT LEGAL ADVICE/);
  assert.match(html, /No warranty/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /name="kid3_name"/); // two kids known, one spare slot
  const paper = I.intakeFormPage(d, {});
  assert.doesNotMatch(paper, /method="post"/);
  assert.match(I.medicalConsentTemplate({ kids: [{ name: "Leo" }] }, d.profile), /parent\(s\) or legal guardian\(s\) of Leo,\nauthorize Grace Example/);
});

test("pipeline stats: leads by channel and stage, conversion and median days to book", () => {
  const d = emptyDesk();
  const lead = (id, source, created, status, bookedOn) => ({ ...leadFromForm({ name: id, contact: `${id}@example.com`, source }, created, id), source, status, ...(bookedOn ? { bookedOn } : {}) });
  d.leads = [
    lead("a", "church friend", "2026-09-01", "booked", "2026-09-04"),
    lead("b", "Grace Church bulletin", "2026-09-10", "booked", "2026-09-20"),
    lead("c", "church", "2026-09-12", "lost"),
    lead("d", "Nextdoor", "2026-09-01", "contacted"),
    lead("e", "Nextdoor neighbor", "2026-09-02", "declined"),
    lead("f", "website", "2026-09-03", "booked", "2026-09-05"),
    lead("g", "my friend Ana (client)", "2026-09-05", "booked"),
    lead("h", "", "2026-09-06", "meet-and-greet"),
    lead("i", "PTO newsletter", "2026-09-07", "new"),
  ];
  // "g" has no bookedOn; its first sit (via the family with the same contact) is used.
  d.families = [{ id: "fam_g", name: "G family", contact: "g@example.com", kids: [] }];
  d.bookings = [{ id: "b1", familyId: "fam_g", date: "2026-09-12", start: "18:00", end: "21:00" }, { id: "b0", familyId: "fam_g", date: "2026-08-01", start: "18:00", end: "21:00" }];
  const { channels, all } = I.pipelineStats(d);
  const by = Object.fromEntries(channels.map((r) => [r.channel, r]));
  assert.equal(I.channelOf("church friend"), "church");
  assert.equal(I.channelOf("Sittercity"), "marketplace");
  assert.equal(I.channelOf("flyer at the library"), "other");
  assert.deepEqual(Object.keys(by).sort(), ["church", "nextdoor", "referral", "school", "unknown", "website"]);
  assert.equal(by.church.leads, 3);
  assert.equal(by.church.booked, 2);
  assert.equal(by.church.conversion, 66.7);
  assert.equal(by.church.medianDaysToBook, 6.5); // 3 and 10
  assert.equal(by.nextdoor.conversion, 0);
  assert.equal(by.nextdoor.open, 1);
  assert.equal(by.referral.medianDaysToBook, 7); // 2026-09-05 -> first sit 2026-09-12
  assert.equal(by.unknown.stages["meet-and-greet"], 1);
  assert.equal(channels[0].channel, "church");
  assert.equal(all.leads, 9);
  assert.equal(all.booked, 4);
  assert.equal(all.conversion, 44.4);
  assert.equal(all.medianDaysToBook, 5); // 2, 3, 7, 10
  assert.equal(all.smallSample, false);
  const html = I.pipelineHTML(d);
  assert.match(html, /Where booked families come from/);
  assert.match(html, /66\.7%/);
  assert.match(I.pipelineHTML(emptyDesk()), /appear once you have leads/);
});

test("the Families-tab panel shows link state, flags, and only a real server address", () => {
  const d = exampleDesk(TODAY);
  d.families[1].intakeToken = TOKEN;
  d.families[1].intakeIssued = TODAY;
  const html = I.intakeHTML(d, TODAY, "https://desk.example");
  assert.match(html, new RegExp(`data-copy="https://desk.example/intake/${TOKEN}"`));
  assert.match(html, /link sent 2026-11-02/);
  assert.match(html, /No emergency contact on file yet/);
  assert.doesNotMatch(I.intakeHTML(d, TODAY, `javascript:alert(1)`), /data-copy/);
  assert.equal(I.intakeHTML(emptyDesk(), TODAY), "");
});

test("keepIntakes keeps a family's sheet when the app syncs an older copy", () => {
  const server = { families: [{ id: "f1", name: "A", kids: [{ name: "Leo" }], emergency: "Gran 555", intakeReceived: TODAY }, { id: "f2", name: "B" }] };
  const incoming = { families: [{ id: "f1", name: "A renamed", kids: [], intakeToken: TOKEN }, { id: "f2", name: "B2" }, { id: "f3", name: "C" }] };
  I.keepIntakes(server, incoming);
  assert.deepEqual(incoming.families[0], { id: "f1", name: "A renamed", kids: [{ name: "Leo" }], emergency: "Gran 555", intakeReceived: TODAY });
  assert.equal(incoming.families[1].name, "B2");
  assert.equal(I.keepIntakes(server, null), null);
});

test("meet-and-greet.html is the generated page (run node intake.mjs --write)", () => {
  const file = readFileSync(new URL("./meet-and-greet.html", import.meta.url), "utf8");
  assert.equal(file, I.meetAndGreetPage());
  assert.match(file, /No warranty/);
  assert.match(file, /not legal, tax, or financial advice/i);
  assert.match(file, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(file, /<link rel="canonical" href="\.\/meet-and-greet\.html">/);
  assert.match(file, /<meta name="description" content="[^"]{80,}/);
  for (const s of I.MEET_AND_GREET) assert.ok(file.includes(s.topic));
  const kit = I.meetAndGreetPage({ ...exampleDesk().profile }, { name: "Rivera family" });
  assert.match(kit, /with the Rivera family/);
  assert.match(kit, /Faith-based activities \(optional\)/); // the example sitter offers them
  assert.match(kit, /noindex/);
});

async function serve(state, fetchImpl = async () => ({ ok: true })) {
  let saves = 0;
  const srv = http.createServer(handler(state, () => saves++, { ADMIN_KEY: "admin-key", NOTIFY_WEBHOOK_URL: "https://ntfy.example/x" }, () => Date.parse("2026-11-02T15:00:00Z"), fetchImpl));
  await new Promise((r) => srv.listen(0, r));
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)), saves: () => saves };
}

test("server: /intake/<token> serves the sheet, merges it once, and sync keeps it", async () => {
  const state = { desk: exampleDesk(TODAY) };
  state.desk.families[1].intakeToken = TOKEN;
  const pings = [];
  const s = await serve(state, async (url, init) => { pings.push(init.body); return { ok: true }; });
  try {
    for (const p of ["/intake/", "/intake/nope", `/intake/${"f".repeat(32)}`, `/intake/${TOKEN}/x`]) assert.equal((await fetch(s.base + p)).status, 404, p);
    const get = await fetch(`${s.base}/intake/${TOKEN}`);
    assert.equal(get.status, 200);
    assert.equal(get.headers.get("cache-control"), "no-store");
    assert.match(await get.text(), /Family info sheet: Chen family/);
    const big = await fetch(`${s.base}/intake/${TOKEN}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "notes=" + "x".repeat(40 * 1024) });
    assert.equal(big.status, 413);
    const post = await fetch(`${s.base}/intake/${TOKEN}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ kid1_name: "Sam", kid1_allergies: "penicillin", ec1_name: "Lee Chen", ec1_phone: "555-0123", doctor: "<b>Dr. X</b>" }) });
    assert.equal(post.status, 200);
    const fam = state.desk.families[1];
    assert.equal(fam.kids[0].allergies, "penicillin");
    assert.equal(fam.emergency, "Lee Chen 555-0123");
    assert.equal(fam.intakeToken, undefined);
    assert.equal(s.saves(), 1);
    assert.match(pings[0], /Family info sheet received: Chen family/);
    assert.equal((await fetch(`${s.base}/intake/${TOKEN}`)).status, 404, "a link works once");
    // the app syncs a copy from before the family filled the sheet in
    const stale = exampleDesk(TODAY);
    stale.families[1].intakeToken = TOKEN;
    const put = await fetch(`${s.base}/api/desk`, { method: "PUT", headers: { authorization: "Bearer admin-key", "content-type": "application/json" }, body: JSON.stringify(stale) });
    assert.equal(put.status, 200);
    assert.equal(state.desk.families[1].emergency, "Lee Chen 555-0123");
    assert.equal(state.desk.families[1].intakeToken, undefined);
    assert.equal((await fetch(`${s.base}/intake.mjs`)).headers.get("content-type"), "text/javascript; charset=utf-8");
    assert.equal((await fetch(`${s.base}/meet-and-greet.html`)).status, 200);
  } finally { await s.close(); }
});
