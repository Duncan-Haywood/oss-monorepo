// Arizona preliminary twenty day notice (private works): who must get it, the 20-day date, what a
// late notice still covers, when proof by affidavit takes over from the acknowledgment, when a new
// notice is needed (estimate up 30% or more), the lien recording date that follows, and a draft
// that follows the A.R.S. § 33-992.01(D) form with its statutory statements word for word.
//
// Source: A.R.S. §§ 33-981, 33-992.01, 33-992.02, 33-993 and 33-1002, text from www.azleg.gov read
// 2026-11-28, kept in sources/az-33.txt (azprelim.test.mjs checks every quoted phrase against it).
// Public works (payment bonds, § 34-223) and owner-occupied dwellings (§ 33-1002) are named, not
// dated.
//
// Day counting: § 33-992.01(C) says "not later than twenty days after the claimant has first
// furnished", so the last day is first furnished + 20 calendar days. § 33-992.01(F): mailed notice
// "is complete at the time of the deposit of notice in the mail", so the mail-by day is the last
// day. A late notice reaches only items "furnished within twenty days before the service of the
// notice and at any time thereafter" (§ 33-992.01(E)): the earliest covered day is the mailing day
// less 20. § 33-992.02(2): when the acknowledgment is not returned "within thirty days from the date
// of mailing", proof is by the mailer's affidavit. § 33-993(A): record the lien within 120 days after
// completion, or 60 days after a recorded notice of completion. Nothing here moves a date off a
// weekend or holiday; the page says to mail early instead. Pure functions, no I/O.

import { parseDate, isoDate } from "./prelim.mjs";

export { parseDate, isoDate };

const DAY = 86400000;
const addDays = (t, n) => t + n * DAY;
const days = (a, b) => Math.round((b - a) / DAY);

// § 33-992.01(F): the three mail services the statute names; each is complete on deposit.
export const METHODS = {
  certified: { label: "Certified mail", rule: "complete when deposited in the mail (§ 33-992.01(F))" },
  registered: { label: "Registered mail", rule: "complete when deposited in the mail (§ 33-992.01(F))" },
  firstclass: { label: "First class mail with a certificate of mailing", rule: "complete when deposited in the mail (§ 33-992.01(F)); keep the certificate of mailing for the affidavit (§ 33-992.02(2))" },
};

export const ROLES = {
  sub: "A subcontractor or supplier (hired by the GC or by another sub)",
  direct: "I contracted directly with the owner (the original contractor)",
  laborer: "A worker paid wages for my own labor",
  occupant: "A sub or supplier on an owner-occupant's own home",
};

// § 33-992.01(B): who is served. § 33-1002(B): no lien on an owner-occupant's dwelling except by a
// person with a written contract directly with the owner-occupant.
export function recipients(role) {
  if (role === "laborer") return { needed: false, to: [], why: "A person performing actual labor for wages is not required to give the preliminary twenty day notice (§ 33-992.01(B))." };
  if (role === "occupant") return {
    needed: false,
    to: [],
    why: "On the dwelling (one- or two-family home or condominium unit) of a person who owned it and meant to live in it before the work began, no lien is allowed except by a person with a written contract directly with that owner-occupant (§ 33-1002(B)), and a waiver of that rule in the contract is void (§ 33-1002(C)). A sub or supplier there has no lien right for a notice to protect; look to the contractor who hired you, and to any payment bond. If the owner is a company, a builder or an investor, the home is not owner-occupied: choose subcontractor or supplier.",
  };
  if (role === "direct") return {
    needed: true,
    to: ["The owner or reputed owner (who is also the person you contracted with)", "The construction lender, if there is one"],
    why: "The statute exempts only wage laborers, so an original contractor gives the notice too: to the owner and to the construction lender, if any (§ 33-992.01(B)). Without it, and proof of mailing, the lien cannot be enforced (§ 33-981(D)).",
  };
  return {
    needed: true,
    to: [
      "The owner or reputed owner",
      "The original contractor (the GC with the contract with the owner) or reputed contractor",
      "The construction lender, if there is one, or reputed lender",
      "The person you contracted with (the sub or supplier who hired you, if not the GC)",
    ],
    why: "Every person who furnishes labor, professional services, materials, machinery, fixtures or tools serves these, as a necessary prerequisite to the validity of any claim of lien (§ 33-992.01(B)); a lien is enforceable only with the notice given and proof of service made (§ 33-981(D)).",
  };
}

function status(deadline, today) {
  if (Number.isNaN(today)) return null;
  const left = days(today, deadline);
  return { daysLeft: left, state: left < 0 ? "past" : left === 0 ? "today" : left <= 5 ? "soon" : "open" };
}

// Money typed as "$184,500.00" or "184500" in whole cents; NaN when it is not an amount.
export function cents(v) {
  const s = String(v ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m || !/^\d+$/.test(m[1])) return NaN;
  return Number(m[1]) * 100 + Number(((m[2] || "") + "00").slice(0, 2));
}

// § 33-992.01(G): a new notice when the estimated total "exceeds by thirty percent or more" the
// total in any prior notice. Compared in whole cents: current >= prior x 1.3 <=> 10 x current >= 13 x prior.
export function reNotice(prior, current) {
  const p = cents(prior), c = cents(current);
  if (Number.isNaN(p) || Number.isNaN(c) || p <= 0) return null;
  const threshold = Math.ceil((p * 13) / 10);
  return { needed: c * 10 >= p * 13, threshold: threshold / 100, increase: Math.round(((c - p) / p) * 1000) / 10 };
}

// first: day first furnished to the jobsite; mailed: day the notice was or will be deposited.
// completed / noc: optional, for the § 33-993(A) recording date.
export function noticeDates({ first, mailed, method = "certified", today, completed, noc } = {}) {
  const errors = [];
  const f = parseDate(first);
  if (Number.isNaN(f)) errors.push("Enter the day you first furnished labor or materials to the jobsite as YYYY-MM-DD.");
  if (!METHODS[method]) errors.push("Choose how the notice is mailed.");
  const opt = (v, what) => {
    if (!v || !String(v).trim()) return null;
    const t = parseDate(v);
    if (Number.isNaN(t)) errors.push(`Enter ${what} as YYYY-MM-DD, or leave it blank.`);
    return t;
  };
  const m = opt(mailed, "the day the notice is mailed");
  const c = opt(completed, "the completion date");
  const n = opt(noc, "the day a notice of completion was recorded");
  if (errors.length) return { errors };
  if (m !== null && m < f) return { errors: ["The mailing date is before the first day of work. A notice can be mailed before work starts only if your records support it; check both dates."] };
  if (n !== null && c !== null && n < c) return { errors: ["A notice of completion is recorded after completion (§ 33-993(E)); check both dates."] };

  const t = parseDate(today);
  const lastDay = addDays(f, 20);
  const out = { errors: [], lastDay: isoDate(lastDay), status: status(lastDay, t), rule: METHODS[method].rule, notes: [] };
  if (m !== null) {
    out.mailed = isoDate(m);
    out.onTime = m <= lastDay;
    if (out.onTime) out.covers = "all of your work on this job";
    else {
      out.coversFrom = isoDate(addDays(m, -20));
      out.covers = `only what you furnished from ${out.coversFrom} on`;
      out.lostDays = days(f, addDays(m, -20));
      out.notes.push(`Late by ${days(lastDay, m)} day(s). A late notice still counts, but the lien then reaches only what was furnished within the 20 days before it was mailed, and after (§ 33-992.01(E)): ${first} to ${isoDate(addDays(m, -21))} is not covered.`);
    }
    out.ackBy = isoDate(addDays(m, 30));
    out.notes.push(`If a signed acknowledgment of receipt is not back by ${out.ackBy} (30 days after mailing), prove the mailing by your own affidavit with the certificate of mailing or the certified or registered mail receipt attached (§ 33-992.02(2)).`);
  }
  if (n !== null) {
    out.recordBy = isoDate(addDays(n, 60));
    out.recordRule = "60 days after the notice of completion was recorded (§ 33-993(A))";
    if (c !== null) out.notes.push(`If the owner did not mail you a copy of the notice of completion within 15 days of recording it, you have 120 days from completion instead, ${isoDate(addDays(c, 120))} (§ 33-993(I)). Plan on ${out.recordBy}.`);
  } else if (c !== null) {
    out.recordBy = isoDate(addDays(c, 120));
    out.recordRule = "120 days after completion (§ 33-993(A)); a recorded notice of completion shortens it to 60 days after recording";
  }
  if (out.recordBy) out.recordStatus = status(parseDate(out.recordBy), t);
  return out;
}

// § 33-992.01(C)(5) and (D): the statements, word for word (the form's version of the first one).
export const FORM_TITLE = "Arizona Preliminary Twenty Day Lien Notice";
export const FORM_INTRO = "In accordance with Arizona Revised Statutes section 33-992.01, this is not a lien. This is not a reflection on the integrity of any contractor or subcontractor.";
export const OWNER_NOTICE_HEAD = "Notice to Property Owner";
export const OWNER_NOTICE = [
  "If bills are not paid in full for the labor, professional services, materials, machinery, fixtures or tools furnished, or to be furnished, a mechanic's lien leading to the loss, through court foreclosure proceedings, of all or part of your property being improved may be placed against the property. You may wish to protect yourself against this consequence by either:",
  "1. Requiring your contractor to furnish a conditional waiver and release pursuant to Arizona Revised Statutes section 33-1008, subsection D, paragraphs 1 and 3 signed by the person or firm giving you this notice before you make payment to your contractor.",
  "2. Requiring your contractor to furnish an unconditional waiver and release pursuant to Arizona Revised Statutes section 33-1008, subsection D, paragraphs 2 and 4 signed by the person or firm giving you this notice after you make payment to your contractor.",
  "3. Using any other method or device that is appropriate under the circumstances.",
];
// "in type at least as large as the largest type otherwise on the document".
export const TEN_DAYS = [
  "Within ten days after the receipt of this preliminary twenty day notice the owner or other interested party is required to furnish all information necessary to correct any inaccuracies in the notice pursuant to Arizona Revised Statutes section 33-992.01, subsection J or lose as a defense any inaccuracy of that information.",
  "Within ten days after the receipt of this preliminary twenty day notice if any payment bond has been recorded in compliance with Arizona Revised Statutes section 33-1003, the owner must provide a copy of the payment bond, including the name and address of the surety company and bonding agent providing the payment bond to the person who has given the preliminary twenty day notice. In the event that the owner or other interested party fails to provide the bond information within that ten day period, the claimant shall retain lien rights to the extent precluded or prejudiced from asserting a claim against the bond as a result of not timely receiving the bond information.",
];
// § 33-992.02(1), the acknowledgment the form says to insert.
export const ACK = [
  "Acknowledgment of receipt of preliminary twenty day notice",
  "This acknowledges receipt on (insert date) of a copy of the preliminary twenty day notice at (insert address) .",
];

// The form's boxes (§ 33-992.01(D)), each with the statute's own label, and whether § 33-992.01(C)
// requires the item (the lender only "if any").
export const ITEMS = [
  ["owner", "The name and address of the owner or reputed owner are:", true, "the owner's name and address"],
  ["original", "The name and address of the original contractor are:", true, "the original contractor's name and address"],
  ["lender", "The name and address of any lender or reputed lender and assigns are:", false, "the lender"],
  ["hiredBy", "The name and address of the person with whom the claimant has contracted are:", true, "who you contracted with (§ 33-992.01(C)(3))"],
  ["claimant", "This preliminary lien notice has been completed by (name and address of claimant):", true, "your name and address (§ 33-992.01(C)(2))"],
  ["work", "You are hereby notified that the claimant has furnished or will furnish labor, professional services, materials, machinery, fixtures or tools of the following general description:", true, "a general description of your work (§ 33-992.01(C)(1))"],
  ["site", "In the construction, alteration or repair of the building, structure or improvement located at:", false, "the jobsite address"],
  ["county", "And situated on that certain lot(s) or parcel(s) of land in", false, "the county"],
  ["legal", "described as follows:", false, "the legal description"],
  ["estimate", "An estimate of the total price of the labor, professional services, materials, machinery, fixtures or tools furnished or to be furnished is: $", true, "an estimate of the total price (§ 33-992.01(C)(1))"],
];

const clean = (v) => String(v ?? "").trim();

export function draftNotice(fields = {}) {
  const missing = [];
  const v = Object.fromEntries(ITEMS.map(([k]) => [k, clean(fields[k])]));
  for (const [k, , req, short] of ITEMS) if (req && !v[k]) missing.push(short);
  if (!v.site && !v.legal) missing.push("a description of the jobsite sufficient for identification (§ 33-992.01(C)(4))");
  const blank = "____________________";
  const lines = [FORM_TITLE, "", FORM_INTRO, ""];
  const put = (k) => {
    const [, label] = ITEMS.find((i) => i[0] === k);
    if (k === "estimate") lines.push(`${label}${(v.estimate || blank).replace(/^\$/, "")}`, "");
    else if (k === "county") lines.push(`${label} ${v.county || "_____________"} County, Arizona,`);
    else lines.push(label, v[k] || (k === "lender" ? "None known" : blank), "");
  };
  ["owner", "original", "lender", "hiredBy", "claimant"].forEach(put);
  lines.push(`Date: ${clean(fields.date) || blank}`, `By: ${clean(fields.signer) || blank}`, "");
  ["work", "site", "county", "legal", "estimate"].forEach(put);
  lines.push(OWNER_NOTICE_HEAD, "", ...OWNER_NOTICE.flatMap((p) => [p, ""]), ...TEN_DAYS.flatMap((p) => [p, ""]));
  lines.push(`Dated: ${clean(fields.date) || blank}`, clean(fields.company) || "(Company name)", "By: ______________________ (Signature)", `${clean(fields.title) || "______________________"} (Title)`, "");
  lines.push("______________________________", "Signature of sender", "", ...ACK, "", "Date: ______________________ (Date this acknowledgment is executed)", "", "______________________________", "Signature of person acknowledging receipt, with title if acknowledgment is made on behalf of another person");
  return { text: lines.join("\n"), missing };
}
