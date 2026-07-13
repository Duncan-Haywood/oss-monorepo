/**
 * log-lead.test.ts — `npm test` (tsx, no test framework dependency).
 *
 * Exercises log-lead.ts's pure functions against an in-memory copy of
 * leads-log.ts's shape — never touches the real process/leads-log.ts file.
 */

import { appendLeadToSource, formatLeadEntry, nextLeadId, validateLeadInput } from "./log-lead";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

const EMPTY_SOURCE = `import type { OutreachTemplate } from "./outreach-templates";

export type LeadStage = "identified" | "contacted";

export type Lead = {
  id: string;
  audience: OutreachTemplate["audience"];
  contactLabel: string;
  channel: OutreachTemplate["channel"];
  templateId?: string;
  stage: LeadStage;
  dateLogged: string;
  notes?: string;
};

export const leadsLog: Lead[] = [];

export const LEAD_STAGE_ORDER: LeadStage[] = ["identified", "contacted"];
`;

function run() {
  let threw = false;
  try {
    validateLeadInput({});
  } catch {
    threw = true;
  }
  assert(threw, "validateLeadInput should reject an empty input");

  threw = false;
  try {
    validateLeadInput({
      audience: "agent",
      contactLabel: "x",
      channel: "email",
      stage: "not_a_real_stage" as never,
      dateLogged: "2026-07-12",
    });
  } catch {
    threw = true;
  }
  assert(threw, "validateLeadInput should reject an invalid stage");

  const input = {
    audience: "agent" as const,
    contactLabel: "Agent — Keller Williams downtown",
    channel: "email" as const,
    templateId: "agent-cold-email",
    stage: "contacted" as const,
    dateLogged: "2026-07-12",
    notes: 'Replied "interested" to cold email',
  };
  validateLeadInput(input); // should not throw

  threw = false;
  try {
    validateLeadInput({ ...input, paymentMethod: "not_a_real_method" as never });
  } catch {
    threw = true;
  }
  assert(threw, "validateLeadInput should reject an unknown payment method");

  threw = false;
  try {
    validateLeadInput({ ...input, stage: "contacted", paymentReference: "conf-1234" });
  } catch {
    threw = true;
  }
  assert(threw, "validateLeadInput should reject a payment reference on a non-paid stage");

  const paidInput = {
    ...input,
    stage: "paid" as const,
    paymentMethod: "zelle" as const,
    paymentReference: "conf-1234",
  };
  validateLeadInput(paidInput); // should not throw
  const paidEntry = formatLeadEntry("lead-paid", paidInput);
  assert(paidEntry.includes('paymentMethod: "zelle"'), "formatted entry should include paymentMethod");
  assert(paidEntry.includes('paymentReference: "conf-1234"'), "formatted entry should include paymentReference");

  assert(nextLeadId(EMPTY_SOURCE) === "lead-001", `expected lead-001, got ${nextLeadId(EMPTY_SOURCE)}`);

  const entry = formatLeadEntry("lead-001", input);
  assert(entry.includes('id: "lead-001"'), "formatted entry should include the id");
  assert(entry.includes('notes: "Replied \\"interested\\" to cold email"'), "formatted entry should escape quotes");

  const first = appendLeadToSource(EMPTY_SOURCE, input);
  assert(first.id === "lead-001", "first appended id should be lead-001");
  assert(first.updated.includes('contactLabel: "Agent — Keller Williams downtown"'), "should contain contact label");
  assert(/export const LEAD_STAGE_ORDER/.test(first.updated), "rest of the file should be untouched");
  assert(first.updated.includes("export const leadsLog: Lead[] = [\n  {"), "entry should land inside the array");

  const second = appendLeadToSource(first.updated, {
    ...input,
    contactLabel: "STR host — 2BR downtown loft",
    templateId: undefined,
    notes: undefined,
  });
  assert(second.id === "lead-002", `expected lead-002, got ${second.id}`);
  assert(second.updated.includes('id: "lead-001"'), "first entry should still be present after a second append");
  assert(second.updated.includes('id: "lead-002"'), "second entry should be appended");

  console.log("log-lead.test.ts: all assertions passed");
}

run();
