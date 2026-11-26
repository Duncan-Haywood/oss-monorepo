/**
 * CMMC affirmation and assessment due dates.
 *
 * After a CMMC assessment a small defense shop has a handful of dates to
 * keep, and missing one can cost the status it worked for:
 *
 *   - Level 1 (Self): a self-assessment every year, results in SPRS
 *     (32 CFR 170.15(a)(1)), and an affirmation after it.
 *   - Level 2 (Self): a self-assessment every three years (170.16(a)(1));
 *     a Conditional status needs a POA&M closeout self-assessment posted to
 *     SPRS within 180 days of the Conditional CMMC Status Date
 *     (170.16(a)(1)(ii)(B)).
 *   - Level 2 (C3PAO): a certification assessment every three years and a
 *     POA&M closeout assessment by a C3PAO within 180 days of the Conditional
 *     status date (170.17; read through search excerpts, see SOURCES.md).
 *   - Every level: the Affirming Official affirms in SPRS after every
 *     assessment, including a POA&M closeout, and annually thereafter
 *     (170.22(a)).
 *
 * This module turns the dates a shop already has (its CMMC Status Date, the
 * last affirmation, a closeout if any) into those due dates, a year-by-year
 * plan to the next assessment, a calendar file (RFC 5545) with alarms 60 and
 * 7 days ahead, and a Markdown record. It mirrors the rules the CMMC
 * workspace's affirmation schedule uses, so a date here and a date there
 * agree. Pure functions; nothing is transmitted.
 *
 * These are reminders computed from what the user typed, not a determination
 * of anyone's CMMC status. The affirming official decides what is due.
 */
import { mdText } from "./ssp.mjs";

/** Days of warning before a due date: the page turns it amber, and the first calendar alarm. */
export const DUE_SOON_DAYS = 60;
/** Calendar alarms, in days before each due date. */
export const ALARM_DAYS = [DUE_SOON_DAYS, 7];
export const CLOSEOUT_DAYS = 180;

export const LEVELS = {
  l1: { label: "Level 1 (Self)", cycleYears: 1, conditional: false, assessor: "self" },
  l2self: { label: "Level 2 (Self)", cycleYears: 3, conditional: true, assessor: "self" },
  l2c3pao: { label: "Level 2 (C3PAO)", cycleYears: 3, conditional: true, assessor: "c3pao" },
};

/**
 * Wording from 32 CFR part 170 as recorded, with the date read from eCFR, in the CMMC
 * workspace's affirmation schedule (read 25 Nov 2026; not re-read in this session because
 * ecfr.gov refused the proxy). page.test.mjs checks every <q> on the page is one of these.
 */
export const QUOTES = {
  affirm: "must affirm the continuing compliance of their respective organizations with the specified security requirement after every assessment, including POA&M closeout, and annually thereafter. Affirmations are entered electronically in SPRS.",
  l1: "the OSA must conduct a Level 1 self-assessment on an annual basis and submit the results in SPRS",
  l2self: "the OSA must conduct a Level 2 self-assessment every three years",
  closeout: "within 180 days of the CMMC Status Date associated with the Conditional Level 2 (Self)",
};

/** The level's rules; an unknown key (never an inherited one such as "constructor") reads as Level 2 (Self). */
export const levelOf = (key) => LEVELS[Object.hasOwn(LEVELS, key) ? key : "l2self"];

export function emptyPlan() {
  return {
    level: "l2self", // l1 | l2self | l2c3pao
    status: "final", // final | conditional: the status the assessment gave
    statusDate: "", // YYYY-MM-DD, the CMMC Status Date in SPRS (or eMASS for a C3PAO)
    lastAffirmed: "", // YYYY-MM-DD, the latest affirmation entered in SPRS (empty: none yet)
    closeoutDate: "", // YYYY-MM-DD, a passed POA&M closeout assessment (Conditional only)
    closeoutAffirmed: "no", // yes | no: was an affirmation entered after that closeout?
    company: "",
    cage: "",
    official: "",
  };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written YYYY-MM-DD. */
export function isIsoDate(s) {
  const m = typeof s === "string" ? DATE_RE.exec(s) : null;
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s;
}

const parts = (s) => s.split("-").map(Number);
const fmt = (dt) => dt.toISOString().slice(0, 10);

/** The same date `years` later; 29 February becomes 28 February (a day early, never late). */
export function addYears(date, years) {
  const [y, m, d] = parts(date);
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(y + years, m - 1, Math.min(d, last))));
}

export function addDays(date, days) {
  const [y, m, d] = parts(date);
  return fmt(new Date(Date.UTC(y, m - 1, d + days)));
}

export function daysBetween(from, to) {
  const [a, b, c] = parts(from);
  const [x, y, z] = parts(to);
  return Math.round((Date.UTC(x, y - 1, z) - Date.UTC(a, b - 1, c)) / 86_400_000);
}

/** Today's date in the visitor's own calendar, YYYY-MM-DD. */
export function localToday(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const pick = (v, allowed, dflt) => (allowed.includes(v) ? v : dflt);
const text = (v, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
const date = (v) => (isIsoDate(v) ? v : "");

/** A plan from anything (a saved file, a query string), with unknown values dropped. */
export function normalisePlan(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const level = pick(r.level, Object.keys(LEVELS), "l2self");
  const p = {
    level,
    status: levelOf(level).conditional ? pick(r.status, ["final", "conditional"], "final") : "final",
    statusDate: date(r.statusDate),
    lastAffirmed: date(r.lastAffirmed),
    closeoutDate: date(r.closeoutDate),
    closeoutAffirmed: pick(r.closeoutAffirmed, ["yes", "no"], "no"),
    company: text(r.company),
    cage: text(r.cage, 20),
    official: text(r.official),
  };
  if (p.status !== "conditional") { p.closeoutDate = ""; p.closeoutAffirmed = "no"; }
  return p;
}

/** Problems that stop the dates being worked out, or make them doubtful. */
export function checkPlan(p, today) {
  const errors = [];
  const warnings = [];
  if (!p.statusDate) errors.push("Enter the CMMC Status Date from SPRS (or eMASS, for a C3PAO assessment).");
  else if (p.statusDate > today) errors.push("The CMMC Status Date cannot be in the future.");
  if (p.lastAffirmed && p.lastAffirmed > today) errors.push("The last affirmation cannot be in the future.");
  if (p.statusDate && p.lastAffirmed && p.lastAffirmed < p.statusDate)
    warnings.push("The last affirmation is before the CMMC Status Date. Every assessment needs its own affirmation (32 CFR 170.22(a)): if you affirmed after this assessment, enter that date.");
  if (p.closeoutDate) {
    if (p.closeoutDate > today) errors.push("The POA&M closeout date cannot be in the future.");
    if (p.statusDate && p.closeoutDate < p.statusDate) errors.push("The POA&M closeout cannot be before the Conditional status date.");
    else if (p.statusDate && daysBetween(p.statusDate, p.closeoutDate) > CLOSEOUT_DAYS)
      warnings.push("The closeout is more than 180 days after the Conditional status date. A Conditional status that is not closed out in 180 days expires, so check what SPRS shows before relying on these dates.");
  }
  return { errors, warnings };
}

function deadline(key, label, due, basis, today) {
  const daysLeft = daysBetween(today, due);
  const state = daysLeft < 0 ? "overdue" : daysLeft <= DUE_SOON_DAYS ? "due_soon" : "ok";
  return { key, label, due, daysLeft, state, basis };
}

/**
 * The dates that are due next, soonest first. Empty when the plan has errors.
 *
 * - Assessment: the cycle runs from the CMMC Status Date; a closeout does not restart it.
 * - POA&M closeout: Conditional with no closeout recorded, 180 days from the status date.
 * - Affirmation after the closeout: due now when a closeout is recorded with none after it.
 * - Annual affirmation: a year after the latest affirmation (or after the status date when
 *   none is recorded, which also flags the missing one).
 */
export function dueDates(p, today) {
  if (checkPlan(p, today).errors.length) return [];
  const L = levelOf(p.level);
  const out = [];
  const conditionalOpen = p.status === "conditional" && !p.closeoutDate;
  if (conditionalOpen) {
    out.push(deadline("closeout",
      L.assessor === "c3pao" ? "POA&M closeout assessment by a C3PAO, results in eMASS" : "POA&M closeout self-assessment, results posted to SPRS",
      addDays(p.statusDate, CLOSEOUT_DAYS),
      L.assessor === "c3pao"
        ? "32 CFR 170.17: within 180 days of the Conditional Level 2 (C3PAO) CMMC Status Date; the Conditional status expires if it is not closed out"
        : "32 CFR 170.16(a)(1)(ii)(B): within 180 days of the Conditional Level 2 (Self) CMMC Status Date; the Conditional status expires if it is not closed out",
      today));
  }
  if (!p.lastAffirmed) {
    out.push(deadline("first_affirmation", "Affirmation after the assessment, in SPRS", p.statusDate,
      "32 CFR 170.22(a): an affirmation after every assessment. None is recorded here since the CMMC Status Date", today));
  }
  if (p.closeoutDate && p.closeoutAffirmed !== "yes") {
    out.push(deadline("closeout_affirmation", "Affirmation after the POA&M closeout, in SPRS", p.closeoutDate,
      "32 CFR 170.22(a): an affirmation after every assessment, including POA&M closeout", today));
  }
  const lastAffirmation = [p.lastAffirmed, p.closeoutAffirmed === "yes" ? p.closeoutDate : ""]
    .filter(Boolean).sort().at(-1) || p.statusDate;
  out.push(deadline("annual_affirmation", "Annual affirmation in SPRS", addYears(lastAffirmation, 1),
    "32 CFR 170.22(a): after every assessment, including POA&M closeout, and annually thereafter (counted from the latest affirmation)", today));
  out.push(deadline("assessment",
    p.level === "l1" ? "Annual Level 1 self-assessment, results in SPRS"
      : L.assessor === "c3pao" ? "Level 2 certification assessment by a C3PAO"
        : "Level 2 self-assessment, results in SPRS",
    addYears(p.statusDate, L.cycleYears),
    p.level === "l1" ? "32 CFR 170.15(a)(1): a Level 1 self-assessment on an annual basis (counted from the CMMC Status Date)"
      : L.assessor === "c3pao" ? "32 CFR 170.17: a Level 2 certification assessment every three years (counted from the CMMC Status Date, not the closeout)"
        : "32 CFR 170.16(a)(1): a Level 2 self-assessment every three years (counted from the CMMC Status Date, not the closeout)",
    today));
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.key.localeCompare(b.key));
}

/**
 * Every affirmation and assessment date from the status date to the next assessment, for
 * planning the years ahead: assuming each annual affirmation is made on its due date.
 */
export function cyclePlan(p, today) {
  if (checkPlan(p, today).errors.length) return [];
  const L = levelOf(p.level);
  const end = addYears(p.statusDate, L.cycleYears);
  const rows = [];
  const anchor = [p.lastAffirmed, p.closeoutAffirmed === "yes" ? p.closeoutDate : ""].filter(Boolean).sort().at(-1) || p.statusDate;
  for (let n = 1; n <= 10; n++) {
    const d = addYears(anchor, n);
    if (d >= end) break;
    rows.push({ date: d, what: "Annual affirmation in SPRS" });
  }
  rows.push({ date: end, what: p.level === "l1" ? "Annual self-assessment, then its affirmation" : `Next ${L.assessor === "c3pao" ? "C3PAO certification assessment" : "self-assessment"}, then its affirmation` });
  if (p.status === "conditional" && !p.closeoutDate) rows.push({ date: addDays(p.statusDate, CLOSEOUT_DAYS), what: "POA&M closeout deadline (Conditional status expires after it)" });
  return rows.sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ ...r, past: r.date < today }));
}

/** One line on where things stand, for the result box. */
export function summary(p, today) {
  const { errors } = checkPlan(p, today);
  if (errors.length) return errors[0];
  const d = dueDates(p, today);
  const late = d.filter((x) => x.state === "overdue");
  if (late.length) return `${late.length} date${late.length > 1 ? "s" : ""} passed: ${late.map((x) => x.label).join("; ")}. Check SPRS now.`;
  const next = d[0];
  return `Next: ${next.label} by ${next.due}, ${next.daysLeft === 0 ? "today" : `in ${next.daysLeft} day${next.daysLeft === 1 ? "" : "s"}`}.`;
}

// --- Calendar file (RFC 5545) ---

/** RFC 5545 3.3.11: backslash, semicolon, comma and newlines are escaped in TEXT values. */
export function icsText(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

const enc = new TextEncoder();
/** RFC 5545 3.1: fold lines over 75 octets with CRLF and a space, never inside a UTF-8 sequence. */
export function foldLine(line) {
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = "", bytes = 0, limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) { out.push(cur); cur = ""; bytes = 0; limit = 74; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const NOTE = "A planning reminder from the dates you typed, not a determination of your CMMC status. The affirming official enters affirmations in SPRS.";

/**
 * The due dates as an .ics file: one all-day event per date that has not passed yet, with alarms
 * 60 and 7 days ahead, at most one per day. UIDs depend on the level, the kind of date and the
 * date itself, so re-importing the same plan does not double up in calendars that honour UID.
 */
export function plansToIcs(p, today, now = new Date()) {
  const stamp = now.toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
  const who = p.company ? ` (${p.company})` : "";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Machine shop guides//CMMC due dates//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  const seen = new Set();
  const events = [
    ...dueDates(p, today).filter((d) => d.daysLeft >= 0).map((d) => ({ key: d.key, date: d.due, title: d.label, basis: d.basis })),
    ...cyclePlan(p, today).filter((r) => !r.past).map((r) => ({ key: "plan", date: r.date, title: r.what, basis: "" })),
  ];
  for (const e of events) {
    if (seen.has(e.date)) continue; // one reminder per day: the due date wins over the plan row
    seen.add(e.date);
    const title = `CMMC ${levelOf(p.level).label}${who}: ${e.title}`;
    lines.push("BEGIN:VEVENT",
      `UID:cmmc-${p.level}-${e.key}-${e.date.replace(/-/g, "")}@machine-shop-guides`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${e.date.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, "")}`,
      `SUMMARY:${icsText(title)}`,
      `DESCRIPTION:${icsText((e.basis ? e.basis + "\n\n" : "") + NOTE)}`,
      "TRANSP:TRANSPARENT");
    for (const days of ALARM_DAYS) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `TRIGGER;RELATED=START:-P${days}D`, `DESCRIPTION:${icsText(`${title}: due in ${days} days (${e.date})`)}`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** The plan as Markdown, for the compliance binder. */
export function planToMarkdown(p, today) {
  const L = levelOf(p.level);
  const out = [`# CMMC due dates: ${mdText(L.label)}`, ""];
  if (p.company || p.cage) out.push(`Company: ${mdText(p.company) || "-"}  `, `CAGE: ${mdText(p.cage) || "-"}  `);
  if (p.official) out.push(`Affirming Official: ${mdText(p.official)}  `);
  out.push(`CMMC Status: ${p.status === "conditional" ? "Conditional" : "Final"}, status date ${p.statusDate || "-"}  `,
    `Last affirmation: ${p.lastAffirmed || "none recorded"}  `);
  if (p.closeoutDate) out.push(`POA&M closeout: ${p.closeoutDate} (affirmed after it: ${p.closeoutAffirmed})  `);
  out.push(`Worked out on: ${today}`, "");
  const { errors, warnings } = checkPlan(p, today);
  for (const e of errors) out.push(`- Error: ${mdText(e)}`);
  for (const w of warnings) out.push(`- Check: ${mdText(w)}`);
  if (errors.length || warnings.length) out.push("");
  out.push("## Due next", "", "| Due | What | Days left | Basis |", "|---|---|---|---|");
  for (const d of dueDates(p, today)) out.push(`| ${d.due} | ${mdText(d.label)} | ${d.daysLeft < 0 ? `${-d.daysLeft} days ago` : d.daysLeft} | ${mdText(d.basis)} |`);
  out.push("", "## The cycle", "", "| Date | What |", "|---|---|");
  for (const r of cyclePlan(p, today)) out.push(`| ${r.date} | ${mdText(r.what)}${r.past ? " (past)" : ""} |`);
  out.push("", `_${mdText(NOTE)}_`, "");
  return out.join("\n");
}
