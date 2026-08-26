// Deterministic freight accessorial review. No network, no state.
// Amounts and evidence status are user-supplied — never fetched from a
// carrier, and never treated as a dispute determination.

export const ACCESSORIAL_TYPES = {
  DETENTION: {
    label: "Detention",
    evidenceHint: "arrival and departure timestamps plus contracted free time",
  },
  LIFTGATE: {
    label: "Liftgate",
    evidenceHint: "delivery-condition notes or an appointment record",
  },
  RESIDENTIAL: {
    label: "Residential / limited access",
    evidenceHint: "delivery address class or limited-access confirmation",
  },
  REWEIGH: {
    label: "Reweigh / reclass",
    evidenceHint: "carrier scale ticket or class worksheet",
  },
  LUMPER: {
    label: "Lumper",
    evidenceHint: "lumper receipt matching the billed location",
  },
  OTHER: {
    label: "Other accessorial",
    evidenceHint: "the contract line or rate confirmation for this code",
  },
};

const EVIDENCE_STATUSES = new Set(["missing", "contradicts", "supports", ""]);

function cents(value) {
  return Math.round(value * 100) / 100;
}

function nonNegative(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return number;
}

function money(value) {
  return `$${cents(value).toFixed(2)}`;
}

function normalizeEvidence(value) {
  const evidence = String(value ?? "").trim().toLowerCase();
  return EVIDENCE_STATUSES.has(evidence) ? evidence : "";
}

function priorityFor(row) {
  if (row.flags.some((flag) => flag.startsWith("Invalid"))) return "fix-inputs";
  if (row.evidence === "supports") return "supported";
  if (row.variance > 0 && (row.evidence === "missing" || row.evidence === "contradicts")) {
    return row.variance >= 100 ? "high" : "review";
  }
  if (row.variance > 0) return "review";
  return "no-variance";
}

export function auditCharges(rows) {
  const seen = new Set();
  return rows.map((row, index) => {
    const billedInput = Number(row.billed);
    const expectedInput = Number(row.expected);
    const billedMissing = row.billed == null || String(row.billed).trim() === "";
    const expectedMissing = row.expected == null || String(row.expected).trim() === "";
    const billed = Number.isFinite(billedInput) ? billedInput : 0;
    const expected = Number.isFinite(expectedInput) ? expectedInput : 0;
    const code = String(row.code ?? "").trim();
    const key = `${row.invoice}|${row.reference}|${code}|${billed.toFixed(2)}`;
    const flags = [];
    if (billedMissing || !Number.isFinite(billedInput) || billed < 0) {
      flags.push("Invalid billed amount");
    }
    if (expectedMissing || !Number.isFinite(expectedInput) || expected < 0) {
      flags.push("Invalid expected amount");
    }
    if (seen.has(key)) flags.push("Possible duplicate");
    seen.add(key);
    if (billed > expected && billed >= 0 && expected >= 0) {
      flags.push(`Over expected by ${money(billed - expected)}`);
    }
    if (!code) flags.push("Missing accessorial code");
    const evidence = normalizeEvidence(row.evidence);
    if (evidence === "missing" && billed > expected) {
      flags.push("Evidence missing for the overage");
    }
    if (evidence === "contradicts" && billed > expected) {
      flags.push("Evidence contradicts the billed condition");
    }
    const result = {
      invoice: String(row.invoice ?? ""),
      reference: String(row.reference ?? ""),
      code,
      type: String(row.type ?? ""),
      billed,
      expected,
      variance: cents(billed - expected),
      evidence,
      flags,
      index,
    };
    result.priority = priorityFor(result);
    return result;
  });
}

export function auditTotals(results) {
  return results.reduce(
    (totals, row) => ({
      billed: cents(totals.billed + row.billed),
      expected: cents(totals.expected + row.expected),
      flagged: totals.flagged + (row.flags.length ? 1 : 0),
      recoverable: cents(totals.recoverable + Math.max(0, row.variance)),
      actionable:
        totals.actionable +
        (row.priority === "high" || row.priority === "review" ? 1 : 0),
    }),
    { billed: 0, expected: 0, flagged: 0, recoverable: 0, actionable: 0 },
  );
}

export function csvForReview(results) {
  const escape = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const lines = ["Invoice,Reference,Code,Billed,Expected,Variance,Evidence,Priority,Flags"];
  for (const row of results) {
    lines.push(
      [
        row.invoice,
        row.reference,
        row.code,
        row.billed.toFixed(2),
        row.expected.toFixed(2),
        row.variance.toFixed(2),
        row.evidence,
        row.priority,
        row.flags.join("; "),
      ]
        .map(escape)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function disputeDraft({ invoice = "", carrier = "", results = [] } = {}) {
  const actionable = results.filter(
    (row) => row.priority === "high" || row.priority === "review",
  );
  const totals = auditTotals(actionable);
  const subjectRef = invoice.trim() || "invoice reference";
  const carrierBit = carrier.trim() || "the carrier";
  const lines = actionable.map((row) => {
    const code = row.code || row.type || "uncoded accessorial";
    const evidence =
      row.evidence === "contradicts"
        ? "selected evidence contradicts the billed condition"
        : row.evidence === "missing"
          ? "supporting evidence is not attached"
          : "evidence status was not selected";
    return `- ${code} on ${row.invoice || "unlabelled invoice"}: billed ${money(row.billed)}, expected ${money(row.expected)} (${money(row.variance)} above expected; ${evidence})`;
  });
  const body = [
    `Subject: Accessorial review — ${subjectRef}`,
    "",
    `Please review the accessorial lines below on ${subjectRef} from ${carrierBit}.`,
    `The entered expected amounts leave ${money(totals.recoverable)} above expected across ${actionable.length} line(s).`,
    "",
    ...(lines.length ? lines : ["- No line currently has both an overage and a missing or contradictory evidence status."]),
    "",
    "Please provide the governing rate confirmation, BOL/POD or applicable ticket for each line, and issue a corrected invoice or credit if a charge is unsupported.",
    "",
    "This is a factual review request. I will verify the attached records against the contract and shipment documents. It is not a determination that any charge is wrong.",
  ];
  return body.join("\n");
}

/**
 * Clock time on dock versus contracted free time and the billed detention
 * line. Billable hours are only the minutes after free time.
 */
export function reviewDetention(input = {}) {
  const dockMinutes = nonNegative(input.dockMinutes, "Time on dock");
  const freeMinutes = nonNegative(input.freeMinutes, "Free time");
  const ratePerHour = nonNegative(input.ratePerHour, "Contract hourly rate");
  const billedAmount = nonNegative(input.billedAmount, "Billed detention");

  const clockHours = cents(dockMinutes / 60);
  const freeHours = cents(freeMinutes / 60);
  const billableMinutes = Math.max(0, dockMinutes - freeMinutes);
  const billableHours = cents(billableMinutes / 60);
  const expected = cents(billableHours * ratePerHour);
  const variance = cents(billedAmount - expected);
  const impliedBilledHours = ratePerHour > 0 ? cents(billedAmount / ratePerHour) : null;

  const flags = [];
  if (dockMinutes < freeMinutes) flags.push("Free time is longer than the clock");
  if (variance > 0) flags.push(`Over expected by ${money(variance)}`);
  if (impliedBilledHours != null && impliedBilledHours > clockHours + 0.001) {
    flags.push("Billed hours exceed time on dock");
  }

  return {
    clockHours,
    freeHours,
    billableHours,
    expected,
    billedAmount,
    variance,
    impliedBilledHours,
    recoverable: Math.max(0, variance),
    flags,
  };
}

export function detentionNote(result) {
  const clock = `${result.clockHours.toFixed(2)} hours on dock`;
  const free = `${result.freeHours.toFixed(2)} free hours`;
  const billable = `${result.billableHours.toFixed(2)} hour${result.billableHours === 1 ? "" : "s"}`;
  const implied =
    result.impliedBilledHours == null
      ? "The billed amount cannot be turned into hours without a contract rate."
      : `The invoice bills ${money(result.billedAmount)} as if ${result.impliedBilledHours.toFixed(2)} hours.`;
  if (result.variance === 0) {
    return `The clock shows ${clock} after ${free}, so ${billable} is billable — ${money(result.expected)} expected. ${implied} The billed line matches the clock.`;
  }
  if (result.variance < 0) {
    return `The clock shows ${clock} after ${free}, so ${billable} is billable — ${money(result.expected)} expected. The invoice bills ${money(result.billedAmount)} (${money(-result.variance)} under that). This is a review of the line, not a determination that the invoice is short.`;
  }
  return `The clock shows ${clock} after ${free}, so ${billable} is billable — ${money(result.expected)} expected. ${implied} That is ${money(result.variance)} above the clock. This is a review of the line, not a determination that the charge is wrong.`;
}
