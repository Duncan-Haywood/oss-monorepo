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
  const rounded = cents(value);
  return rounded < 0 ? `-$${(-rounded).toFixed(2)}` : `$${rounded.toFixed(2)}`;
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
      // How the expected amount was arrived at, in the user's own terms —
      // "$65.00/hour × 1 hour past 2 free", say. Set by the importer from the
      // rate-card rule that priced the line; blank for a hand-typed figure.
      // Carried through so the CSV and the dispute draft can cite the
      // contract term rather than assert a number.
      basis: String(row.basis ?? "").trim(),
      units: String(row.units ?? "").trim(),
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
      // A row whose amounts could not be read is not an overage of its whole
      // billed value. Treating a blank expected as $0.00 would headline the
      // full billed amount as "above expected" — the difference between "this
      // line looks overbilled" and "we do not know what this line should
      // cost". Such rows are already excluded from `actionable`; this keeps
      // the dollar figure consistent with that. `unpriced` reports how many
      // were held back so the omission is visible rather than silent.
      // A row whose evidence *supports* the billed condition is not an
      // outstanding overage either. `priorityFor` already keeps it out of
      // `actionable`, but its variance still landed in `recoverable` here
      // — so a detention line billed $300 against a $75 rate-card figure,
      // with a scale ticket attached that supports the $300, still added
      // $225.00 to the headline "Above expected" dollar total shown on the
      // page, right next to an "actionable" count that correctly excluded
      // it. The evidence has already reconciled that gap against the real
      // record; counting it toward "recoverable" reintroduces the
      // overclaim the evidence was attached to rule out.
      recoverable:
        row.priority === "fix-inputs" || row.priority === "supported"
          ? totals.recoverable
          : cents(totals.recoverable + Math.max(0, row.variance)),
      unpriced: totals.unpriced + (row.priority === "fix-inputs" ? 1 : 0),
      supported: totals.supported + (row.priority === "supported" ? 1 : 0),
      actionable:
        totals.actionable +
        (row.priority === "high" || row.priority === "review" ? 1 : 0),
    }),
    { billed: 0, expected: 0, flagged: 0, recoverable: 0, unpriced: 0, supported: 0, actionable: 0 },
  );
}

export function csvForReview(results) {
  const escape = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const lines = ["Invoice,Reference,Code,Quantity,Billed,Expected,Basis,Variance,Evidence,Priority,Flags"];
  for (const row of results) {
    lines.push(
      [
        row.invoice,
        row.reference,
        row.code,
        row.units ?? "",
        row.billed.toFixed(2),
        row.expected.toFixed(2),
        row.basis ?? "",
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
    // Citing how the expected figure was reached turns the line from an
    // assertion into something the carrier's rating desk can check against the
    // same contract. A hand-typed expected amount has no basis to cite.
    const basis = row.basis ? `; expected from ${row.basis}` : "";
    return `- ${code} on ${row.invoice || "unlabelled invoice"}: billed ${money(row.billed)}, expected ${money(row.expected)} (${money(row.variance)} above expected${basis}; ${evidence})`;
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

/**
 * Who keeps cash after a billed accessorial: eat it, invoice the
 * customer, or pay first and file a review. Pay-the-carrier-first is
 * the usual AP path. Recovery is the typed expected amount versus the
 * billed line — not a carrier decision.
 */
export function comparePassThrough(input = {}) {
  const billed = nonNegative(input.billed, "Billed accessorial");
  const expected = nonNegative(input.expected, "Expected / supported amount");
  const collectedFreight = nonNegative(input.collectedFreight, "Freight already collected");
  const backCharge = nonNegative(input.backCharge, "Amount you would bill the customer");
  const reviewHours = nonNegative(input.reviewHours, "Review hours");
  const reviewRate = nonNegative(input.reviewRate, "Review hourly cost");

  const recoverable = cents(Math.max(0, billed - expected));
  const labor = cents(reviewHours * reviewRate);
  const eat = cents(collectedFreight - billed);
  const billCustomer = cents(collectedFreight + backCharge - billed);
  const reviewCredit = cents(collectedFreight - billed + recoverable - labor);
  const reviewNoCredit = cents(collectedFreight - billed - labor);
  const reviewHoursCreditBuys = reviewRate > 0 ? cents(recoverable / reviewRate) : null;

  const paths = [
    { id: "eat", label: "Eat the charge", kept: eat, customerPays: 0, labor: 0 },
    { id: "bill", label: "Bill the customer", kept: billCustomer, customerPays: backCharge, labor: 0 },
    {
      id: "reviewCredit",
      label: "Review, credit arrives",
      kept: reviewCredit,
      customerPays: 0,
      labor,
    },
    {
      id: "reviewNoCredit",
      label: "Review, no credit",
      kept: reviewNoCredit,
      customerPays: 0,
      labor,
    },
  ];
  const winner = paths.reduce((best, row) => (row.kept > best.kept ? row : best), paths[0]);

  return {
    billed,
    expected,
    collectedFreight,
    backCharge,
    recoverable,
    labor,
    eat,
    billCustomer,
    reviewCredit,
    reviewNoCredit,
    reviewHoursCreditBuys,
    vsEatBill: cents(billCustomer - eat),
    vsEatReviewCredit: cents(reviewCredit - eat),
    vsBillReviewCredit: cents(reviewCredit - billCustomer),
    paths,
    winnerId: winner.id,
    winnerKept: winner.kept,
  };
}

/**
 * Billed LTL fuel surcharge versus the contract percent of linehaul.
 * Optional index (DOE / EIA / carrier bulletin) plus a typed adder is a
 * second expected amount — never fetched. A rate card that skips FUEL
 * cannot price this line because the base is linehaul, not a flat code.
 */
export function reviewFuelSurcharge(input = {}) {
  const linehaul = nonNegative(input.linehaul, "Linehaul");
  const contractPercent = nonNegative(input.contractPercent, "Contract fuel percent");
  if (contractPercent > 100) {
    throw new Error("Contract fuel percent must be at most 100.");
  }
  const billedAmount = nonNegative(input.billedAmount, "Billed fuel surcharge");
  const indexPercent = optionalPercent(input.indexPercent, "Index fuel percent");
  const indexAdderRaw = input.indexAdder;
  const indexAdderProvided = indexAdderRaw != null && String(indexAdderRaw).trim() !== "";
  if (indexAdderProvided && indexPercent == null) {
    throw new Error("Index adder needs an index fuel percent.");
  }
  const indexAdder = indexPercent == null ? 0 : nonNegative(indexAdderRaw ?? 0, "Index adder");
  const indexAppliedPercent = indexPercent == null ? null : cents(indexPercent + indexAdder);
  if (indexAppliedPercent != null && indexAppliedPercent > 100) {
    throw new Error("Index plus adder must be at most 100.");
  }

  const expectedFromContract = cents(linehaul * (contractPercent / 100));
  const expectedFromIndex =
    indexAppliedPercent == null ? null : cents(linehaul * (indexAppliedPercent / 100));
  const billedPercent = linehaul > 0 ? cents((billedAmount / linehaul) * 100) : null;
  const varianceVsContract = cents(billedAmount - expectedFromContract);
  const varianceVsIndex =
    expectedFromIndex == null ? null : cents(billedAmount - expectedFromIndex);

  const flags = [];
  if (linehaul === 0) flags.push("Linehaul is zero — billed percent cannot be computed");
  if (varianceVsContract > 0) flags.push(`Over contract by ${money(varianceVsContract)}`);
  if (varianceVsIndex != null && varianceVsIndex > 0) {
    flags.push(`Over index by ${money(varianceVsIndex)}`);
  }

  return {
    linehaul,
    contractPercent,
    billedAmount,
    billedPercent,
    expectedFromContract,
    varianceVsContract,
    recoverable: Math.max(0, varianceVsContract),
    indexPercent,
    indexAdder: indexPercent == null ? 0 : indexAdder,
    indexAppliedPercent,
    expectedFromIndex,
    varianceVsIndex,
    flags,
  };
}

function optionalPercent(value, name) {
  if (value == null || String(value).trim() === "") return null;
  const number = nonNegative(value, name);
  if (number > 100) throw new Error(`${name} must be at most 100.`);
  return number;
}

export function fuelSurchargeNote(result) {
  const linehaul = money(result.linehaul);
  const contract = `${result.contractPercent.toFixed(2)}%`;
  const expected = money(result.expectedFromContract);
  const billed = money(result.billedAmount);
  const billedPct =
    result.billedPercent == null
      ? "The billed percent cannot be computed without a linehaul."
      : `${result.billedPercent.toFixed(2)}% of linehaul`;
  const vsContract =
    result.varianceVsContract === 0
      ? `The billed line matches the ${expected} contract amount.`
      : result.varianceVsContract > 0
        ? `That is ${money(result.varianceVsContract)} above the contract.`
        : `The invoice bills ${money(-result.varianceVsContract)} under the contract. This is a review of the line, not a determination that the invoice is short.`;
  const index =
    result.indexAppliedPercent == null
      ? "No index percent was typed."
      : `The typed index (${result.indexPercent.toFixed(2)}% plus ${result.indexAdder.toFixed(2)} points) is ${result.indexAppliedPercent.toFixed(2)}% and expects ${money(result.expectedFromIndex)}.` +
        (result.varianceVsIndex === 0
          ? " The billed line matches that index amount."
          : result.varianceVsIndex > 0
            ? ` The billed line is ${money(result.varianceVsIndex)} above that index amount.`
            : ` The billed line is ${money(-result.varianceVsIndex)} under that index amount.`);
  return (
    `Linehaul ${linehaul} at the ${contract} contract rate expects ${expected}. ` +
    `The invoice bills ${billed} — ${billedPct}. ${vsContract} ${index} ` +
    `This is a review of the line, not a determination that the charge is wrong.`
  );
}

export function passThroughNote(result) {
  const collected = money(result.collectedFreight);
  const billed = money(result.billed);
  const expected = money(result.expected);
  const gap = money(result.recoverable);
  const labor = money(result.labor);
  const eat = money(result.eat);
  const bill = money(result.billCustomer);
  const credit = money(result.reviewCredit);
  const noCredit = money(result.reviewNoCredit);
  const hours =
    result.reviewHoursCreditBuys == null
      ? "The credit cannot be turned into review hours without an hourly cost."
      : `The ${gap} gap buys ${result.reviewHoursCreditBuys.toFixed(2)} hours of review at the typed rate.`;
  return (
    `Freight already collected is ${collected}. The carrier billed ${billed} against ${expected} supported (${gap} gap). ` +
    `Eating the line keeps ${eat}. Billing the customer ${money(result.backCharge)} keeps ${bill}. ` +
    `Paying first and getting a ${gap} credit after ${labor} of review keeps ${credit}. ` +
    `The same review with no credit keeps ${noCredit}. ${hours} ` +
    `This is cash on these inputs, not a reason to invoice a customer or to file a claim.`
  );
}
