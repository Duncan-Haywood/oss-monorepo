// Florida Notice to Owner: who serves it and on whom, the 45-day serve-by and 40-day mail-by dates,
// when a notice counts as served for each method, and a draft of the § 713.06(2)(c) form word for
// word.
//
// Source: Fla. Stat. § 713.06(2) and § 713.18 as published by the Florida Senate (2026 Florida
// Statutes), fetched 2026-11-27. The snapshot is PayApps' own verified copy,
// ventures/payapps/packages/lien-waivers/sources/fl-713-06.txt; flnto.test.mjs checks every line of
// NTO_FORM and every quoted phrase in QUOTES against it, so the page cannot drift from the statute.
//
// Day counting: § 713.06(2)(a), "not later than 45 days after commencing" to furnish, so the last
// day is the first day of furnishing + 45 calendar days; § 713.18(2)(b), "mailed within 40 days
// after the date the lienor first furnishes", so the mail-by date is + 40. Nothing here moves a date
// off a weekend or holiday: the sections read say nothing about one, so the earlier date stands and
// the page says to serve early. The rule matches PayApps' (packages/lien-waivers/src/fl-service.ts).
// Pure functions, no I/O.

const DAY = 86400000;

export function parseDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? "").trim());
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : NaN;
}
export const isoDate = (t) => new Date(t).toISOString().slice(0, 10);
const days = (a, b) => Math.round((b - a) / DAY);

export const SERVE_DAYS = 45;
export const MAIL_DAYS = 40;

// § 713.18(1) means of service, and which of them § 713.18(2) lets count on the day of mailing.
export const METHODS = {
  certified: { label: "Certified mail", onMailing: true },
  registered: { label: "Registered mail", onMailing: true },
  gxg: { label: "Global Express Guaranteed", onMailing: true },
  carrier: { label: "Common carrier delivery service", onMailing: false },
  hand: { label: "Hand delivery", onMailing: false },
  posting: { label: "Posting on the site", onMailing: false },
};

// § 713.06(2)(a), (b), (d): who gets the notice or a copy, by the lienor's place on the job.
export const ROLES = {
  sub: "A subcontractor hired by the contractor (GC)",
  subsub: "A sub-subcontractor, or a supplier to a subcontractor",
  supsubsub: "A supplier to a sub-subcontractor",
  direct: "I contracted directly with the owner",
  laborer: "A laborer (wages for my own work)",
};

const DESIGNEE = "Anyone the owner's notice of commencement designates to receive a copy (§ 713.06(2)(b))";
const LENDER = "A lender, if the notice of commencement names one: addressed to the persons and place it designates (§ 713.06(2)(d))";

export function recipients(role) {
  if (role === "laborer") {
    return { needed: false, to: [], why: "Laborers are excepted: \"All lienors under this section, except laborers\" must serve the notice (§ 713.06(2)(a))." };
  }
  if (role === "direct") {
    return { needed: false, to: [], why: "Section 713.06 is for lienors not in privity with the owner (subcontractors, sub-subcontractors and suppliers). A contractor hired by the owner does not serve this notice; Florida has other requirements for it (for example the contractor's final payment affidavit, § 713.06(3)(d)), which this page does not cover." };
  }
  const to = ["The owner (§ 713.06(2)(a)); served on one owner, it is served on all owners (§ 713.18(4))"];
  if (role === "subsub" || role === "supsubsub") to.push("A copy to the contractor (GC) (§ 713.06(2)(a))");
  if (role === "supsubsub") to.push("A copy to the subcontractor above your customer, if you know its name and address (§ 713.06(2)(a))");
  to.push(DESIGNEE, LENDER);
  const strict = role === "sub"
    ? "Without it you cannot perfect a lien or record a claim of lien."
    : "The copy to the contractor is also \"a prerequisite to perfecting a lien\".";
  return { needed: true, to, why: `${strict} Missing the designee's copy "does not invalidate an otherwise valid lien" (§ 713.06(2)(b)).` };
}

function status(deadline, today) {
  if (Number.isNaN(today)) return null;
  const left = days(today, deadline);
  return { daysLeft: left, state: left < 0 ? "past" : left === 0 ? "today" : left <= 5 ? "soon" : "open" };
}

/**
 * The two dates from the first day of furnishing, and, given how and when a notice went out, the
 * day it counts as served and whether that is within the 45 days.
 *   first: YYYY-MM-DD, the first day you furnished labor, services or materials
 *   method: a METHODS key (optional); sent: day mailed, handed over or posted (optional);
 *   delivered: delivery date from the evidence of delivery (optional); today: for the countdown.
 */
export function ntoDates({ first, method = "certified", sent = "", delivered = "", today = "" } = {}) {
  const errors = [];
  const f = parseDate(first);
  if (Number.isNaN(f)) errors.push("Enter the first day you furnished labor, services or materials as YYYY-MM-DD.");
  if (!METHODS[method]) errors.push("Choose how the notice is served.");
  const s = sent ? parseDate(sent) : null;
  if (Number.isNaN(s)) errors.push("Enter the day the notice is mailed, handed over or posted as YYYY-MM-DD.");
  const d = delivered ? parseDate(delivered) : null;
  if (Number.isNaN(d)) errors.push("Enter the delivery date as YYYY-MM-DD.");
  // Serving "before commencing" is allowed (§ 713.06(2)(a)), so a sent date before the first day is fine.
  if (!errors.length && s !== null && d !== null && d < s) errors.push("The delivery date is before the day it was sent.");
  if (errors.length) return { errors };

  const serveBy = f + SERVE_DAYS * DAY;
  const mailBy = f + MAIL_DAYS * DAY;
  const out = {
    errors,
    serveBy: isoDate(serveBy),
    mailBy: isoDate(mailBy),
    status: status(serveBy, parseDate(today)),
    mailStatus: status(mailBy, parseDate(today)),
    servedOn: null,
    basis: null,
    onTime: null,
    notes: [],
  };
  if (s === null) return out;

  const m = METHODS[method];
  if (method === "hand" || method === "posting") {
    out.servedOn = isoDate(s);
    out.basis = method === "posting" ? "posting" : "delivery";
  } else if (m.onMailing && s <= mailBy) {
    out.servedOn = isoDate(s);
    out.basis = "mailing";
    out.notes.push(`Mailed by ${m.label.toLowerCase()} within the ${MAIL_DAYS} days, so it is served as of the day mailed (§ 713.18(2)), as long as you keep a mail log with the USPS mail number, the name and address served and the USPS date stamp, or USPS tracking records showing the date the USPS received it (§ 713.18(2)(c)).`);
  } else {
    out.basis = "delivery";
    out.servedOn = d === null ? null : isoDate(d);
    out.notes.push(m.onMailing
      ? `Mailed after the ${MAIL_DAYS} days (mail-by ${out.mailBy}), so it counts when delivered, with evidence of delivery (§ 713.18(1)(b)).`
      : `A carrier's delivery counts when it is delivered, with evidence of delivery (§ 713.18(1)(b)); only registered, certified and Global Express Guaranteed mail can count on the day of mailing.`);
    if (d === null) out.notes.push(`Enter the delivery date from the evidence of delivery to check it against ${out.serveBy}.`);
  }
  if (out.basis === "posting") out.notes.push("Posting counts only \"if service as provided by paragraph (a) or paragraph (b) cannot be accomplished\" (§ 713.18(1)(c)). Keep a record of the attempts.");
  if (out.servedOn !== null) {
    out.onTime = out.basis === "mailing" ? true : out.servedOn <= out.serveBy;
    if (!out.onTime) {
      out.notes.push(`Served ${out.servedOn}, after the ${SERVE_DAYS} days ended ${out.serveBy}: "the failure to serve the notice, or to timely serve it, is a complete defense to enforcement of a lien by any person" (§ 713.06(2)(a)), and "a lienor must strictly comply with the time requirements" (§ 713.06(2)(f)). Unlike California, there is no partial cover for later work.`);
    }
  }
  out.notes.push("In any event the notice must be served \"before the date of the owner’s disbursement of the final payment after the contractor has furnished the affidavit\" (§ 713.06(2)(a)), which can come before the 45 days on a short job.");
  return out;
}

// § 713.06(2)(c), line by line as the Florida Senate prints it. Captions in parentheses mark where
// the statute leaves a blank; draftNotice fills them. flnto.test.mjs checks each line verbatim
// against the snapshot.
export const NTO_FORM = [
  "WARNING! FLORIDA’S CONSTRUCTION LIEN LAW ALLOWS SOME UNPAID CONTRACTORS, SUBCONTRACTORS, AND MATERIAL SUPPLIERS TO FILE LIENS AGAINST YOUR PROPERTY EVEN IF YOU HAVE MADE PAYMENT IN FULL.",
  "UNDER FLORIDA LAW, YOUR FAILURE TO MAKE SURE THAT WE ARE PAID MAY RESULT IN A LIEN AGAINST YOUR PROPERTY AND YOUR PAYING TWICE.",
  "TO AVOID A LIEN AND PAYING TWICE, YOU MUST OBTAIN A WRITTEN RELEASE FROM US EVERY TIME YOU PAY YOUR CONTRACTOR.",
  "NOTICE TO OWNER",
  "To (Owner’s name and address)",
  "The undersigned hereby informs you that he or she has furnished or is furnishing services or materials as follows:",
  "(General description of services or materials) for the improvement of the real property identified as (property description) under an order given by____.",
  "Florida law prescribes the serving of this notice and restricts your right to make payments under your contract in accordance with Section 713.06, Florida Statutes.",
  "IMPORTANT INFORMATION FOR YOUR PROTECTION",
  "Under Florida’s laws, those who work on your property or provide materials and are not paid have a right to enforce their claim for payment against your property. This claim is known as a construction lien.",
  "If your contractor fails to pay subcontractors or material suppliers or neglects to make other legally required payments, the people who are owed money may look to your property for payment, EVEN IF YOU HAVE PAID YOUR CONTRACTOR IN FULL.",
  "PROTECT YOURSELF:",
  "—RECOGNIZE that this Notice to Owner may result in a lien against your property unless all those supplying a Notice to Owner have been paid.",
  "—LEARN more about the Construction Lien Law, Chapter 713, Part I, Florida Statutes, and the meaning of this notice by contacting an attorney or the Florida Department of Business and Professional Regulation.",
  "(Lienor’s Signature)",
  "(Lienor’s Name)",
  "(Lienor’s Address)",
  "Copies to: (Those persons listed in Section 713.06(2)(a) and (b), Florida Statutes)",
];

// Lines printed in capitals as warnings (bold on the printed notice).
export const BOLD_LINES = new Set([0, 1, 2, 3, 8, 11]);

// Every phrase the page and this module quote, checked against the snapshot by the test.
export const QUOTES = [
  "All lienors under this section, except laborers",
  "not later than 45 days after commencing",
  "before the date of the owner’s disbursement of the final payment after the contractor has furnished the affidavit",
  "the failure to serve the notice, or to timely serve it, is a complete defense to enforcement of a lien by any person",
  "a lienor must strictly comply with the time requirements",
  "does not invalidate an otherwise valid lien",
  "The notice may be in substantially the following form and must include the information and the warning contained in the following form",
  "may rely on the information contained in the building permit application",
  "is mailed within 40 days after the date the lienor first furnishes labor, services, or materials",
  "if service as provided by paragraph (a) or paragraph (b) cannot be accomplished",
  "NOTICE TO OWNER/NOTICE TO CONTRACTOR",
  "The serving of the notice does not dispense with recording the claim of lien",
  "a prerequisite to perfecting a lien",
];

export const FIELDS = [
  ["owner", "Owner’s name and address", true],
  ["work", "General description of services or materials", true],
  ["site", "Property description", true],
  ["hiredBy", "Under an order given by (who hired you)", true],
  ["lienor", "Your company name (lienor)", true],
  ["address", "Your company address", true],
  ["copies", "Copies to", false],
];

/** The form with the user's entries in place of the statute's captions, and what is still blank. */
export function draftNotice(v = {}) {
  const val = (k) => String(v[k] ?? "").trim();
  const missing = FIELDS.filter(([k, , req]) => req && !val(k)).map(([, label]) => label);
  const or = (k, caption) => val(k) || caption;
  const lines = NTO_FORM.map((line) => {
    if (line === "To (Owner’s name and address)") return `To ${or("owner", "(Owner’s name and address)")}`;
    if (line.startsWith("(General description")) {
      return `${or("work", "(General description of services or materials)")} for the improvement of the real property identified as ${or("site", "(property description)")} under an order given by${val("hiredBy") ? ` ${val("hiredBy").replace(/\.+$/, "")}.` : "____."}`;
    }
    if (line === "(Lienor’s Signature)") return "____________________ (Lienor’s Signature)";
    if (line === "(Lienor’s Name)") return or("lienor", "(Lienor’s Name)");
    if (line === "(Lienor’s Address)") return or("address", "(Lienor’s Address)");
    if (line.startsWith("Copies to:")) return `Copies to: ${or("copies", "(Those persons listed in Section 713.06(2)(a) and (b), Florida Statutes)")}`;
    return line;
  });
  return { lines, text: lines.join("\n\n"), missing };
}
