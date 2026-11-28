// Notice of intent to lien: the states whose statute makes a notice before the lien a condition of it,
// the last day to serve it (counted back from the day you will file the lien), the lien filing date it
// is counted from where the statute dates it from your own last furnishing, and a draft notice
// (Wyoming's statutory form word for word; elsewhere a plain letter carrying what the statute asks for).
//
// Source: each statute read on the legislature's own site on 2026-11-28 and kept in sources/noi.txt
// (noi.test.mjs checks every quoted phrase and the Wyoming form against it):
//   Colorado     C.R.S. 38-22-109(3), (5)        10 days before filing, owner AND prime contractor
//   Missouri     RSMo 429.100 (and 429.080)       10 days before filing, served by an officer or witness
//   North Dakota N.D.C.C. 35-27-02(4), 35-27-13   10 days before recording, certified mail
//   Wyoming      W.S. 29-2-107, 29-10-102, 29-2-106(a)   20 days before filing, the statutory form
// Wisconsin (779.06(2)) and Pennsylvania (49 P.S. 1501(c)) also have one, but their sites did not answer
// from this session, so they are named and not dated: nothing here is written from memory.
//
// Day counting: "at least ten days before" and "no later than twenty (20) days prior to" are counted
// back in calendar days from the filing day, so the serve-by day is filing day less 10 (or 20). Nothing
// is moved off a weekend or holiday; the page says to serve early instead. Lien dates follow PayApps'
// own lien-deadline.ts (Colorado four months, same day of the month, clamped to the month's end).
// Pure functions, no I/O.

import { parseDate, isoDate } from "./prelim.mjs";

export { parseDate, isoDate };

const DAY = 86400000;
const addDays = (t, n) => t + n * DAY;
const days = (a, b) => Math.round((b - a) / DAY);

/** Same day of the month N months later, clamped to the month's last day (PayApps' addMonths). */
export function addMonths(t, months) {
  const d = new Date(t);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + months + 1, 0)).getUTCDate();
  return Date.UTC(y, m + months, Math.min(day, last));
}

export const STATES = {
  CO: {
    name: "Colorado",
    days: 10,
    citation: "C.R.S. § 38-22-109(3)",
    url: "https://content.leg.colorado.gov/sites/default/files/images/olls/crs2024-title-38.pdf",
    act: "file the lien statement with the county clerk and recorder",
    lienWord: "lien statement",
    to: (role) => role === "direct"
      ? ["The owner or reputed owner of the property, or the owner's agent"]
      : ["The owner or reputed owner of the property, or the owner's agent", "The principal or prime contractor, or its agent"],
    how: "By personal service, or by registered or certified mail, return receipt requested, to each person's last-known address (§ 38-22-109(3)).",
    proof: "An affidavit of the service or mailing is filed for record with the lien statement, and is the proof of service (§ 38-22-109(3)).",
    excluded: () => null,
    lienBy: ({ last }) => ({ t: addMonths(last, 4), rule: "four months after the last day you performed labor or furnished laborers or materials (§ 38-22-109(5))" }),
    lienNote: "Labor only, paid by the day or piece, has two months after completion of the improvement instead (§ 38-22-109(4)).",
  },
  MO: {
    name: "Missouri",
    days: 10,
    citation: "RSMo § 429.100",
    url: "https://revisor.mo.gov/main/OneSection.aspx?section=429.100",
    act: "file the lien with the clerk of the circuit court",
    lienWord: "lien",
    to: () => ["The owner, owners or agent, or either of them"],
    how: "Served by any officer authorized by law to serve process in civil actions, or by any person who would be a competent witness (§ 429.100). The statute names no mail service, so hand delivery by a process server is the plain reading.",
    proof: "When an officer serves it, the officer's official return endorsed on it is the proof; when anyone else serves it, the person who served it signs an affidavit of service (§ 429.100).",
    excluded: (role) => role === "direct"
      ? "Missouri's ten-day notice is required of every person except the original contractor (§ 429.100). If you contracted directly with the owner, this notice is not yours to give; your lien still has to be filed within six months after the indebtedness accrued (§ 429.080)."
      : null,
    lienBy: () => null,
    lienNote: "The lien itself is filed “within six months after the indebtedness shall have accrued” (§ 429.080). When a debt accrues depends on the contract, so this page does not date it: enter the day you will file.",
  },
  ND: {
    name: "North Dakota",
    days: 10,
    citation: "N.D.C.C. § 35-27-02(4)",
    url: "https://www.ndlegis.gov/cencode/t35c27.pdf",
    act: "record the construction lien with the county recorder",
    lienWord: "construction lien",
    to: () => ["The legal or equitable owner of the real estate"],
    how: "By certified mail (§ 35-27-02(4)).",
    proof: "Keep the certified mail receipt and a copy of the notice with the lien papers.",
    excluded: () => null,
    lienBy: ({ last }) => ({ t: addDays(last, 90), rule: "ninety days after all your contribution is done (§ 35-27-13)" }),
    lienNote: "A lien recorded after the ninety days is not lost outright, but it does not hold against good-faith purchasers or encumbrancers whose rights come first, or against the owner for what the owner paid the contractor before the lien was recorded; and no lien may be filed more than three years after the first item of material was furnished (§ 35-27-14).",
  },
  WY: {
    name: "Wyoming",
    days: 20,
    citation: "W.S. § 29-2-107",
    url: "https://wyoleg.gov/statutes/compress/title29.pdf",
    act: "file the lien statement",
    lienWord: "lien statement",
    to: () => ["The record owner of the property, or the owner's agent (one form for each owner)"],
    how: "The statutory form is headed CERTIFIED MAIL, RETURN RECEIPT REQUESTED (W.S. § 29-10-102). Send one to each record owner.",
    proof: "Keep the certified mail receipt and the green return card with your copy of the notice.",
    excluded: () => null,
    lienBy: ({ last, completed, role }) => {
      const n = role === "direct" ? 150 : 120;
      const who = role === "direct" ? "a contractor" : "everyone other than a contractor";
      let from = last, what = "the last day you performed work or furnished materials";
      if (completed !== null && completed < last) { from = completed; what = "substantial completion of the project, which you entered as earlier than your last day"; }
      return { t: addDays(from, n), rule: `${n} days after ${what} (§ 29-2-106(a), the time for ${who})` };
    },
    lienNote: "The 120 or 150 days run from the earlier of your last day of work or materials and substantial completion of the project; a recorded notice of substantial completion is presumed to be that date (§ 29-2-106(a), (c)).",
  },
};

export const UNDATED = [
  { name: "Wisconsin", cite: "Wis. Stat. § 779.06(2)" },
  { name: "Pennsylvania", cite: "49 P.S. § 1501(c)" },
];

export const ROLES = {
  sub: "A subcontractor or supplier (hired by the GC or by another sub)",
  direct: "I contracted directly with the owner (the original or prime contractor)",
};

const state = (s) => STATES[String(s ?? "").trim().toUpperCase()] ?? null;

/** When to serve the notice, and the lien date it is counted back from. */
export function noiDates({ state: code, role = "sub", last = "", completed = "", file = "", served = "", today = "" } = {}) {
  const st = state(code);
  const errors = [];
  if (!st) return { errors: ["Choose one of the states listed."], needed: false };
  const excluded = st.excluded(role);
  const opt = (v, label) => {
    if (!String(v ?? "").trim()) return null;
    const t = parseDate(v);
    if (Number.isNaN(t)) { errors.push(`${label}: use YYYY-MM-DD, a real date.`); return null; }
    return t;
  };
  const lastT = opt(last, "Last day you furnished"), compT = opt(completed, "Substantial completion");
  const fileT = opt(file, "Day you will file"), servedT = opt(served, "Day served"), todayT = opt(today, "Today");
  if (lastT !== null && fileT !== null && fileT < lastT) errors.push("The filing day is before your last day of work: a lien is filed after you finish.");
  if (errors.length) return { errors, needed: !excluded };

  const out = { errors, needed: !excluded, excluded, name: st.name, citation: st.citation, days: st.days, act: st.act, notes: [] };
  if (excluded) return out;

  const lien = lastT !== null ? st.lienBy({ last: lastT, completed: compT, role }) : null;
  if (lien) { out.lienBy = isoDate(lien.t); out.lienRule = lien.rule; }
  out.notes.push(st.lienNote);

  const fileOn = fileT ?? lien?.t ?? null;
  if (fileOn === null) {
    out.notes.push(st.lienBy({ last: 0, completed: null, role })
      ? "Enter your last day of work, or the day you will file, to date the notice."
      : "Enter the day you will file the lien to date the notice.");
    return out;
  }
  out.fileOn = isoDate(fileOn);
  out.fileBasis = fileT !== null ? "the day you entered" : "the last day to file";
  if (lien && fileT !== null && fileT > lien.t) out.notes.unshift(`The day you entered to file, ${isoDate(fileT)}, is after the last day to ${st.act}, ${isoDate(lien.t)}. Plan on that date instead.`);

  const serveBy = addDays(fileOn, -st.days);
  out.serveBy = isoDate(serveBy);
  if (lastT !== null && serveBy < lastT) out.notes.push("The serve-by day is before your last day of work. Nothing stops you serving while you still work, but count the lien deadline from your real last day.");
  if (todayT !== null) {
    const left = days(todayT, serveBy);
    out.status = { daysLeft: left, state: left < 0 ? "past" : left === 0 ? "today" : left <= 7 ? "soon" : "open" };
    if (left < 0 && lien) {
      const latest = addDays(lien.t, -st.days);
      out.notes.unshift(latest >= todayT
        ? `That day has passed. Served today, the earliest you could file is ${isoDate(addDays(todayT, st.days))}, still inside the ${isoDate(lien.t)} deadline: serve now.`
        : `Served today, the earliest you could file is ${isoDate(addDays(todayT, st.days))}, after the ${isoDate(lien.t)} deadline. Talk to a construction attorney today about what is left.`);
    }
  }
  if (servedT !== null) {
    out.served = isoDate(servedT);
    out.earliestFile = isoDate(addDays(servedT, st.days));
    out.servedOk = servedT <= serveBy;
    if (lien && addDays(servedT, st.days) > lien.t) out.servedNote = `Served ${isoDate(servedT)}, the earliest filing day is ${out.earliestFile}, after the last day to file (${isoDate(lien.t)}).`;
  }
  return out;
}

// W.S. § 29-10-102(a), word for word (blanks filled from the fields). sources/noi.txt has the original.
export const WY_NOTE = "Note to lien claimant: This form, if filled out correctly and sent within the time periods specified in W.S. 29-2-107 constitutes prima facie evidence that you have provided the contents of the notice required by W.S. 29-2-107(a). If you have any questions regarding how to fill out this form or whether it has been filled out properly, you should consult an attorney.";
export const WY_HEAD = "CERTIFIED MAIL, RETURN RECEIPT REQUESTED";
export const WY_TO_CAPTION = "Record owner or agent of owner (note: If there is more than one (1) owner, use a form for each owner)";
export const WY_RE = "Re: Notice of Intention to File Lien";
export const wyBody = ({ claimant, amount, dueFrom }) => [
  `You are hereby notified pursuant to W.S. 29-2-107 that ${claimant} (hereinafter the "lien claimant") intends to file a lien against your property.`,
  `The amount of the lien claim is $${amount}. This amount is due from ${dueFrom} (person/entity whose actions have caused a lien to be filed) pursuant to a contract with the lien claimant under which the lien claimant performed work or supplied materials for the work.`,
  "If we are unable to resolve this matter within twenty (20) days from the date of this notice, the lien claimant intends to file the lien statement asserting a lien against your property.",
];

const BLANK = "________________";
// A plain amount only: 1250, 1,250.5, $18,400.00. Not 1e3, 0x10 or a blank (Number() takes those).
const AMOUNT = /^\d{1,3}(,\d{3})*(\.\d{1,2})?$|^\d+(\.\d{1,2})?$/;
const money = (v) => {
  const s = String(v ?? "").replace(/^\s*\$\s*/, "").trim();
  if (!AMOUNT.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  return n > 0 ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;
};

/**
 * A draft notice. Fields: owner, prime (Colorado), claimant, dueFrom, amount, property, county,
 * work, first, last, date, signer, title, cc.
 */
export function draftNotice(code, f = {}) {
  const st = state(code);
  if (!st) return { text: "", missing: ["the state"] };
  const v = (k) => String(f[k] ?? "").trim();
  const missing = [];
  const need = (k, label) => { if (!v(k)) { missing.push(label); return BLANK; } return v(k); };
  const amt = money(f.amount);
  if (!amt) missing.push("the amount claimed");
  const amount = amt ?? BLANK;

  if (code === "WY") {
    const lines = [WY_HEAD, "", `To: ${need("owner", "the record owner (or agent) and address")}`, WY_TO_CAPTION, "", `Date: ${need("date", "the date")}`, "", WY_RE, "",
      ...wyBody({ claimant: need("claimant", "your company (the lien claimant)"), amount, dueFrom: need("dueFrom", "who owes the money") })];
    lines.push("", `cc: ${v("cc") || BLANK}`);
    lines.push("", `${v("claimant") || BLANK}`, `By: ${need("signer", "who signs")}${v("title") ? `, ${v("title")}` : ""}`);
    return { text: lines.join("\n"), missing, statutory: true };
  }

  const toList = [need("owner", "the owner (or agent) and address")];
  if (code === "CO") toList.push(need("prime", "the prime contractor and address"));
  const claimant = need("claimant", "your company and address");
  const dueFrom = need("dueFrom", "who owes the money");
  const property = need("property", "the property address or legal description");
  const county = need("county", "the county");
  const work = need("work", "what you furnished");
  const span = v("first") && v("last") ? ` from ${v("first")} to ${v("last")}` : v("last") ? ` through ${v("last")}` : "";
  const lines = [
    `NOTICE OF INTENT TO ${code === "ND" ? "CLAIM A CONSTRUCTION LIEN" : code === "CO" ? "FILE A LIEN STATEMENT" : "FILE A MECHANIC'S LIEN"}`,
    `Under ${st.citation}`,
    "",
    `Date: ${need("date", "the date")}`,
    "",
    ...toList.map((t, i) => `${i === 0 ? "To" : "And to"}: ${t}`),
    "",
    `Property: ${property}, ${county} County, ${st.name}`,
    "",
    `${claimant} holds a claim against the building or improvement on the property above for ${work}${span}.`,
    `The amount due is $${amount}, due from ${dueFrom.replace(/\.+$/, "")}.`,
    `Unless it is paid, ${v("claimant") ? v("claimant").split(",")[0] : "the claimant"} intends to ${st.act} when ${st.days} days have passed after this notice is served.`,
    "",
    `${v("claimant") ? v("claimant").split(",")[0] : BLANK}`,
    `By: ${need("signer", "who signs")}${v("title") ? `, ${v("title")}` : ""}`,
  ];
  return { text: lines.join("\n"), missing, statutory: false };
}
