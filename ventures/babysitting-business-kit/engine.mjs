// Babysitting Business Kit: the engine. Pure functions over one JSON "desk" that the
// page keeps in the browser and the optional server keeps in a file. Nothing here
// touches the network, the clock (callers pass `today`) or storage.
//
// desk = {
//   profile:    the sitter: name, area, rates, availability, website copy, tax settings
//   leads:      inquiries not yet booked (scored by scoreLead)
//   families:   clients, with kids, allergies and emergency notes
//   bookings:   sits, quoted by quote(), paid or not
//   expenses:   receipts by Schedule C category; miles live on bookings and here
//   references: requested / received references and testimonials, with consent flags
// }
//
// Money is in dollars rounded to cents. Times are "HH:MM" 24-hour; dates "YYYY-MM-DD".

import { buildSiteFiles } from "./site.mjs";

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const num = (x, d = 0) => (Number.isFinite(Number(x)) && x !== "" && x !== null ? Number(x) : d);

// Tax constants, each with where it came from. Sibling ventures checked them first:
// SS wage base, ai-bookkeeper/payroll.mjs (ssa.gov); household-employee threshold,
// nanny-tax-calculator/calc.mjs; 1099-K $20,000 and 200 payments, 1099-k-threshold-checker
// (One Big Beautiful Bill Act); mileage, ai-bookkeeper/deductions.mjs (IRS Notice 2026-10,
// with the 2026-07-01 raise that file reports from secondary sources).
export const SS_WAGE_BASE = { 2024: 168600, 2025: 176100, 2026: 184500, 2027: 192300 };
export const HOUSEHOLD_THRESHOLD = { 2024: 2700, 2025: 2800, 2026: 3000 };
export const MILEAGE_RATES = { 2024: [["01-01", 0.67]], 2025: [["01-01", 0.70]], 2026: [["01-01", 0.725], ["07-01", 0.76]] };
export const FORM_1099K = { amount: 20000, count: 200 };

export function newId(prefix = "x", seed = Math.random()) {
  return `${prefix}_${Math.floor(seed * 36 ** 8).toString(36).padStart(8, "0")}`;
}

export const DEFAULT_PROFILE = {
  name: "Your Name",
  businessName: "",
  city: "Your Town",
  area: "Your Town and nearby neighborhoods",
  serviceRadiusMiles: 10,
  phone: "",
  email: "",
  bio: "Experienced, CPR and First Aid certified babysitter who loves helping kids feel safe and have fun.",
  faithStatement: "",
  showFaith: false,
  faithActivities: "Bible stories, simple prayers at meals and bedtime, worship songs: only when parents ask for them.",
  certifications: ["CPR and First Aid"],
  youngestMonths: 6,
  maxKids: 3,
  availability: "Mon-Fri 15:00-22:00; Sat 08:00-23:30",
  rates: { hourly: 20, extraChild: 3, lateAfter: "23:00", lateExtra: 5, holidayMultiplier: 1.5, lastMinuteHours: 24, lastMinuteFee: 15, minimumHours: 3, cancelHours: 24, cancelFeePct: 50 },
  holidays: ["12-24", "12-25", "12-31", "01-01", "07-04", "10-31"],
  taxRate: 12,
  stateTaxRate: 4.4,
  formAction: "",
  followUpDays: [0, 2, 7],
  rebookAfterDays: 30,
};

export function emptyDesk() {
  return { version: 1, profile: structuredClone(DEFAULT_PROFILE), leads: [], families: [], bookings: [], expenses: [], references: [] };
}

// Fill gaps in a desk loaded from storage or an import so every function can trust its shape.
export function normalizeDesk(d) {
  const out = emptyDesk();
  if (!d || typeof d !== "object") return out;
  out.profile = { ...out.profile, ...(d.profile || {}), rates: { ...out.profile.rates, ...((d.profile || {}).rates || {}) } };
  for (const k of ["leads", "families", "bookings", "expenses", "references"]) out[k] = Array.isArray(d[k]) ? d[k].filter((x) => x && typeof x === "object") : [];
  if (d.automations && typeof d.automations === "object" && !Array.isArray(d.automations)) out.automations = d.automations; // sent log and opt-outs (automations.mjs)
  if (d.safety && typeof d.safety === "object" && !Array.isArray(d.safety)) out.safety = d.safety; // late-sit check-ins (safety.mjs)
  if (Array.isArray(d.credentials)) out.credentials = d.credentials.filter((x) => x && typeof x === "object"); // the sitter's own credentials (credentials.mjs)
  if (d.business && typeof d.business === "object" && !Array.isArray(d.business)) out.business = d.business; // business-readiness ticks (credentials.mjs)
  if (Array.isArray(d.posts)) out.posts = d.posts.filter((x) => x && typeof x === "object"); // blog posts (content.mjs)
  if (d.agreements && typeof d.agreements === "object" && !Array.isArray(d.agreements)) out.agreements = d.agreements; // agreement versions (agreements.mjs)
  if (d.network && typeof d.network === "object" && !Array.isArray(d.network)) out.network = d.network; // backup sitters and pass-ons (network.mjs)
  return out;
}

// ---------- time ----------

export function toMin(hhmm) {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(String(hhmm).trim());
  if (!m) return NaN;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (m[3]) {
    const pm = m[3].toLowerCase() === "pm";
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  return h * 60 + min;
}
export const fmtMin = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function dayOf(date) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}
export function addDays(date, n) {
  const t = new Date(`${date}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
}

// "Mon-Fri 15-22; Sat 8:00-23:30; Sun off" -> { 0: [], 1: [[900,1320]], ... }. An end at
// or before the start runs past midnight and is kept as an end > 1440.
export function parseWeekly(text) {
  const out = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  const errors = [];
  for (const raw of String(text || "").split(/[;\n]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const m = /^([A-Za-z,\s-]+?)\s+(off|any|all day|[\d:apm\s]+-\s*[\d:apm\s]+)$/i.exec(part);
    if (!m) { errors.push(`Could not read "${part}"`); continue; }
    const days = parseDays(m[1]);
    if (!days.length) { errors.push(`No day names in "${part}"`); continue; }
    const span = m[2].toLowerCase();
    if (span === "off") { for (const d of days) out[d] = []; continue; }
    let s = 0, e = 1440;
    if (span !== "any" && span !== "all day") {
      const [a, b] = span.split("-").map((x) => x.trim());
      s = toMin(/^\d+$/.test(a) ? `${a}:00` : a);
      e = toMin(/^\d+$/.test(b) ? `${b}:00` : b);
      if (!Number.isFinite(s) || !Number.isFinite(e)) { errors.push(`Could not read the times in "${part}"`); continue; }
      if (e <= s) e += 1440;
    }
    for (const d of days) out[d].push([s, e]);
  }
  return { slots: out, errors };
}

function parseDays(text) {
  const names = DAYS.map((d) => d.toLowerCase());
  const out = new Set();
  const t = text.toLowerCase().trim();
  if (/^(daily|every ?day|any ?day)$/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  if (/^weekdays?$/.test(t)) return [1, 2, 3, 4, 5];
  if (/^weekends?$/.test(t)) return [0, 6];
  for (const chunk of t.split(/[,\s]+/)) {
    if (!chunk) continue;
    const [a, b] = chunk.split("-").map((x) => names.indexOf(x.slice(0, 3)));
    if (a < 0) continue;
    if (b === undefined) out.add(a);
    else if (b >= 0) for (let i = a, n = 0; n < 7; i = (i + 1) % 7, n++) { out.add(i); if (i === b) break; }
  }
  return [...out];
}

// Share of the requested weekly minutes that fall inside the sitter's availability.
export function scheduleFit(availability, requested) {
  const A = parseWeekly(availability).slots, R = parseWeekly(requested).slots;
  let want = 0, got = 0;
  for (let d = 0; d < 7; d++) {
    for (const [s, e] of R[d]) {
      want += e - s;
      for (const [as, ae] of A[d]) got += Math.max(0, Math.min(e, ae) - Math.max(s, as));
    }
  }
  return want ? Math.min(1, got / want) : null;
}

// ---------- leads ----------

// Score an inquiry 0-100 against the sitter's own limits and say why. The point is to
// answer the good ones first and decline politely, early, the ones that do not fit.
// A family's religion is never an input: faith-based activities are a service the
// parents may ask for, and asking for them only adds a reason to match.
export function scoreLead(lead, profile = DEFAULT_PROFILE) {
  const reasons = [];
  const blockers = [];
  let score = 50;
  const add = (pts, why) => { score += pts; reasons.push(`${pts > 0 ? "+" : ""}${pts} ${why}`); };
  const kids = (Array.isArray(lead.kids) ? lead.kids : String(lead.kids || "").split(/[,\s]+/)).map((x) => parseAgeMonths(x)).filter((x) => x !== null);
  const rates = profile.rates || DEFAULT_PROFILE.rates;

  const dist = num(lead.distanceMiles, NaN);
  if (Number.isFinite(dist)) {
    const radius = num(profile.serviceRadiusMiles, 10);
    if (dist > radius * 1.5) { add(-30, `${dist} mi away, well outside your ${radius} mi area`); blockers.push("distance"); }
    else if (dist > radius) add(-12, `${dist} mi away, just outside your ${radius} mi area`);
    else add(8, `${dist} mi away, inside your area`);
  }
  if (kids.length) {
    if (kids.length > num(profile.maxKids, 3)) { add(-25, `${kids.length} children; your limit is ${profile.maxKids}`); blockers.push("kids"); }
    const youngest = Math.min(...kids);
    if (youngest < num(profile.youngestMonths, 0)) { add(-25, `youngest is ${fmtAge(youngest)}; you take ${fmtAge(profile.youngestMonths)} and up`); blockers.push("age"); }
  }
  if (lead.schedule) {
    const fit = scheduleFit(profile.availability, lead.schedule);
    if (fit === null) reasons.push("0 could not read the requested times");
    else if (fit >= 0.99) add(15, "the times they want are all inside your availability");
    else if (fit >= 0.5) add(3, `${Math.round(fit * 100)}% of the requested time fits your availability`);
    else { add(-20, `only ${Math.round(fit * 100)}% of the requested time fits your availability`); if (fit === 0) blockers.push("schedule"); }
  }
  const budget = num(lead.budget, NaN);
  if (Number.isFinite(budget) && budget > 0) {
    const need = num(rates.hourly) + Math.max(0, kids.length - 1) * num(rates.extraChild);
    if (budget >= need) add(10, `budget $${budget}/h covers your $${r2(need)}/h for ${kids.length || 1} child${kids.length === 1 ? "" : "ren"}`);
    else if (budget >= need * 0.85) add(-5, `budget $${budget}/h is a little under your $${r2(need)}/h`);
    else add(-18, `budget $${budget}/h is well under your $${r2(need)}/h`);
  }
  const kind = String(lead.wants || "").toLowerCase();
  if (/recurring|weekly|regular|after.?school|summer/.test(kind)) add(12, "recurring work (steady income)");
  else if (/date|one.?off|occasional/.test(kind)) add(2, "occasional sits");
  const src = String(lead.source || "").toLowerCase();
  if (/referr|friend|church|family|client/.test(src)) add(10, `came by ${lead.source}, the leads most likely to book`);
  if (lead.faithActivities && profile.faithActivities) add(4, "asked for faith-based activities, which you offer");
  if (lead.pets && /allerg/i.test(String(profile.notes || ""))) add(-5, "has pets; check against your allergy note");
  score = Math.max(0, Math.min(100, Math.round(score)));
  const tier = blockers.length ? "decline" : score >= 70 ? "hot" : score >= 50 ? "warm" : "cool";
  return { score, tier, reasons, blockers };
}

export function parseAgeMonths(x) {
  const s = String(x).trim().toLowerCase();
  if (!s) return null;
  let m = /^(\d+(?:\.\d+)?)\s*(m|mo|mos|months?)$/.exec(s);
  if (m) return Number(m[1]);
  m = /^(\d+(?:\.\d+)?)\s*(y|yr|yrs|years?)?$/.exec(s);
  if (m) return Math.round(Number(m[1]) * 12);
  if (/^newborn|infant$/.test(s)) return 1;
  return null;
}
export function fmtAge(months) {
  const m = num(months);
  return m < 24 ? `${m} months` : `${Math.floor(m / 12)} years`;
}

// ---------- quotes and bookings ----------

// Price one sit from the profile's rate card. Returns the lines so the family sees
// how the total was built.
export function quote(sit, rates = DEFAULT_PROFILE.rates, holidays = DEFAULT_PROFILE.holidays) {
  const s = toMin(sit.start);
  let e = toMin(sit.end);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return { hours: 0, total: 0, lines: [], errors: ["Start and end times are needed"] };
  if (e <= s) e += 1440;
  const kids = Math.max(1, Math.round(num(sit.kids, 1)));
  const actual = (e - s) / 60;
  const hours = Math.max(actual, num(rates.minimumHours));
  const perHour = num(rates.hourly) + (kids - 1) * num(rates.extraChild);
  const lines = [];
  lines.push({ label: `${r2(hours)} h × $${r2(perHour)}/h (${kids} child${kids > 1 ? "ren" : ""})${hours > actual ? `, ${rates.minimumHours} h minimum` : ""}`, amount: r2(hours * perHour) });
  const late = toMin(rates.lateAfter || "23:00");
  if (num(rates.lateExtra) > 0 && Number.isFinite(late)) {
    // The late window runs from lateAfter until 6am.
    const lateMin = Math.max(0, Math.min(e, 1440 + 360) - Math.max(s, late));
    if (lateMin > 0) lines.push({ label: `${r2(lateMin / 60)} h after ${rates.lateAfter} × $${rates.lateExtra}`, amount: r2((lateMin / 60) * rates.lateExtra) });
  }
  let total = lines.reduce((a, l) => a + l.amount, 0);
  if (sit.date && (holidays || []).includes(sit.date.slice(5)) && num(rates.holidayMultiplier, 1) > 1) {
    const extra = total * (rates.holidayMultiplier - 1);
    lines.push({ label: `holiday rate × ${rates.holidayMultiplier}`, amount: r2(extra) });
    total += extra;
  }
  if (sit.date && sit.bookedOn && num(rates.lastMinuteFee) > 0) {
    const lead = (Date.parse(`${sit.date}T${fmtMin(s % 1440)}:00Z`) - Date.parse(`${sit.bookedOn}T12:00:00Z`)) / 36e5;
    if (lead < num(rates.lastMinuteHours, 24)) { lines.push({ label: `booked under ${rates.lastMinuteHours} h ahead`, amount: r2(rates.lastMinuteFee) }); total += num(rates.lastMinuteFee); }
  }
  return { hours: r2(hours), total: r2(total), lines, errors: [] };
}

export function cancellationFee(sit, cancelledOn, rates = DEFAULT_PROFILE.rates) {
  const hoursBefore = (Date.parse(`${sit.date}T${fmtMin(toMin(sit.start) % 1440)}:00Z`) - Date.parse(cancelledOn)) / 36e5;
  if (hoursBefore >= num(rates.cancelHours, 24)) return 0;
  return r2((quote(sit, rates, []).total * num(rates.cancelFeePct)) / 100);
}

// Weekly repeats: { ..., repeatWeeks: 8 } becomes 8 dated sits.
export function expandBookings(bookings) {
  const out = [];
  for (const b of bookings) {
    const n = Math.max(1, Math.round(num(b.repeatWeeks, 1)));
    for (let i = 0; i < n; i++) {
      const date = addDays(b.date, 7 * i);
      out.push({ ...b, date, occurrence: i, key: n > 1 ? `${b.id}#${i}` : b.id, status: (b.skip || []).includes(date) ? "cancelled" : b.status });
    }
  }
  return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

function span(b) {
  const s = Date.parse(`${b.date}T00:00:00Z`) / 6e4 + toMin(b.start);
  let e = Date.parse(`${b.date}T00:00:00Z`) / 6e4 + toMin(b.end);
  if (e <= s) e += 1440;
  return [s, e];
}

// Overlapping sits, or sits closer than the travel buffer between two families.
export function conflicts(bookings, bufferMin = 30) {
  const list = expandBookings(bookings).filter((b) => b.status !== "cancelled");
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const [s1, e1] = span(list[i]);
    for (let j = i + 1; j < list.length; j++) {
      const [s2, e2] = span(list[j]);
      if (s2 > e1 + bufferMin) break;
      const gap = s2 - e1;
      const same = list[i].familyId && list[i].familyId === list[j].familyId;
      if (s2 < e1) out.push({ a: list[i], b: list[j], kind: "overlap", minutes: e1 - s2 });
      else if (!same && gap < bufferMin) out.push({ a: list[i], b: list[j], kind: "tight", minutes: gap });
    }
  }
  return out;
}

// Is the sitter free for this request? Checks availability and existing sits.
export function canTake(desk, sit, bufferMin = 30) {
  const why = [];
  const A = parseWeekly(desk.profile.availability).slots[dayOf(sit.date)];
  let s = toMin(sit.start), e = toMin(sit.end);
  if (e <= s) e += 1440;
  if (!A.some(([as, ae]) => as <= s && ae >= e)) why.push(`outside your ${DAYS[dayOf(sit.date)]} availability`);
  const clash = conflicts([...desk.bookings, { ...sit, id: "__new", status: "scheduled" }], bufferMin).filter((c) => c.a.id === "__new" || c.b.id === "__new");
  for (const c of clash) {
    const other = c.a.id === "__new" ? c.b : c.a;
    why.push(c.kind === "overlap" ? `overlaps your ${other.date} ${other.start} sit` : `only ${c.minutes} min after/before your ${other.start} sit`);
  }
  return { ok: why.length === 0, why };
}

const icsText = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
const icsDT = (date, min) => {
  const d = addDays(date, Math.floor(min / 1440));
  return `${d.replace(/-/g, "")}T${fmtMin(min % 1440).replace(":", "")}00`;
};

// A calendar file (or subscribable feed) of upcoming sits, floating local time.
export function toICS(desk, { from = "0000-00-00", privateNotes = true } = {}) {
  const fam = Object.fromEntries(desk.families.map((f) => [f.id, f]));
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//babysitting-business-kit//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${icsText(desk.profile.businessName || desk.profile.name)} sits`];
  for (const b of expandBookings(desk.bookings)) {
    if (b.status === "cancelled" || b.date < from) continue;
    const f = fam[b.familyId] || {};
    const s = toMin(b.start);
    let e = toMin(b.end);
    if (e <= s) e += 1440;
    const kids = (f.kids || []).map((k) => `${k.name || "child"}${k.allergies ? ` (allergies: ${k.allergies})` : ""}`).join(", ");
    lines.push("BEGIN:VEVENT", `UID:${b.key}@babysitting-business-kit`, `DTSTAMP:${b.date.replace(/-/g, "")}T000000Z`, `DTSTART:${icsDT(b.date, s)}`, `DTEND:${icsDT(b.date, e)}`, `SUMMARY:${icsText(`Babysit: ${f.name || b.family || "family"}`)}`);
    if (f.address) lines.push(`LOCATION:${icsText(f.address)}`);
    if (privateNotes) lines.push(`DESCRIPTION:${icsText([kids && `Kids: ${kids}`, f.emergency && `Emergency: ${f.emergency}`, b.notes].filter(Boolean).join("\n"))}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldICS).join("\r\n") + "\r\n";
}
function foldICS(line) {
  const out = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = " " + rest.slice(74); }
  out.push(rest);
  return out.join("\r\n");
}

// ---------- money and taxes ----------

export function mileageRate(date, override) {
  if (num(override) > 0) return num(override);
  const y = Number(date.slice(0, 4));
  const steps = MILEAGE_RATES[y] || MILEAGE_RATES[Math.max(...Object.keys(MILEAGE_RATES).map(Number))];
  let rate = steps[0][1];
  for (const [md, v] of steps) if (date.slice(5) >= md) rate = v;
  return rate;
}

export const EXPENSE_CATEGORIES = {
  supplies: "Supplies (activities, crafts, snacks you buy)",
  training: "Training and certification (CPR, First Aid)",
  advertising: "Advertising (website, flyers, cards)",
  phone: "Phone and internet (business share)",
  insurance: "Insurance (liability policy)",
  fees: "Fees (background check, app or payment fees)",
  other: "Other",
};

// Estimated quarterly due dates for a tax year, moved off weekends. Federal holidays
// can push one a further day; the IRS page for the year is the source of truth.
export function quarterlyDueDates(year) {
  const raw = [`${year}-04-15`, `${year}-06-15`, `${year}-09-15`, `${year + 1}-01-15`];
  return raw.map((d) => { let x = d; while ([0, 6].includes(dayOf(x))) x = addDays(x, 1); return x; });
}

// Everything the year's money looks like: income by month, family and payment method,
// deductions, self-employment tax, a set-aside, the quarterly schedule and the flags
// a babysitter tends to miss.
export function taxSummary(desk, year, today = `${year}-12-31`) {
  const p = desk.profile;
  const Y = String(year);
  const sits = expandBookings(desk.bookings).filter((b) => b.date.startsWith(Y) && b.status !== "cancelled");
  const paid = [];
  for (const b of desk.bookings) for (const pay of payments(b)) if (String(pay.date).startsWith(Y)) paid.push({ ...pay, familyId: b.familyId });
  const income = r2(paid.reduce((a, x) => a + num(x.amount), 0));
  const byMonth = Array(12).fill(0), byFamily = {}, byMethod = {};
  for (const x of paid) {
    byMonth[Number(x.date.slice(5, 7)) - 1] += num(x.amount);
    byFamily[x.familyId || "unknown"] = r2((byFamily[x.familyId || "unknown"] || 0) + num(x.amount));
    byMethod[x.method || "unspecified"] = r2((byMethod[x.method || "unspecified"] || 0) + num(x.amount));
  }
  const miles = [...sits.map((b) => ({ date: b.date, miles: num(b.miles) })), ...desk.expenses.filter((e) => e.miles && String(e.date).startsWith(Y)).map((e) => ({ date: e.date, miles: num(e.miles) }))];
  const mileage = r2(miles.reduce((a, m) => a + m.miles * mileageRate(m.date, p.mileageRate), 0));
  const totalMiles = miles.reduce((a, m) => a + m.miles, 0);
  const expenseByCat = {};
  for (const e of desk.expenses) if (String(e.date).startsWith(Y) && num(e.amount)) expenseByCat[e.category || "other"] = r2((expenseByCat[e.category || "other"] || 0) + num(e.amount));
  const expenses = r2(Object.values(expenseByCat).reduce((a, x) => a + x, 0));
  const net = r2(income - expenses - mileage);
  const seBase = Math.max(0, net) * 0.9235;
  const wageBase = SS_WAGE_BASE[year] || SS_WAGE_BASE[2027];
  const seTax = net >= 400 ? r2(Math.min(seBase, wageBase) * 0.124 + seBase * 0.029) : 0;
  const incomeTaxable = Math.max(0, net - seTax / 2);
  const incomeTax = r2((incomeTaxable * num(p.taxRate)) / 100);
  const stateTax = r2((incomeTaxable * num(p.stateTaxRate)) / 100);
  const setAside = r2(seTax + incomeTax + stateTax);
  const setAsidePct = income > 0 ? Math.round((setAside / income) * 1000) / 10 : 0;
  const due = quarterlyDueDates(year);
  const quarterEnds = [`${year}-03-31`, `${year}-05-31`, `${year}-08-31`, `${year}-12-31`];
  const quarters = due.map((d, i) => {
    const through = quarterEnds[i];
    const inc = paid.filter((x) => x.date <= through && (i === 0 || x.date > quarterEnds[i - 1])).reduce((a, x) => a + num(x.amount), 0);
    return { quarter: i + 1, through, due: d, income: r2(inc), suggested: r2(inc * (setAsidePct / 100)), past: d < today };
  });
  const flags = [];
  if (net >= 400) flags.push(`Net profit is $${net}. At $400 or more you owe self-employment tax and file Schedule C and Schedule SE with your Form 1040, even if you owe no income tax.`);
  else flags.push(`Net profit is under $400 so far: no self-employment tax yet. If you have no other income you may not need to file; check the Form 1040 instructions.`);
  const threshold = HOUSEHOLD_THRESHOLD[year];
  for (const [fid, amt] of Object.entries(byFamily)) {
    if (threshold && amt >= threshold) {
      const f = desk.families.find((x) => x.id === fid);
      flags.push(`${f ? f.name : "One family"} paid you $${amt} this year (at or over $${threshold}). If that family controls how and when you work in their home, the IRS can treat you as their household employee (Publication 926), and they would owe the nanny tax and give you a W-2. Babysitters who run their own business for many families are usually self-employed. Talk it through with the family.`);
    }
  }
  const appTotal = Object.entries(byMethod).filter(([m]) => /venmo|paypal|cash ?app|square|stripe/i.test(m));
  const appSum = appTotal.reduce((a, [, v]) => a + v, 0);
  if (appSum > 0) flags.push(`$${r2(appSum)} came through payment apps. A Form 1099-K arrives only above $${FORM_1099K.amount.toLocaleString()} and ${FORM_1099K.count} payments, but every dollar is income whether or not a form arrives, cash too.`);
  if (sits.length && !totalMiles) flags.push("No miles logged. Driving between sits (not from home to your first sit if home is not your main place of business) can be deductible; log miles on each sit.");
  flags.push("Families who claim the child and dependent care credit (Form 2441) or a dependent-care FSA need your name, address and taxpayer ID. A free EIN from the IRS lets you give one without sharing your Social Security number. The family statement below has the totals they need.");
  return { year, income, byMonth: byMonth.map(r2), byFamily, byMethod, expenses, expenseByCat, mileage, totalMiles, net, seTax, incomeTax, stateTax, setAside, setAsidePct, quarters, flags, sits: sits.length, unpaid: unpaid(desk, today) };
}

export function payments(b) {
  if (Array.isArray(b.payments)) return b.payments.filter((p) => num(p.amount));
  if (num(b.paid) > 0) return [{ amount: num(b.paid), date: b.paidDate || b.date, method: b.method || "" }];
  return [];
}

// Sits that have happened and are not fully paid, oldest first. A weekly booking owes
// each past occurrence; its payments pay the oldest occurrences first.
export function unpaid(desk, today) {
  const out = [];
  for (const b of desk.bookings) {
    if (b.status === "cancelled") continue;
    const past = expandBookings([b]).filter((o) => o.status !== "cancelled" && o.date <= today);
    if (!past.length) continue;
    let got = payments(b).reduce((a, p) => a + num(p.amount), 0);
    let owed = 0, oldest = null;
    for (const o of past) {
      const price = num(b.price, quote(o, desk.profile.rates, desk.profile.holidays).total);
      const covered = Math.min(got, price);
      got -= covered;
      if (price - covered > 0.009) { owed += price - covered; oldest = oldest || o; }
    }
    if (owed > 0.009) out.push({ booking: oldest, owed: r2(owed), days: daysBetween(oldest.date, today) });
  }
  return out.sort((a, b) => b.days - a.days);
}

// Year-end statement a family can use for Form 2441 or a dependent-care FSA claim.
export function familyStatement(desk, familyId, year) {
  const f = desk.families.find((x) => x.id === familyId);
  const p = desk.profile;
  const rows = [];
  for (const b of desk.bookings) if (b.familyId === familyId) for (const pay of payments(b)) if (String(pay.date).startsWith(String(year))) rows.push({ ...pay, sit: b.date });
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const total = r2(rows.reduce((a, x) => a + num(x.amount), 0));
  const text = [
    `Child care statement for ${year}`,
    ``,
    `Provider: ${p.businessName ? `${p.businessName} (${p.name})` : p.name}`,
    `Address: ${p.address || "[your address]"}`,
    `Taxpayer ID: ${p.taxId ? p.taxId : "[your EIN or SSN; write it in by hand]"}`,
    ``,
    `Paid by: ${f ? f.name : familyId}`,
    `Total paid for care in ${year}: $${total.toFixed(2)}`,
    ``,
    ...rows.map((x) => `  ${x.date}  $${num(x.amount).toFixed(2)}  ${x.method || ""}  (sit on ${x.sit})`),
    ``,
    `This is a record of payments received, prepared by the provider. It is not tax advice.`,
  ].join("\n");
  return { total, rows, text };
}

// ---------- references ----------

export function referenceRequest(ref, profile = DEFAULT_PROFILE, kind = "reference") {
  const first = String(ref.name || "").split(" ")[0] || "there";
  const me = profile.name;
  if (kind === "testimonial") {
    return `Hi ${first}! It's ${me}. I've loved watching your kids, and I'm putting together a simple website for my babysitting. Would you be willing to write two or three sentences about what it's been like having me sit? Anything honest is welcome. I'll only put your first name and last initial on the site, and only if you say yes. Thank you so much!`;
  }
  return `Hi ${first}! It's ${me}. A new family I may be sitting for asked for a reference. Would it be okay if I gave them your ${ref.contactPreference || "phone number"} so they can ask you a few questions about my babysitting? If you'd rather not, no problem at all. Thank you!`;
}

// Next step for each reference: who to ask, who to chase, which quotes may be published.
export function referenceQueue(desk, today) {
  const out = [];
  for (const r of desk.references) {
    if (!r.requested) out.push({ ref: r, action: "ask", note: "not asked yet" });
    else if (!r.received && daysBetween(r.requested, today) >= 5) out.push({ ref: r, action: "follow up", note: `asked ${daysBetween(r.requested, today)} days ago` });
    else if (r.received && r.quote && r.consentPublic === undefined) out.push({ ref: r, action: "ask consent", note: "quote received; ask if it can go on your website" });
  }
  return out;
}

// Quotes that may appear on the website: received, and the person said yes.
export function publishableTestimonials(desk) {
  return desk.references.filter((r) => r.quote && r.consentPublic === true).map((r) => ({ quote: r.quote, by: shortName(r.name), relation: r.relationship || "" }));
}
export function shortName(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] || "";
}

// ---------- sales messages ----------

export function leadReply(lead, profile = DEFAULT_PROFILE, scored = scoreLead(lead, profile)) {
  const first = String(lead.name || "").split(" ")[0] || "there";
  const r = profile.rates;
  if (scored.tier === "decline") {
    const why = { distance: "I only travel within my area", kids: `I can only care for up to ${profile.maxKids} children at a time`, age: `I care for children ${fmtAge(profile.youngestMonths)} and older`, schedule: "my schedule doesn't have room for those times" }[scored.blockers[0]];
    return `Hi ${first}, thank you so much for reaching out! Unfortunately ${why}, so I'm not the right fit this time. I hope you find someone wonderful, and please keep me in mind if anything changes.`;
  }
  return [
    `Hi ${first}, thank you for reaching out! I'd love to help.`,
    `My rate is $${r.hourly}/hour for one child, plus $${r.extraChild}/hour for each additional child, with a ${r.minimumHours}-hour minimum.`,
    profile.certifications && profile.certifications.length ? `I'm ${profile.certifications.join(", ")} certified.` : "",
    lead.faithActivities && profile.faithActivities ? `You mentioned faith-based activities: I'm happy to include ${profile.faithActivities.replace(/[:.].*$/, "").toLowerCase()}.` : "",
    `Would you like to set up a quick meet-and-greet so you and the kids can get to know me? I can also send references.`,
  ].filter(Boolean).join(" ");
}

// The follow-up sequence for an unanswered lead: day 0 reply, a nudge, a last note.
export function followUpMessage(lead, step, profile = DEFAULT_PROFILE) {
  const first = String(lead.name || "").split(" ")[0] || "there";
  if (step === 0) return leadReply(lead, profile);
  if (step === 1) return `Hi ${first}, just checking in on your babysitting request. I still have openings ${lead.schedule ? `around ${lead.schedule}` : "this week"}. Happy to answer any questions!`;
  return `Hi ${first}, I don't want to crowd your inbox, so this is my last note. If you still need a sitter, just reply and I'll do my best to fit you in. Have a great week!`;
}

export function rebookMessage(family, profile = DEFAULT_PROFILE, today) {
  const first = String(family.contactName || family.name || "").split(" ")[0] || "there";
  const month = Number((today || "2026-01-01").slice(5, 7));
  const hook = month === 2 ? "Valentine's date night" : month === 12 ? "Christmas shopping or a holiday party" : [6, 7].includes(month) ? "a summer day out" : month === 10 ? "a fall date night" : "a date night or a few hours to yourselves";
  return `Hi ${first}! It's ${profile.name}. I miss your crew! I have some openings coming up if you'd like ${hook}. Just reply with a day that works.`;
}

export function referralAsk(family, profile = DEFAULT_PROFILE) {
  const first = String(family.contactName || family.name || "").split(" ")[0] || "there";
  return `Hi ${first}! I'm opening a few spots for new families. If you know anyone who needs a trustworthy sitter, I'd be so grateful if you passed my name along. Thank you for trusting me with your kids!`;
}

// ---------- the to-do list ----------

// What to do today, most valuable first: new leads, follow-ups, unpaid sits, references,
// families to rebook, tax deadlines, sits tomorrow.
export function todayQueue(desk, today) {
  const p = desk.profile;
  const out = [];
  const steps = (p.followUpDays || [0, 2, 7]).map(Number);
  for (const lead of desk.leads) {
    if (!["new", "contacted", undefined, ""].includes(lead.status)) continue;
    const sc = scoreLead(lead, p);
    const sent = num(lead.followUps, 0);
    if (sent >= steps.length || (sc.tier === "decline" && sent >= 1)) continue;
    const dueOn = addDays(lead.created || today, steps[sent]);
    if (dueOn <= today) out.push({ kind: "lead", priority: sc.tier === "hot" ? 1 : sc.tier === "decline" ? 4 : 2, title: `${sent === 0 ? "Reply to" : "Follow up with"} ${lead.name} (${sc.tier}, ${sc.score})`, message: sc.tier === "decline" && sent === 0 ? leadReply(lead, p, sc) : followUpMessage(lead, sent, p), id: lead.id, step: sent });
  }
  for (const u of unpaid(desk, today)) if (u.days >= 1) {
    const f = desk.families.find((x) => x.id === u.booking.familyId);
    out.push({ kind: "unpaid", priority: u.days > 7 ? 1 : 3, title: `$${u.owed} unpaid from ${f ? f.name : "a family"} for ${u.booking.date} (${u.days} days)`, message: `Hi! Just a friendly reminder about $${u.owed} for babysitting on ${u.booking.date}. Thank you!`, id: u.booking.id });
  }
  for (const q of referenceQueue(desk, today)) out.push({ kind: "reference", priority: 3, title: `Reference: ${q.action} ${q.ref.name} (${q.note})`, message: q.action === "ask consent" ? `Thank you so much for the kind words! Would it be okay to share them on my website as "${shortName(q.ref.name)}"?` : referenceRequest(q.ref, p, q.ref.kind || "reference"), id: q.ref.id });
  const last = {};
  for (const b of expandBookings(desk.bookings)) if (b.status !== "cancelled" && b.date <= today) last[b.familyId] = b.date;
  const upcoming = new Set(expandBookings(desk.bookings).filter((b) => b.date > today && b.status !== "cancelled").map((b) => b.familyId));
  for (const f of desk.families) {
    const l = last[f.id];
    if (l && !upcoming.has(f.id) && daysBetween(l, today) >= num(p.rebookAfterDays, 30) && (!f.nudged || daysBetween(f.nudged, today) >= 30)) out.push({ kind: "rebook", priority: 3, title: `Invite ${f.name} back (last sit ${daysBetween(l, today)} days ago)`, message: rebookMessage(f, p, today), id: f.id });
  }
  const y = Number(today.slice(0, 4));
  for (const yr of [y - 1, y]) for (const [i, d] of quarterlyDueDates(yr).entries()) {
    const n = daysBetween(today, d);
    if (n >= 0 && n <= 14) { const t = taxSummary(desk, yr, today); out.push({ kind: "tax", priority: n <= 3 ? 1 : 2, title: `Estimated tax Q${i + 1} ${yr} due ${d} (${n} days): about $${t.quarters[i].suggested} on $${t.quarters[i].income} of income`, message: "", id: `tax-${yr}-${i}` }); }
  }
  const tomorrow = addDays(today, 1);
  for (const b of expandBookings(desk.bookings)) if ((b.date === today || b.date === tomorrow) && b.status !== "cancelled") {
    const f = desk.families.find((x) => x.id === b.familyId);
    out.push({ kind: "sit", priority: 2, title: `${b.date === today ? "Today" : "Tomorrow"} ${b.start}-${b.end}: ${f ? f.name : "sit"}`, message: `Hi! Looking forward to seeing the kids ${b.date === today ? "today" : "tomorrow"} at ${b.start}. Anything new I should know (bedtime, allergies, plans)?`, id: b.key });
  }
  return out.sort((a, b) => a.priority - b.priority);
}

// ---------- content marketing ----------

const TOPICS = {
  1: ["New year, new routines: how a regular sitter helps", "Indoor winter activities for snow days"],
  2: ["Book your Valentine's date night early", "Why a meet-and-greet before the first sit matters"],
  3: ["Spring break: half-day plans that keep kids busy", "What a CPR and First Aid certification covers"],
  4: ["Easter crafts and activities kids love", "How to leave a great note for your sitter"],
  5: ["Mother's Day: give mom an afternoon off", "Summer is filling up: book weekly sits now"],
  6: ["Summer survival: a sitter for the long days", "Outdoor games that need nothing but a yard"],
  7: ["Fourth of July evening plans", "Keeping kids cool and safe in the heat"],
  8: ["Back-to-school after-school care", "Building a homework routine that works"],
  9: ["Fall schedules: reserve a regular weekly night", "Screen-free evenings: what we do instead"],
  10: ["Halloween night: costume help and candy rules", "Questions to ask any new babysitter"],
  11: ["Thankful crafts for Thanksgiving week", "Holiday party season: book your sitter now"],
  12: ["Christmas shopping hours while I watch the kids", "Advent and holiday traditions with little ones"],
};
const FAITH_TOPICS = { 3: "Teaching kindness: simple Bible stories for little ones", 4: "Celebrating Easter with kids: crafts with meaning", 12: "Advent with kids: a candle a week", 11: "Gratitude journals for kids" };
const CHANNELS = ["Facebook post", "Nextdoor post", "Instagram post", "Church or school bulletin blurb", "Blog post on your website"];

export function contentCalendar(start, weeks = 12, profile = DEFAULT_PROFILE) {
  const out = [];
  const used = new Set();
  for (let w = 0; w < weeks; w++) {
    const date = addDays(start, w * 7);
    const m = Number(date.slice(5, 7));
    const pool = [...TOPICS[m], ...(profile.showFaith && FAITH_TOPICS[m] ? [FAITH_TOPICS[m]] : [])];
    const topic = pool.find((t) => !used.has(t)) || pool[w % pool.length];
    used.add(topic);
    const channel = CHANNELS[w % CHANNELS.length];
    out.push({ week: w + 1, date, channel, topic, draft: draftPost(topic, channel, profile) });
  }
  return out;
}

export function draftPost(topic, channel, profile = DEFAULT_PROFILE) {
  const contact = profile.phone || profile.email || "a message";
  const cta = `Serving ${profile.area}. Reach me at ${contact} to book.`;
  if (/bulletin/i.test(channel)) return `${profile.name}, ${profile.certifications.join(", ")} certified babysitter, has openings for ${profile.area} families. ${topic}. ${cta}`;
  return `${topic}\n\n[Two or three sentences in your own words: a real moment from a recent sit, with no child's name or photo unless the parents said yes.]\n\n${cta}`;
}

// ---------- the website ----------

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// A one-file marketing site for the sitter. Testimonials appear only when the person
// gave consent; the inquiry form posts to the sitter's own server (or opens email).
// The website lives in site.mjs (themes, several pages, local SEO, zip download);
// this keeps the one-page call working and returns the home page.
export function buildSite(desk, opts = {}) {
  return buildSiteFiles(desk, opts)["index.html"];
}

// Turn the website form (or a pasted message) into a lead.
export function leadFromForm(fields, today, id = newId("lead")) {
  const kids = String(fields.kids || "").split(/[,;&]|\band\b/).map((s) => s.trim()).filter(Boolean);
  return {
    id,
    created: today,
    name: String(fields.name || "").slice(0, 120),
    contact: String(fields.contact || fields.email || fields.phone || "").slice(0, 200),
    kids,
    schedule: String(fields.schedule || "").slice(0, 200),
    wants: String(fields.wants || "").slice(0, 100),
    source: String(fields.source || "website").slice(0, 100),
    notes: String(fields.notes || "").slice(0, 2000),
    distanceMiles: fields.distanceMiles ?? "",
    budget: fields.budget ?? "",
    faithActivities: /pray|bible|faith|church|christian|worship/i.test(`${fields.notes || ""} ${fields.wants || ""}`),
    status: "new",
    followUps: 0,
  };
}

// An invented desk to explore the tool with. No real person or family.
export function exampleDesk(today = "2026-11-02") {
  const d = emptyDesk();
  d.profile = { ...d.profile, name: "Grace Example", businessName: "Grace Notes Babysitting", city: "Springfield", area: "Springfield and Riverside", phone: "555-0100", email: "grace@example.com", showFaith: true, faithStatement: "I'm a Christian, and caring for kids is one way I try to love my neighbors well. I care for every family the same way, whatever they believe.", mileageRate: "" };
  d.families = [
    { id: "fam_a", name: "Rivera family", contactName: "Ana Rivera", contact: "555-0111", address: "12 Oak St", emergency: "Grandma 555-0112", kids: [{ name: "Leo", birth: "2021-04-02" }, { name: "Mia", birth: "2023-09-10", allergies: "peanuts" }] },
    { id: "fam_b", name: "Chen family", contactName: "David Chen", contact: "555-0122", address: "48 Elm Ave", kids: [{ name: "Sam", birth: "2018-01-20" }] },
  ];
  d.bookings = [
    { id: "bk_1", familyId: "fam_a", date: addDays(today, -21), start: "18:00", end: "23:30", kids: 2, status: "done", payments: [{ amount: 129, date: addDays(today, -21), method: "Venmo" }], miles: 6 },
    { id: "bk_2", familyId: "fam_b", date: addDays(today, -60), start: "15:00", end: "18:00", kids: 1, status: "done", payments: [{ amount: 60, date: addDays(today, -60), method: "cash" }], miles: 4 },
    { id: "bk_3", familyId: "fam_a", date: addDays(today, -3), start: "17:00", end: "21:00", kids: 2, status: "done", miles: 6 },
    { id: "bk_4", familyId: "fam_a", date: addDays(today, 1), start: "15:30", end: "18:30", kids: 2, status: "scheduled", repeatWeeks: 6, miles: 6 },
  ];
  d.leads = [
    leadFromForm({ name: "Hannah Brooks", contact: "555-0133", kids: "3, 6", schedule: "Fri 18-23", wants: "date nights", source: "church friend", notes: "Would love bedtime prayers with the kids." }, today, "lead_1"),
    { ...leadFromForm({ name: "Tom Ellis", contact: "tom@example.com", kids: "4 months", schedule: "Mon-Fri 8-17", wants: "full-time", source: "Nextdoor" }, addDays(today, -2), "lead_2"), followUps: 1, status: "contacted" },
  ];
  d.leads[0].distanceMiles = 4;
  d.leads[0].budget = 25;
  d.references = [
    { id: "ref_1", name: "Ana Rivera", familyId: "fam_a", relationship: "mom of two", requested: addDays(today, -10), received: addDays(today, -8), quote: "Grace is calm, kind and always on time. Our kids ask for her by name.", consentPublic: true },
    { id: "ref_2", name: "David Chen", familyId: "fam_b", relationship: "dad", requested: addDays(today, -7), kind: "reference" },
  ];
  d.expenses = [{ id: "ex_1", date: addDays(today, -40), amount: 85, category: "training", note: "CPR and First Aid class" }, { id: "ex_2", date: addDays(today, -15), amount: 22.4, category: "supplies", note: "craft supplies" }];
  return d;
}
