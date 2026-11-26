// California preliminary notice (private works): who must get it, the 20-day date, when a notice
// is "given" for each delivery method, what a late notice still covers, and a draft notice with
// every item Cal. Civ. Code §§ 8102 and 8202 ask for and § 8202(a)(3)'s statement word for word.
//
// Source: Cal. Civ. Code §§ 8102, 8106, 8110, 8116, 8118, 8200, 8202, 8204, 8206, 8216, text from the
// California Legislative Counsel's official bulk download (pubinfo_2025.zip, LAW_SECTION_TBL rows
// CIV 8102. ... 8216., active), read 2026-11-25. Each section: "Added by Stats. 2010, Ch. 697, Sec.
// 20. (SB 189) Effective January 1, 2011. Operative July 1, 2012"; no later amendment listed.
// Public works (§ 9300 and following) have their own rules and are not covered here.
//
// Day counting: § 8204(a) says "not later than 20 days after the claimant has first furnished
// work", so the last day is first furnished + 20 calendar days. A late notice covers "work
// performed within 20 days prior to the service", so the earliest covered day is the day the
// notice is given less 20 days. The day a notice is given comes from § 8116: delivery or mailing
// day, or five days after mailing when it is left and mailed under Code Civ. Proc. § 415.20.
// Nothing here moves a date off a weekend or holiday; the page says to serve early instead.
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
const addDays = (t, n) => t + n * DAY;
const days = (a, b) => Math.round((b - a) / DAY);

// § 8106 means of giving notice; § 8110 lists the mail services; § 8116 says when each is complete.
export const METHODS = {
  personal: { label: "Personal delivery", lag: 0, rule: "complete when delivered (§ 8116(a))" },
  certified: { label: "Certified or registered mail", lag: 0, rule: "complete when deposited in the mail (§ 8116(b))" },
  express: { label: "Express mail or an overnight express carrier", lag: 0, rule: "complete when deposited with the carrier (§ 8116(b))" },
  leave: { label: "Left at the address and a copy mailed (Code Civ. Proc. § 415.20)", lag: 5, rule: "complete five days after mailing (§ 8116(c))" },
};

// § 8200: who the notice goes to, by the claimant's place on the job.
export const ROLES = {
  sub: "A subcontractor or supplier (hired by the GC or by another sub)",
  direct: "I contracted directly with the owner (I am the GC or a prime)",
  laborer: "A laborer (paid wages for my own work)",
};

export function recipients(role) {
  if (role === "laborer") return { needed: false, to: [], why: "A laborer is not required to give preliminary notice (§ 8200(e)(1))." };
  if (role === "direct") return { needed: true, to: ["The construction lender, if there is one"], why: "A claimant with a direct contract with the owner gives preliminary notice only to the construction lender or reputed construction lender, if any (§ 8200(e)(2)). With no lender, there is no one to notify." };
  return {
    needed: true,
    to: ["The owner or reputed owner", "The direct contractor (the GC) you work under, directly or through other subcontractors", "The construction lender, if there is one"],
    why: "Before recording a lien claim, giving a stop payment notice or claiming on a payment bond, a claimant gives preliminary notice to these three (§ 8200(a)). Without it the lien claim and stop payment notice are not valid (§ 8200(c)).",
  };
}

function status(deadline, today) {
  if (Number.isNaN(today)) return null;
  const left = days(today, deadline);
  return { daysLeft: left, state: left < 0 ? "past" : left === 0 ? "today" : left <= 5 ? "soon" : "open" };
}

// first: day first furnished work; served: day the notice was or will be delivered or mailed.
export function noticeDates({ first, served, method = "certified", today } = {}) {
  const errors = [];
  const f = parseDate(first);
  if (Number.isNaN(f)) errors.push("Enter the day you first furnished work on this job as YYYY-MM-DD.");
  const m = METHODS[method];
  if (!m) errors.push("Choose how the notice is given.");
  const s = served && String(served).trim() ? parseDate(served) : null;
  if (Number.isNaN(s)) errors.push("Enter the day the notice is delivered or mailed as YYYY-MM-DD, or leave it blank.");
  if (errors.length) return { errors };

  const t = parseDate(today);
  const lastDay = addDays(f, 20);
  const out = {
    errors: [],
    lastDay: isoDate(lastDay),
    status: status(lastDay, t),
    // The latest day to deliver or mail so the notice is complete in time.
    sendBy: isoDate(addDays(lastDay, -m.lag)),
    sendByStatus: status(addDays(lastDay, -m.lag), t),
    rule: m.rule,
    notes: [],
  };
  if (m.lag) out.notes.push(`Left and mailed, the notice is complete only five days after mailing, so mail it by ${out.sendBy} to be given by ${out.lastDay}.`);
  if (s !== null) {
    if (s < f) return { errors: ["The notice date is before the first day of work. A notice can be given before work starts only if your records support it; check both dates."] };
    const given = addDays(s, m.lag);
    out.given = isoDate(given);
    out.onTime = given <= lastDay;
    if (out.onTime) out.covers = "all of your work on this job";
    else {
      out.coversFrom = isoDate(addDays(given, -20));
      out.covers = `only work performed from ${out.coversFrom} on`;
      out.lostDays = days(f, addDays(given, -20));
      out.notes.push(`Late by ${days(lastDay, given)} day(s). A late notice still counts, but a lien, stop payment notice or bond claim then reaches only work performed within the 20 days before it was given, and after (§ 8204(a)): work from ${first} to ${isoDate(addDays(given, -21))} is not covered.`);
    }
  }
  return out;
}

// § 8202(a)(3), word for word.
export const OWNER_NOTICE_HEAD = "NOTICE TO PROPERTY OWNER";
export const OWNER_NOTICE = [
  "EVEN THOUGH YOU HAVE PAID YOUR CONTRACTOR IN FULL, if the person or firm that has given you this notice is not paid in full for labor, service, equipment, or material provided or to be provided to your construction project, a lien may be placed on your property. Foreclosure of the lien may lead to loss of all or part of your property. You may wish to protect yourself against this by (1) requiring your contractor to provide a signed release by the person or firm that has given you this notice before making payment to your contractor, or (2) any other method that is appropriate under the circumstances.",
  "This notice is required by law to be served by the undersigned as a statement of your legal rights. This notice is not intended to reflect upon the financial condition of the contractor or the person employed by you on the construction project.",
  "If you record a notice of cessation or completion of your construction project, you must within 10 days after recording, send a copy of the notice of completion to your contractor and the person or firm that has given you this notice. The notice must be sent by registered or certified mail. Failure to send the notice will extend the deadline to record a claim of lien. You are not required to send the notice if you are a residential homeowner of a dwelling containing four or fewer units.",
];

// The § 8102(a) and § 8202(a) items, each under the statute's own words. Required means the
// statute lists it; § 8102(a) asks for each "to the extent known to the person giving the notice".
export const ITEMS = [
  ["owner", "Name and address of the owner or reputed owner", "§ 8102(a)(1)", true],
  ["direct", "Name and address of the direct contractor", "§ 8102(a)(2)", true],
  ["lender", "Name and address of the construction lender, if any", "§ 8102(a)(3)", false],
  ["site", "Description of the site, including its street address", "§ 8102(a)(4)", true],
  ["claimant", "Name, address and relationship to the parties of the person giving the notice", "§ 8102(a)(5)", true],
  ["work", "General description of the work provided and to be provided", "§§ 8102(a)(6)(A), 8202(a)(1)", true],
  ["hiredBy", "Name of the person to or for whom the work is provided", "§ 8102(a)(6)(B)", true],
  ["estimate", "Estimate of the total price of the work provided and to be provided", "§ 8202(a)(2)", true],
  ["demand", "Statement or estimate of the claimant's demand, if any, after deducting all just credits and offsets", "§ 8102(a)(6)(C)", false],
  ["laborers", "Laborers (and benefit funds) owed compensation, with names and addresses", "§ 8202(b)", false],
];

const clean = (v) => String(v ?? "").replace(/\s+$/g, "").trim();

export function draftNotice(fields = {}) {
  const missing = [];
  const lines = ["CALIFORNIA PRELIMINARY NOTICE", "(Cal. Civ. Code §§ 8102, 8200-8216; private work)", ""];
  for (const [key, label, cite, required] of ITEMS) {
    const v = clean(fields[key]);
    if (!v) {
      if (required) missing.push(`${label} (${cite})`);
      if (key === "lender") lines.push(`${label}: none known`, "");
      continue;
    }
    lines.push(`${label}:`, v, "");
  }
  lines.push(OWNER_NOTICE_HEAD, ...OWNER_NOTICE.flatMap((p) => [p, ""]));
  lines.push(`Date: ${clean(fields.date) || "____________"}`, "Signature: ______________________________", `Name and title: ${clean(fields.signer) || "______________________________"}`);
  return { text: lines.join("\n"), missing };
}
