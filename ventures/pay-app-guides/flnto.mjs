// Florida Notice to Owner (private works): who must serve it and on whom, the 45-day date, the
// 40-day mail-by date for service on mailing, what a late notice costs, the 90-day claim of lien
// date, and a draft of the statutory form, Fla. Stat. § 713.06(2)(c), word for word.
//
// Source: Fla. Stat. §§ 713.06(2), 713.18 and 713.08(4)(c), (5), 2026 Florida Statutes as published
// by the Florida Senate (flsenate.gov), read 2026-11-27; snapshot in sources/fl-713.txt, which
// flnto.test.mjs checks every quoted phrase and the whole form against. The same snapshot of
// §§ 713.06(2) and 713.18 backs the Notice to Owner in PayApps (packages/lien-waivers/src/fl-notice.ts).
//
// Day counting: § 713.06(2)(a) says "not later than 45 days after commencing", so the last day is
// first furnished + 45 calendar days. § 713.18(2)(b): mailed "within 40 days after the date the
// lienor first furnishes", by registered, Global Express Guaranteed or certified mail with a mail
// log or USPS tracking, the notice is served as of the mailing date; otherwise it is served when it
// is delivered. The sections read here say nothing about weekends or holidays, so nothing is moved.
// Not covered: public works and bonded jobs (§ 255.05, § 713.23), and a lienor in privity with the
// owner, which § 713.06 ("Liens of persons not in privity") does not address. Pure functions, no I/O.

const DAY = 86400000;

export function parseDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? "").trim());
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : NaN;
}
export const isoDate = (t) => new Date(t).toISOString().slice(0, 10);
const addDays = (t, n) => t + n * DAY;
const days = (a, b) => Math.round((b - a) / DAY);

export const SERVE_DAYS = 45; // § 713.06(2)(a)
export const MAIL_DAYS = 40; // § 713.18(2)(b)
export const CLAIM_DAYS = 90; // § 713.08(5)

// § 713.18(1) means of service, and whether § 713.18(2)'s service-on-mailing rule can apply.
export const METHODS = {
  mail: { label: "Certified, registered or Global Express Guaranteed mail", onMailing: true, rule: "§ 713.18(1)(b), with evidence of delivery" },
  carrier: { label: "Common carrier delivery service (e.g. a courier)", onMailing: false, rule: "§ 713.18(1)(b), with evidence of delivery" },
  hand: { label: "Hand delivery", onMailing: false, rule: "§ 713.18(1)(a)" },
  post: { label: "Posting on the job site", onMailing: false, rule: "§ 713.18(1)(c), only if hand delivery and mail or carrier cannot be accomplished" },
};

// The claimant's place on the job; who gets the notice and its copies follows § 713.06(2)(a), (b).
export const ROLES = {
  sub: "A subcontractor hired by the contractor (GC)",
  supplierGc: "A supplier (materialman) to the contractor",
  subsub: "A sub-subcontractor (hired by a subcontractor)",
  supplierSub: "A supplier to a subcontractor",
  supplierSubsub: "A supplier to a sub-subcontractor",
  laborer: "A laborer (paid wages for my own work)",
  direct: "I contracted directly with the owner",
};

const DESIGNEE = "Anyone the owner's notice of commencement names to receive a copy (§ 713.06(2)(b); missing this copy does not invalidate an otherwise valid lien)";

export function recipients(role) {
  if (role === "laborer") return { needed: false, to: [], why: "Laborers are excepted: \"All lienors under this section, except laborers\" must serve the notice (§ 713.06(2)(a))." };
  if (role === "direct") return { needed: false, to: [], why: "Section 713.06 covers \"persons not in privity\" with the owner. A contractor who contracted with the owner does not serve this notice; the claim of lien date below still applies to you (§ 713.08(5)), and this page does not cover the rest of a contractor's lien steps." };
  if (!ROLES[role]) return { needed: false, to: [], why: "Choose who you are on this job." };
  const to = ["The owner (§ 713.06(2)(a))"];
  if (role === "subsub" || role === "supplierSub" || role === "supplierSubsub") to.push("A copy on the contractor (GC) (§ 713.06(2)(a))");
  if (role === "supplierSubsub") to.push("The subcontractor above your customer, if you know its name and address (§ 713.06(2)(a))");
  to.push(DESIGNEE);
  return {
    needed: true,
    to,
    why: "Serving the notice is \"a prerequisite to perfecting a lien under this chapter and recording a claim of lien\", and \"the failure to serve the notice, or to timely serve it, is a complete defense to enforcement of a lien by any person\" (§ 713.06(2)(a)).",
  };
}

function status(deadline, today) {
  if (Number.isNaN(today)) return null;
  const left = days(today, deadline);
  return { daysLeft: left, state: left < 0 ? "past" : left === 0 ? "today" : left <= 5 ? "soon" : "open" };
}

// first: first day of furnishing; sent: day mailed, handed over or posted; delivered: day a mailed
// or couriered notice was delivered (optional); last: last day of furnishing (optional).
export function noticeDates({ first, sent, delivered, method = "mail", last, today } = {}) {
  const errors = [];
  const f = parseDate(first);
  if (Number.isNaN(f)) errors.push("Enter the first day you furnished labor, services or materials as YYYY-MM-DD.");
  const m = METHODS[method];
  if (!m) errors.push("Choose how the notice is served.");
  const opt = (v, what) => {
    if (!v || !String(v).trim()) return null;
    const t = parseDate(v);
    if (Number.isNaN(t)) errors.push(`Enter ${what} as YYYY-MM-DD, or leave it blank.`);
    return t;
  };
  const s = opt(sent, "the day the notice was mailed, delivered or posted");
  const d = opt(delivered, "the day it was delivered");
  const l = opt(last, "the last day you furnished work");
  if (errors.length) return { errors };
  const r = compute(f, s, m, d, l, today);
  // Serving before commencing is allowed by § 713.06(2)(a), so an early date is not an error.
  if (!r.errors.length && s !== null && s < f) r.notes.unshift("Served before you started: the statute allows that (\"before commencing, or not later than 45 days after commencing\", § 713.06(2)(a)).");
  return r;
}

function compute(f, s, m, d, l, today) {
  const t = parseDate(today);
  const serveBy = addDays(f, SERVE_DAYS);
  const mailBy = addDays(f, MAIL_DAYS);
  const out = {
    errors: [],
    serveBy: isoDate(serveBy),
    status: status(serveBy, t),
    mailBy: m.onMailing ? isoDate(mailBy) : null,
    mailByStatus: m.onMailing ? status(mailBy, t) : null,
    rule: m.rule,
    notes: [],
  };
  if (m.onMailing) {
    out.notes.push(`Mailed by ${out.mailBy} with a mail log or USPS tracking records, the notice counts as served on the day you mail it (§ 713.18(2)). Mailed later, it counts only when it is delivered, and that must be by ${out.serveBy}.`);
  } else if (m === METHODS.carrier) {
    out.notes.push(`By courier the notice is served when it is delivered, so it must arrive by ${out.serveBy}; the service-on-mailing rule is for registered, certified and Global Express Guaranteed mail only (§ 713.18(2)(a)).`);
  }
  if (s !== null) {
    let served = null;
    if (m.onMailing && s <= mailBy) {
      served = s;
      out.servedHow = "on mailing (§ 713.18(2)), if you keep the mail log or USPS tracking records";
    } else if (m.onMailing || m === METHODS.carrier) {
      if (d !== null) {
        if (d < s) return { errors: ["The delivery date is before the mailing date; check both dates."] };
        served = d;
        out.servedHow = "on delivery";
      } else {
        out.servedHow = null;
        out.notes.push(m.onMailing
          ? `Mailed ${isoDate(s)}, after the 40th day: it counts only when delivered. Enter the delivery date to check it reached the owner by ${out.serveBy}.`
          : "Enter the delivery date to check it.");
      }
    } else {
      served = s;
      out.servedHow = m === METHODS.hand ? "on hand delivery" : "on posting";
    }
    if (served !== null) {
      out.served = isoDate(served);
      out.onTime = served <= serveBy;
      if (!out.onTime) out.notes.push(`Late by ${days(serveBy, served)} day(s). Florida does not save part of the work: the failure "to timely serve it, is a complete defense to enforcement of a lien by any person" (§ 713.06(2)(a)), and "a lienor must strictly comply with the time requirements" (§ 713.06(2)(f)). Talk to a Florida construction attorney about any bond or contract claim you still have.`);
    }
  }
  if (l !== null) {
    if (l < f) return { errors: ["The last day of furnishing is before the first; check both dates."] };
    out.claimBy = isoDate(addDays(l, CLAIM_DAYS));
    out.claimStatus = status(addDays(l, CLAIM_DAYS), t);
  }
  return out;
}

// § 713.06(2)(c), word for word. A {{key}} marks where the statute prints a caption or a blank.
export const WARNINGS = [
  "WARNING! FLORIDA’S CONSTRUCTION LIEN LAW ALLOWS SOME UNPAID CONTRACTORS, SUBCONTRACTORS, AND MATERIAL SUPPLIERS TO FILE LIENS AGAINST YOUR PROPERTY EVEN IF YOU HAVE MADE PAYMENT IN FULL.",
  "UNDER FLORIDA LAW, YOUR FAILURE TO MAKE SURE THAT WE ARE PAID MAY RESULT IN A LIEN AGAINST YOUR PROPERTY AND YOUR PAYING TWICE.",
  "TO AVOID A LIEN AND PAYING TWICE, YOU MUST OBTAIN A WRITTEN RELEASE FROM US EVERY TIME YOU PAY YOUR CONTRACTOR.",
];
export const FORM = [
  ...WARNINGS,
  "NOTICE TO OWNER",
  "To {{owner}}",
  "The undersigned hereby informs you that he or she has furnished or is furnishing services or materials as follows:",
  "{{work}} for the improvement of the real property identified as {{site}} under an order given by {{hiredBy}}.",
  "Florida law prescribes the serving of this notice and restricts your right to make payments under your contract in accordance with Section 713.06, Florida Statutes.",
  "IMPORTANT INFORMATION FOR YOUR PROTECTION",
  "Under Florida’s laws, those who work on your property or provide materials and are not paid have a right to enforce their claim for payment against your property. This claim is known as a construction lien.",
  "If your contractor fails to pay subcontractors or material suppliers or neglects to make other legally required payments, the people who are owed money may look to your property for payment, EVEN IF YOU HAVE PAID YOUR CONTRACTOR IN FULL.",
  "PROTECT YOURSELF:",
  "—RECOGNIZE that this Notice to Owner may result in a lien against your property unless all those supplying a Notice to Owner have been paid.",
  "—LEARN more about the Construction Lien Law, Chapter 713, Part I, Florida Statutes, and the meaning of this notice by contacting an attorney or the Florida Department of Business and Professional Regulation.",
  "(Lienor’s Signature)",
  "{{lienorName}}",
  "{{lienorAddress}}",
  "Copies to: {{copies}}",
];

// The caption the statute prints in each place, kept when the field is blank.
export const FIELDS = [
  ["owner", "(Owner’s name and address)", true],
  ["work", "(General description of services or materials)", true],
  ["site", "(property description)", true],
  ["hiredBy", "____", true],
  ["lienorName", "(Lienor’s Name)", true],
  ["lienorAddress", "(Lienor’s Address)", true],
  ["copies", "(Those persons listed in Section 713.06(2)(a) and (b), Florida Statutes)", false],
];
const LABELS = { owner: "owner's name and address", work: "description of your services or materials", site: "property description", hiredBy: "who ordered the work", lienorName: "your company's name", lienorAddress: "your company's address", copies: "who gets copies" };

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

export function draftNotice(fields = {}) {
  const missing = [];
  const fill = {};
  for (const [key, caption, required] of FIELDS) {
    // The form puts a period after who gave the order, so "Coastline Builders Inc." must not print "Inc..".
    const v = key === "hiredBy" ? clean(fields[key]).replace(/\.+$/, "") : clean(fields[key]);
    if (!v && required) missing.push(LABELS[key]);
    fill[key] = v || caption;
  }
  const lines = FORM.map((line) => line.replace(/\{\{(\w+)\}\}/g, (_, k) => fill[k]));
  return { lines, text: lines.join("\n\n"), missing };
}
