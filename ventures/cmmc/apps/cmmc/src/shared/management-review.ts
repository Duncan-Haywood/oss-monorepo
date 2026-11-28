// ISO 9001 management review (clause 9.3): top management looks at how the quality system is doing
// at planned intervals and records what it decided. A small shop's owner usually does this once a
// year, and the slow part is gathering the figures: what came of the last review's actions, the
// complaints and returns, the audits, the corrective actions, the gauges, the suppliers. The
// workspace already holds most of those records, so a review here starts with the figures for its
// period filled in from them, and the meeting only has to say what they mean and what to do.
//
// ISO 9001's text is copyrighted, so nothing here quotes it: the input and output headings are
// plain-language readings of 9.3.2 and 9.3.3 with the clause letter beside each, so a reader can
// check them against their own copy of the standard (docs/SOURCES.md, "Management review"). The
// record is a record-keeping aid; it does not make a quality system conform to ISO 9001 or AS9100.
// Shared by the Worker and the SPA; everything here is pure.

import { addDays, daysBetween, isIsoDate } from "./affirmation";
import type { AsFound } from "./calibration";
import type { CaSource, FindingKind } from "./internal-audits";
import { addMonths } from "./security-policies";

export const MANAGEMENT_REVIEW_CLAUSE_ID = "iso9001-9.3";
export const REVIEW_INTERVAL_MONTHS = 12;
export const REVIEW_DUE_SOON_DAYS = 30;
export const MAX_REVIEWS_PER_ORG = 200;
export const MAX_REVIEW_ACTIONS = 100;
export const REVIEW_TEXT_MAX = 4000;
export const REVIEW_SHORT_MAX = 200;

export const REVIEW_STATUSES = ["draft", "final"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** The inputs a review considers, in the standard's order (9.3.2 a to f), in our own words. */
export const REVIEW_INPUTS = [
  {
    key: "previous_actions",
    clause: "9.3.2 a",
    label: "Actions from the last review",
    hint: "Were the last review's actions done, and did they work?",
  },
  {
    key: "context_changes",
    clause: "9.3.2 b",
    label: "Changes inside and outside the shop",
    hint: "New customers or markets, people who left or joined, new machines, customer or regulatory requirements such as DFARS or a prime's quality clauses.",
  },
  {
    key: "customer_feedback",
    clause: "9.3.2 c 1",
    label: "Customer satisfaction and feedback",
    hint: "Complaints, returns, scorecards, on-time delivery as customers rate it, praise.",
  },
  {
    key: "objectives",
    clause: "9.3.2 c 2",
    label: "Quality objectives",
    hint: "Each objective, its target and how far it was met.",
  },
  {
    key: "process_performance",
    clause: "9.3.2 c 3",
    label: "Process performance and conforming product",
    hint: "On-time delivery, scrap and rework, first-pass yield, first article results.",
  },
  {
    key: "nonconformities",
    clause: "9.3.2 c 4",
    label: "Nonconformities and corrective actions",
    hint: "What went wrong, whether causes were found, and whether the actions worked.",
  },
  {
    key: "monitoring",
    clause: "9.3.2 c 5",
    label: "Monitoring and measurement results",
    hint: "Inspection results, gauge calibration, anything measured to judge the system.",
  },
  {
    key: "audits",
    clause: "9.3.2 c 6",
    label: "Audit results",
    hint: "Internal audits, customer and registrar audits.",
  },
  {
    key: "suppliers",
    clause: "9.3.2 c 7",
    label: "Supplier performance",
    hint: "Late or rejected supplier deliveries, outside processors, calibration labs.",
  },
  {
    key: "resources",
    clause: "9.3.2 d",
    label: "Whether resources are enough",
    hint: "People, training, machines, inspection equipment, time.",
  },
  {
    key: "risks",
    clause: "9.3.2 e",
    label: "Actions on risks and opportunities",
    hint: "Did the actions planned for risks and opportunities work? Cyber incidents belong here too.",
  },
  {
    key: "improvement",
    clause: "9.3.2 f",
    label: "Opportunities for improvement",
    hint: "Ideas from the floor, customers, audits.",
  },
] as const;
export type ReviewInputKey = (typeof REVIEW_INPUTS)[number]["key"];
export const REVIEW_INPUT_KEYS = REVIEW_INPUTS.map((i) => i.key) as ReviewInputKey[];

/** What the review decided (9.3.3 a to c), in our own words. */
export const REVIEW_OUTPUTS = [
  {
    key: "improvements",
    clause: "9.3.3 a",
    label: "Improvements decided",
  },
  {
    key: "system_changes",
    clause: "9.3.3 b",
    label: "Changes to the quality system",
  },
  {
    key: "resource_needs",
    clause: "9.3.3 c",
    label: "Resources needed",
  },
] as const;
export type ReviewOutputKey = (typeof REVIEW_OUTPUTS)[number]["key"];
export const REVIEW_OUTPUT_KEYS = REVIEW_OUTPUTS.map((o) => o.key) as ReviewOutputKey[];

export interface ReviewAction {
  id: string;
  text: string;
  /** A person's name, as the minutes would write it. */
  owner: string;
  dueOn: string | null;
  doneOn: string | null;
}

export interface ReviewFields {
  heldOn: string;
  periodFrom: string;
  periodTo: string;
  attendees: string;
  inputs: Partial<Record<ReviewInputKey, string>>;
  outputs: Partial<Record<ReviewOutputKey, string>>;
  actions: ReviewAction[];
  nextReviewOn: string | null;
}

export type ReviewFacts = Record<ReviewInputKey, string[]>;

export interface ReviewLike extends ReviewFields {
  id: string;
  status: ReviewStatus;
  finalisedOn: string | null;
}

const DATE_ERR = (what: string) => `Give the ${what} as a calendar date (YYYY-MM-DD).`;

/** Errors in a draft as saved: dates readable and in order, actions complete enough to keep. */
export function validateReview(r: ReviewFields): string[] {
  const errors: string[] = [];
  if (!isIsoDate(r.heldOn)) errors.push(DATE_ERR("meeting date"));
  if (!isIsoDate(r.periodFrom)) errors.push(DATE_ERR("start of the period reviewed"));
  if (!isIsoDate(r.periodTo)) errors.push(DATE_ERR("end of the period reviewed"));
  if (isIsoDate(r.periodFrom) && isIsoDate(r.periodTo) && r.periodFrom > r.periodTo)
    errors.push("The period reviewed starts after it ends.");
  if (isIsoDate(r.periodTo) && isIsoDate(r.heldOn) && r.periodTo > r.heldOn)
    errors.push("The period reviewed cannot end after the meeting.");
  if (r.nextReviewOn !== null) {
    if (!isIsoDate(r.nextReviewOn)) errors.push(DATE_ERR("next review date"));
    else if (isIsoDate(r.heldOn) && r.nextReviewOn <= r.heldOn)
      errors.push("The next review has to fall after this one.");
  }
  if (r.actions.length > MAX_REVIEW_ACTIONS)
    errors.push(`A review keeps at most ${MAX_REVIEW_ACTIONS} actions.`);
  r.actions.forEach((a, i) => {
    const n = i + 1;
    if (!a.text.trim()) errors.push(`Action ${n} needs a description.`);
    if (a.dueOn !== null && !isIsoDate(a.dueOn)) errors.push(DATE_ERR(`due date of action ${n}`));
    if (a.doneOn !== null && !isIsoDate(a.doneOn))
      errors.push(DATE_ERR(`done date of action ${n}`));
  });
  return errors;
}

/**
 * What stands between a draft and the minutes an auditor would accept: the meeting has happened, the
 * people present are named, every input was considered (figures from the records, or a note saying
 * what was discussed, "nothing to report" included), every output says what was decided ("none" is
 * an answer), and every action has someone and a date.
 */
export function finaliseProblems(r: ReviewFields, facts: ReviewFacts, today: string): string[] {
  const problems = validateReview(r);
  if (isIsoDate(r.heldOn) && r.heldOn > today)
    problems.push("A review can only be finalised once the meeting has been held.");
  if (!r.attendees.trim()) problems.push("Name who took part, top management included.");
  for (const input of REVIEW_INPUTS) {
    const note = (r.inputs[input.key] ?? "").trim();
    if (!note && !facts[input.key]?.length)
      problems.push(
        `${input.label} (${input.clause}): say what was discussed, or write "nothing to report".`,
      );
  }
  for (const output of REVIEW_OUTPUTS) {
    if (!(r.outputs[output.key] ?? "").trim())
      problems.push(`${output.label} (${output.clause}): say what was decided, or write "none".`);
  }
  r.actions.forEach((a, i) => {
    if (!a.owner.trim()) problems.push(`Action ${i + 1} needs an owner.`);
    if (!a.dueOn) problems.push(`Action ${i + 1} needs a due date.`);
  });
  return problems;
}

/** The period a new review covers by default: the day after the last one's period, to the meeting. */
export function defaultPeriod(
  heldOn: string,
  lastFinal: Pick<ReviewLike, "periodTo"> | null,
): { periodFrom: string; periodTo: string } {
  const from = lastFinal
    ? addDays(lastFinal.periodTo, 1)
    : addMonths(heldOn, -REVIEW_INTERVAL_MONTHS);
  return { periodFrom: from <= heldOn ? from : heldOn, periodTo: heldOn };
}

// ---------- figures from the workspace's records ----------

export interface FactsCa {
  ref: string;
  source: CaSource;
  raisedOn: string;
  dueOn: string | null;
  completedOn: string | null;
  verifiedOn: string | null;
  effective: boolean | null;
  closedOn: string | null;
}
export interface FactsAudit {
  title: string;
  status: "planned" | "done" | "cancelled";
  plannedOn: string;
  completedOn: string | null;
}
export interface FactsFinding {
  kind: FindingKind;
  /** The date of the audit that raised it (completed, else planned). */
  auditOn: string;
}
export interface FactsGauge {
  tag: string;
  inUse: boolean;
  dueOn: string | null;
}
export interface FactsCalibration {
  calibratedOn: string;
  asFound: AsFound;
  impactRecorded: boolean;
}
export interface FactsSupplier {
  name: string;
  /** Gaps an assessor would write up against the supplier today (status, flow-down). */
  gaps: number;
}
export interface FactsIncident {
  /** YYYY-MM-DD the incident was discovered. */
  discoveredOn: string;
  closedOn: string | null;
}

export interface FactsInput {
  periodFrom: string;
  periodTo: string;
  today: string;
  previous: Pick<ReviewLike, "heldOn" | "actions"> | null;
  correctiveActions: readonly FactsCa[];
  audits: readonly FactsAudit[];
  findings: readonly FactsFinding[];
  gauges: readonly FactsGauge[];
  calibrations: readonly FactsCalibration[];
  suppliers: readonly FactsSupplier[];
  incidents: readonly FactsIncident[];
}

const inPeriod = (d: string | null, from: string, to: string) => !!d && d >= from && d <= to;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listed = (items: string[], max = 6) =>
  items.length > max
    ? `${items.slice(0, max).join(", ")} and ${items.length - max} more`
    : items.join(", ");

const CUSTOMER_SOURCES: readonly CaSource[] = ["customer_complaint", "customer_return"];

/**
 * The figures for each input, worked out from the records the workspace holds for the period. Each
 * line says where it came from, so the minutes never pass off a count of logged records as the
 * whole truth (a complaint nobody logged is not counted). An empty list means the workspace has
 * nothing on that input, and the meeting has to say what it discussed.
 */
export function reviewFacts(d: FactsInput): ReviewFacts {
  const { periodFrom: from, periodTo: to, today } = d;
  const facts = Object.fromEntries(REVIEW_INPUT_KEYS.map((k) => [k, []])) as unknown as ReviewFacts;

  // a: the last review's actions, as they stand today.
  if (d.previous?.actions.length) {
    const acts = d.previous.actions;
    const done = acts.filter((a) => a.doneOn);
    const open = acts.filter((a) => !a.doneOn);
    const late = open.filter((a) => a.dueOn && a.dueOn < today);
    facts.previous_actions.push(
      `The review of ${d.previous.heldOn} set ${plural(acts.length, "action")}: ${done.length} done, ${open.length} open${late.length ? `, ${late.length} past due` : ""}.`,
    );
    if (open.length)
      facts.previous_actions.push(
        `Open: ${listed(
          open.map(
            (a) =>
              `${a.text.trim()}${a.owner.trim() ? ` (${a.owner.trim()}${a.dueOn ? `, due ${a.dueOn}` : ""})` : ""}`,
          ),
          4,
        )}.`,
      );
  } else if (d.previous) {
    facts.previous_actions.push(`The review of ${d.previous.heldOn} set no actions.`);
  }

  // c 1: complaints and returns logged as corrective actions.
  const cas = d.correctiveActions;
  const raised = cas.filter((c) => inPeriod(c.raisedOn, from, to));
  const customer = raised.filter((c) => CUSTOMER_SOURCES.includes(c.source));
  const complaints = customer.filter((c) => c.source === "customer_complaint");
  const returns = customer.filter((c) => c.source === "customer_return");
  if (cas.length || customer.length)
    facts.customer_feedback.push(
      customer.length
        ? `Logged as corrective actions in the period: ${plural(complaints.length, "customer complaint")}, ${plural(returns.length, "return or rejection", "returns or rejections")} (${listed(customer.map((c) => c.ref))}).`
        : "No customer complaint or return was logged as a corrective action in the period.",
    );

  // c 4: nonconformities and corrective actions.
  if (cas.length) {
    const bySource = new Map<CaSource, number>();
    for (const c of raised) bySource.set(c.source, (bySource.get(c.source) ?? 0) + 1);
    const sources = [...bySource.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `${n} ${SOURCE_WORD[s]}`);
    facts.nonconformities.push(
      `${plural(raised.length, "corrective action")} raised in the period${sources.length ? ` (${sources.join(", ")})` : ""}; ${cas.filter((c) => inPeriod(c.closedOn, from, to)).length} closed in it.`,
    );
    const open = cas.filter((c) => !c.closedOn);
    const overdue = open.filter((c) => !c.completedOn && c.dueOn && c.dueOn < today);
    const notEffective = cas.filter((c) => !c.closedOn && c.verifiedOn && c.effective === false);
    if (open.length)
      facts.nonconformities.push(
        `Open today: ${open.length}${overdue.length ? `, ${overdue.length} with the action past due (${listed(overdue.map((c) => c.ref))})` : ""}${notEffective.length ? `; ${notEffective.length} checked and found not effective (${listed(notEffective.map((c) => c.ref))})` : ""}.`,
      );
    else facts.nonconformities.push("No corrective action is open today.");
    const verified = cas.filter((c) => inPeriod(c.verifiedOn, from, to));
    if (verified.length) {
      const worked = verified.filter((c) => c.effective === true).length;
      facts.nonconformities.push(
        `Effectiveness checked on ${verified.length} in the period: ${worked} worked, ${verified.length - worked} did not.`,
      );
    }
  }

  // c 6: internal audits.
  if (d.audits.length) {
    const done = d.audits.filter((a) => a.status === "done" && inPeriod(a.completedOn, from, to));
    const missed = d.audits.filter(
      (a) => a.status === "planned" && a.plannedOn < today && a.plannedOn <= to,
    );
    const f = d.findings.filter((x) => inPeriod(x.auditOn, from, to));
    const count = (k: FindingKind) => f.filter((x) => x.kind === k).length;
    facts.audits.push(
      `${plural(done.length, "internal audit")} done in the period${
        done.length
          ? ` (${listed(
              done.map((a) => a.title.trim()),
              4,
            )})`
          : ""
      }.`,
    );
    if (f.length)
      facts.audits.push(
        `Findings: ${count("major")} major and ${count("minor")} minor nonconformities, ${plural(count("observation"), "observation")}, ${plural(count("improvement"), "opportunity", "opportunities")} for improvement.`,
      );
    if (missed.length)
      facts.audits.push(
        `${plural(missed.length, "planned audit")} past its date and not done (${listed(
          missed.map((a) => `${a.title.trim()}, ${a.plannedOn}`),
          3,
        )}).`,
      );
  }
  const auditCas = raised.filter((c) => c.source === "external_audit");
  if (auditCas.length)
    facts.audits.push(
      `${plural(auditCas.length, "corrective action")} from customer or registrar audits raised in the period.`,
    );

  // c 5: gauges and calibration.
  if (d.gauges.length) {
    const inUse = d.gauges.filter((g) => g.inUse);
    const cals = d.calibrations.filter((c) => inPeriod(c.calibratedOn, from, to));
    const oot = cals.filter((c) => c.asFound === "out_of_tolerance");
    const late = inUse.filter((g) => !g.dueOn || g.dueOn <= today);
    facts.monitoring.push(
      `${plural(inUse.length, "gauge")} in use; ${plural(cals.length, "calibration")} recorded in the period, ${oot.length} found out of tolerance${oot.length ? ` (${oot.filter((c) => !c.impactRecorded).length} without an impact record)` : ""}.`,
    );
    facts.monitoring.push(
      late.length
        ? `Overdue or never calibrated today: ${listed(late.map((g) => g.tag))}.`
        : "No gauge in use is overdue today.",
    );
  }

  // c 7: suppliers (problems logged as corrective actions, and the CMMC flow-down register).
  const supplierCas = raised.filter((c) => c.source === "supplier");
  if (supplierCas.length || cas.length)
    facts.suppliers.push(
      `${plural(supplierCas.length, "supplier problem")} logged as corrective actions in the period${supplierCas.length ? ` (${listed(supplierCas.map((c) => c.ref))})` : ""}.`,
    );
  if (d.suppliers.length) {
    const gaps = d.suppliers.filter((s) => s.gaps > 0);
    facts.suppliers.push(
      gaps.length
        ? `CMMC flow-down register: ${plural(gaps.length, "supplier")} of ${d.suppliers.length} with a gap today (${listed(
            gaps.map((s) => s.name.trim()),
            4,
          )}).`
        : `CMMC flow-down register: no gaps today across ${plural(d.suppliers.length, "supplier")}.`,
    );
  }

  // e: cyber incidents are a realised risk the review should hear about.
  const incidents = d.incidents.filter((i) => inPeriod(i.discoveredOn, from, to));
  if (incidents.length)
    facts.risks.push(
      `${plural(incidents.length, "cyber incident")} logged in the period, ${incidents.filter((i) => !i.closedOn).length} still open.`,
    );

  return facts;
}

const SOURCE_WORD: Record<CaSource, string> = {
  internal_audit: "from internal audits",
  external_audit: "from customer or registrar audits",
  customer_complaint: "from customer complaints",
  customer_return: "from returns",
  supplier: "from suppliers",
  process: "found in the shop",
  other: "other",
};

// ---------- when the next review is due ----------

export type ReviewTiming = "never" | "current" | "due_soon" | "overdue";

export interface ReviewAttention {
  timing: ReviewTiming;
  lastHeldOn: string | null;
  nextDueOn: string | null;
  /** Open actions from final reviews past their due date. */
  actionsOverdue: number;
  actionsOpen: number;
  drafts: number;
}

export function nextReviewDue(r: Pick<ReviewLike, "heldOn" | "nextReviewOn">): string {
  return r.nextReviewOn ?? addMonths(r.heldOn, REVIEW_INTERVAL_MONTHS);
}

export function reviewAttention(
  reviews: readonly Pick<ReviewLike, "status" | "heldOn" | "nextReviewOn" | "actions">[],
  today: string,
): ReviewAttention {
  const finals = reviews
    .filter((r) => r.status === "final")
    .sort((a, b) => (a.heldOn < b.heldOn ? 1 : -1));
  const last = finals[0] ?? null;
  const actions = finals.flatMap((r) => r.actions).filter((a) => !a.doneOn);
  const base = {
    actionsOpen: actions.length,
    actionsOverdue: actions.filter((a) => a.dueOn && a.dueOn < today).length,
    drafts: reviews.filter((r) => r.status === "draft").length,
  };
  if (!last) return { timing: "never", lastHeldOn: null, nextDueOn: null, ...base };
  const due = nextReviewDue(last);
  const days = daysBetween(today, due);
  const timing: ReviewTiming =
    days < 0 ? "overdue" : days <= REVIEW_DUE_SOON_DAYS ? "due_soon" : "current";
  return { timing, lastHeldOn: last.heldOn, nextDueOn: due, ...base };
}

// ---------- the minutes ----------

const md = (s: string) => s.replace(/\r\n?/g, "\n").trim();
/** Neutralises Markdown table pipes in one-line cells. */
const cell = (s: string) => md(s).replace(/\n+/g, " ").replace(/\|/g, "\\|");

/** The minutes as Markdown: what was looked at, what was decided, who does what by when. */
export function reviewMinutesMarkdown(
  r: ReviewLike,
  facts: ReviewFacts,
  meta: { orgName: string; generatedOn: string },
): string {
  const out: string[] = [];
  out.push(`# Management review minutes: ${md(meta.orgName)}`);
  out.push("");
  out.push(`- Meeting held: ${r.heldOn}`);
  out.push(`- Period reviewed: ${r.periodFrom} to ${r.periodTo}`);
  out.push(`- Present: ${md(r.attendees) || "(not recorded)"}`);
  out.push(
    `- Status: ${r.status === "final" ? `final, recorded ${r.finalisedOn ?? ""}`.trim() : "draft, not yet finalised"}`,
  );
  out.push(`- Next review: ${nextReviewDue(r)}`);
  out.push("");
  out.push("## Inputs considered (ISO 9001 9.3.2)");
  for (const input of REVIEW_INPUTS) {
    out.push("");
    out.push(`### ${input.label} (${input.clause})`);
    const lines = facts[input.key] ?? [];
    if (lines.length) {
      out.push("");
      out.push("From the workspace's records:");
      out.push("");
      for (const l of lines) out.push(`- ${md(l)}`);
    }
    const note = md(r.inputs[input.key] ?? "");
    out.push("");
    out.push(note ? note : lines.length ? "(no further discussion recorded)" : "(not recorded)");
  }
  out.push("");
  out.push("## Decisions (ISO 9001 9.3.3)");
  for (const output of REVIEW_OUTPUTS) {
    out.push("");
    out.push(`### ${output.label} (${output.clause})`);
    out.push("");
    out.push(md(r.outputs[output.key] ?? "") || "(not recorded)");
  }
  out.push("");
  out.push("## Actions");
  out.push("");
  if (r.actions.length) {
    out.push("| # | Action | Owner | Due | Done |");
    out.push("|---|---|---|---|---|");
    r.actions.forEach((a, i) => {
      out.push(
        `| ${i + 1} | ${cell(a.text)} | ${cell(a.owner) || "-"} | ${a.dueOn ?? "-"} | ${a.doneOn ?? "open"} |`,
      );
    });
  } else out.push("No actions were set.");
  out.push("");
  out.push(
    `Generated ${meta.generatedOn} by the CMMC Workspace. The headings paraphrase ISO 9001:2015 clause 9.3; check them against your copy of the standard. This record does not by itself make a quality system conform to ISO 9001 or AS9100.`,
  );
  out.push("");
  return out.join("\n");
}
