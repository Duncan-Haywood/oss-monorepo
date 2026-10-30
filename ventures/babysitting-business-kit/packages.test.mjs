import { test } from "node:test";
import assert from "node:assert/strict";
import * as E from "./engine.mjs";
import * as K from "./packages.mjs";

// Deterministic "random" bytes for tests: a counter.
function counter(start = 0) { let i = start; return (n) => Uint8Array.from({ length: n }, () => (i++ * 37 + 11) & 255); }
const B = (k) => Uint8Array.from({ length: 6 }, (_, j) => (k * 7 + j) & 255);

function desk() {
  const d = E.emptyDesk();
  d.families.push({ id: "f1", name: "Rivera" }, { id: "f2", name: "Chen" });
  d.bookings.push(
    { id: "b1", familyId: "f1", date: "2026-11-06", start: "18:00", end: "22:00", kids: 2, status: "scheduled" },
    { id: "b2", familyId: "f1", date: "2026-11-13", start: "18:00", end: "23:30", kids: 2, status: "scheduled" },
    { id: "b3", familyId: "f2", date: "2026-11-07", start: "09:00", end: "17:00", kids: 1, status: "scheduled", repeatWeeks: 3 },
  );
  return d;
}

test("suggestPrice uses the rate card: 4 sits of 4 h for 2 kids at $20 + $3 is $368, 10% off $331.20", () => {
  const s = K.suggestPrice({ unit: "sits", quantity: 4, hoursPerSit: 4, kids: 2, start: "18:00" }, E.DEFAULT_PROFILE, 10);
  assert.equal(s.perSit, 92);
  assert.equal(s.list, 368);
  assert.equal(s.price, 331.2);
  const h = K.suggestPrice({ unit: "hours", quantity: 40, hoursPerSit: 8, kids: 1, start: "08:00" }, E.DEFAULT_PROFILE, 0);
  assert.equal(h.list, 800);
  assert.equal(K.planTemplates(E.DEFAULT_PROFILE).length, 3);
});

test("savePlan validates; sellPackage sets expiry from validDays", () => {
  assert.equal(K.savePlan(desk(), { name: "", quantity: 0, price: 0 }).why.length, 3);
  let r = K.savePlan(desk(), { name: "Date nights", unit: "sits", quantity: 4, price: 320, validDays: 120 }, B(1));
  assert.ok(r.ok);
  const s = K.sellPackage(r.desk, r.plan.id, { familyId: "f1", soldOn: "2026-11-01", method: "Venmo", bytes: B(2) });
  assert.equal(s.sold.expires, "2027-03-01");
  assert.deepEqual(K.packageBalance(s.sold, "2026-11-02"), { used: 0, remaining: 4, expired: false, unitValue: 80, valueLeft: 320, daysLeft: 119, usable: true });
  assert.equal(K.packageBalance(s.sold, "2027-03-02").expired, true);
});

test("a package sale is income once; redeeming it marks the sit paid without new income", () => {
  let d = desk();
  d = K.savePlan(d, { name: "Date nights", unit: "sits", quantity: 4, price: 320 }, B(1)).desk;
  const planId = d.packages.plans[0].id;
  d = K.sellPackage(d, planId, { familyId: "f1", soldOn: "2026-11-01", method: "Venmo", bytes: B(2) }).desk;
  const soldId = d.packages.sold[0].id;
  assert.equal(E.taxSummary(d, 2026).income, 320);
  assert.equal(E.taxSummary(d, 2026).byMethod.Venmo, 320);
  // the 23:30 sit quotes above $80 (late hours), but a "sits" package covers the whole sit
  const r = K.redeemPackage(d, soldId, "b2", { bytes: B(3) });
  assert.ok(r.ok, r.why.join());
  assert.equal(r.value, 80);
  assert.equal(r.stillOwed, 0);
  d = r.desk;
  assert.equal(E.taxSummary(d, 2026).income, 320, "no double counting");
  assert.equal(E.unpaid(d, "2026-11-30").filter((u) => u.booking.id === "b2").length, 0);
  assert.equal(K.packageBalance(d.packages.sold[0], "2026-11-14").remaining, 3);
  // same sit twice is refused; another family's sit is refused
  assert.equal(K.redeemPackage(d, soldId, "b2").ok, false);
  assert.match(K.redeemPackage(d, soldId, "b3", { date: "2026-11-07" }).why[0], /different family/);
  // undo returns the balance and removes the credit
  const red = d.packages.sold[0].redemptions[0];
  const u = K.undoRedemption(d, soldId, red.id);
  assert.equal(K.packageBalance(u.desk.packages.sold[0], "2026-11-14").remaining, 4);
  assert.equal(u.desk.bookings.find((b) => b.id === "b2").payments.length, 0);
});

test("an hours package draws the sit's quoted hours from a weekly series, one date at a time", () => {
  let d = desk();
  d = K.savePlan(d, { name: "Summer block", unit: "hours", quantity: 20, price: 360 }, B(1)).desk;
  d = K.sellPackage(d, d.packages.plans[0].id, { familyId: "f2", soldOn: "2026-11-01", bytes: B(2) }).desk;
  const id = d.packages.sold[0].id;
  let r = K.redeemPackage(d, id, "b3", { date: "2026-11-14", bytes: B(3) });
  assert.ok(r.ok, r.why.join());
  assert.equal(r.units, 8);
  assert.equal(r.value, 144); // 8 h × $18 package rate
  assert.equal(r.stillOwed, 16); // rate card is $160 for that day
  d = r.desk;
  d = K.redeemPackage(d, id, "b3", { date: "2026-11-21", bytes: B(4) }).desk;
  const left = K.packageBalance(d.packages.sold[0], "2026-11-22");
  assert.equal(left.remaining, 4);
  assert.match(K.redeemPackage(d, id, "b3", { date: "2026-11-07" }).why[0], /Only 4 hours left/);
});

test("expired packages cannot be used", () => {
  let d = desk();
  d = K.savePlan(d, { name: "X", unit: "sits", quantity: 2, price: 100, validDays: 3 }, B(1)).desk;
  d = K.sellPackage(d, d.packages.plans[0].id, { familyId: "f1", soldOn: "2026-11-01", bytes: B(2) }).desk;
  assert.match(K.redeemPackage(d, d.packages.sold[0].id, "b1").why[0], /expired on 2026-11-04/);
});

test("gift codes use the plain alphabet, are unbiased in form and never repeat an issued code", () => {
  const rand = counter();
  const a = K.newGiftCode([], rand);
  assert.match(a, /^GIFT-[34679A-HJKMNP-RT-Y]{4}-[34679A-HJKMNP-RT-Y]{4}$/);
  // a source that keeps giving the same bytes must be detected as a collision
  const same = () => new Uint8Array(16).fill(5);
  const first = K.newGiftCode([], same);
  assert.throws(() => K.newGiftCode([first], same), /unused code/);
  // a collision on the first draw is redrawn
  let calls = 0;
  const twice = (n) => (calls++ < 1 ? new Uint8Array(n).fill(5) : new Uint8Array(n).fill(6));
  const b = K.newGiftCode([first.toLowerCase().replace(/-/g, " ")], twice);
  assert.notEqual(K.normalizeCode(b), K.normalizeCode(first));
  // bytes at or above the rejection limit are skipped
  const hi = (n) => new Uint8Array(n).fill(255);
  let n = 0;
  const mix = (k) => (n++ === 0 ? hi(k) : new Uint8Array(k).fill(0));
  assert.equal(K.newGiftCode([], mix), "GIFT-3333-3333");
  const codes = new Set();
  for (let i = 0; i < 2000; i++) codes.add(K.newGiftCode(codes));
  assert.equal(codes.size, 2000);
});

test("gift certificates: income when sold, balance carries across sits, expiry enforced", () => {
  let d = desk();
  const r = K.issueGift(d, { kind: "amount", value: 100, soldOn: "2026-10-20", buyer: "Grandma Lee", recipient: "The Riveras", method: "cash", expires: "2027-10-20" }, counter(3));
  assert.ok(r.ok);
  d = r.desk;
  const code = r.gift.code;
  assert.equal(E.taxSummary(d, 2026).income, 100);
  assert.equal(E.taxSummary(d, 2026).byFamily["gift certificates"], 100);
  assert.ok(!E.taxSummary(d, 2026).flags.some((f) => /One family/.test(f)));
  const r1 = K.redeemGift(d, code.toLowerCase(), "b1", { bytes: B(1) }); // 4 h, 2 kids = $92
  assert.ok(r1.ok, r1.why.join());
  assert.equal(r1.value, 92);
  assert.equal(r1.left.remaining, 8);
  d = r1.desk;
  const r2 = K.redeemGift(d, code, "b2", { bytes: B(2) });
  assert.equal(r2.value, 8);
  assert.ok(r2.stillOwed > 0);
  assert.equal(K.redeemGift(r2.desk, code, "b2").why[0], "This certificate is used up.");
  assert.equal(E.taxSummary(r2.desk, 2026).income, 100, "redemptions are not income again");
  assert.equal(K.redeemGift(d, "GIFT-NOPE-NOPE", "b1").ok, false);
  const late = K.issueGift(desk(), { kind: "hours", value: 3, soldOn: "2026-01-01", expires: "2026-06-30" }, counter(9));
  assert.equal(late.gift.price, 60);
  assert.match(K.redeemGift(late.desk, late.gift.code, "b1").why[0], /expired on 2026-06-30.*check your state's rules/i);
  assert.equal(K.issueGift(desk(), { value: 50, soldOn: "2026-05-01", expires: "2026-04-01" }).ok, false);
});

test("an hours gift certificate pays the sit's hours at the price the buyer paid", () => {
  const r = K.issueGift(desk(), { kind: "hours", value: 5, price: 90, soldOn: "2026-11-01" }, counter(5));
  const x = K.redeemGift(r.desk, r.gift.code, "b1");
  assert.equal(x.units, 4);
  assert.equal(x.value, 72);
  assert.equal(x.left.remaining, 1);
});

test("the certificate page escapes text and shows the code and expiry", () => {
  const html = K.giftCertificateHTML({ code: "GIFT-ABCD-EFGH", kind: "amount", value: 50, recipient: "<b>Kim</b>", soldOn: "2026-11-01", expires: "2027-11-01" }, { ...E.DEFAULT_PROFILE, name: "Ana B" });
  assert.match(html, /GIFT-ABCD-EFGH/);
  assert.match(html, /\$50\.00 of babysitting/);
  assert.match(html, /Use by 2027-11-01/);
  assert.match(html, /&lt;b&gt;Kim/);
  assert.doesNotMatch(html, /<script/);
});

test("events: capacity from adults × ratio, family price cap, waitlist and warnings", () => {
  let d = desk();
  const s = K.saveEvent(d, { title: "Parents' night out", date: "2026-12-05", perChild: 15, familyCap: 35, ratio: 4, adults: 2, maxKids: 10, youngestMonths: 24 }, B(1));
  assert.ok(s.ok);
  d = s.desk;
  const id = s.event.id;
  assert.deepEqual(K.eventCapacity(s.event), { byRatio: 8, capacity: 8 });
  assert.equal(K.familyPrice(s.event, 3), 35);
  assert.equal(K.familyPrice(s.event, 2), 30);
  const fam = (n, at, extra = {}) => ({ parent: `P${at}`, contact: "x@example.com", at: `2026-11-0${at}`, kids: Array.from({ length: n }, (_, i) => ({ name: `K${at}${i}`, ageMonths: 60, ...extra })) });
  d = K.addSignup(d, id, fam(3, 1), B(2)).desk;
  d = K.addSignup(d, id, fam(3, 2, { allergies: "peanuts" }), B(3)).desk;
  const r = K.addSignup(d, id, fam(3, 3), B(4));
  assert.equal(r.waitlisted, true);
  d = r.desk;
  let st = K.eventStatus(d.packages.events[0]);
  assert.equal(st.kids, 6);
  assert.equal(st.placesLeft, 2);
  assert.equal(st.revenue, 70);
  assert.equal(st.waitlist.length, 1);
  assert.equal(st.allergies.length, 3);
  assert.deepEqual(st.warnings, []);
  // the sitter lets the waitlisted family in anyway: ratio warning
  d.packages.events[0].signups[2].waitlist = false;
  st = K.eventStatus(d.packages.events[0]);
  assert.equal(st.kids, 9);
  assert.match(st.warnings[0], /Ratio exceeded: 9 children for 2 adults.*Add 1 helper/);
  // a toddler under the sitter's youngest age
  d = K.addSignup(d, id, { parent: "Q", contact: "q", at: "2026-11-09", kids: [{ name: "Tot", ageMonths: 12 }], waitlist: false }, B(5)).desk;
  assert.ok(K.eventStatus(d.packages.events[0]).warnings.some((w) => /Younger than.*Tot/.test(w)));
  const bk = K.eventToBooking(d.packages.events[0], B(6));
  assert.equal(bk.kids, 10);
  assert.equal(bk.date, "2026-12-05");
  assert.match(bk.notes, /peanuts/);
});

test("the announcement uses only the sitter's own facts and says to ask the office first", () => {
  const ev = { title: "Parents' night out", date: "2026-12-05", start: "17:30", end: "21:00", place: "Grace Church hall", group: "Grace Church", perChild: 15, familyCap: 35, ratio: 4, adults: 2, youngestMonths: 36, signups: [] };
  const t = K.eventAnnouncement(ev, { ...E.DEFAULT_PROFILE, name: "Ana B", phone: "555-0100" }, { audience: "church" });
  assert.match(t, /Saturday, December 5/);
  assert.match(t, /\$15 per child, at most \$35 per family/);
  assert.match(t, /Places: 8/);
  assert.match(t, /Ages 3 and up/);
  assert.match(t, /church office/);
  const school = K.eventAnnouncement(ev, E.DEFAULT_PROFILE, { audience: "school", link: "https://x.example/event/abc" });
  assert.match(school, /Sign up here: https:\/\/x\.example\/event\/abc/);
  assert.match(school, /PTA/);
  assert.doesNotMatch(school, /church office/);
});

test("the /event/<token> form: validation, honeypot, waitlist, closed links and sync merge", () => {
  let d = desk();
  const token = K.eventToken(new Uint8Array(16).fill(171));
  d = K.saveEvent(d, { date: "2026-12-05", perChild: 10, ratio: 2, adults: 1, token }, B(1)).desk;
  const get = K.handleEventRoute(d, "GET", token, null, "2026-11-01");
  assert.equal(get.code, 200);
  assert.match(get.html, /2 places left/);
  assert.equal(K.handleEventRoute(d, "GET", "nope", null, "2026-11-01").code, 404);
  assert.equal(K.handleEventRoute(d, "GET", token, null, "2026-12-06").code, 404, "past events close");
  assert.equal(K.handleEventRoute(d, "POST", token, { parent: "A" }, "2026-11-01").code, 400);
  const hp = K.handleEventRoute(d, "POST", token, { website: "x", parent: "bot" }, "2026-11-01");
  assert.equal(hp.desk, undefined);
  const ok = K.handleEventRoute(d, "POST", token, { parent: "Mia", contact: "mia@example.com", kid1name: "Leo", kid1age: "5", kid1allergies: "eggs", kid2name: "<i>Zoe</i>", kid2age: "7" }, "2026-11-01", "2026-11-01T10:00:00Z", B(2));
  assert.equal(ok.code, 200);
  assert.equal(ok.signup.kids[0].ageMonths, 60);
  assert.equal(ok.signup.via, "link");
  const again = K.handleEventRoute(ok.desk, "POST", token, { parent: "Sam", contact: "s", kid1name: "Ty" }, "2026-11-01", "2026-11-01T11:00:00Z", B(3));
  assert.equal(again.waitlisted, true);
  assert.match(again.html, /waitlist/);
  assert.match(K.handleEventRoute(again.desk, "GET", token, null, "2026-11-01").html, /full/);
  // the app syncs an older copy: the link sign-ups are kept
  const incoming = structuredClone(d);
  const merged = K.mergeEventSignups(again.desk, incoming);
  assert.equal(merged.packages.events[0].signups.length, 2);
  // a sign-up the sitter removed in the app stays removed
  const inc2 = structuredClone(d);
  inc2.packages.events[0].removedSignups = [ok.signup.id];
  assert.equal(K.mergeEventSignups(again.desk, inc2).packages.events[0].signups.length, 1);
});

test("normalizeDesk keeps desk.packages; the overview finds expiring balances and sales", () => {
  let d = desk();
  d = K.issueGift(d, { kind: "amount", value: 40, soldOn: "2026-10-01", expires: "2026-11-20" }, counter(1)).desk;
  d = E.normalizeDesk(JSON.parse(JSON.stringify(d)));
  assert.equal(d.packages.gifts.length, 1);
  const o = K.packagesOverview(d, "2026-11-01");
  assert.equal(o.salesThisYear, 40);
  assert.equal(o.outstanding, 40);
  assert.equal(o.expiringSoon.length, 1);
  assert.equal(E.normalizeDesk({}).packages, undefined);
});

test("server: /event/<token> takes a sign-up, and PUT /api/desk keeps it when the app syncs an older copy", async () => {
  const http = await import("node:http");
  const { handler } = await import("./server.mjs");
  const token = "ab".repeat(16);
  let d = desk();
  d = K.saveEvent(d, { date: "2026-12-05", perChild: 10, ratio: 3, adults: 1, token }, B(1)).desk;
  const older = structuredClone(d);
  const state = { desk: d };
  let saves = 0;
  const srv = http.createServer(handler(state, () => saves++, { ADMIN_KEY: "k" }, () => Date.parse("2026-11-02T15:00:00Z"), async () => ({ ok: true })));
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const page = await fetch(`${base}/event/${token}`);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("cache-control"), "no-store");
    assert.match(await page.text(), /3 places left/);
    const post = await fetch(`${base}/event/${token}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "parent=Mia&contact=mia%40example.com&kid1name=Leo&kid1age=5" });
    assert.equal(post.status, 200);
    assert.equal(saves, 1);
    assert.equal(state.desk.packages.events[0].signups.length, 1);
    assert.equal((await fetch(`${base}/event/${"cd".repeat(16)}`)).status, 404);
    assert.equal((await fetch(`${base}/packages-ui.mjs`)).status, 200);
    const put = await fetch(`${base}/api/desk`, { method: "PUT", headers: { authorization: "Bearer k", "content-type": "application/json" }, body: JSON.stringify(older) });
    assert.equal(put.status, 200);
    assert.equal((await put.json()).desk.packages.events[0].signups[0].parent, "Mia");
  } finally { await new Promise((r) => srv.close(r)); }
});
