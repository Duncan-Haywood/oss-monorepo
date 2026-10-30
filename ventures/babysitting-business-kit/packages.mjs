// Babysitting Business Kit: more ways to sell. Prepaid packages the sitter defines
// (a date-night bundle of sits, a summer block of hours, school-holiday days), gift
// certificates with a unique code, and a "parents' night out" event planner for a
// church or school group: ratio check, sign-up list, announcement draft.
//
// Everything lives under desk.packages = { plans, sold, gifts, events }. Functions take
// the desk and return a new one (or plain values); nothing here touches the network,
// storage or the clock (callers pass `today`), and randomness comes in as bytes.
//
// Money, as this kit counts it (cash method: money counts when you receive it):
//   - selling a package or a gift certificate is income on the day it is sold;
//     taxSummary() in engine.mjs reads desk.packages.sold and desk.packages.gifts for that.
//   - using one later is not income again. A redemption adds a payment to the sit marked
//     `credit: true`, so the sit shows as paid, and taxSummary() leaves credits out.
//   - a balance that expires unused was already counted when it was sold.
// If you keep accrual books, advance payments have their own rules: ask a tax preparer.

import { quote, expandBookings, payments, addDays, daysBetween, DEFAULT_PROFILE } from "./engine.mjs";

const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const num = (x, d = 0) => (Number.isFinite(Number(x)) && x !== "" && x !== null ? Number(x) : d);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

export const UNITS = { sits: "sits", hours: "hours" };

// Plain-words note shown wherever an expiry date is set. No law is cited on purpose:
// the rules differ by state and this kit does not track them.
export const EXPIRY_NOTE = "Some states limit or forbid expiry dates and fees on gift certificates and prepaid services, and some require cash back for a small leftover balance. Check your state's rules before you print an expiry date.";
export const GROUP_NOTE = "Watching a group of children from several families can fall under your state's child-care licensing rules, depending on how often, how many children and where. Check your state's rules, and the host's insurance, before you advertise.";

const uid = (prefix, bytes) => `${prefix}_${Array.from(bytes || randomBytes(6)).map((b) => (b & 255).toString(16).padStart(2, "0")).join("")}`;

export function randomBytes(n) {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

/** Make sure desk.packages has all four lists. Returns the same desk. */
export function ensure(desk) {
  const p = desk.packages && typeof desk.packages === "object" && !Array.isArray(desk.packages) ? desk.packages : {};
  desk.packages = p;
  for (const k of ["plans", "sold", "gifts", "events"]) p[k] = Array.isArray(p[k]) ? p[k].filter((x) => x && typeof x === "object") : [];
  return desk;
}
const clone = (desk) => ensure(structuredClone(desk));

// ---------- packages ----------

/**
 * Starting points the sitter edits. Prices are their list price for the same work, less
 * the discount they choose (default 10%); they can type any price instead.
 */
export function planTemplates(profile = DEFAULT_PROFILE, discountPct = 10) {
  const base = [
    { name: "Date-night bundle", unit: "sits", quantity: 4, hoursPerSit: 4, kids: 2, start: "18:00", validDays: 120, note: "Four evening sits, booked whenever you like." },
    { name: "Summer weekday block", unit: "hours", quantity: 40, hoursPerSit: 8, kids: 2, start: "08:00", validDays: 90, note: "Forty daytime hours to use over the summer." },
    { name: "School-holiday days", unit: "sits", quantity: 3, hoursPerSit: 8, kids: 2, start: "08:00", validDays: 60, note: "Three full days for teacher work days and school breaks." },
  ];
  return base.map((t) => ({ ...t, price: suggestPrice(t, profile, discountPct).price, discountPct }));
}

/** List price for the plan's work from the rate card, and the price after a discount. */
export function suggestPrice(plan, profile = DEFAULT_PROFILE, discountPct = 10) {
  const hrs = Math.max(0.5, num(plan.hoursPerSit, 4));
  const startMin = /^\d{1,2}:\d{2}$/.test(plan.start || "") ? plan.start : "18:00";
  const [h, m] = startMin.split(":").map(Number);
  const endMin = (h * 60 + m + Math.round(hrs * 60)) % 1440;
  const end = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
  const one = quote({ start: startMin, end, kids: num(plan.kids, 1) }, profile.rates, []);
  const perHour = one.hours > 0 ? one.total / one.hours : num(profile.rates.hourly);
  const list = plan.unit === "hours" ? perHour * num(plan.quantity) : one.total * num(plan.quantity);
  return { list: r2(list), price: r2(list * (1 - num(discountPct) / 100)), perSit: r2(one.total), perHour: r2(perHour) };
}

/** Add or replace a plan (the sitter's own definition). Returns { ok, why, desk, plan }. */
export function savePlan(desk, input, bytes) {
  const why = [];
  const plan = {
    id: input.id || uid("plan", bytes),
    name: String(input.name || "").trim().slice(0, 80),
    unit: input.unit === "hours" ? "hours" : "sits",
    quantity: num(input.quantity),
    hoursPerSit: num(input.hoursPerSit, 4),
    kids: Math.max(1, Math.round(num(input.kids, 1))),
    price: r2(input.price),
    validDays: input.validDays === "" || input.validDays == null ? null : Math.max(1, Math.round(num(input.validDays))),
    note: String(input.note || "").trim().slice(0, 300),
  };
  if (!plan.name) why.push("Give the package a name.");
  if (!(plan.quantity > 0)) why.push("How many sits or hours does it hold?");
  if (!(plan.price > 0)) why.push("Set a price.");
  if (why.length) return { ok: false, why, desk };
  const d = clone(desk);
  const i = d.packages.plans.findIndex((p) => p.id === plan.id);
  if (i >= 0) d.packages.plans[i] = plan; else d.packages.plans.push(plan);
  return { ok: true, why, desk: d, plan };
}

/** Sell a plan to a family. The price is income on `soldOn`. Returns { ok, why, desk, sold }. */
export function sellPackage(desk, planId, { familyId = "", soldOn, method = "", expires, bytes } = {}) {
  const d = clone(desk);
  const plan = d.packages.plans.find((p) => p.id === planId);
  if (!plan) return { ok: false, why: ["That package is gone."], desk };
  if (!isDate(soldOn)) return { ok: false, why: ["Enter the date it was paid for."], desk };
  const exp = isDate(expires) ? expires : plan.validDays ? addDays(soldOn, plan.validDays) : null;
  const sold = { id: uid("pkg", bytes), planId, name: plan.name, unit: plan.unit, quantity: plan.quantity, hoursPerSit: plan.hoursPerSit, price: plan.price, familyId, soldOn, method, expires: exp, redemptions: [] };
  d.packages.sold.push(sold);
  return { ok: true, why: [], desk: d, sold };
}

/** What is left on a sold package. `unitValue` is dollars per sit or per hour. */
export function packageBalance(sold, today) {
  const used = r2((sold.redemptions || []).reduce((a, r) => a + num(r.units), 0));
  const remaining = r2(Math.max(0, num(sold.quantity) - used));
  const expired = !!(sold.expires && today && today > sold.expires);
  const unitValue = num(sold.quantity) > 0 ? num(sold.price) / num(sold.quantity) : 0;
  const daysLeft = sold.expires && today ? daysBetween(today, sold.expires) : null;
  return { used, remaining, expired, unitValue: r2(unitValue), valueLeft: r2(remaining * unitValue), daysLeft, usable: remaining > 0.0001 && !expired };
}

// ---------- shared: apply a credit to one sit ----------

function findOccurrence(d, bookingId, date) {
  const b = d.bookings.find((x) => x.id === bookingId);
  if (!b) return {};
  const occ = expandBookings([b]).find((o) => o.date === (date || b.date));
  return { b, occ };
}

/** Every credit already put on this sit, from any package or gift certificate. */
export function creditsFor(desk, bookingId, date) {
  ensure(desk);
  const out = [];
  for (const s of desk.packages.sold) for (const r of s.redemptions || []) if (r.bookingId === bookingId && r.date === date) out.push({ source: s.id, kind: "package", ...r });
  for (const g of desk.packages.gifts) for (const r of g.redemptions || []) if (r.bookingId === bookingId && r.date === date) out.push({ source: g.id, kind: "gift", ...r });
  return out;
}

function addCredit(b, { id, amount, on, label, source }) {
  b.payments = payments(b).map((p) => ({ ...p }));
  b.payments.push({ id, amount: r2(amount), date: on, method: label, credit: true, source });
  delete b.paid; // folded into payments above
}

/**
 * Use a package for one sit (one date of a weekly repeat). A "sits" package uses one
 * sit; an "hours" package uses the sit's quoted hours (or `units` if given). The sit
 * gets a credit worth units × unit value. With `coverWhole` (default for "sits") a
 * one-off sit's price is set to that value, so extras on the rate card are not owed on
 * top; otherwise any difference stays owed and is returned as `stillOwed`.
 */
export function redeemPackage(desk, soldId, bookingId, { date, on, units, coverWhole, bytes } = {}) {
  const d = clone(desk);
  const s = d.packages.sold.find((x) => x.id === soldId);
  if (!s) return { ok: false, why: ["That package is gone."], desk };
  const { b, occ } = findOccurrence(d, bookingId, date);
  if (!b || !occ) return { ok: false, why: ["Pick a sit on the schedule."], desk };
  if (occ.status === "cancelled") return { ok: false, why: ["That sit is cancelled."], desk };
  if (s.familyId && b.familyId && s.familyId !== b.familyId) return { ok: false, why: ["That sit is for a different family than the package."], desk };
  if ((s.redemptions || []).some((r) => r.bookingId === bookingId && r.date === occ.date)) return { ok: false, why: ["This package is already used for that sit."], desk };
  const when = isDate(on) ? on : occ.date;
  const bal = packageBalance(s, when);
  if (bal.expired) return { ok: false, why: [`This package expired on ${s.expires}.`], desk };
  const q = quote(occ, d.profile.rates, d.profile.holidays);
  const want = units != null && units !== "" ? num(units) : s.unit === "hours" ? q.hours : 1;
  if (!(want > 0)) return { ok: false, why: ["Nothing to use."], desk };
  if (want > bal.remaining + 0.0001) return { ok: false, why: [`Only ${bal.remaining} ${s.unit} left.`], desk };
  const value = r2(want * bal.unitValue);
  const whole = coverWhole ?? s.unit === "sits";
  const id = uid("red", bytes);
  s.redemptions = [...(s.redemptions || []), { id, bookingId, date: occ.date, on: when, units: r2(want), value }];
  addCredit(b, { id, amount: value, on: when, label: `package: ${s.name}`, source: s.id });
  const repeating = num(b.repeatWeeks, 1) > 1;
  if (whole && !repeating) b.price = r2(creditsFor(d, bookingId, occ.date).reduce((a, c) => a + num(c.value), 0));
  const price = num(b.price, q.total);
  return { ok: true, why: [], desk: d, value, units: r2(want), stillOwed: r2(Math.max(0, price - value)), note: whole && repeating ? "A weekly series keeps its rate-card price; extras beyond the package value stay owed." : "" };
}

/** Take back a redemption (wrong sit, sit cancelled): the balance returns and the credit leaves the sit. */
export function undoRedemption(desk, sourceId, redemptionId) {
  const d = clone(desk);
  const src = d.packages.sold.find((x) => x.id === sourceId) || d.packages.gifts.find((x) => x.id === sourceId);
  if (!src) return { ok: false, desk };
  const r = (src.redemptions || []).find((x) => x.id === redemptionId);
  if (!r) return { ok: false, desk };
  src.redemptions = src.redemptions.filter((x) => x.id !== redemptionId);
  const b = d.bookings.find((x) => x.id === r.bookingId);
  if (b && Array.isArray(b.payments)) b.payments = b.payments.filter((p) => p.id !== redemptionId);
  return { ok: true, desk: d };
}

// ---------- gift certificates ----------

// No 0/O, 1/I/L, 5/S, 2/Z or 8/B: easy to read aloud and type from paper. 26 symbols.
export const CODE_ALPHABET = "34679ABCDEFGHJKMNPQRTUVWXY";
const ALPHA = CODE_ALPHABET.length;

export const normalizeCode = (s) => String(s || "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/^GIFT/, "");

/**
 * A new code like GIFT-7KQ4-XM9C: 8 symbols from a 26-symbol alphabet (about 2.1e11
 * codes), drawn by rejection sampling so each symbol is equally likely, and redrawn if
 * it matches any code already issued. `rand(n)` returns n random bytes.
 */
export function newGiftCode(existing = [], rand = randomBytes) {
  const taken = new Set([...existing].map(normalizeCode));
  const limit = 256 - (256 % ALPHA);
  for (let attempt = 0; attempt < 100; attempt++) {
    let s = "";
    while (s.length < 8) for (const b of rand(16)) { if (b < limit && s.length < 8) s += CODE_ALPHABET[b % ALPHA]; }
    if (!taken.has(s)) return `GIFT-${s.slice(0, 4)}-${s.slice(4)}`;
  }
  throw new Error("could not find an unused code");
}

/**
 * Sell a gift certificate. kind "amount": worth `value` dollars; kind "hours": worth
 * `value` hours of babysitting. `price` is what the buyer paid (income on soldOn); it
 * defaults to the dollar value, or hours × the hourly rate.
 */
export function issueGift(desk, input = {}, rand = randomBytes) {
  const why = [];
  const kind = input.kind === "hours" ? "hours" : "amount";
  const value = r2(input.value);
  if (!(value > 0)) why.push(kind === "hours" ? "How many hours is it for?" : "What is it worth?");
  if (!isDate(input.soldOn)) why.push("Enter the date it was paid for.");
  const price = input.price === "" || input.price == null ? r2(kind === "hours" ? value * num(desk.profile.rates.hourly) : value) : r2(input.price);
  if (!(price >= 0)) why.push("Enter what the buyer paid.");
  if (input.expires && !isDate(input.expires)) why.push("The expiry date should look like 2027-06-30.");
  if (input.expires && isDate(input.soldOn) && input.expires < input.soldOn) why.push("The expiry date is before the sale date.");
  if (why.length) return { ok: false, why, desk };
  const d = clone(desk);
  const code = newGiftCode(d.packages.gifts.map((g) => g.code), rand);
  const gift = {
    id: uid("gift", rand(6)), code, kind, value, price,
    buyer: String(input.buyer || "").trim().slice(0, 80),
    recipient: String(input.recipient || "").trim().slice(0, 80),
    familyId: input.familyId || "",
    message: String(input.message || "").trim().slice(0, 240),
    soldOn: input.soldOn, method: String(input.method || ""), expires: input.expires || null, redemptions: [],
  };
  d.packages.gifts.push(gift);
  return { ok: true, why: [], desk: d, gift };
}

export function findGift(desk, code) {
  const c = normalizeCode(code);
  return c ? ensure(desk).packages.gifts.find((g) => normalizeCode(g.code) === c) || null : null;
}

/** Remaining value of a certificate. For an hours certificate, dollars per hour = price ÷ hours. */
export function giftBalance(gift, today) {
  const used = r2((gift.redemptions || []).reduce((a, r) => a + num(r.units), 0));
  const remaining = r2(Math.max(0, num(gift.value) - used));
  const expired = !!(gift.expires && today && today > gift.expires);
  const perUnit = gift.kind === "hours" ? (num(gift.value) > 0 ? num(gift.price) / num(gift.value) : 0) : 1;
  return { used, remaining, expired, perUnit: r2(perUnit), valueLeft: r2(remaining * perUnit), usable: remaining > 0.0001 && !expired, unit: gift.kind === "hours" ? "hours" : "dollars" };
}

/**
 * Redeem a certificate against a sit. For an amount certificate the default is the
 * smaller of the balance and what the sit still owes; for an hours certificate, the
 * sit's quoted hours (capped at the balance). The rest of the balance stays on the code.
 */
export function redeemGift(desk, code, bookingId, { date, on, units, bytes } = {}) {
  const d = clone(desk);
  const g = findGift(d, code);
  if (!g) return { ok: false, why: ["No gift certificate has that code."], desk };
  const { b, occ } = findOccurrence(d, bookingId, date);
  if (!b || !occ) return { ok: false, why: ["Pick a sit on the schedule."], desk };
  if (occ.status === "cancelled") return { ok: false, why: ["That sit is cancelled."], desk };
  const when = isDate(on) ? on : occ.date;
  const bal = giftBalance(g, when);
  if (bal.expired) return { ok: false, why: [`This certificate expired on ${g.expires}. ${EXPIRY_NOTE}`], desk };
  if (!bal.usable) return { ok: false, why: ["This certificate is used up."], desk };
  const q = quote(occ, d.profile.rates, d.profile.holidays);
  const price = num(b.price, q.total);
  const credited = creditsFor(d, bookingId, occ.date).reduce((a, c) => a + num(c.value), 0);
  const owedHere = Math.max(0, price - credited);
  let want;
  if (units != null && units !== "") want = num(units);
  else if (g.kind === "hours") want = Math.min(q.hours, bal.remaining);
  else want = Math.min(owedHere, bal.remaining);
  want = r2(want);
  if (!(want > 0)) return { ok: false, why: ["Nothing left to pay on that sit."], desk };
  if (want > bal.remaining + 0.0001) return { ok: false, why: [`Only ${bal.remaining} ${bal.unit} left on this certificate.`], desk };
  const value = r2(want * bal.perUnit);
  const id = uid("red", bytes);
  g.redemptions = [...(g.redemptions || []), { id, bookingId, date: occ.date, on: when, units: want, value }];
  addCredit(b, { id, amount: value, on: when, label: `gift certificate ${g.code}`, source: g.id });
  const left = giftBalance(g, when);
  return { ok: true, why: [], desk: d, value, units: want, stillOwed: r2(Math.max(0, owedHere - value)), left };
}

/** A printable, self-contained certificate page (one per sheet). */
export function giftCertificateHTML(gift, profile = DEFAULT_PROFILE, { terms } = {}) {
  const who = profile.businessName || profile.name;
  const worth = gift.kind === "hours" ? `${gift.value} hour${gift.value === 1 ? "" : "s"} of babysitting` : `$${num(gift.value).toFixed(2)} of babysitting`;
  const contact = [profile.phone, profile.email].filter(Boolean).join(" · ");
  const t = terms || `Redeem by giving this code when you book a sit with ${who}. Any balance left stays on the code.${gift.expires ? ` Use by ${gift.expires}.` : ""}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gift certificate ${esc(gift.code)}</title>
<style>@page{size:letter landscape;margin:0.5in}body{font:18px/1.5 Georgia,serif;color:#2b2433;margin:0;background:#fff}
.c{border:6px double #b0507a;border-radius:18px;padding:36px 44px;max-width:9in;margin:24px auto;text-align:center}
h1{font-size:40px;margin:0 0 4px;color:#7a2d55}.worth{font-size:28px;margin:14px 0}.code{font:700 30px/1.2 ui-monospace,Menlo,monospace;letter-spacing:3px;border:2px dashed #7a2d55;display:inline-block;padding:8px 18px;margin:10px 0}
.small{font-size:14px;color:#555}.row{display:flex;justify-content:space-between;gap:20px;margin-top:18px;text-align:left}</style></head>
<body><div class="c"><h1>Gift certificate</h1><div>${esc(who)}${profile.city ? `, ${esc(profile.city)}` : ""}</div>
<div class="worth">${gift.recipient ? `For <strong>${esc(gift.recipient)}</strong>: ` : ""}${esc(worth)}</div>
${gift.message ? `<p><em>${esc(gift.message)}</em></p>` : ""}
<div class="code">${esc(gift.code)}</div>
<div class="row"><div class="small">${gift.buyer ? `From ${esc(gift.buyer)}<br>` : ""}Issued ${esc(gift.soldOn)}${gift.expires ? `<br>Use by ${esc(gift.expires)}` : ""}</div><div class="small" style="text-align:right">${esc(contact)}</div></div>
<p class="small">${esc(t)}</p></div></body></html>`;
}

// ---------- parents' night out ----------

/** Children allowed: adults × ratio, and never more than maxKids if the sitter set one. */
export function eventCapacity(ev) {
  const byRatio = Math.max(1, Math.round(num(ev.adults, 1))) * Math.max(1, Math.round(num(ev.ratio, 4)));
  const cap = num(ev.maxKids) > 0 ? Math.min(byRatio, Math.round(num(ev.maxKids))) : byRatio;
  return { byRatio, capacity: cap };
}

/** Price for one family: per child, but never above the family cap if one is set. */
export function familyPrice(ev, kids) {
  const raw = num(ev.perChild) * Math.max(0, kids);
  return r2(num(ev.familyCap) > 0 ? Math.min(raw, num(ev.familyCap)) : raw);
}

export function saveEvent(desk, input, bytes) {
  const why = [];
  const ev = {
    id: input.id || uid("evt", bytes),
    title: String(input.title || "").trim().slice(0, 100) || "Parents' night out",
    date: input.date, start: input.start || "17:30", end: input.end || "21:00",
    place: String(input.place || "").trim().slice(0, 120),
    group: String(input.group || "").trim().slice(0, 100),
    perChild: r2(input.perChild), familyCap: input.familyCap === "" || input.familyCap == null ? null : r2(input.familyCap),
    ratio: Math.max(1, Math.round(num(input.ratio, desk.profile.maxKids || 4))),
    adults: Math.max(1, Math.round(num(input.adults, 1))),
    maxKids: input.maxKids === "" || input.maxKids == null ? null : Math.max(1, Math.round(num(input.maxKids))),
    youngestMonths: input.youngestMonths === "" || input.youngestMonths == null ? num(desk.profile.youngestMonths, 0) : num(input.youngestMonths),
    note: String(input.note || "").trim().slice(0, 400),
    signups: Array.isArray(input.signups) ? input.signups : [],
    token: input.token || "",
  };
  if (!isDate(ev.date)) why.push("Pick a date.");
  if (!(ev.perChild >= 0)) why.push("Set a price per child (0 for a free event).");
  if (why.length) return { ok: false, why, desk };
  const d = clone(desk);
  const i = d.packages.events.findIndex((e) => e.id === ev.id);
  if (i >= 0) d.packages.events[i] = { ...d.packages.events[i], ...ev, signups: d.packages.events[i].signups || [], token: d.packages.events[i].token || ev.token };
  else d.packages.events.push(ev);
  return { ok: true, why: [], desk: d, event: d.packages.events.find((e) => e.id === ev.id) };
}

const kidCount = (s) => (Array.isArray(s.kids) ? s.kids.length : 0);

/**
 * Head count, money and warnings for an event. Confirmed sign-ups fill places in the
 * order they came in; the rest are a waitlist. Warnings are the ratio being exceeded,
 * children under the sitter's youngest age, and allergies to plan for.
 */
export function eventStatus(ev) {
  const { byRatio, capacity } = eventCapacity(ev);
  const list = (ev.signups || []).filter((s) => s && !s.withdrawn).slice().sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  let kids = 0;
  const confirmed = [], waitlist = [];
  for (const s of list) {
    if (s.waitlist === false || kids + kidCount(s) <= capacity) { confirmed.push(s); kids += kidCount(s); } else waitlist.push(s);
  }
  const warnings = [];
  const adults = Math.max(1, Math.round(num(ev.adults, 1)));
  if (kids > byRatio) warnings.push(`Ratio exceeded: ${kids} children for ${adults} adult${adults > 1 ? "s" : ""} at your limit of 1 to ${ev.ratio}. Add ${Math.ceil(kids / ev.ratio) - adults} helper(s) or take fewer children.`);
  else if (kids > capacity) warnings.push(`Over your cap of ${capacity} children.`);
  const young = [], allergies = [];
  for (const s of confirmed) for (const k of s.kids || []) {
    if (Number.isFinite(Number(k.ageMonths)) && num(ev.youngestMonths) > 0 && Number(k.ageMonths) < num(ev.youngestMonths)) young.push(k.name || "a child");
    if (k.allergies) allergies.push(`${k.name || "a child"}: ${k.allergies}`);
  }
  if (young.length) warnings.push(`Younger than your youngest age (${ev.youngestMonths} months): ${young.join(", ")}.`);
  const revenue = r2(confirmed.reduce((a, s) => a + familyPrice(ev, kidCount(s)), 0));
  return { kids, capacity, byRatio, placesLeft: Math.max(0, capacity - kids), confirmed, waitlist, warnings, allergies, revenue, families: confirmed.length };
}

/** Parse a sign-up from the form fields (kid1name, kid1age, kid1allergies ... kid6). */
export function parseSignup(fields = {}, at) {
  const kids = [];
  for (let i = 1; i <= 6; i++) {
    const name = String(fields[`kid${i}name`] || "").trim().slice(0, 60);
    if (!name) continue;
    const ageYears = num(fields[`kid${i}age`], NaN);
    kids.push({ name, ageMonths: Number.isFinite(ageYears) ? Math.round(ageYears * 12) : null, allergies: String(fields[`kid${i}allergies`] || "").trim().slice(0, 120) });
  }
  const s = { parent: String(fields.parent || "").trim().slice(0, 80), contact: String(fields.contact || "").trim().slice(0, 120), pickup: String(fields.pickup || "").trim().slice(0, 120), kids, at };
  const why = [];
  if (!s.parent) why.push("Please give your name.");
  if (!s.contact) why.push("Please give a phone number or email.");
  if (!kids.length) why.push("Please list at least one child.");
  return { ok: !why.length, why, signup: s };
}

/** Add a sign-up (from the app or the link). Full events put the family on the waitlist. */
export function addSignup(desk, eventId, signup, bytes) {
  const d = clone(desk);
  const ev = d.packages.events.find((e) => e.id === eventId);
  if (!ev) return { ok: false, why: ["That event is gone."], desk };
  const before = eventStatus(ev);
  const s = { ...signup, id: signup.id || uid("su", bytes) };
  ev.signups = [...(ev.signups || []), s];
  const after = eventStatus(ev);
  const waitlisted = after.waitlist.some((x) => x.id === s.id);
  return { ok: true, why: [], desk: d, signup: s, waitlisted, placesLeft: after.placesLeft, wasFull: before.placesLeft === 0 };
}

/** A drafted announcement for a church bulletin, school newsletter or group chat. */
export function eventAnnouncement(ev, profile = DEFAULT_PROFILE, { audience = "church", link = "" } = {}) {
  const st = eventStatus(ev);
  const who = profile.businessName || profile.name;
  const date = new Date(`${ev.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const price = num(ev.perChild) > 0 ? `$${num(ev.perChild).toFixed(0)} per child${num(ev.familyCap) > 0 ? `, at most $${num(ev.familyCap).toFixed(0)} per family` : ""}` : "free";
  const group = ev.group ? (audience === "school" ? `${ev.group} families` : `families at ${ev.group}`) : audience === "school" ? "school families" : "church families";
  const certs = (profile.certifications || []).filter(Boolean).join(", ");
  const lines = [
    `${ev.title}: ${date}, ${ev.start}-${ev.end}${ev.place ? ` at ${ev.place}` : ""}.`,
    "",
    `Parents, take the evening for yourselves. ${who} is hosting a night of games, crafts and a snack for ${group}. ${[certs && `${who.split(" ")[0]} is ${certs} certified`, ev.adults > 1 ? `${ev.adults} adults, at most ${ev.ratio} children each` : `at most ${ev.ratio} children per adult`].filter(Boolean).join("; ")}.`,
    "",
    `Cost: ${price}. Places: ${st.capacity}${st.kids ? ` (${st.placesLeft} left)` : ""}.${num(ev.youngestMonths) > 0 ? ` Ages ${Math.ceil(num(ev.youngestMonths) / 12) >= 1 && num(ev.youngestMonths) >= 12 ? `${Math.floor(num(ev.youngestMonths) / 12)} and up` : `${num(ev.youngestMonths)} months and up`}.` : ""}`,
    `Sign up${link ? ` here: ${link}` : ` with ${[profile.phone, profile.email].filter(Boolean).join(" or ") || who}`}. Please list allergies and who will pick up.`,
  ];
  if (ev.note) lines.push("", ev.note);
  if (audience === "church") lines.push("", "[Ask your church office before posting: bulletins often have a deadline and their own wording rules.]");
  else lines.push("", "[Ask the school office or PTA before posting: many schools only share notices from approved groups.]");
  return lines.join("\n");
}

/** Put the event on the schedule as one sit, priced at the confirmed total. */
export function eventToBooking(ev, bytes) {
  const st = eventStatus(ev);
  return { id: uid("book", bytes), familyId: "", date: ev.date, start: ev.start, end: ev.end, kids: Math.max(1, st.kids), price: st.revenue, status: "scheduled", notes: `${ev.title}: ${st.families} families, ${st.kids} children${st.allergies.length ? `. Allergies: ${st.allergies.join("; ")}` : ""}`, eventId: ev.id };
}

// ---------- server: the optional /event/<token> sign-up form ----------

export const isEventToken = (t) => /^[a-f0-9]{32,64}$/.test(String(t || ""));
export const eventToken = (bytes = randomBytes(16)) => Array.from(bytes).map((x) => (x & 255).toString(16).padStart(2, "0")).join("");
export const MAX_SIGNUP_BYTES = 8 * 1024;

const shell = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{font:17px/1.6 Georgia,serif;max-width:36rem;margin:2rem auto;padding:0 1rem;color:#2b2433;background:#fffaf6}label{display:block;margin-top:.6rem}input{font:inherit;width:100%;padding:.5rem;min-height:44px;box-sizing:border-box}fieldset{border:1px solid #d9cbd3;border-radius:8px;margin:.8rem 0}button{font:inherit;min-height:44px;padding:.5rem 1.2rem;background:#7a2d55;color:#fff;border:0;border-radius:8px;margin-top:1rem}.hp{position:absolute;left:-9999px}.note{color:#555;font-size:.9em}</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;

export function signupPage(desk, ev, { action = "", message = "" } = {}) {
  const st = eventStatus(ev);
  const p = desk.profile;
  const date = new Date(`${ev.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const kid = (i) => `<fieldset><legend>Child ${i}${i > 1 ? " (optional)" : ""}</legend><label>First name<input name="kid${i}name"${i === 1 ? " required" : ""}></label><label>Age in years<input name="kid${i}age" inputmode="decimal"></label><label>Allergies or medical needs<input name="kid${i}allergies"></label></fieldset>`;
  return shell(ev.title, `<p><strong>${esc(date)}, ${esc(ev.start)}-${esc(ev.end)}</strong>${ev.place ? `<br>${esc(ev.place)}` : ""}<br>With ${esc(p.businessName || p.name)}. ${num(ev.perChild) > 0 ? `$${esc(num(ev.perChild).toFixed(2))} per child${num(ev.familyCap) > 0 ? `, at most $${esc(num(ev.familyCap).toFixed(2))} per family` : ""}` : "Free"}.</p>
<p>${st.placesLeft > 0 ? `${st.placesLeft} place${st.placesLeft === 1 ? "" : "s"} left.` : "This event is full: you can join the waitlist."}</p>
${message ? `<p role="alert"><strong>${esc(message)}</strong></p>` : ""}
<form method="post" action="${esc(action)}"><label>Your name<input name="parent" required autocomplete="name"></label><label>Phone or email<input name="contact" required></label><label>Who will pick up<input name="pickup"></label>${kid(1)}${kid(2)}${kid(3)}<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button>Sign up</button></form>
<p class="note">Your answers go only to ${esc(p.name)}, to plan the evening. Nothing is paid here.</p>`);
}

/**
 * Handle GET/POST /event/<token>. Returns { code, html, desk? }: when `desk` is set the
 * caller saves it. A token that matches no event, or a past event, gets a 404 page.
 */
export function handleEventRoute(desk, method, token, fields, today, at, bytes) {
  ensure(desk);
  const ev = isEventToken(token) ? desk.packages.events.find((e) => e.token && e.token === token) : null;
  if (!ev || (today && ev.date < today)) return { code: 404, html: shell("Sign-up not found", "<p>This sign-up link is closed or not valid. Please contact the organiser directly.</p>") };
  const action = `./${token}`;
  if (method === "GET") return { code: 200, html: signupPage(desk, ev, { action }) };
  if (method !== "POST") return { code: 405, html: shell("Not allowed", "") };
  const done = (w) => shell("Thank you!", `<p>${w ? "You are on the waitlist. You will hear if a place opens." : "You are signed up."} ${esc(desk.profile.name)} will be in touch before the evening.</p>`);
  if (fields && fields.website) return { code: 200, html: done(false) };
  if ((ev.signups || []).length >= 200) return { code: 429, html: shell("Sign-ups closed", "<p>Please contact the organiser directly.</p>") };
  const p = parseSignup(fields || {}, at);
  if (!p.ok) return { code: 400, html: signupPage(desk, ev, { action, message: p.why.join(" ") }) };
  const r = addSignup(desk, ev.id, { ...p.signup, via: "link" }, bytes);
  return { code: 200, html: done(r.waitlisted), desk: r.desk, signup: r.signup, waitlisted: r.waitlisted, event: ev };
}

/**
 * On PUT /api/desk: keep sign-ups that arrived through the link since the app last
 * synced. Sign-ups are matched by id; the app's copy of each event wins otherwise.
 */
export function mergeEventSignups(serverDesk, incoming) {
  const srv = ensure({ packages: structuredClone((serverDesk && serverDesk.packages) || {}) }).packages.events;
  if (!incoming || !incoming.packages || !Array.isArray(incoming.packages.events)) {
    if (srv.length && incoming) incoming.packages = { ...(incoming.packages || {}), events: srv };
    return incoming;
  }
  for (const ev of incoming.packages.events) {
    const s = srv.find((x) => x.id === ev.id);
    if (!s) continue;
    const have = new Set((ev.signups || []).map((x) => x.id));
    const removed = new Set(ev.removedSignups || []);
    ev.signups = [...(ev.signups || []), ...(s.signups || []).filter((x) => x.via === "link" && !have.has(x.id) && !removed.has(x.id))];
  }
  return incoming;
}

// ---------- overview ----------

/** One summary for the panel and the Today list: open balances, expiring soon, sales this year. */
export function packagesOverview(desk, today, soonDays = 30) {
  ensure(desk);
  const Y = String(today).slice(0, 4);
  const sold = desk.packages.sold.map((s) => ({ s, bal: packageBalance(s, today) }));
  const gifts = desk.packages.gifts.map((g) => ({ g, bal: giftBalance(g, today) }));
  const expiringSoon = [
    ...sold.filter(({ s, bal }) => bal.usable && s.expires && bal.daysLeft <= soonDays).map(({ s, bal }) => ({ kind: "package", id: s.id, name: s.name, familyId: s.familyId, expires: s.expires, left: `${bal.remaining} ${s.unit}` })),
    ...gifts.filter(({ g, bal }) => bal.usable && g.expires && daysBetween(today, g.expires) <= soonDays).map(({ g, bal }) => ({ kind: "gift", id: g.id, name: g.code, recipient: g.recipient, expires: g.expires, left: bal.unit === "hours" ? `${bal.remaining} hours` : `$${bal.remaining.toFixed(2)}` })),
  ];
  const salesThisYear = r2([...desk.packages.sold, ...desk.packages.gifts].filter((x) => String(x.soldOn).startsWith(Y)).reduce((a, x) => a + num(x.price), 0));
  const outstanding = r2(sold.filter(({ bal }) => bal.usable).reduce((a, { bal }) => a + bal.valueLeft, 0) + gifts.filter(({ bal }) => bal.usable).reduce((a, { bal }) => a + bal.valueLeft, 0));
  const upcomingEvents = desk.packages.events.filter((e) => e.date >= today).map((e) => ({ e, st: eventStatus(e) }));
  return { salesThisYear, outstanding, expiringSoon, upcomingEvents };
}
