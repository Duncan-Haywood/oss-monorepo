/**
 * DFARS 252.204-7012 cyber incident clock and checklist.
 *
 * A small shop that holds covered defense information (CDI) and finds a
 * cyber incident has a short list of duties in paragraphs (c) to (m) of the
 * clause, and two of them run on a clock:
 *
 *   - "Rapidly report" is defined in paragraph (a) as "within 72 hours of
 *     discovery of any cyber incident"; the report goes to
 *     https://dibnet.dod.mil (paragraph (c)(1)(ii)).
 *   - Images of the affected systems and the relevant monitoring/packet
 *     capture data are kept "for at least 90 days from the submission of
 *     the cyber incident report" (paragraph (e)).
 *
 * This module turns what the shop types (when it discovered the incident,
 * when it reported, whether malware was isolated, whether it is a
 * subcontractor) into those two dates, a checklist where every step cites
 * its paragraph, and an incident record as Markdown or JSON.
 *
 * Clause text: DFARS 252.204-7012 (MAY 2024), read from GSA's published
 * DFARS source (github.com/GSA/GSA-Acquisition-DFARS, dita/252.204-7012.dita)
 * on 25 November 2026; see SOURCES.md. Pure functions, nothing transmitted.
 */
import { mdText } from "./ssp.mjs";

export const REPORT_HOURS = 72;
export const PRESERVE_DAYS = 90;
const HOUR = 3600 * 1000;

export const CLAUSE = "DFARS 252.204-7012 (MAY 2024)";

/** Verbatim from the clause; pinned by a hash in incident.test.mjs. */
export const QUOTES = {
  rapidly: "“Rapidly report” means within 72 hours of discovery of any cyber incident.",
  preserve: "When a Contractor discovers a cyber incident has occurred, the Contractor shall preserve and protect images of all known affected information systems identified in paragraph (c)(1)(i) of this clause and all relevant monitoring/packet capture data for at least 90 days from the submission of the cyber incident report to allow DoD to request the media or decline interest.",
  malware: "Do not send the malicious software to the Contracting Officer.",
};

export function emptyIncident() {
  return {
    company: "",
    cage: "",
    contract: "",
    role: "prime", // prime | sub
    higherTier: "",
    clause: "unsure", // yes | no | unsure: is 252.204-7012 in the contract or subcontract?
    affects: "unsure", // cdi | ocs | neither | unsure
    discoveredAt: "", // local "YYYY-MM-DDTHH:MM", as from <input type="datetime-local">
    reportedAt: "",
    reportNumber: "",
    higherTierNotifiedAt: "",
    malware: "unknown", // none | found | unknown
    cloud: "unknown", // yes | no | unknown: does an external cloud provider hold CDI?
    systems: "",
    summary: "",
    steps: {}, // id -> { done: bool, note: string }
    timeline: [], // { at, text }
  };
}

const ENUMS = {
  role: ["prime", "sub"],
  clause: ["yes", "no", "unsure"],
  affects: ["cdi", "ocs", "neither", "unsure"],
  malware: ["none", "found", "unknown"],
  cloud: ["yes", "no", "unknown"],
};
const TEXT = ["company", "cage", "contract", "higherTier", "discoveredAt", "reportedAt", "reportNumber", "higherTierNotifiedAt", "systems", "summary"];
const MAX = 20000;

const str = (v) => (typeof v === "string" ? v.slice(0, MAX) : "");

/** Accepts anything (a re-opened JSON file) and returns a clean record. */
export function normaliseIncident(raw) {
  const out = emptyIncident();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const k of TEXT) out[k] = str(raw[k]);
  for (const [k, allowed] of Object.entries(ENUMS)) if (allowed.includes(raw[k])) out[k] = raw[k];
  if (raw.steps && typeof raw.steps === "object" && !Array.isArray(raw.steps)) {
    for (const s of STEPS) {
      const v = raw.steps[s.id];
      if (v && typeof v === "object") out.steps[s.id] = { done: v.done === true, note: str(v.note) };
    }
  }
  if (Array.isArray(raw.timeline)) {
    out.timeline = raw.timeline.slice(0, 500)
      .filter((e) => e && typeof e === "object")
      .map((e) => ({ at: str(e.at), text: str(e.text) }))
      .filter((e) => e.at || e.text);
  }
  return out;
}

/** Parses "YYYY-MM-DDTHH:MM[:SS]" as local time; anything else is null. */
export function parseLocal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1).map((x) => Number(x || 0));
  const dt = new Date(y, mo - 1, d, h, mi, se);
  // Reject rollovers such as 2026-02-30.
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d || dt.getHours() !== h || dt.getMinutes() !== mi) return null;
  return dt;
}

const pad = (n) => String(n).padStart(2, "0");
/** Local "YYYY-MM-DD HH:MM", the same wall clock the shop typed in. */
export function fmtLocal(dt) {
  if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export function fmtDuration(ms) {
  const neg = ms < 0;
  let m = Math.floor(Math.abs(ms) / 60000);
  const d = Math.floor(m / 1440); m -= d * 1440;
  const h = Math.floor(m / 60); m -= h * 60;
  const parts = [];
  if (d) parts.push(`${d} d`);
  if (d || h) parts.push(`${h} h`);
  parts.push(`${m} min`);
  return (neg ? "-" : "") + parts.join(" ");
}

/**
 * Does paragraph (c) apply? (c)(1) covers an incident that "affects a covered
 * contractor information system or the covered defense information residing
 * therein, or that affects the contractor's ability to perform the
 * requirements of the contract that are designated as operationally critical
 * support". The clause has to be in the contract, or flowed down under (m).
 * Returns { required: true | false | null, reason }.
 */
export function applicability(input) {
  const r = normaliseIncident(input);
  if (r.clause === "no") {
    return { required: false, reason: "Your contract does not carry DFARS 252.204-7012, so its 72-hour report is not owed under that clause. Other clauses, laws or your customer's terms may still require a report (paragraph (l) says the clause does not replace them). Check before you decide nothing is owed." };
  }
  if (r.affects === "neither") {
    return { required: r.clause === "yes" ? false : null, reason: "You say the incident touched no system that stores, processes or transmits covered defense information and no operationally critical support. Then paragraph (c) is not triggered. Paragraph (c)(1)(i) asks for a review that looks for evidence of compromise, including other systems that may have been accessed; write down how you reached the conclusion." };
  }
  if (r.clause === "yes" && (r.affects === "cdi" || r.affects === "ocs")) {
    return { required: true, reason: "The clause is in your contract and the incident affects " + (r.affects === "cdi" ? "a covered contractor information system or the CDI on it" : "operationally critical support named in the contract") + ": review, report within 72 hours of discovery, and preserve images." };
  }
  return { required: null, reason: "Not settled yet. Check the contract (and any subcontract or purchase order) for 252.204-7012 and decide whether the affected systems hold CDI. While you find out, run the 72-hour clock from discovery: a late report cannot be made on time afterwards." };
}

/**
 * The two clocks. `now` defaults to the current time.
 * Returns null fields until the inputs they need are typed.
 */
export function deadlines(input, { now = new Date() } = {}) {
  const r = normaliseIncident(input);
  const discovered = parseLocal(r.discoveredAt);
  const reported = parseLocal(r.reportedAt);
  const out = { discovered, reported, reportDue: null, msLeft: null, overdue: false, reportedLate: null, reportedAfterMs: null, preserveUntil: null, preserveMsLeft: null, error: null };
  if (discovered) {
    out.reportDue = new Date(discovered.getTime() + REPORT_HOURS * HOUR);
    if (discovered.getTime() > now.getTime() + 60000) out.error = "The discovery time is in the future. Check the date and time.";
    if (!reported) {
      out.msLeft = out.reportDue.getTime() - now.getTime();
      out.overdue = out.msLeft < 0;
    }
  }
  if (reported) {
    // Calendar days on the local clock, so a DST change inside the 90 days
    // does not move the date by an hour into the previous day.
    out.preserveUntil = new Date(reported.getFullYear(), reported.getMonth(), reported.getDate() + PRESERVE_DAYS, reported.getHours(), reported.getMinutes());
    out.preserveMsLeft = out.preserveUntil.getTime() - now.getTime();
    if (discovered) {
      out.reportedAfterMs = reported.getTime() - discovered.getTime();
      if (out.reportedAfterMs < 0) out.error = "The report time is before the discovery time. Check both.";
      else out.reportedLate = out.reportedAfterMs > REPORT_HOURS * HOUR;
    }
  }
  return out;
}

/**
 * Every step, with the paragraph it comes from. `when(r)` decides whether a
 * step applies to this incident; steps that do not apply are left out.
 */
export const STEPS = [
  {
    id: "certificate", cite: "(c)(3)", title: "Have a DoD-approved medium assurance certificate",
    detail: "The clause requires one to report. Get it before an incident, not inside the 72 hours, from the External Certification Authority program (https://public.cyber.mil/eca/).",
    when: () => true,
  },
  {
    id: "review", cite: "(c)(1)(i)", title: "Review for evidence that CDI was compromised",
    detail: "Identify compromised computers, servers, specific data and user accounts. Include the systems that were part of the incident and any other system on your network that may have been accessed because of it.",
    when: () => true,
  },
  {
    id: "report", cite: "(a), (c)(1)(ii), (c)(2)", title: "Report to DoD at https://dibnet.dod.mil within 72 hours of discovery",
    detail: "The report needs, at a minimum, the elements DIBNet asks for. You do not need to finish the review first: report what you know within 72 hours.",
    when: () => true,
  },
  {
    id: "number", cite: "(m)(2)(ii)", title: "Write down the incident report number DoD assigns",
    detail: "DIBNet assigns it automatically when you submit. Keep it with this record.",
    when: () => true,
  },
  {
    id: "higher", cite: "(m)(2)(ii)", title: "Give the report number to your prime or next higher-tier subcontractor",
    detail: "As soon as practicable after you report to DoD. Primes have to require this of their subcontractors.",
    when: (r) => r.role === "sub",
  },
  {
    id: "preserve", cite: "(e)", title: "Preserve images of the affected systems and the monitoring/packet capture data",
    detail: "Keep images of all known affected information systems and all relevant monitoring and packet capture data for at least 90 days from the day you submitted the report, so DoD can ask for them or decline. Do not wipe or rebuild a machine before it is imaged.",
    when: () => true,
  },
  {
    id: "malware", cite: "(d)", title: "Submit isolated malicious software to the DoD Cyber Crime Center (DC3)",
    detail: "Follow the instructions DC3 or the Contracting Officer gives you. Do not send the malicious software to the Contracting Officer.",
    when: (r) => r.malware !== "none",
  },
  {
    id: "cloud", cite: "(b)(2)(ii)(D)", title: "Bring in your cloud provider",
    detail: "A cloud service provider that holds CDI for you must meet paragraphs (c) to (g) too: reporting, malware, preserving media, access for forensics and damage assessment. Ask it for its logs and its own review now.",
    when: (r) => r.cloud !== "no",
  },
  {
    id: "access", cite: "(f), (g)", title: "Be ready to give DoD access for forensic analysis and damage assessment",
    detail: "On request, DoD gets access to the additional information or equipment it needs for a forensic analysis. If DoD runs a damage assessment, the Contracting Officer will ask for the information you preserved under (e).",
    when: () => true,
  },
  {
    id: "mark", cite: "(h)", title: "Mark contractor attributional or proprietary information",
    detail: "To the maximum extent practicable, identify and mark what in your report and media identifies your company or is proprietary, so DoD can protect it.",
    when: () => true,
  },
  {
    id: "other", cite: "(l)", title: "Check the other reports you may owe",
    detail: "The clause does not replace reporting required by other clauses in your contracts or by other law. Check your contracts and, where it matters, ask counsel or your insurer.",
    when: () => true,
  },
];

export function checklist(input) {
  const r = normaliseIncident(input);
  return STEPS.filter((s) => s.when(r)).map((s) => ({
    id: s.id, cite: s.cite, title: s.title, detail: s.detail,
    done: r.steps[s.id]?.done === true,
    note: r.steps[s.id]?.note || "",
  }));
}

/** One-line status of the report clock, for the page and the record. */
export function clockText(d) {
  if (d.error) return d.error;
  if (!d.discovered) return "Enter when the incident was discovered to start the 72-hour clock.";
  if (d.reported) {
    if (d.reportedLate === null) return `Reported ${fmtLocal(d.reported)}.`;
    return `Reported ${fmtLocal(d.reported)}, ${fmtDuration(d.reportedAfterMs)} after discovery: ` + (d.reportedLate ? "later than the 72 hours the clause allows. Record why in the timeline." : "inside the 72 hours.");
  }
  if (d.overdue) return `The 72 hours ran out at ${fmtLocal(d.reportDue)} (${fmtDuration(-d.msLeft)} ago). Report now and record why it is late.`;
  return `Report due by ${fmtLocal(d.reportDue)}: ${fmtDuration(d.msLeft)} left.`;
}

function cell(s) {
  return mdText(String(s ?? "").replace(/\s*\n\s*/g, " ")) || " ";
}

export function incidentToMarkdown(input, { now = new Date() } = {}) {
  const r = normaliseIncident(input);
  const d = deadlines(r, { now });
  const a = applicability(r);
  const L = [];
  L.push(`# Cyber incident record: ${mdText(r.company || "Company not named")}`);
  L.push("");
  L.push(`Under ${CLAUSE}. Prepared ${fmtLocal(now)} with a free self-help checklist; it is not legal advice and not a DIBNet report.`);
  L.push("");
  L.push("| | |");
  L.push("|---|---|");
  L.push(`| CAGE code | ${cell(r.cage || "-")} |`);
  L.push(`| Contract | ${cell(r.contract || "-")} |`);
  L.push(`| Role | ${r.role === "sub" ? "Subcontractor" + (r.higherTier ? ", reports to " + cell(r.higherTier) : "") : "Prime contractor"} |`);
  L.push(`| Discovered | ${fmtLocal(d.discovered) || "-"} |`);
  L.push(`| 72-hour report due | ${fmtLocal(d.reportDue) || "-"} |`);
  L.push(`| Reported to DIBNet | ${fmtLocal(d.reported) || "not yet"} |`);
  L.push(`| DoD incident report number | ${cell(r.reportNumber || "-")} |`);
  if (r.role === "sub") L.push(`| Number given to higher tier | ${cell(r.higherTierNotifiedAt.replace("T", " ") || "not yet")} |`);
  L.push(`| Keep images and capture data until at least | ${d.preserveUntil ? fmtLocal(d.preserveUntil) : "90 days after the report is submitted"} |`);
  L.push("");
  L.push(`**Report clock:** ${mdText(clockText(d))}`);
  L.push("");
  L.push(`**Does paragraph (c) apply?** ${mdText(a.reason)}`);
  L.push("");
  if (r.summary.trim()) { L.push("## What happened"); L.push(""); L.push(r.summary.trim().split(/\n/).map(mdText).join("  \n")); L.push(""); }
  if (r.systems.trim()) { L.push("## Affected systems"); L.push(""); L.push(r.systems.trim().split(/\n/).map(mdText).join("  \n")); L.push(""); }
  L.push("## Checklist");
  L.push("");
  for (const s of checklist(r)) {
    L.push(`- [${s.done ? "x" : " "}] **${mdText(s.title)}** (${mdText(s.cite)})` + (s.note.trim() ? `: ${cell(s.note)}` : ""));
  }
  L.push("");
  if (r.timeline.length) {
    L.push("## Timeline");
    L.push("");
    L.push("| When | What |");
    L.push("|---|---|");
    for (const e of [...r.timeline].sort((x, y) => x.at.localeCompare(y.at))) L.push(`| ${cell(e.at.replace("T", " "))} | ${cell(e.text)} |`);
    L.push("");
  }
  L.push("> Paragraph references are to DFARS 252.204-7012 (MAY 2024). Read the clause in your contract: the version there governs.");
  return L.join("\n") + "\n";
}

export function incidentToJson(input) {
  return JSON.stringify({ format: "machine-shop-guides/incident@1", ...normaliseIncident(input) }, null, 2);
}
