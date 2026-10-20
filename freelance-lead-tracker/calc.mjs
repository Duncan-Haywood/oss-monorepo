// Freelance lead pipeline maths. Pure functions: leads in, numbers out.
// Money is whole cents; dates are YYYY-MM-DD strings handled in UTC.
// Nothing here reads the DOM or the network.

export const CURRENCIES = { USD: "$", CAD: "CA$", EUR: "€", GBP: "£", AUD: "A$", NZD: "NZ$", CHF: "CHF ", JPY: "¥", MXN: "MX$", INR: "₹" };

// Open stages in order, then the two closed ones.
export const STAGES = ["lead", "contacted", "proposal", "negotiating", "won", "lost"];
export const OPEN = ["lead", "contacted", "proposal", "negotiating"];
export const STAGE_LABEL = { lead: "New lead", contacted: "In conversation", proposal: "Proposal sent", negotiating: "Negotiating", won: "Won", lost: "Lost" };
// Starting guesses, used until you have enough closed leads of your own.
export const DEFAULT_PROB = { lead: 0.1, contacted: 0.25, proposal: 0.4, negotiating: 0.7 };
export const MIN_CLOSED_FOR_OWN_RATE = 8;
export const STALE_DAYS = { lead: 5, contacted: 7, proposal: 7, negotiating: 5 };
export const SOURCES = ["Referral", "Past client", "Upwork or marketplace", "LinkedIn", "Cold outreach", "Website or search", "Social media", "Event or community", "Other"];

export const DEFAULTS = { currency: "USD", leads: [] };

export function parseCents(v) {
  const s = String(v ?? "").replace(/[,\s]/g, "").replace(/^[^\d.-]+/, "");
  if (s === "" || !/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return null;
  const n = Math.round(Number(s) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function formatMoney(cents, currency = "USD") {
  const sym = CURRENCIES[currency] ?? currency + " ";
  const zero = currency === "JPY";
  const v = (Math.round(cents) / 100);
  const s = (zero ? Math.round(v).toString() : v.toFixed(2)).replace(/\B(?=(\d{3})+(?!\d))/g, ",").replace(/,(\d{2})$/, ".$1");
  return sym + s;
}

const DAY = 86400000;
const iso = /^\d{4}-\d{2}-\d{2}$/;
export function parseDate(s) {
  if (!iso.test(String(s ?? ""))) return null;
  const t = Date.parse(s + "T00:00:00Z");
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s ? t : null;
}
export function daysBetween(a, b) {
  const x = parseDate(a), y = parseDate(b);
  return x === null || y === null ? null : Math.round((y - x) / DAY);
}
export function addDays(s, n) {
  const t = parseDate(s);
  return t === null ? null : new Date(t + n * DAY).toISOString().slice(0, 10);
}

export function formatDate(iso) {
  const t = parseDate(iso);
  return t === null ? "" : new Date(t).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

// Turns whatever is stored (or restored from a backup) into a lead the rest of
// the code can trust. Returns null for something that is not a lead at all.
export function cleanLead(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const s = (v, n = 400) => String(v ?? "").slice(0, n);
  const stage = STAGES.includes(raw.stage) ? raw.stage : "lead";
  const value = Number.isFinite(raw.value) && raw.value >= 0 ? Math.round(raw.value) : 0;
  const d = (v) => (parseDate(v) === null ? "" : v);
  const history = Array.isArray(raw.history)
    ? raw.history.filter((h) => h && STAGES.includes(h.stage) && parseDate(h.date) !== null).map((h) => ({ stage: h.stage, date: h.date })).slice(-30)
    : [];
  return {
    id: s(raw.id, 40) || "l" + Math.random().toString(36).slice(2, 10),
    name: s(raw.name, 120), contact: s(raw.contact, 160), source: s(raw.source, 60),
    value, stage, created: d(raw.created), lastTouch: d(raw.lastTouch), nextDate: d(raw.nextDate), nextAction: s(raw.nextAction, 200),
    notes: s(raw.notes, 2000), lostReason: s(raw.lostReason, 160), history,
  };
}

// Moves a lead to a stage, stamping the day and keeping the history the
// win-rate and cycle-time figures are computed from.
export function moveStage(lead, stage, today) {
  if (!STAGES.includes(stage) || lead.stage === stage) return lead;
  const history = [...(lead.history ?? []), { stage, date: today }].slice(-30);
  return { ...lead, stage, lastTouch: today, history };
}

export const isOpen = (l) => OPEN.includes(l.stage);

// Share of leads that reached each stage and went on to win, from your own
// history. Stages reached are read from `history` plus the created stage.
export function ownRates(leads) {
  const closed = leads.filter((l) => l.stage === "won" || l.stage === "lost");
  const won = closed.filter((l) => l.stage === "won").length;
  const reached = (l, st) => l.history?.some((h) => h.stage === st) || l.stage === st;
  const rates = {};
  for (const st of OPEN) {
    const pool = closed.filter((l) => reached(l, st) || (st === "lead"));
    const w = pool.filter((l) => l.stage === "won").length;
    rates[st] = pool.length >= 3 ? w / pool.length : null;
  }
  return { closed: closed.length, won, overall: closed.length ? won / closed.length : null, rates };
}

// Probability used for the forecast at one stage: yours once you have enough
// closed leads and enough reached that stage, the starting guess otherwise.
export function stageProbability(leads, stage) {
  const o = ownRates(leads);
  const own = o.closed >= MIN_CLOSED_FOR_OWN_RATE ? o.rates[stage] : null;
  return own !== null && own !== undefined ? { p: own, own: true } : { p: DEFAULT_PROB[stage] ?? 0, own: false };
}

export function forecast(leads) {
  const open = leads.filter(isOpen);
  let weighted = 0, total = 0;
  const byStage = {};
  for (const st of OPEN) byStage[st] = { count: 0, cents: 0, weighted: 0, p: stageProbability(leads, st) };
  for (const l of open) {
    const b = byStage[l.stage];
    const w = Math.round(l.value * b.p.p);
    b.count++; b.cents += l.value; b.weighted += w;
    total += l.value; weighted += w;
  }
  return { openCount: open.length, openCents: total, weightedCents: weighted, byStage, usingOwnRates: ownRates(leads).closed >= MIN_CLOSED_FOR_OWN_RATE };
}

// What to do today: overdue and due follow-ups first, then leads that have gone
// quiet for longer than their stage allows and have no follow-up booked.
export function followUps(leads, today) {
  const rows = [];
  for (const l of leads.filter(isOpen)) {
    if (l.nextDate) {
      const late = daysBetween(l.nextDate, today);
      if (late > 0) rows.push({ lead: l, kind: "overdue", days: late, sort: 0 - late });
      else if (late === 0) rows.push({ lead: l, kind: "today", days: 0, sort: 1 });
      else rows.push({ lead: l, kind: "upcoming", days: -late, sort: 1000 - late * -1 });
    } else {
      const since = daysBetween(l.lastTouch || l.created, today);
      if (since !== null && since >= STALE_DAYS[l.stage]) rows.push({ lead: l, kind: "quiet", days: since, sort: 500 - since });
      else rows.push({ lead: l, kind: "unscheduled", days: since ?? 0, sort: 2000 });
    }
  }
  return rows.sort((a, b) => a.sort - b.sort || b.lead.value - a.lead.value);
}

// By where the lead came from: how many, how many won, what they were worth.
export function bySource(leads) {
  const map = new Map();
  for (const l of leads) {
    const k = l.source || "Unknown";
    const r = map.get(k) ?? { source: k, leads: 0, won: 0, lost: 0, open: 0, wonCents: 0 };
    r.leads++;
    if (l.stage === "won") { r.won++; r.wonCents += l.value; } else if (l.stage === "lost") r.lost++; else r.open++;
    map.set(k, r);
  }
  return [...map.values()].map((r) => ({ ...r, winRate: r.won + r.lost > 0 ? r.won / (r.won + r.lost) : null })).sort((a, b) => b.wonCents - a.wonCents || b.leads - a.leads);
}

export function lostReasons(leads) {
  const m = new Map();
  for (const l of leads.filter((x) => x.stage === "lost")) { const k = l.lostReason.trim() || "No reason recorded"; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

// Days from the lead's first entry to win, over won leads that have both dates.
export function cycleDays(leads) {
  const days = [];
  for (const l of leads.filter((x) => x.stage === "won")) {
    const end = [...(l.history ?? [])].reverse().find((h) => h.stage === "won")?.date;
    const d = l.created && end ? daysBetween(l.created, end) : null;
    if (d !== null && d >= 0) days.push(d);
  }
  if (!days.length) return null;
  const s = [...days].sort((a, b) => a - b);
  const mid = s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
  return { n: days.length, median: mid };
}

// The plain question a freelancer has: how much pipeline do I need to hit a
// monthly target, given how often I win? Value per win comes from your won
// leads, or from the open pipeline average if there are none yet.
export function pipelineNeeded(leads, targetCents) {
  const o = ownRates(leads);
  const wins = leads.filter((l) => l.stage === "won" && l.value > 0);
  const open = leads.filter((l) => isOpen(l) && l.value > 0);
  const avg = wins.length ? wins.reduce((s, l) => s + l.value, 0) / wins.length : open.length ? open.reduce((s, l) => s + l.value, 0) / open.length : null;
  if (!targetCents || avg === null) return null;
  const rate = o.closed >= MIN_CLOSED_FOR_OWN_RATE && o.overall ? o.overall : null;
  const usedRate = rate ?? 0.25;
  const winsNeeded = Math.ceil(targetCents / avg);
  return { avgCents: Math.round(avg), winsNeeded, leadsNeeded: Math.ceil(winsNeeded / usedRate), rate: usedRate, ownRate: rate !== null };
}

// Things worth hearing before you open the pipeline: no invented numbers.
export function check(leads, today) {
  const out = [];
  const open = leads.filter(isOpen);
  const noNext = open.filter((l) => !l.nextDate).length;
  if (noNext) out.push(`${noNext} open lead${noNext === 1 ? " has" : "s have"} no follow-up date. A lead with no next step is how a good one goes cold.`);
  const noValue = open.filter((l) => !l.value).length;
  if (noValue) out.push(`${noValue} open lead${noValue === 1 ? " has" : "s have"} no value, so the forecast leaves ${noValue === 1 ? "it" : "them"} at zero.`);
  const stalledProposals = open.filter((l) => l.stage === "proposal" && daysBetween(l.lastTouch || l.created, today) >= 10).length;
  if (stalledProposals) out.push(`${stalledProposals} proposal${stalledProposals === 1 ? " has" : "s have"} had no contact for 10 days or more. A short check-in now beats finding out in a month.`);
  const f = forecast(leads);
  if (f.openCents > 0) {
    const biggest = open.reduce((a, b) => (b.value > a.value ? b : a), open[0]);
    if (biggest.value / f.openCents > 0.6 && open.length > 1) out.push(`${biggest.name || "One lead"} is over 60% of the open pipeline. If it falls through, most of it goes.`);
  }
  if (open.length === 0 && leads.length > 0) out.push("Nothing is open right now. The best time to add leads is while you are busy.");
  return out;
}

// Opens Freelance Proposal Maker with the client, title and contact filled in.
// Text only, in the URL fragment (never sent to a server); the receiver
// whitelists the fields.
export function proposalHandoffHash(lead, currency = "USD") {
  const f = { client: lead.name, contact: lead.contact, currency };
  if (lead.notes) f.problem = lead.notes;
  if (lead.value > 0) f.budget = (lead.value / 100).toFixed(2);
  return "#handoff=" + encodeURIComponent(JSON.stringify({ v: 1, from: "freelance-lead-tracker", proposal: f }));
}

// CSV for a spreadsheet: one row per lead.
export function toCsv(leads, currency = "USD") {
  const q = (v) => { const s = String(v ?? ""); return /^[=+\-@\t\r]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ["name", "contact", "source", "stage", `value ${currency}`, "created", "last contact", "next follow-up", "next action", "lost reason", "notes"];
  const rows = leads.map((l) => [l.name, l.contact, l.source, STAGE_LABEL[l.stage], (l.value / 100).toFixed(2), l.created, l.lastTouch, l.nextDate, l.nextAction, l.lostReason, l.notes].map(q).join(","));
  return [head.join(","), ...rows].join("\n") + "\n";
}

// A small example so a new visitor sees the whole thing working.
export function exampleLeads(today) {
  const d = (n) => addDays(today, n);
  const mk = (o) => cleanLead({ ...o, history: o.history ?? [] });
  return [
    mk({ id: "ex1", name: "Acme Dental (example)", contact: "office@acme.example", source: "Referral", value: 600000, stage: "proposal", created: d(-12), lastTouch: d(-9), nextDate: d(-2), nextAction: "Ask if they have questions on option 2", history: [{ stage: "contacted", date: d(-10) }, { stage: "proposal", date: d(-9) }] }),
    mk({ id: "ex2", name: "Bright Bakery (example)", contact: "hello@bright.example", source: "Website or search", value: 250000, stage: "contacted", created: d(-3), lastTouch: d(-1), nextDate: d(2), nextAction: "Send two portfolio links", history: [{ stage: "contacted", date: d(-1) }] }),
    mk({ id: "ex3", name: "Orbit Logistics (example)", contact: "ops@orbit.example", source: "LinkedIn", value: 1400000, stage: "negotiating", created: d(-30), lastTouch: d(-3), nextDate: d(0), nextAction: "Call about scope and start date", history: [{ stage: "contacted", date: d(-27) }, { stage: "proposal", date: d(-20) }, { stage: "negotiating", date: d(-3) }] }),
    mk({ id: "ex4", name: "Pine Street Yoga (example)", contact: "", source: "Cold outreach", value: 0, stage: "lead", created: d(-8), lastTouch: "", nextDate: "", nextAction: "" }),
    mk({ id: "ex5", name: "Delta Realty (example)", source: "Referral", value: 480000, stage: "won", created: d(-45), lastTouch: d(-20), history: [{ stage: "contacted", date: d(-44) }, { stage: "proposal", date: d(-38) }, { stage: "won", date: d(-20) }] }),
    mk({ id: "ex6", name: "Kite Apparel (example)", source: "Upwork or marketplace", value: 300000, stage: "lost", created: d(-40), lastTouch: d(-25), lostReason: "Went with a cheaper quote", history: [{ stage: "contacted", date: d(-39) }, { stage: "proposal", date: d(-33) }, { stage: "lost", date: d(-25) }] }),
  ];
}
