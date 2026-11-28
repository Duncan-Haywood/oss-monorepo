// Ohio notice of furnishing: the notice a subcontractor or material supplier serves on the owner's
// designee and the original contractor named in a recorded notice of commencement, within 21 days
// after first furnishing (Ohio Rev. Code § 1311.05(A)). Gives who serves it, the last day (with
// § 1311.04(I) and (J)'s extensions when the notice of commencement was recorded late or not served
// on request), what a late notice still covers (§ 1311.05(D)), and the lien affidavit date that
// follows (§ 1311.06(B)) and the copy to the owner (§ 1311.07).
//
// Source: Ohio Rev. Code §§ 1311.011, 1311.04, 1311.05, 1311.06, 1311.07, 1311.19 and 1311.261, text
// from codes.ohio.gov read 2026-11-28, kept in sources/oh-1311.txt (oh-furnishing.test.mjs checks
// every quoted phrase on the page and the form against it).
//
// Day counting: calendar days as the sections state them. Ohio's general rule for a period that
// ends on a weekend or holiday is not read or computed here; the module reports the weekday and
// plans on the unmoved date. Pure functions, no I/O.

import { parseDate, isoDate } from "./prelim.mjs";

export { parseDate, isoDate };

const DAY = 86400000;
const addDays = (t, n) => t + n * DAY;
const days = (a, b) => Math.round((b - a) / DAY);
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const weekday = (t) => WEEKDAYS[new Date(t).getUTCDay()];

export const ROLES = {
  sub: "A subcontractor or supplier hired by the original contractor",
  lower: "A subcontractor or supplier further down (hired by a sub)",
  direct: "I contracted directly with the owner (an original contractor, or a supplier to the owner)",
  laborer: "A worker paid wages for my own labor",
};

export const JOBS = {
  recorded: "A notice of commencement has been recorded for the job",
  none: "No notice of commencement has been recorded (yet)",
  home: "A home construction contract (an owner's own 1- or 2-family home, § 1311.011)",
  public: "A public improvement (state, county, city, school and the like)",
};

// Who serves, and on whom. § 1311.05(A): the designee (or the owner named, the first one if several)
// and the original contractor; none from an original contractor; a sub or supplier "in direct
// privity of contract with the original contractor" need not serve the original contractor.
// § 1311.05(E), (G), (H), (I) and § 1311.04(O): no notice on a home construction contract, from a
// laborer, or without a recorded notice of commencement. § 1311.261: public jobs are separate.
export function whoServes(role, job) {
  if (!ROLES[role]) return { needed: null, why: "Choose your role on the job." };
  if (!JOBS[job]) return { needed: null, why: "Choose what kind of job it is." };
  if (job === "public") return { needed: role === "lower", why: role === "lower"
    ? "On a public improvement the notice of furnishing goes to the principal contractor, within 21 days after you first furnished on the site, on § 1311.261's own form; it protects your claim against the funds and bond, not a lien on the property. This page's form is for private jobs."
    : "On a public improvement, a sub or supplier in direct contract with the principal contractor need not serve the § 1311.261 notice of furnishing. Public property is not liened." };
  if (role === "laborer") return { needed: false, why: "“No laborer must serve a notice of furnishing in accordance with this section to preserve lien rights” (§ 1311.05(G))." };
  if (role === "direct") return { needed: false, why: "“No original contractor has to serve a notice of furnishing to preserve lien rights arising from a contract with an owner, part owner, or lessee”, and a supplier in direct contract with the owner need not serve the owner either (§ 1311.05(A))." };
  if (job === "home") return { needed: false, why: "§ 1311.05 “does not apply to any improvement made pursuant to a home construction contract as defined in section 1311.011” (§ 1311.05(E)), even where the lender had a notice of commencement recorded (§ 1311.05(I), § 1311.04(O)). Home jobs have their own rules in § 1311.011, which this page does not cover." };
  if (job === "none") return { needed: false, why: "With no notice of commencement recorded, no notice of furnishing is needed to keep your lien rights (§ 1311.05(H)). If one is recorded later, you have 21 days from its recording (§ 1311.04(I)): ask the owner and the GC for it in writing, and enter its recording date below." };
  const to = role === "sub"
    ? "Serve the designee named in the notice of commencement (or the owner it names, if no designee). You hired on with the original contractor, so the statute does not require you to serve it too (§ 1311.05(A)), but a copy costs one more envelope and keeps the GC from saying it never knew."
    : "Serve both the designee named in the notice of commencement (or the owner it names, if no designee) and the original contractor it names, at the addresses it lists (§ 1311.05(A)).";
  return { needed: true, why: `A notice of commencement is recorded, so you serve a notice of furnishing to keep your lien rights. ${to}` };
}

function status(deadline, today) {
  if (Number.isNaN(today)) return null;
  const left = days(today, deadline);
  return { daysLeft: left, state: left < 0 ? "past" : left === 0 ? "today" : left <= 5 ? "soon" : "open" };
}

export const PROPERTIES = {
  commercial: "Anything other than a 1- or 2-family home or a condo unit (75 days)",
  dwelling: "A 1- or 2-family dwelling or a residential condominium unit (60 days)",
};

// first: first labor, work or materials. recorded: day the notice of commencement was recorded, if
// after first. requested: day your written request for the notice of commencement was served.
// received: day a copy was actually served on you. served: day the notice of furnishing was or will
// be served (by certified mail, the mailing day, § 1311.19(B)). last: last day of work, for the
// lien affidavit (§ 1311.06(B)).
export function noticeDates({ first, recorded, requested, received, served, last, property = "commercial", today } = {}) {
  const errors = [];
  const f = parseDate(first);
  if (Number.isNaN(f)) errors.push("Enter the day you first performed labor or work or furnished materials as YYYY-MM-DD.");
  const opt = (v, what) => {
    if (!v || !String(v).trim()) return null;
    const t = parseDate(v);
    if (Number.isNaN(t)) errors.push(`Enter ${what} as YYYY-MM-DD, or leave it blank.`);
    return t;
  };
  const r = opt(recorded, "the day the notice of commencement was recorded");
  const q = opt(requested, "the day your written request was served");
  const g = opt(received, "the day you were served a copy of the notice of commencement");
  const s = opt(served, "the day the notice of furnishing is served");
  const l = opt(last, "your last day of work");
  if (!PROPERTIES[property]) errors.push("Choose the kind of property.");
  if (errors.length) return { errors };
  if (g !== null && q !== null && g < q) return { errors: ["The copy was served before your request; check both dates."] };
  if (l !== null && l < f) return { errors: ["The last day of work is before the first; check both dates."] };

  const t = parseDate(today);
  const out = { errors: [], notes: [] };
  let lastDay = addDays(f, 21);
  out.rule = "21 days after you first furnished (§ 1311.05(A))";
  if (r !== null && r > f) {
    lastDay = addDays(r, 21);
    out.rule = "21 days after the notice of commencement was recorded, since it was recorded after you started (§ 1311.04(I))";
    out.notes.push("You need not serve a notice of furnishing to keep lien rights for the period before the notice of commencement was recorded (§ 1311.04(I)).");
  }
  if (q !== null) {
    const due = addDays(q, 10);
    if (g !== null && g > due) {
      const ext = addDays(g, 21);
      if (ext > lastDay) {
        lastDay = ext;
        out.rule = "21 days after a copy of the notice of commencement was actually served on you, since it was not served within 10 days of your written request (§ 1311.04(E), (J))";
      }
    } else if (g === null) {
      out.notes.push(`Whoever you asked must serve you a copy within 10 days, by ${isoDate(due)} (§ 1311.04(E), (F)). If the owner's side does not, your time runs until 21 days after a copy actually reaches you (§ 1311.04(J)); keep proof of the request's delivery.`);
    }
  }
  out.lastDay = isoDate(lastDay);
  out.weekday = weekday(lastDay);
  out.status = status(lastDay, t);
  if (out.weekday === "Saturday" || out.weekday === "Sunday") out.notes.push(`${out.lastDay} is a ${out.weekday}. This page does not move a deadline off a weekend: mail it by certified mail the business day before and service is complete on mailing (§ 1311.19(B)).`);

  if (s !== null) {
    out.served = isoDate(s);
    out.onTime = s <= lastDay;
    if (out.onTime) out.covers = "all of your work on this job";
    else {
      const from = addDays(s, -21);
      out.coversFrom = isoDate(from);
      out.covers = `only what you furnish from ${out.coversFrom} on`;
      out.notes.push(`Late by ${days(lastDay, s)} day(s). A late notice keeps your lien for work in the 21 days before it was served and after, from ${out.coversFrom}, but does not revive rights for anything earlier (§ 1311.05(D)).`);
    }
  }
  if (l !== null) {
    const n = property === "dwelling" ? 60 : 75;
    const by = addDays(l, n);
    out.affidavitBy = isoDate(by);
    out.affidavitRule = `${n} days after your last labor, work or materials (§ 1311.06(B)(${property === "dwelling" ? 1 : 3}))`;
    out.affidavitStatus = status(by, t);
    out.notes.push("Once the affidavit is recorded with the county recorder, serve a copy on the owner or designee within 30 days (§ 1311.07).");
  }
  return out;
}
