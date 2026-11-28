// Cyber incident register: NIST SP 800-171 Rev. 2 3.6.1 and 3.6.2 (IR.L2-3.6.1, IR.L2-3.6.2: an
// incident-handling capability, and incidents tracked, documented and reported), with the two clocks
// DFARS 252.204-7012 runs once a shop holding covered defense information (CDI) discovers a cyber
// incident:
//
//   - paragraph (a): "Rapidly report" means within 72 hours of discovery; (c)(1)(ii): to DoD at
//     https://dibnet.dod.mil;
//   - paragraph (e): images of the affected systems and the relevant monitoring/packet capture data
//     kept for at least 90 days from the submission of the report.
//
// Every string in INCIDENT_QUOTES is a verbatim substring of DFARS 252.204-7012 (MAY 2024) as GSA
// publishes it for acquisition.gov (https://raw.githubusercontent.com/GSA/GSA-Acquisition-DFARS/master/dita/252.204-7012.dita),
// read on 2026-11-28 with tags removed and spaces collapsed; file sha256
// 99af021d6f34a1a2b8def660f9b7bd6d219c910c3dfd84a9db9591e5a73b18c1. incidents.test.ts pins the
// quotes' hash. The free front door's copy of the same logic is ventures/machine-shop-guides/incident.mjs
// (read 2026-11-25 from the same source). docs/SOURCES.md, "Incidents".
//
// Times are instants (ISO 8601 in UTC, as Date.prototype.toISOString writes them): the browser turns
// the shop's local wall clock into one and back, so a 72-hour deadline is 72 elapsed hours whatever
// daylight saving does. Everything here is pure, shared by the Worker and the SPA. A record-keeping
// aid: it files nothing with DoD and is not legal advice.

export const REPORT_HOURS = 72;
export const PRESERVE_DAYS = 90;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** A discovery time up to this far ahead of the server's clock is taken as clock skew, not a typo. */
const FUTURE_SLACK_MS = 5 * 60_000;
export const MAX_INCIDENTS_PER_ORG = 500;
export const MAX_TIMELINE_ENTRIES = 200;

export const INCIDENT_CLAUSE = "DFARS 252.204-7012 (MAY 2024)";

export const INCIDENT_QUOTES = {
  rapidly: "“Rapidly report” means within 72 hours of discovery of any cyber incident.",
  report: "Rapidly report cyber incidents to DoD at https://dibnet.dod.mil.",
  preserve:
    "for at least 90 days from the submission of the cyber incident report to allow DoD to request the media or decline interest.",
  malware: "Do not send the malicious software to the Contracting Officer.",
} as const;

export const INCIDENT_RULE_VERIFICATION = {
  source: "DFARS 252.204-7012 (MAY 2024), paragraphs (a), (b)(2)(ii)(D), (c) to (h), (l) and (m)",
  url: "https://www.acquisition.gov/dfars/252.204-7012-safeguarding-covered-defense-information-and-cyber-incident-reporting.",
  readOn: "2026-11-28",
  note: "The quoted lines are the clause's own words, read on 28 November 2026 from the source GSA publishes for acquisition.gov. The version of the clause in your contract governs; the report itself is filed at dibnet.dod.mil, not here.",
} as const;

export const CLAUSE_ANSWERS = ["yes", "no", "unsure"] as const;
export type ClauseAnswer = (typeof CLAUSE_ANSWERS)[number];
export const CLAUSE_LABEL: Record<ClauseAnswer, string> = {
  unsure: "Not sure yet",
  yes: "Yes",
  no: "No",
};

export const AFFECTS = ["unsure", "cdi", "ocs", "neither"] as const;
export type Affects = (typeof AFFECTS)[number];
export const AFFECTS_LABEL: Record<Affects, string> = {
  unsure: "Not sure yet",
  cdi: "A system holding covered defense information (CDI)",
  ocs: "Operationally critical support named in the contract",
  neither: "Neither, after review",
};

export const ROLES = ["prime", "sub"] as const;
export type IncidentRole = (typeof ROLES)[number];
export const ROLE_LABEL: Record<IncidentRole, string> = {
  prime: "Prime contractor",
  sub: "Subcontractor",
};

export const TRI = ["unknown", "yes", "no"] as const;
export type Tri = (typeof TRI)[number];
export const TRI_LABEL: Record<Tri, string> = { unknown: "Not known yet", yes: "Yes", no: "No" };

/** What the register needs of a row; the DB row has more (ids, timestamps). */
export interface IncidentFacts {
  title: string;
  clause: ClauseAnswer;
  affects: Affects;
  role: IncidentRole;
  higherTier: string;
  contractRef: string;
  /** Instants, ISO 8601 UTC. */
  discoveredAt: string;
  reportedAt: string | null;
  reportNumber: string;
  higherTierNotifiedAt: string | null;
  malware: Tri;
  cloud: Tri;
  systems: string;
  summary: string;
  /** Step id -> done. */
  steps: Record<string, boolean>;
  timeline: TimelineEntry[];
  /** YYYY-MM-DD the incident was closed (handling finished), or null while open. */
  closedOn: string | null;
  lessons: string;
}

export interface TimelineEntry {
  at: string;
  text: string;
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;
/** An ISO 8601 instant in UTC that names a real time (no 2026-02-30T...). */
export function isInstant(s: unknown): s is string {
  if (typeof s !== "string" || !ISO_INSTANT.test(s)) return false;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return false;
  return new Date(t).toISOString().slice(0, 16) === s.slice(0, 16);
}

const ms = (iso: string) => Date.parse(iso);

export interface IncidentClocks {
  reportDue: string;
  /** Milliseconds left to the report deadline while unreported (negative once passed), else null. */
  msLeft: number | null;
  overdue: boolean;
  /** Once reported: whether it went in after the 72 hours (null without a report). */
  reportedLate: boolean | null;
  reportedAfterMs: number | null;
  /** At least until this instant (report + 90 days); null until reported. */
  preserveUntil: string | null;
  preserveMsLeft: number | null;
}

export function incidentClocks(
  r: Pick<IncidentFacts, "discoveredAt" | "reportedAt">,
  now: Date,
): IncidentClocks {
  const discovered = ms(r.discoveredAt);
  const reportDueMs = discovered + REPORT_HOURS * HOUR_MS;
  const out: IncidentClocks = {
    reportDue: new Date(reportDueMs).toISOString(),
    msLeft: null,
    overdue: false,
    reportedLate: null,
    reportedAfterMs: null,
    preserveUntil: null,
    preserveMsLeft: null,
  };
  if (!r.reportedAt) {
    out.msLeft = reportDueMs - now.getTime();
    out.overdue = out.msLeft < 0;
    return out;
  }
  const reported = ms(r.reportedAt);
  out.reportedAfterMs = reported - discovered;
  out.reportedLate = out.reportedAfterMs > REPORT_HOURS * HOUR_MS;
  // 90 days of elapsed time, plus one hour so a daylight-saving change inside the 90 days can only
  // move the shown date later, never earlier (the clause says "at least").
  const until = reported + PRESERVE_DAYS * DAY_MS + HOUR_MS;
  out.preserveUntil = new Date(until).toISOString();
  out.preserveMsLeft = until - now.getTime();
  return out;
}

/**
 * Does paragraph (c) apply? (c)(1) covers an incident "that affects a covered contractor information
 * system or the covered defense information residing therein, or that affects the contractor's
 * ability to perform the requirements of the contract that are designated as operationally critical
 * support"; the clause must be in the contract, or flowed down under (m). Ported from the front door.
 */
export function applicability(r: Pick<IncidentFacts, "clause" | "affects">): {
  required: boolean | null;
  reason: string;
} {
  if (r.clause === "no")
    return {
      required: false,
      reason:
        "Your contract does not carry DFARS 252.204-7012, so its 72-hour report is not owed under that clause. Other clauses, laws or your customer's terms may still require one (paragraph (l)). Record how you checked.",
    };
  if (r.affects === "neither")
    return {
      required: r.clause === "yes" ? false : null,
      reason:
        "You say the incident touched no system holding covered defense information and no operationally critical support, so paragraph (c) is not triggered. Paragraph (c)(1)(i) asks for a review that includes other systems that may have been accessed: write down how you reached the conclusion.",
    };
  if (r.clause === "yes" && (r.affects === "cdi" || r.affects === "ocs"))
    return {
      required: true,
      reason: `The clause is in your contract and the incident affects ${
        r.affects === "cdi"
          ? "a covered contractor information system or the CDI on it"
          : "operationally critical support named in the contract"
      }: review, report within 72 hours of discovery, and preserve images.`,
    };
  return {
    required: null,
    reason:
      "Not settled yet. Check the contract (and any subcontract or purchase order) for 252.204-7012 and whether the affected systems hold CDI. Until you know, run the 72-hour clock from discovery: a late report cannot be made on time afterwards.",
  };
}

export interface IncidentStep {
  id: string;
  cite: string;
  title: string;
  detail: string;
}

type StepDef = IncidentStep & {
  when: (r: Pick<IncidentFacts, "role" | "malware" | "cloud">) => boolean;
};

/** Every step after an incident, each with its paragraph of the clause. Ported from the front door. */
export const INCIDENT_STEPS: readonly StepDef[] = [
  {
    id: "review",
    cite: "(c)(1)(i)",
    title: "Review for evidence that CDI was compromised",
    detail:
      "Identify compromised computers, servers, specific data and user accounts, including other systems on your network that may have been accessed because of the incident.",
    when: () => true,
  },
  {
    id: "certificate",
    cite: "(c)(3)",
    title: "Have a DoD-approved medium assurance certificate",
    detail:
      "Needed to report. It comes through the External Certification Authority program; get it before an incident, not inside the 72 hours.",
    when: () => true,
  },
  {
    id: "report",
    cite: "(a), (c)(1)(ii)",
    title: "Report to DoD at https://dibnet.dod.mil within 72 hours of discovery",
    detail:
      "Report what you know within the 72 hours; the review does not have to be finished first.",
    when: () => true,
  },
  {
    id: "number",
    cite: "(m)(2)(ii)",
    title: "Write down the incident report number DoD assigns",
    detail: "DIBNet assigns it when you submit. Enter it on this incident.",
    when: () => true,
  },
  {
    id: "higher",
    cite: "(m)(2)(ii)",
    title: "Give the report number to your prime or next higher-tier subcontractor",
    detail: "As soon as practicable after you report to DoD.",
    when: (r) => r.role === "sub",
  },
  {
    id: "preserve",
    cite: "(e)",
    title: "Preserve images of the affected systems and the monitoring/packet capture data",
    detail:
      "For at least 90 days from submitting the report, so DoD can ask for them or decline. Do not wipe or rebuild a machine before it is imaged.",
    when: () => true,
  },
  {
    id: "malware",
    cite: "(d)",
    title: "Submit isolated malicious software to the DoD Cyber Crime Center (DC3)",
    detail: `Follow DC3's or the Contracting Officer's instructions. ${INCIDENT_QUOTES.malware}`,
    when: (r) => r.malware !== "no",
  },
  {
    id: "cloud",
    cite: "(b)(2)(ii)(D)",
    title: "Bring in your cloud provider",
    detail:
      "A cloud service provider holding CDI for you must meet paragraphs (c) to (g) too. Ask it for its logs and its own review.",
    when: (r) => r.cloud !== "no",
  },
  {
    id: "access",
    cite: "(f), (g)",
    title: "Be ready to give DoD access for forensic analysis and damage assessment",
    detail:
      "On request, DoD gets the information or equipment it needs; for a damage assessment the Contracting Officer asks for what you preserved.",
    when: () => true,
  },
  {
    id: "mark",
    cite: "(h)",
    title: "Mark contractor attributional or proprietary information",
    detail: "In what you give DoD, so it can limit its release.",
    when: () => true,
  },
  {
    id: "other",
    cite: "(l)",
    title: "Check the other reports you may owe",
    detail:
      "The clause does not replace reporting other clauses or laws require (your customer's terms, your insurer, state breach laws).",
    when: () => true,
  },
];
export const STEP_IDS = INCIDENT_STEPS.map((s) => s.id);

export function incidentChecklist(
  r: Pick<IncidentFacts, "role" | "malware" | "cloud" | "steps">,
): (IncidentStep & { done: boolean })[] {
  return INCIDENT_STEPS.filter((s) => s.when(r)).map(({ when: _w, ...s }) => ({
    ...s,
    done: r.steps[s.id] === true,
  }));
}

/**
 * Where the incident stands, read from what is filled in (never stored):
 * report: the report is not in and may be owed; not_owed: the clause does not apply and no report is
 * recorded; preserve: reported, the 90 days are running; open: reported and past the 90 days but not
 * closed; closed.
 */
export const INCIDENT_STAGES = ["report", "not_owed", "preserve", "open", "closed"] as const;
export type IncidentStage = (typeof INCIDENT_STAGES)[number];
export const INCIDENT_STAGE_LABEL: Record<IncidentStage, string> = {
  report: "Report due",
  not_owed: "No 7012 report owed",
  preserve: "Keep images",
  open: "Open",
  closed: "Closed",
};

export function incidentStage(r: IncidentFacts, now: Date): IncidentStage {
  if (r.closedOn) return "closed";
  if (!r.reportedAt) return applicability(r).required === false ? "not_owed" : "report";
  const c = incidentClocks(r, now);
  return (c.preserveMsLeft ?? 0) > 0 ? "preserve" : "open";
}

export interface IncidentIssue {
  kind:
    | "report_overdue"
    | "reported_late"
    | "no_report_number"
    | "higher_tier"
    | "closed_before_hold"
    | "steps_open";
  message: string;
}

/** UTC wall clock, "2026-11-28 14:05 UTC": the server has no time zone of the shop's to show. */
export function fmtUtc(iso: string | null): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC` : "";
}

export function fmtDuration(msLen: number): string {
  const neg = msLen < 0;
  let m = Math.floor(Math.abs(msLen) / 60000);
  const d = Math.floor(m / 1440);
  m -= d * 1440;
  const h = Math.floor(m / 60);
  m -= h * 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} d`);
  if (d || h) parts.push(`${h} h`);
  parts.push(`${m} min`);
  return (neg ? "-" : "") + parts.join(" ");
}

export function incidentIssues(r: IncidentFacts, now: Date): IncidentIssue[] {
  const out: IncidentIssue[] = [];
  const c = incidentClocks(r, now);
  const owed = applicability(r).required;
  if (!r.reportedAt && c.overdue && owed !== false && !r.closedOn)
    out.push({
      kind: "report_overdue",
      message: `The 72 hours ran out at ${fmtUtc(c.reportDue)}. Report at dibnet.dod.mil now and note in the timeline why it is late.`,
    });
  if (c.reportedLate)
    out.push({
      kind: "reported_late",
      message: `Reported ${fmtDuration(c.reportedAfterMs ?? 0)} after discovery, later than 72 hours: the timeline should say why.`,
    });
  if (r.reportedAt && !r.reportNumber.trim())
    out.push({
      kind: "no_report_number",
      message: "Reported, but the DoD incident report number is not recorded.",
    });
  if (r.role === "sub" && r.reportedAt && !r.higherTierNotifiedAt)
    out.push({
      kind: "higher_tier",
      message: `Give the report number to ${r.higherTier.trim() || "your prime or next higher tier"} as soon as practicable (paragraph (m)(2)(ii)).`,
    });
  if (r.closedOn && c.preserveUntil && r.closedOn < c.preserveUntil.slice(0, 10))
    out.push({
      kind: "closed_before_hold",
      message: `Closed before the 90 days are up: keep the images and capture data until at least ${c.preserveUntil.slice(0, 10)}.`,
    });
  if (r.closedOn) {
    const open = incidentChecklist(r).filter((s) => !s.done).length;
    if (open && owed !== false)
      out.push({
        kind: "steps_open",
        message: `Closed with ${open} checklist step${open === 1 ? "" : "s"} not ticked.`,
      });
  }
  return out;
}

export interface IncidentAttention {
  incidentId: string;
  title: string;
  stage: IncidentStage;
  /** The deadline the card is about: the report deadline while unreported, else the hold's end. */
  due: string | null;
  overdue: boolean;
}

/** Open incidents that need someone: a report owed (or not yet ruled out), or a sub's higher tier. */
export function incidentAttention(rows: readonly (IncidentFacts & { id: string })[], now: Date) {
  const out: IncidentAttention[] = [];
  for (const r of rows) {
    const stage = incidentStage(r, now);
    if (stage === "report") {
      const c = incidentClocks(r, now);
      out.push({ incidentId: r.id, title: r.title, stage, due: c.reportDue, overdue: c.overdue });
    } else if (stage === "preserve" && r.role === "sub" && !r.higherTierNotifiedAt) {
      out.push({
        incidentId: r.id,
        title: r.title,
        stage,
        due: incidentClocks(r, now).preserveUntil,
        overdue: false,
      });
    }
  }
  return out.sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
}

/** Dates for the calendar file: the day each image hold ends (counts per day, no titles). */
export interface IncidentDueDate {
  date: string;
  count: number;
}
export function incidentHoldDates(rows: readonly IncidentFacts[], now: Date): IncidentDueDate[] {
  const by = new Map<string, number>();
  for (const r of rows) {
    if (!r.reportedAt) continue;
    const c = incidentClocks(r, now);
    if (!c.preserveUntil || (c.preserveMsLeft ?? 0) <= 0) continue;
    const d = c.preserveUntil.slice(0, 10);
    by.set(d, (by.get(d) ?? 0) + 1);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}

/** Cross-field checks; field shapes are checked by the route's schema. Returns messages. */
export function validateIncident(
  r: Pick<
    IncidentFacts,
    "discoveredAt" | "reportedAt" | "higherTierNotifiedAt" | "closedOn" | "timeline" | "steps"
  >,
  now: Date,
): string[] {
  const errors: string[] = [];
  if (!isInstant(r.discoveredAt)) errors.push("Discovered: give a date and time.");
  else if (ms(r.discoveredAt) > now.getTime() + FUTURE_SLACK_MS)
    errors.push("Discovered is in the future: check the date and time.");
  if (r.reportedAt !== null) {
    if (!isInstant(r.reportedAt)) errors.push("Reported: give a date and time.");
    else if (ms(r.reportedAt) > now.getTime() + FUTURE_SLACK_MS)
      errors.push("Reported is in the future: check the date and time.");
    else if (isInstant(r.discoveredAt) && ms(r.reportedAt) < ms(r.discoveredAt))
      errors.push("Reported is before discovered: check both.");
  }
  if (r.higherTierNotifiedAt !== null) {
    if (!isInstant(r.higherTierNotifiedAt)) errors.push("Higher tier told: give a date and time.");
    else if (r.reportedAt === null)
      errors.push("The higher tier gets the report number, so record the report first.");
    else if (isInstant(r.reportedAt) && ms(r.higherTierNotifiedAt) < ms(r.reportedAt))
      errors.push("Higher tier told is before the report: check both.");
  }
  if (r.closedOn !== null && isInstant(r.discoveredAt) && r.closedOn < r.discoveredAt.slice(0, 10))
    errors.push("Closed is before discovered.");
  if (r.timeline.length > MAX_TIMELINE_ENTRIES)
    errors.push(`A timeline holds at most ${MAX_TIMELINE_ENTRIES} entries.`);
  if (r.timeline.some((e) => !isInstant(e.at)))
    errors.push("Each timeline entry needs a date and time.");
  for (const k of Object.keys(r.steps))
    if (!STEP_IDS.includes(k)) errors.push(`Unknown checklist step: ${k}.`);
  return errors;
}

const csvCell = (v: string) => {
  // Formula-safe: a cell a spreadsheet would read as a formula gets a leading apostrophe.
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The register as CSV (one row per incident), times in UTC. */
export function incidentsCsv(rows: readonly IncidentFacts[], now: Date): string {
  const head = [
    "Incident",
    "Stage",
    "Discovered (UTC)",
    "Report due (UTC)",
    "Reported (UTC)",
    "Hours to report",
    "DoD report number",
    "Role",
    "Higher tier",
    "Higher tier told (UTC)",
    "Keep images until at least (UTC)",
    "Contract",
    "7012 in contract",
    "Affects",
    "Closed",
    "Checklist done",
    "Issues",
  ];
  const lines = rows.map((r) => {
    const c = incidentClocks(r, now);
    const steps = incidentChecklist(r);
    return [
      r.title,
      INCIDENT_STAGE_LABEL[incidentStage(r, now)],
      fmtUtc(r.discoveredAt),
      fmtUtc(c.reportDue),
      fmtUtc(r.reportedAt),
      c.reportedAfterMs === null ? "" : (c.reportedAfterMs / HOUR_MS).toFixed(1),
      r.reportNumber,
      ROLE_LABEL[r.role],
      r.higherTier,
      fmtUtc(r.higherTierNotifiedAt),
      fmtUtc(c.preserveUntil),
      r.contractRef,
      CLAUSE_LABEL[r.clause],
      AFFECTS_LABEL[r.affects],
      r.closedOn ?? "",
      `${steps.filter((s) => s.done).length}/${steps.length}`,
      incidentIssues(r, now)
        .map((i) => i.message)
        .join(" "),
    ];
  });
  return `${[head, ...lines].map((l) => l.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

const md = (s: string) => s.replace(/([\\`*_[\]<>|#])/g, "\\$1");
const mdCell = (s: string) => md(s.replace(/\s*\n\s*/g, " ")) || " ";

/** One incident as a Markdown record, the evidence an assessor asks for under 3.6.2. */
export function incidentRecordMarkdown(
  r: IncidentFacts,
  { orgName, now }: { orgName: string; now: Date },
): string {
  const c = incidentClocks(r, now);
  const a = applicability(r);
  const L: string[] = [];
  L.push(`# Cyber incident record: ${md(r.title)}`);
  L.push("");
  L.push(
    `${md(orgName)}. Under ${INCIDENT_CLAUSE}. Exported ${fmtUtc(now.toISOString())} from CMMC Workspace; a record-keeping aid, not legal advice and not a DIBNet report. Times are UTC.`,
  );
  L.push("");
  L.push("| | |");
  L.push("|---|---|");
  L.push(`| Stage | ${INCIDENT_STAGE_LABEL[incidentStage(r, now)]} |`);
  L.push(`| Contract | ${mdCell(r.contractRef || "-")} |`);
  L.push(`| DFARS 252.204-7012 in the contract | ${CLAUSE_LABEL[r.clause]} |`);
  L.push(`| Affects | ${AFFECTS_LABEL[r.affects]} |`);
  L.push(
    `| Role | ${ROLE_LABEL[r.role]}${r.role === "sub" && r.higherTier ? `, reports to ${mdCell(r.higherTier)}` : ""} |`,
  );
  L.push(`| Discovered | ${fmtUtc(r.discoveredAt)} |`);
  L.push(`| 72-hour report due | ${fmtUtc(c.reportDue)} |`);
  L.push(`| Reported to DIBNet | ${fmtUtc(r.reportedAt) || "not yet"} |`);
  L.push(`| DoD incident report number | ${mdCell(r.reportNumber || "-")} |`);
  if (r.role === "sub")
    L.push(
      `| Report number given to higher tier | ${fmtUtc(r.higherTierNotifiedAt) || "not yet"} |`,
    );
  L.push(
    `| Keep images and capture data until at least | ${c.preserveUntil ? fmtUtc(c.preserveUntil) : "90 days after the report is submitted"} |`,
  );
  L.push(`| Closed | ${r.closedOn ?? "open"} |`);
  L.push("");
  L.push(`**Does paragraph (c) apply?** ${md(a.reason)}`);
  L.push("");
  const issues = incidentIssues(r, now);
  if (issues.length) {
    L.push("## Open points");
    L.push("");
    for (const i of issues) L.push(`- ${md(i.message)}`);
    L.push("");
  }
  for (const [head, body] of [
    ["What happened", r.summary],
    ["Affected systems", r.systems],
    ["Lessons learned", r.lessons],
  ] as const) {
    if (!body.trim()) continue;
    L.push(`## ${head}`);
    L.push("");
    L.push(body.trim().split(/\n/).map(md).join("  \n"));
    L.push("");
  }
  L.push("## Checklist");
  L.push("");
  for (const s of incidentChecklist(r))
    L.push(`- [${s.done ? "x" : " "}] **${md(s.title)}** (${md(s.cite)})`);
  L.push("");
  if (r.timeline.length) {
    L.push("## Timeline");
    L.push("");
    L.push("| When (UTC) | What |");
    L.push("|---|---|");
    for (const e of [...r.timeline].sort((x, y) => x.at.localeCompare(y.at)))
      L.push(`| ${fmtUtc(e.at)} | ${mdCell(e.text)} |`);
    L.push("");
  }
  L.push(
    `> Paragraph references are to ${INCIDENT_CLAUSE}. The version in your contract governs. ${md(INCIDENT_QUOTES.rapidly)}`,
  );
  return `${L.join("\n")}\n`;
}
