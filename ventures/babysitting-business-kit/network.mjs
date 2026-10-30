// Babysitting Business Kit: the trusted-sitter network. Overflow work goes to sitters the
// sitter knows and trusts instead of being lost, and work they pass back is tracked.
//
// desk.network = {
//   sitters: [{ id, name, contact, ages ("6 months-12"), maxKids, area, availability
//              ("Mon-Fri 15-22"), notes, cprSeen (true when she has seen their card),
//              cprSeenOn, peerId + peerUrl (+ peerSecret) when they run this kit too }],
//   sent:    [{ id, date, from: "lead"|"booking", leadId, bookingKey, familyId, firstName,
//              kids (ages), when, sitterId, consent: { share, contact, at, how, note },
//              status: "suggested"|"asked"|"passed on"|"booked"|"declined", handoff }],
// }
// Referrals in are leads: a lead with referredBySitter (from a server handoff) or whose
// "How did you hear" names a backup sitter. Families referring families stay in
// print.mjs (creditReferral, sourceStats); this file reuses them.
//
// Privacy: a family's contact goes to a backup only after the family said yes, and the
// yes is recorded with its time and how it was given. The server handoff carries only
// a first name, the kids' ages and the requested time. A family's religion is never an
// input to anything here.

import { DAYS, dayOf, addDays, parseAgeMonths, fmtAge, scheduleFit, expandBookings, newId, scoreLead } from "./engine.mjs";
import { sourceStats } from "./print.mjs";

const str = (x, n = 200) => String(x ?? "").trim().slice(0, n);
const firstWord = (s) => str(s).split(/\s+/)[0] || "";

export function emptyNetwork() { return { sitters: [], sent: [] }; }
export function normalizeNetwork(n) {
  const out = emptyNetwork();
  if (!n || typeof n !== "object") return out;
  for (const k of ["sitters", "sent"]) out[k] = Array.isArray(n[k]) ? n[k].filter((x) => x && typeof x === "object") : [];
  return out;
}
export const networkOf = (desk) => normalizeNetwork(desk && desk.network);

// ---- ages a backup takes: "6 months-12", "2-10", "1+", "infants to 8"
export function parseAgeRange(text) {
  const s = String(text || "").toLowerCase().replace(/\binfants?\b|\bnewborns?\b/g, "0 months").replace(/\s+to\s+/g, "-").trim();
  if (!s) return null;
  const plus = /^(.+?)\s*(\+|and up|or older)$/.exec(s);
  if (plus) { const lo = parseAgeMonths(plus[1]); return lo === null ? null : [lo, Infinity]; }
  const parts = s.split(/\s*-\s*/);
  if (parts.length !== 2) { const one = parseAgeMonths(s); return one === null ? null : [one, one + 11]; }
  let [a, b] = parts;
  // "6 months-12" reads the second number as years; "6-18 months" puts both in months.
  if (/m/.test(b) && !/[a-z]/.test(a)) a = `${a} months`;
  const lo = parseAgeMonths(a), hi = parseAgeMonths(b);
  if (lo === null || hi === null) return null;
  return [lo, /m/.test(b) ? hi : hi + 11]; // "to 12" includes twelve-year-olds
}

export function monthsOld(birth, onDate) {
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birth || ""));
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(onDate || ""));
  if (!b || !d) return null;
  let m = (Number(d[1]) - Number(b[1])) * 12 + (Number(d[2]) - Number(b[2]));
  if (Number(d[3]) < Number(b[3])) m--;
  return Math.max(0, m);
}

// ---- a request she cannot take, from a lead or from one of her own booked sits
export function requestFromLead(lead) {
  const kids = (Array.isArray(lead.kids) ? lead.kids : String(lead.kids || "").split(/[,;]/)).map((k) => parseAgeMonths(k)).filter((x) => x !== null);
  return { from: "lead", leadId: lead.id, firstName: firstWord(lead.name), contact: str(lead.contact), kids, when: str(lead.schedule), weekly: str(lead.schedule) };
}
export function requestFromSit(desk, sit) {
  const fam = (desk.families || []).find((f) => f.id === sit.familyId) || {};
  const kids = (fam.kids || []).map((k) => monthsOld(k.birth, sit.date)).filter((x) => x !== null);
  const day = DAYS[dayOf(sit.date)];
  return {
    from: "booking", bookingKey: sit.key || sit.id, familyId: fam.id || "", date: sit.date, start: sit.start, end: sit.end,
    firstName: firstWord(fam.contactName) || str(fam.name), contact: str(fam.contact), kids,
    when: `${day} ${sit.date} ${sit.start}-${sit.end}`, weekly: `${day} ${sit.start}-${sit.end}`,
  };
}
const agesText = (kids) => (kids.length ? kids.map((m) => fmtAge(m).replace(/ years$/, "")).join(" and ") : "");
const kidsPhrase = (kids) => (kids.length ? `${kids.length === 1 ? "one child" : `${kids.length} kids`} (${agesText(kids)}${kids.every((m) => m >= 24) ? (kids.length === 1 ? " years old" : "") : ""})` : "the kids");

// ---- which backup to suggest: ages, availability, how many kids, CPR card seen.
// Area is only a note: she knows whether "Riverside" is near the family.
export function suggestBackups(desk, req, { exclude = [] } = {}) {
  const out = [];
  for (const s of networkOf(desk).sitters) {
    if (s.active === false || exclude.includes(s.id)) continue;
    let score = 50;
    const reasons = [], cautions = [];
    const range = parseAgeRange(s.ages);
    if (range && req.kids.length) {
      const outside = req.kids.filter((m) => m < range[0] || m > range[1]);
      if (outside.length) { score -= 40; cautions.push(`takes ${s.ages}; this family has ${agesText(outside)}`); }
      else { score += 15; reasons.push(`takes ages ${s.ages}`); }
    } else if (req.kids.length) cautions.push("ask which ages they take");
    const max = Number(s.maxKids);
    if (max > 0 && req.kids.length > max) { score -= 30; cautions.push(`takes up to ${max} kids`); }
    if (s.availability && req.weekly) {
      const fit = scheduleFit(s.availability, req.weekly);
      if (fit === null) cautions.push("check their availability");
      else if (fit >= 0.99) { score += 20; reasons.push(`usually free then (${s.availability})`); }
      else if (fit > 0) { score += 5; reasons.push(`partly free then (${Math.round(fit * 100)}%)`); }
      else { score -= 25; cautions.push(`not usually free then (${s.availability})`); }
    } else cautions.push("ask if they are free");
    if (s.cprSeen) { score += 10; reasons.push(`you have seen their CPR card${s.cprSeenOn ? ` (${s.cprSeenOn})` : ""}`); }
    else cautions.push("you have not seen their CPR card");
    if (s.area) reasons.push(`area: ${s.area}`);
    out.push({ sitter: s, score: Math.max(0, Math.min(100, score)), reasons, cautions });
  }
  return out.sort((a, b) => b.score - a.score || String(a.sitter.name).localeCompare(String(b.sitter.name)));
}

// ---- consent
export const CONSENT_HOW = ["text", "email", "call", "in person"];
export function recordConsent(entry, { share = true, contact = false, how = "text", note = "" } = {}, at = new Date().toISOString()) {
  return { ...entry, consent: { share: !!share, contact: !!(share && contact), how: CONSENT_HOW.includes(how) ? how : "text", note: str(note, 300), at } };
}
export const canShare = (entry) => !!(entry && entry.consent && entry.consent.share && entry.consent.at);
export const canShareContact = (entry) => canShare(entry) && !!entry.consent.contact;

// ---- drafts
export function familyMessage(desk, req, sitter, { reason = "booked" } = {}) {
  const me = firstWord(desk.profile && desk.profile.name) || "your sitter";
  const name = firstWord(sitter.name) || "a friend";
  const why = reason === "sick" ? `I'm sorry: I'm sick and can't safely sit ${req.date ? `on ${req.when.replace(/^\w+ /, `${DAYS[dayOf(req.date)]} `)}` : "then"}.` : `Thank you so much for thinking of me! I'm already booked${req.when ? ` for ${req.when}` : " then"}.`;
  const cpr = sitter.cprSeen ? ` I've seen ${name}'s current CPR card.` : "";
  return [
    `Hi ${req.firstName || "there"},`,
    "",
    `${why} But my friend ${sitter.name} is wonderful, and someone I trust.${cpr}`,
    "",
    `Would you like me to pass on your first name, the kids' ages and the time to ${name}? I'll only give ${name} your number if you say so, or I can send you ${name}'s contact instead.`,
    reason === "sick" ? "\nIf you'd rather cancel, there is no fee at all. Just let me know." : "",
    "",
    `Thank you, ${me}`,
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
}

export function backupMessage(desk, req, sitter, entry = {}) {
  const me = firstWord(desk.profile && desk.profile.name) || "me";
  const contactLine = canShareContact(entry) && req.contact
    ? `They said I can share their contact: ${req.firstName}, ${req.contact}.`
    : canShare(entry)
      ? `They're happy for me to pass this on; I'll share their number once you say you're free.`
      : `I haven't shared their details yet; I'll ask them first if you're free.`;
  return [
    `Hi ${firstWord(sitter.name) || "there"}, it's ${me}.`,
    `A family I know needs a sitter${req.when ? ` ${/^\w{3} \d/.test(req.when) ? "on" : "for"} ${req.when}` : ""}: ${req.firstName ? `${req.firstName}, ` : ""}${kidsPhrase(req.kids)}. I can't take it. Are you free and interested?`,
    contactLine,
    "Thank you!",
  ].join("\n");
}

// Start a pass-on record (status "suggested") for a lead or sit and a chosen backup.
export function passOn(desk, req, sitterId, today, id = newId("net")) {
  return { id, date: today, from: req.from, leadId: req.leadId || "", bookingKey: req.bookingKey || "", familyId: req.familyId || "", firstName: req.firstName, kids: req.kids.map((m) => fmtAge(m)), when: req.when, sitterId, status: "suggested" };
}

// ---- leads she cannot take: any blocker except budget, or a status she set
export function overflowLeads(desk) {
  return (desk.leads || []).filter((l) => !["booked", "lost"].includes(l.status)).map((l) => ({ lead: l, score: scoreLead(l, desk.profile) }))
    .filter(({ lead, score }) => lead.status === "declined" || score.blockers.length).map(({ lead, score }) => ({ lead, blockers: score.blockers }));
}

// ---- sub-for-me: her booked sits in the next N days, each with a backup or a no-fee cancel
export function subForMe(desk, today, days = 3) {
  const end = addDays(today, Math.max(1, Math.min(30, Number(days) || 3)) - 1);
  const sits = expandBookings(desk.bookings || []).filter((b) => b.date >= today && b.date <= end && !["cancelled", "done"].includes(b.status));
  return sits.map((sit) => {
    const req = requestFromSit(desk, sit);
    const best = suggestBackups(desk, req).filter((x) => x.score >= 50)[0] || null;
    const fam = (desk.families || []).find((f) => f.id === sit.familyId);
    const cancel = [
      `Hi ${req.firstName || "there"},`,
      "",
      `I'm so sorry: I'm sick and can't safely sit for you on ${DAYS[dayOf(sit.date)]} ${sit.date}, ${sit.start}-${sit.end}. There's no cancellation fee, of course.`,
      best ? `If it helps, my friend ${best.sitter.name} may be free; I can ask, with your OK.` : "",
      "",
      `I hope to see you all soon. ${firstWord(desk.profile && desk.profile.name)}`,
    ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
    return { sit, family: fam ? fam.name : "", req, backup: best, offer: best ? familyMessage(desk, req, best.sitter, { reason: "sick" }) : "", cancel };
  });
}

// Cancel one sit with no fee: a date of a weekly repeat is skipped, a single sit is
// marked cancelled by the sitter. Returns new bookings; the desk is not changed.
export function cancelNoFee(bookings, key, today) {
  const [id, n] = String(key).split("#");
  return bookings.map((b) => {
    if (b.id !== id) return b;
    if (n !== undefined) { const date = addDays(b.date, 7 * Number(n)); return { ...b, skip: [...new Set([...(b.skip || []), date])].sort() }; }
    return { ...b, status: "cancelled", cancelledBy: "sitter", cancelledOn: today, cancelFee: 0 };
  });
}

// ---- referrals both ways
export function sitterReferrer(lead, sitters) {
  if (lead.referredBySitter) return sitters.find((s) => s.id === lead.referredBySitter || (s.peerId && s.peerId === lead.referredBySitter)) || { id: lead.referredBySitter, name: (lead.handoff && lead.handoff.from) || lead.referredBySitter };
  const src = String(lead.source || "").toLowerCase();
  if (!src.trim()) return null;
  const full = sitters.filter((s) => s.name && src.includes(String(s.name).toLowerCase()));
  if (full.length === 1) return full[0];
  const first = sitters.filter((s) => { const f = firstWord(s.name).toLowerCase(); return f.length > 2 && new RegExp(`\\b${f.replace(/[^a-z]/g, "")}\\b`).test(src); });
  return first.length === 1 ? first[0] : null;
}

export function networkStats(desk) {
  const net = networkOf(desk);
  const byId = Object.fromEntries(net.sitters.map((s) => [s.id, s]));
  const out = new Map();
  for (const e of net.sent) {
    const r = out.get(e.sitterId) || { sitterId: e.sitterId, sitter: (byId[e.sitterId] || {}).name || "(removed)", sent: 0, booked: 0 };
    r.sent++; if (e.status === "booked") r.booked++;
    out.set(e.sitterId, r);
  }
  const inn = new Map();
  for (const l of desk.leads || []) {
    const s = sitterReferrer(l, net.sitters);
    if (!s) continue;
    const r = inn.get(s.id) || { sitterId: s.id, sitter: s.name, leads: 0, booked: 0 };
    r.leads++; if (l.status === "booked") r.booked++;
    inn.set(s.id, r);
  }
  const sentOut = [...out.values()].sort((a, b) => b.sent - a.sent);
  const fromSitters = [...inn.values()].sort((a, b) => b.leads - a.leads);
  return {
    sentOut, fromSitters,
    fromFamilies: sourceStats(desk).referrers, // families who sent her families (print.mjs)
    totals: { sent: net.sent.length, sentBooked: net.sent.filter((e) => e.status === "booked").length, received: fromSitters.reduce((a, r) => a + r.leads, 0), receivedBooked: fromSitters.reduce((a, r) => a + r.booked, 0) },
  };
}
