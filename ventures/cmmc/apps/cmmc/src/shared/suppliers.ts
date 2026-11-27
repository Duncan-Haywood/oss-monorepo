// Subcontractors and suppliers: what DFARS 252.204-7021 asks a contractor to check before it flows
// FCI or CUI down, and pure checks on a shop's supplier list. Shared by the Worker and the SPA.
//
// Every string in SUPPLIER_QUOTES is a verbatim substring of DFARS 252.204-7021 (NOV 2025), and of
// DFARS 204.7502, as published in GSA's DITA source for acquisition.gov
// (https://raw.githubusercontent.com/GSA/GSA-Acquisition-DFARS/master/dita/252.204-7021.dita and
// .../dita/204.7502.dita), read on 2026-11-26 with tags removed and spaces collapsed; file sha256
// c5bcbb3f0836e8ef7faeb941ca1a62619bb19a7910e84b90a33e817655911ac3 (7021) and
// d1d7493b56df91a01464d92c036071ccbf4a4d7ed765f7250e43016ba9523d15 (204.7502). suppliers.test.ts
// pins the quotes' hash. docs/SOURCES.md, "Suppliers".
//
// Which level a subcontract needs is 32 CFR 170.23, quoted in FLOWDOWN_RULE_QUOTES from eCFR's
// versioner API (https://www.ecfr.gov/api/versioner/v1/full/2026-11-01/title-32.xml?part=170&section=170.23),
// the text in force on 2026-11-01, read on 2026-11-26 with tags removed and spaces collapsed; file
// sha256 05d63c9b120441134d9638c754568d7b4d644e8b5ffec143c123680e1fa85348. suggestFlowdownLevel applies
// its four paragraphs; the shop still chooses the level it flows down (its prime contract or DoD's own
// guidance can ask for more, 170.23(b)), and the checks compare the supplier's status with that choice.

import { addDays, addYears, daysBetween, isIsoDate } from "./affirmation";

export const SUPPLIER_QUOTES = {
  flowdown:
    "Consult 32 CFR 170.23 related to the flowdown of the CMMC requirements, and flow down the correct CMMC level to subcontracts and other contractual instruments",
  affirmation:
    "Ensure all subcontractors and suppliers complete prior to subcontract award, and maintain on an annual basis",
  affirmationScope:
    "of continuous compliance with the requirements associated with the CMMC level required for the subcontract or other contractual instrument for each of the subcontractor information systems that process, store, or transmit FCI or CUI and that are used in performance of the subcontract",
  insert:
    "in subcontracts and other contractual instruments, including those for the acquisition of commercial products and commercial services, excluding commercially available off-the-shelf items",
  insertWhen:
    "if the subcontract or other contractual instrument will contain a requirement to process, store, or transmit FCI or CUI",
  beforeAward:
    "Prior to awarding a subcontract or other contractual instrument, ensure that the subcontractor has a current CMMC certificate or current CMMC status at the CMMC level that is appropriate for the information that is being flowed down to the subcontractor based on the requirements at 32 CFR 170.23.",
  conditionalCurrent:
    "Not older than 180 days for Conditional Level 2 (Self) assessments and Conditional Level 2 (certified third-party assessment organization (C3PAO)) assessments",
  finalL1Current: "Not older than 1 year for Final Level 1 (Self)",
  finalL2Current:
    "Not older than 3 years for Final Level 2 (Self) assessments and Final Level 2 (C3PAO) assessments",
  affirmationCurrent: "A corresponding affirmation of continuous compliance, not older than 1 year",
  uid: "means 10 alpha-numeric characters assigned to each CMMC assessment",
  level1Final: "CMMC level 1 requires a final CMMC level for award.",
} as const;

export const SUPPLIER_RULE_VERIFICATION = {
  source:
    "DFARS 252.204-7021 (NOV 2025), paragraphs (a) definitions, (d)(1)(ii), (d)(4) and (f); DFARS 204.7502(b)(2)",
  url: "https://www.acquisition.gov/dfars/252.204-7021-contractor-compliance-cybersecurity-maturity-model-certification-level-requirements.",
  readOn: "2026-11-26",
  checkedAgainstRule: true,
  levelRuleRead: true,
  levelSource: "32 CFR 170.23 (a)(1)-(4) and (b), as in force on 2026-11-01",
  levelUrl:
    "https://www.ecfr.gov/current/title-32/subtitle-A/chapter-I/subchapter-G/part-170/subpart-C/section-170.23",
  note: "The quoted lines are the rules' own words, read on 26 November 2026: DFARS 252.204-7021 from the source GSA publishes for acquisition.gov, and 32 CFR 170.23 from eCFR. The app suggests the level 32 CFR 170.23 sets from what you send and your prime contract's level; you choose the level you flow down, and the checks compare each supplier's status with it. The clause, 32 CFR 170.23 and your prime contract govern.",
} as const;

/**
 * 32 CFR 170.23, verbatim (see the module header). Each is a substring of the eCFR text with tags
 * removed and spaces collapsed; suppliers.test.ts pins their hash.
 */
export const FLOWDOWN_RULE_QUOTES = {
  scope:
    "CMMC requirements apply to prime contractors and subcontractors throughout the supply chain at all tiers that will process, store, or transmit any FCI or CUI on contractor information systems in the performance of the DoD contract or subcontract.",
  a1: "If a subcontractor will only process, store, or transmit FCI (and not CUI) in performance of the subcontract, then a CMMC Status of Level 1 (Self) is required for the subcontractor.",
  a2: "If a subcontractor will process, store, or transmit CUI in performance of the subcontract, then a CMMC Status of Level 2 (Self) is the minimum requirement for the subcontractor.",
  a3: "If a subcontractor will process, store, or transmit CUI in performance of the subcontract and the associated prime contract has a requirement for a CMMC Status of Level 2 (C3PAO), then the CMMC Status of Level 2 (C3PAO) is the minimum requirement for the subcontractor.",
  a4: "If a subcontractor will process, store, or transmit CUI in performance of the subcontract and the associated prime contract has a requirement for the CMMC Status of Level 3 (DIBCAC), then the CMMC Status of Level 2 (C3PAO) is the minimum requirement for the subcontractor.",
  b: "As with any solicitation or contract, the DoD may provide specific guidance pertaining to flow-down.",
} as const;

/** What the subcontract or purchase order asks the supplier to process, store or transmit. */
export const INFO_FLOWED = ["cui", "fci", "none"] as const;
export type InfoFlowed = (typeof INFO_FLOWED)[number];

export const INFO_FLOWED_LABEL: Record<InfoFlowed, string> = {
  cui: "CUI (drawings, specs or data marked CUI)",
  fci: "FCI only (contract information, no CUI)",
  none: "Neither (e.g. stock material bought with no contract information)",
};

/** The CMMC levels a contracting officer can insert in paragraph (d)(1)(i), lowest first. */
export const SUPPLIER_LEVELS = ["l1_self", "l2_self", "l2_c3pao", "l3_dibcac"] as const;
export type SupplierLevel = (typeof SUPPLIER_LEVELS)[number];

export const SUPPLIER_LEVEL_LABEL: Record<SupplierLevel, string> = {
  l1_self: "CMMC Level 1 (Self)",
  l2_self: "CMMC Level 2 (Self)",
  l2_c3pao: "CMMC Level 2 (C3PAO)",
  l3_dibcac: "CMMC Level 3 (DIBCAC)",
};

const LEVEL_RANK: Record<SupplierLevel, number> = {
  l1_self: 1,
  l2_self: 2,
  l2_c3pao: 3,
  l3_dibcac: 4,
};

/** What 32 CFR 170.23 asks of one subcontract. `level` is null when nothing needs flowing down. */
export interface FlowdownSuggestion {
  level: SupplierLevel | null;
  /** "32 CFR 170.23(a)(2)", or the DFARS paragraph for COTS. */
  cite: string;
  /** The rule's own words for this case, or null when none applies. */
  quote: string | null;
  /** Set only when the prime contract's level is not known and CUI flows: the minimum if it is
   * Level 2 (C3PAO) or Level 3 (DIBCAC) (170.23(a)(3)-(4)). */
  ifPrimeC3pao: SupplierLevel | null;
  /** One plain sentence on why. */
  reason: string;
}

/**
 * The minimum level 32 CFR 170.23(a) sets for a subcontract, from what the order sends and the level
 * in the associated prime contract (null when the shop does not know it). Pure.
 */
export function suggestFlowdownLevel(
  s: Pick<SupplierLike, "infoFlowed" | "cots">,
  primeLevel: SupplierLevel | null,
): FlowdownSuggestion {
  if (s.infoFlowed === "none")
    return {
      level: null,
      cite: "32 CFR 170.23(a)",
      quote: FLOWDOWN_RULE_QUOTES.scope,
      ifPrimeC3pao: null,
      reason:
        "Nothing from the contract goes with the order, so 32 CFR 170.23 asks for no level. If FCI or CUI starts going with it, choose again.",
    };
  if (s.cots)
    return {
      level: null,
      cite: "DFARS 252.204-7021(f)(1)",
      quote: SUPPLIER_QUOTES.insert,
      ifPrimeC3pao: null,
      reason:
        "The clause is not flowed down for commercially available off-the-shelf items. Make sure nothing marked FCI or CUI goes with the order.",
    };
  if (s.infoFlowed === "fci")
    return {
      level: "l1_self",
      cite: "32 CFR 170.23(a)(1)",
      quote: FLOWDOWN_RULE_QUOTES.a1,
      ifPrimeC3pao: null,
      reason: "The order sends FCI and no CUI, so the subcontractor needs Level 1 (Self).",
    };
  if (primeLevel === "l3_dibcac")
    return {
      level: "l2_c3pao",
      cite: "32 CFR 170.23(a)(4)",
      quote: FLOWDOWN_RULE_QUOTES.a4,
      ifPrimeC3pao: null,
      reason:
        "The order sends CUI and the prime contract requires Level 3 (DIBCAC), so the subcontractor needs at least Level 2 (C3PAO).",
    };
  if (primeLevel === "l2_c3pao")
    return {
      level: "l2_c3pao",
      cite: "32 CFR 170.23(a)(3)",
      quote: FLOWDOWN_RULE_QUOTES.a3,
      ifPrimeC3pao: null,
      reason:
        "The order sends CUI and the prime contract requires Level 2 (C3PAO), so the subcontractor needs at least Level 2 (C3PAO).",
    };
  return {
    level: "l2_self",
    cite: "32 CFR 170.23(a)(2)",
    quote: FLOWDOWN_RULE_QUOTES.a2,
    ifPrimeC3pao: primeLevel === null ? "l2_c3pao" : null,
    reason:
      primeLevel === null
        ? "The order sends CUI, so the subcontractor needs at least Level 2 (Self); at least Level 2 (C3PAO) if the prime contract requires Level 2 (C3PAO) or Level 3 (DIBCAC). Check the prime contract."
        : "The order sends CUI, so the subcontractor needs at least Level 2 (Self).",
  };
}

/** The seven statuses in the clause's definition of "CMMC status". */
export const SUPPLIER_STATUSES = [
  "final_l1_self",
  "conditional_l2_self",
  "final_l2_self",
  "conditional_l2_c3pao",
  "final_l2_c3pao",
  "conditional_l3_dibcac",
  "final_l3_dibcac",
] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export const SUPPLIER_STATUS_LABEL: Record<SupplierStatus, string> = {
  final_l1_self: "Final Level 1 (Self)",
  conditional_l2_self: "Conditional Level 2 (Self)",
  final_l2_self: "Final Level 2 (Self)",
  conditional_l2_c3pao: "Conditional Level 2 (C3PAO)",
  final_l2_c3pao: "Final Level 2 (C3PAO)",
  conditional_l3_dibcac: "Conditional Level 3 (DIBCAC)",
  final_l3_dibcac: "Final Level 3 (DIBCAC)",
};

const STATUS_LEVEL: Record<SupplierStatus, SupplierLevel> = {
  final_l1_self: "l1_self",
  conditional_l2_self: "l2_self",
  final_l2_self: "l2_self",
  conditional_l2_c3pao: "l2_c3pao",
  final_l2_c3pao: "l2_c3pao",
  conditional_l3_dibcac: "l3_dibcac",
  final_l3_dibcac: "l3_dibcac",
};

export const isConditional = (s: SupplierStatus) => s.startsWith("conditional_");

/** Days of warning before a supplier's status or affirmation stops being current. */
export const SUPPLIER_DUE_SOON_DAYS = 60;

export interface SupplierLike {
  id: string;
  name: string;
  infoFlowed: InfoFlowed;
  /** Commercially available off-the-shelf items: (f)(1) leaves them out of the clause. */
  cots: boolean;
  requiredLevel: SupplierLevel | null;
  status: SupplierStatus | null;
  /** CMMC Status Date, YYYY-MM-DD. */
  statusDate: string | null;
  /** The supplier's latest affirmation of continuous compliance, YYYY-MM-DD. */
  affirmedOn: string | null;
  /** One or more CMMC UIDs, separated by commas or spaces. */
  cmmcUids: string;
  /** The clause's substance is in the subcontract or purchase order terms. */
  clauseFlowedDown: boolean;
  /** When the shop checked the supplier's status (SPRS, or the supplier's own statement). */
  checkedOn: string | null;
  /** When the current subcontract or purchase order was awarded. */
  awardedOn: string | null;
}

/** "Current" as paragraph (a) of the clause defines it: the last day each part is current. */
export interface Currency {
  /** Last day the status itself is current (180 days, 1 year or 3 years from its date). */
  statusThrough: string | null;
  statusBasis: string;
  /** Last day the latest affirmation is current (1 year from it). */
  affirmationThrough: string | null;
  /** The earlier of the two; null when either is unknown. */
  through: string | null;
  state: "current" | "due_soon" | "not_current" | "unknown";
  daysLeft: number | null;
}

/** When a status stops being current under the clause's definition. Pure. */
export function supplierCurrency(
  s: Pick<SupplierLike, "status" | "statusDate" | "affirmedOn">,
  today: string,
): Currency {
  let statusThrough: string | null = null;
  let statusBasis = "";
  if (s.status && s.statusDate && isIsoDate(s.statusDate)) {
    if (isConditional(s.status)) {
      statusThrough = addDays(s.statusDate, 180);
      statusBasis = "Conditional: not older than 180 days";
    } else if (s.status === "final_l1_self") {
      statusThrough = addYears(s.statusDate, 1);
      statusBasis = "Final Level 1 (Self): not older than 1 year";
    } else {
      statusThrough = addYears(s.statusDate, 3);
      statusBasis = "Final Level 2 or 3: not older than 3 years";
    }
  }
  const affirmationThrough =
    s.affirmedOn && isIsoDate(s.affirmedOn) ? addYears(s.affirmedOn, 1) : null;
  const through =
    statusThrough && affirmationThrough
      ? statusThrough < affirmationThrough
        ? statusThrough
        : affirmationThrough
      : null;
  if (!through)
    return {
      statusThrough,
      statusBasis,
      affirmationThrough,
      through,
      state: "unknown",
      daysLeft: null,
    };
  const daysLeft = daysBetween(today, through);
  return {
    statusThrough,
    statusBasis,
    affirmationThrough,
    through,
    daysLeft,
    state:
      daysLeft < 0 ? "not_current" : daysLeft <= SUPPLIER_DUE_SOON_DAYS ? "due_soon" : "current",
  };
}

/** True when the status is at the level flowed down "or higher" ((d)(1)(i)). */
export function meetsLevel(status: SupplierStatus, required: SupplierLevel): boolean {
  return LEVEL_RANK[STATUS_LEVEL[status]] >= LEVEL_RANK[required];
}

/** Whether the clause has to go into this subcontract at all ((f)(1)). */
export function needsFlowdown(s: Pick<SupplierLike, "infoFlowed" | "cots">): boolean {
  return s.infoFlowed !== "none" && !s.cots;
}

const UID_RE = /^[A-Za-z0-9]{10}$/;

export function parseUids(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((u) => u.trim())
    .filter(Boolean);
}

export interface SupplierInputLike {
  infoFlowed: InfoFlowed;
  requiredLevel: SupplierLevel | null;
  status: SupplierStatus | null;
  statusDate: string | null;
  affirmedOn: string | null;
  cmmcUids: string;
  checkedOn: string | null;
  awardedOn: string | null;
}

/** Problems that stop a supplier being saved; an empty list means it can be saved. Pure. */
export function validateSupplier(s: SupplierInputLike, today: string): string[] {
  const errors: string[] = [];
  const dates: [string, string | null][] = [
    ["CMMC Status Date", s.statusDate],
    ["Date of the latest affirmation", s.affirmedOn],
    ["Date you checked the status", s.checkedOn],
    ["Award date", s.awardedOn],
  ];
  for (const [label, d] of dates) {
    if (d === null) continue;
    if (!isIsoDate(d)) errors.push(`${label} must be a date (YYYY-MM-DD).`);
    else if (d > today) errors.push(`${label} cannot be in the future.`);
  }
  if (s.status === null && s.statusDate !== null)
    errors.push("Choose the status that CMMC Status Date belongs to.");
  if (s.statusDate && s.affirmedOn && s.affirmedOn < s.statusDate)
    errors.push(
      "The latest affirmation cannot be before the CMMC Status Date: an affirmation follows the assessment.",
    );
  for (const uid of parseUids(s.cmmcUids))
    if (!UID_RE.test(uid))
      errors.push(`"${uid.slice(0, 20)}" is not a CMMC UID: a UID is 10 letters and digits.`);
  return errors;
}

export type SupplierIssueKind = "gap" | "soon" | "note";

export interface SupplierIssue {
  supplierId: string;
  kind: SupplierIssueKind;
  message: string;
}

export interface SupplierCheck {
  total: number;
  /** Suppliers whose subcontract carries FCI or CUI and is not for COTS items. */
  flowdown: number;
  /** Of those, the ones with no gap: level met, current, clause in, checked before award. */
  ready: number;
  issues: SupplierIssue[];
}

/** What an assessor or a prime would ask about first, per supplier, in order. Pure. */
export function supplierIssues(s: SupplierLike & { name: string }, today: string): SupplierIssue[] {
  const out: SupplierIssue[] = [];
  const add = (kind: SupplierIssueKind, message: string) =>
    out.push({ supplierId: s.id, kind, message: `${s.name}: ${message}` });
  if (s.infoFlowed === "none") return out;
  if (s.cots) {
    add(
      "note",
      "commercially available off-the-shelf items are left out of the clause (252.204-7021(f)(1)). Make sure nothing marked FCI or CUI goes with the order.",
    );
    return out;
  }
  if (!s.requiredLevel) {
    const g = suggestFlowdownLevel(s, null);
    const lvl = g.level ? SUPPLIER_LEVEL_LABEL[g.level] : "";
    add(
      "gap",
      g.ifPrimeC3pao
        ? `choose the CMMC level you flow down. ${g.cite} makes it at least ${lvl}, or ${SUPPLIER_LEVEL_LABEL[g.ifPrimeC3pao]} if your prime contract requires Level 2 (C3PAO) or Level 3 (DIBCAC).`
        : `choose the CMMC level you flow down. ${g.cite} makes it ${lvl}.`,
    );
  } else if (s.infoFlowed === "cui" && s.requiredLevel === "l1_self")
    add(
      "gap",
      "Level 1 covers FCI only. 32 CFR 170.23(a)(2) makes Level 2 (Self) the minimum for a subcontract that flows CUI, and (a)(3)-(4) Level 2 (C3PAO) when the prime contract requires Level 2 (C3PAO) or Level 3.",
    );
  else if (s.infoFlowed === "fci" && s.requiredLevel !== "l1_self")
    add(
      "note",
      `32 CFR 170.23(a)(1) asks for Level 1 (Self) when only FCI goes with the order; you flow down ${SUPPLIER_LEVEL_LABEL[s.requiredLevel]}. That is your subcontract's choice, not the rule's, and the checks hold the supplier to it.`,
    );
  if (!s.status)
    add("gap", "record the supplier's CMMC status (from SPRS or their own statement).");
  else if (s.requiredLevel && !meetsLevel(s.status, s.requiredLevel))
    add(
      "gap",
      `${SUPPLIER_STATUS_LABEL[s.status]} is below the ${SUPPLIER_LEVEL_LABEL[s.requiredLevel]} you flow down.`,
    );
  else if (s.requiredLevel === "l1_self" && isConditional(s.status))
    add(
      "note",
      "a Conditional status is above Level 1, but DFARS 204.7502(b)(2) says Level 1 needs a Final status for award. That line is written for DoD's own awards; ask your prime whether it applies to yours.",
    );
  if (s.status) {
    if (!s.statusDate)
      add("gap", "record the CMMC Status Date, so the app can tell whether it is current.");
    if (!s.affirmedOn)
      add(
        "gap",
        "record the supplier's latest affirmation of continuous compliance (252.204-7021(d)(4)).",
      );
    const c = supplierCurrency(s, today);
    if (c.state === "not_current" && c.through) {
      const which =
        c.through === c.statusThrough
          ? isConditional(s.status)
            ? "its Conditional status is over 180 days old; it needs a POA&M closeout to reach Final"
            : "its status is past its assessment period"
          : "its latest affirmation is over a year old";
      add("gap", `not current since ${addDays(c.through, 1)}: ${which}.`);
    } else if (c.state === "due_soon" && c.through)
      add(
        "soon",
        `stays current through ${c.through} (${c.daysLeft} days). Ask for the new ${
          c.through === c.affirmationThrough ? "affirmation" : "assessment"
        } before then.`,
      );
  }
  if (!s.clauseFlowedDown)
    add(
      "gap",
      "put the substance of DFARS 252.204-7021 in the subcontract or purchase order terms (252.204-7021(f)(1)).",
    );
  if (!s.checkedOn)
    add(
      "gap",
      "record when you checked the supplier's status. The clause asks you to check before award (252.204-7021(f)(2)).",
    );
  if (s.awardedOn) {
    if (s.checkedOn && s.checkedOn > s.awardedOn)
      add("gap", `the status was checked on ${s.checkedOn}, after the award on ${s.awardedOn}.`);
    if (s.affirmedOn && s.affirmedOn > s.awardedOn && s.statusDate && s.statusDate > s.awardedOn)
      add(
        "note",
        `the status and affirmation on file are dated after the award on ${s.awardedOn}. Keep what you checked before award as well.`,
      );
  }
  return out;
}

export function checkSuppliers(list: SupplierLike[], today: string): SupplierCheck {
  const issues: SupplierIssue[] = [];
  let flowdown = 0;
  let ready = 0;
  for (const s of list) {
    const mine = supplierIssues(s, today);
    issues.push(...mine);
    if (!needsFlowdown(s)) continue;
    flowdown++;
    if (!mine.some((i) => i.kind === "gap")) ready++;
  }
  const order: Record<SupplierIssueKind, number> = { gap: 0, soon: 1, note: 2 };
  issues.sort((a, b) => order[a.kind] - order[b.kind]);
  return { total: list.length, flowdown, ready, issues };
}

const csvCell = (v: string) => {
  // A cell that a spreadsheet would read as a formula is prefixed with an apostrophe.
  const guarded = /^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

/** The supplier list as CSV, with the status's "current through" date, for a prime's questionnaire. */
export function suppliersCsv(
  list: (SupplierLike & { supplies: string; subcontractRef: string; notes: string })[],
  today: string,
): string {
  const head = [
    "Supplier",
    "What they supply",
    "Information flowed",
    "COTS",
    "Level flowed down",
    "CMMC status",
    "CMMC Status Date",
    "Latest affirmation",
    "Current through",
    "CMMC UIDs",
    "Clause in the subcontract",
    "Subcontract or PO",
    "Checked on",
    "Awarded on",
    "Open gaps",
    "Notes",
  ];
  const rows = list.map((s) => {
    const c = supplierCurrency(s, today);
    const gaps = supplierIssues(s, today).filter((i) => i.kind === "gap").length;
    return [
      s.name,
      s.supplies,
      s.infoFlowed.toUpperCase(),
      s.cots ? "yes" : "no",
      s.requiredLevel ? SUPPLIER_LEVEL_LABEL[s.requiredLevel] : "",
      s.status ? SUPPLIER_STATUS_LABEL[s.status] : "",
      s.statusDate ?? "",
      s.affirmedOn ?? "",
      c.through ?? "",
      parseUids(s.cmmcUids).join(" "),
      s.clauseFlowedDown ? "yes" : "no",
      s.subcontractRef,
      s.checkedOn ?? "",
      s.awardedOn ?? "",
      String(gaps),
      s.notes,
    ];
  });
  return `${[head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** Hard cap per organization, so one tenant cannot fill the database. */
export const MAX_SUPPLIERS_PER_ORG = 500;

/**
 * The last day a part of a supplier's record is current, grouped by date and part, for the calendar
 * file and the subscribable link: a count per date, never a supplier's name, so the link names no
 * one in the shop's supply chain. Only suppliers the clause applies to (needsFlowdown) count; a
 * date already passed is kept, so an overdue renewal still shows. Pure.
 */
export interface SupplierDueDate {
  /** "status": the CMMC status's period ends; "affirmation": the yearly affirmation's year ends. */
  part: "status" | "affirmation";
  /** The last day it is current, YYYY-MM-DD ("Current through" in the CSV). */
  through: string;
  suppliers: number;
}

export function supplierDueDates(
  list: Pick<SupplierLike, "infoFlowed" | "cots" | "status" | "statusDate" | "affirmedOn">[],
  today: string,
): SupplierDueDate[] {
  const groups = new Map<string, SupplierDueDate>();
  const add = (part: SupplierDueDate["part"], through: string | null) => {
    if (!through) return;
    const key = `${through}|${part}`;
    const g = groups.get(key);
    if (g) g.suppliers++;
    else groups.set(key, { part, through, suppliers: 1 });
  };
  for (const s of list) {
    if (!needsFlowdown(s)) continue;
    const c = supplierCurrency(s, today);
    add("status", c.statusThrough);
    add("affirmation", c.affirmationThrough);
  }
  return [...groups.values()].sort(
    (a, b) => a.through.localeCompare(b.through) || a.part.localeCompare(b.part),
  );
}

export interface SupplierAttention {
  supplierId: string;
  name: string;
  state: "not_current" | "due_soon" | "unknown";
  /** The earlier "current through" date; null when a date or the status is missing. */
  through: string | null;
}

/**
 * What the dashboard lists: suppliers no longer current (oldest first), then those whose status or
 * affirmation runs out within SUPPLIER_DUE_SOON_DAYS, then those with a date or status missing.
 * Only suppliers the clause applies to. Pure.
 */
export function supplierAttention(
  list: Pick<
    SupplierLike,
    "id" | "name" | "infoFlowed" | "cots" | "status" | "statusDate" | "affirmedOn"
  >[],
  today: string,
): SupplierAttention[] {
  const rank = { not_current: 0, due_soon: 1, unknown: 2 } as const;
  const out: SupplierAttention[] = [];
  for (const s of list) {
    if (!needsFlowdown(s)) continue;
    const c = supplierCurrency(s, today);
    if (c.state === "current") continue;
    out.push({ supplierId: s.id, name: s.name, state: c.state, through: c.through });
  }
  return out.sort(
    (a, b) =>
      rank[a.state] - rank[b.state] ||
      (a.through ?? "").localeCompare(b.through ?? "") ||
      a.name.localeCompare(b.name),
  );
}
