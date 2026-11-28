// Utah preliminary notice: the 20-day filing with the State Construction Registry that every
// person who may want a construction lien makes (Utah Code § 38-1a-501), and its government-project
// twin (§ 38-1b-202). Gives the last day, what a late filing still protects, when a notice of
// completion cuts filing off, the lien recording date that follows (§ 38-1a-502) and a checklist of
// what the filing must carry (§ 38-1a-501(1)(h)).
//
// Source: Utah Code §§ 38-1a-102, 38-1a-501, 38-1a-502, 38-1a-503, 38-1a-506, 38-1a-507, 38-1a-701,
// 38-1b-202 and 68-3-7, text from le.utah.gov read 2026-11-28, kept in sources/ut-38.txt
// (utprelim.test.mjs checks every quoted phrase on the page against it).
//
// Day counting: "no later than 20 days after the day on which the person commences providing
// construction work", so the last day is the first day + 20 calendar days. § 68-3-7 carries a period
// that ends on a Saturday, Sunday or legal holiday to the next day that is none of them; this module
// reports the weekday and says so, but plans on the unmoved date (Utah's legal holidays are not
// computed here). A late private-project filing reaches no work provided "before the date that is
// five days after the preliminary notice is filed" (§ 38-1a-501(1)(c)(ii)), so coverage starts on the
// filing day + 5. A filing "more than 10 days after the filing of a notice of completion" has no
// effect (§ 38-1a-501(1)(d)). The lien is recorded within 180 days after final completion, or 90
// days after a notice of completion but never later than 180 days after final completion
// (§ 38-1a-502(1)(a)). Pure functions, no I/O.

import { parseDate, isoDate } from "./prelim.mjs";

export { parseDate, isoDate };

const DAY = 86400000;
const addDays = (t, n) => t + n * DAY;
const days = (a, b) => Math.round((b - a) / DAY);
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const weekday = (t) => WEEKDAYS[new Date(t).getUTCDay()];

export const PROJECTS = {
  private: "A private job (anything not built for a government entity)",
  government: "A government job (state, county, city, school district and the like)",
};

export const ROLES = {
  sub: "A subcontractor or supplier",
  direct: "I contracted directly with the owner (the original contractor)",
  laborer: "A worker paid wages for my own labor",
};

// Who files. Private: § 38-1a-501(1)(a) and (e) apply to "A person who desires to claim a
// construction lien", with no exception for the original contractor or for wage earners.
// Government: § 38-1b-202(1)(a) excepts a person with a contract with the owner and a laborer paid
// wages, and (1)(b) keeps temporary labor and professional employer companies in.
export function whoFiles(project, role) {
  if (project === "government") {
    if (role === "direct") return { needed: false, why: "On a government project the preliminary notice is for subcontractors: a person who has a contract with the owner does not file one (§ 38-1b-202(1)(a)). Public property is not liened; the subs below you look to the payment bond." };
    if (role === "laborer") return { needed: false, why: "A laborer compensated with wages does not file a government-project preliminary notice (§ 38-1b-202(1)(a)). A temporary labor or professional employer company that supplies the labor still does (§ 38-1b-202(1)(b))." };
    return { needed: true, why: "A subcontractor on a government project files a preliminary notice with the registry, attached to the project's notice of commencement (§ 38-1b-202(1), (3)). Without a timely one, claims for work before the fifth day after filing are lost except against the person who hired you (§ 38-1b-202(5)). The claim itself is against the payment bond, not the property." };
  }
  const base = "Anyone who may want a construction lien files, original contractor included: “A person who fails to file a preliminary notice as required in this section may not claim a construction lien” (§ 38-1a-501(1)(e)).";
  if (role === "laborer") return { needed: true, why: `${base} The private-project section has no exception for a wage earner, though your employer's own filing is what usually protects your wages.` };
  if (role === "direct") return { needed: true, why: `${base} Your filing is often the first on the project, which sets the date every construction lien on it relates back to (§ 38-1a-503(1)), and subs who link to its entry number substantially comply (§ 38-1a-501(2)(b)).` };
  return { needed: true, why: `${base} One filing covers all your work under one original contract, even for more than one sub above you (§ 38-1a-501(1)(b)); work under a second original contract needs its own (§ 38-1a-501(3)(b)).` };
}

function status(deadline, today) {
  if (Number.isNaN(today)) return null;
  const left = days(today, deadline);
  return { daysLeft: left, state: left < 0 ? "past" : left === 0 ? "today" : left <= 5 ? "soon" : "open" };
}

// first: day you commenced providing construction work; filed: day the notice was or will be filed.
// commencement (government): day the notice of commencement was filed. completion / noc (private):
// final completion and the day a notice of completion was filed, for § 38-1a-501(1)(d) and § 38-1a-502.
export function noticeDates({ project = "private", first, filed, commencement, completed, noc, today } = {}) {
  const errors = [];
  if (!PROJECTS[project]) errors.push("Choose whether the job is private or a government project.");
  const f = parseDate(first);
  if (Number.isNaN(f)) errors.push("Enter the day you first provided construction work on the job as YYYY-MM-DD.");
  const opt = (v, what) => {
    if (!v || !String(v).trim()) return null;
    const t = parseDate(v);
    if (Number.isNaN(t)) errors.push(`Enter ${what} as YYYY-MM-DD, or leave it blank.`);
    return t;
  };
  const m = opt(filed, "the day the notice is filed");
  const gov = project === "government";
  const nc = gov ? opt(commencement, "the day the notice of commencement was filed") : null;
  const c = gov ? null : opt(completed, "the final completion date");
  const n = gov ? null : opt(noc, "the day the notice of completion was filed");
  if (errors.length) return { errors };
  if (m !== null && m < f) return { errors: ["The filing date is before the first day of work. A preliminary notice can be filed before work starts, but then the 20 days have not begun; check both dates."] };
  if (n !== null && c !== null && n < c) return { errors: ["A notice of completion is filed upon final completion (§ 38-1a-507(1)(a)); check both dates."] };

  const t = parseDate(today);
  let lastDay = addDays(f, 20);
  const out = { errors: [], notes: [] };
  if (gov && nc !== null && f < nc) {
    // § 38-1b-202(1)(a)(ii): the later of the two when work began before the notice of commencement.
    lastDay = Math.max(lastDay, addDays(nc, 20));
    out.rule = "the later of 20 days after you started and 20 days after the notice of commencement was filed (§ 38-1b-202(1)(a))";
    if (days(f, nc) > 15) out.notes.push(`The notice of commencement was filed ${days(f, nc)} days after you began work, more than 15, so you need not file a preliminary notice to keep your rights (§ 38-1b-202(8)). Filing one anyway costs little and leaves no argument.`);
  } else out.rule = gov ? "20 days after you started work (§ 38-1b-202(1)(a))" : "20 days after you started work (§ 38-1a-501(1)(a))";
  out.lastDay = isoDate(lastDay);
  out.weekday = weekday(lastDay);
  out.status = status(lastDay, t);
  if (out.weekday === "Saturday" || out.weekday === "Sunday") out.notes.push(`${out.lastDay} is a ${out.weekday}. § 68-3-7 carries a deadline that ends on a Saturday, Sunday or legal holiday to the next day that is none of them, so a later filing may still count; file by ${out.lastDay} and the question never comes up.`);

  if (m !== null) {
    out.filed = isoDate(m);
    out.onTime = m <= lastDay;
    out.effectiveFrom = isoDate(addDays(m, 5));
    if (out.onTime) out.covers = "all of your work on this job";
    else {
      out.covers = `only what you provide from ${out.effectiveFrom} on`;
      out.lostDays = days(f, addDays(m, 5));
      out.notes.push(gov
        ? `Late by ${days(lastDay, m)} day(s). The notice takes effect five days after filing (§ 38-1b-202(4)), and claims for work from ${isoDate(f)} to ${isoDate(addDays(m, 4))} are lost except against the person who hired you (§ 38-1b-202(5)).`
        : `Late by ${days(lastDay, m)} day(s). You may still file, but you may not claim a lien for work provided before ${out.effectiveFrom}, five days after filing (§ 38-1a-501(1)(c)(ii)): ${isoDate(f)} to ${isoDate(addDays(m, 4))} is outside the lien.`);
    }
    if (n !== null && days(n, m) > 10) {
      out.noEffect = true;
      out.covers = "nothing: it was filed more than 10 days after the notice of completion";
      out.notes.unshift(`Filed ${days(n, m)} days after the notice of completion: a preliminary notice filed more than 10 days after it has no effect (§ 38-1a-501(1)(d)).`);
    }
  }
  if (n !== null) {
    out.cutoff = isoDate(addDays(n, 10));
    out.notes.push(`A notice of completion was filed on ${isoDate(n)}: a preliminary notice filed after ${out.cutoff} has no effect at all (§ 38-1a-501(1)(d)).`);
  }
  if (!gov && c !== null) {
    const outer = addDays(c, 180);
    if (n !== null) {
      const ninety = addDays(n, 90);
      out.recordBy = isoDate(Math.min(ninety, outer));
      out.recordRule = ninety <= outer
        ? "90 days after the notice of completion was filed (§ 38-1a-502(1)(a)(ii))"
        : "180 days after final completion, the outer limit even with a notice of completion (§ 38-1a-502(1)(a)(ii))";
    } else {
      out.recordBy = isoDate(outer);
      out.recordRule = "180 days after final completion of the original contract, with no notice of completion filed (§ 38-1a-502(1)(a)(i)); a notice of completion shortens it to 90 days after its filing";
    }
    out.recordStatus = status(parseDate(out.recordBy), t);
    out.notes.push("After recording, mail or deliver a copy to the owner by certified mail within 30 days (§ 38-1a-502(4)), and sue to enforce within 180 days of recording, with a notice of pendency recorded in the same time (§ 38-1a-701).");
  }
  return out;
}

// § 38-1a-501(1)(h): what a private-project preliminary notice "shall include". The last item is
// one of four identifiers, (vii)(A) to (D). Labels are ours; the section is cited on each.
export const ITEMS = [
  ["claimant", "Your name, address, telephone number and email address", "§ 38-1a-501(1)(h)(i)"],
  ["hiredBy", "Name and address of the person who contracted with you", "§ 38-1a-501(1)(h)(ii)"],
  ["owner", "Name of the record or reputed owner", "§ 38-1a-501(1)(h)(iii)"],
  ["original", "Name of the original contractor your work is under", "§ 38-1a-501(1)(h)(iv)"],
  ["site", "Address of the project property, or a description of its location", "§ 38-1a-501(1)(h)(v)"],
  ["county", "County the property is in", "§ 38-1a-501(1)(h)(vi)"],
];
export const IDENTIFIERS = [
  ["parcel", "Tax parcel identification number of each parcel", "§ 38-1a-501(1)(h)(vii)(A)"],
  ["loanEntry", "Entry number of a notice of construction loan on the project", "§ 38-1a-501(1)(h)(vii)(B)"],
  ["prelimEntry", "Entry number of an earlier preliminary notice on the project that lists the parcel numbers (for example the GC's)", "§ 38-1a-501(1)(h)(vii)(C)"],
  ["permit", "Entry number of the building permit", "§ 38-1a-501(1)(h)(vii)(D)"],
];
export const OPTIONAL = [
  ["projectName", "Subdivision, development or project name", "§ 38-1a-501(1)(i)(i)"],
  ["lot", "Lot or parcel number of each lot", "§ 38-1a-501(1)(i)(ii)"],
];

const clean = (v) => String(v ?? "").trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A checklist to have in hand before filing: each required item, filled or missing.
export function checklist(fields = {}) {
  const v = (k) => clean(fields[k]);
  const missing = [];
  const lines = ["Utah preliminary notice: what to have before you file (Utah Code § 38-1a-501(1)(h))", ""];
  for (const [k, label, cite] of ITEMS) {
    lines.push(`${label} (${cite}):`, v(k) || "____________________", "");
    if (!v(k)) missing.push(label.toLowerCase());
  }
  if (v("claimant") && !EMAIL.test(v("claimant").split(/[\s,;]+/).find((w) => w.includes("@")) || "")) missing.push("an email address in your contact details (§ 38-1a-501(1)(h)(i) asks for one)");
  const ids = IDENTIFIERS.filter(([k]) => v(k));
  lines.push("One of these identifies the project (§ 38-1a-501(1)(h)(vii)):");
  for (const [k, label] of IDENTIFIERS) lines.push(`  ${label}: ${v(k) || "-"}`);
  lines.push("");
  if (!ids.length) missing.push("one project identifier: a tax parcel number, or the entry number of the construction loan notice, an earlier preliminary notice or the building permit");
  const opts = OPTIONAL.filter(([k]) => v(k));
  if (opts.length) {
    lines.push("Optional (§ 38-1a-501(1)(i)):");
    for (const [k, label] of opts) lines.push(`  ${label}: ${v(k)}`);
    lines.push("");
  }
  lines.push(`First day of work: ${v("first") || "____________________"}`);
  if (v("work")) lines.push(`Work provided: ${v("work")}`);
  return { text: lines.join("\n"), missing, linked: Boolean(v("prelimEntry")) };
}
