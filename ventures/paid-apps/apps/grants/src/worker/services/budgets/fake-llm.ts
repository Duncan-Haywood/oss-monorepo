// Deterministic FakeLlm handler for budgets.propose (tests + offline demo). Reads the same prompt
// the real model sees: one line per fact in the context's <facts> block with a dollar amount, the
// project's budget need when nothing is itemized, and one $0 line for staff to fill in.
import type { BudgetCategory, FundingSource } from "@shared/budget";
import type { FakeHandler } from "../../ports/fake-llm";
import type { LlmRequestBase } from "../../ports/llm";
import { type ProposedBudget, PURPOSE_PROPOSE } from "./propose";

const CATEGORY_WORDS: [BudgetCategory, RegExp][] = [
  ["fringe", /\bfringe|benefits\b/i],
  ["personnel", /\bsalar|wage|coordinator|instructor|staff|director|personnel\b/i],
  ["travel", /\btravel|mileage|trip|airfare\b/i],
  ["equipment", /\bequipment|van|vehicle|truck|machine\b/i],
  ["supplies", /\bsuppl|materials|tools\b/i],
  ["contractual", /\bcontract|consultant|evaluator\b/i],
  ["construction", /\bconstruct|renovat|build\b/i],
  ["indirect", /\bindirect|overhead\b/i],
];

const DOLLARS = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/;

export function fakeProposeBudget(req: LlmRequestBase): ProposedBudget {
  const block = /<facts>([\s\S]*?)<\/facts>/.exec(req.context ?? "")?.[1] ?? "";
  const lines: ProposedBudget["lines"] = [];
  for (const row of block.split("\n")) {
    const m = /^\[([^\]]+)\]\s*(?:\([^)]*\))?\s*(.*)$/.exec(row.trim());
    if (!m?.[1] || !m[2]) continue;
    const statement = m[2].split(/\s+—\s+source:/)[0] ?? "";
    const amount = DOLLARS.exec(statement);
    if (!amount?.[1] || m[1].startsWith("project:")) continue;
    const dollars = Number(amount[1].replace(/,/g, "")) + Number(amount[2] ?? 0) / 100;
    const category = CATEGORY_WORDS.find(([, re]) => re.test(statement))?.[0] ?? "other";
    const fundingSource: FundingSource = /\bmatch|in-kind|contribut|cost share/i.test(statement)
      ? "match"
      : "request";
    lines.push({
      category,
      description: statement.slice(0, 120),
      quantity: 1,
      unitCostDollars: dollars,
      fundingSource,
      factIds: [m[1]],
    });
  }
  const need = /Budget need: \$([\d,.]+) \(cite as "([^"]+)"\)/.exec(req.prompt);
  if (lines.length === 0 && need?.[1] && need[2]) {
    lines.push({
      category: "other",
      description: "Project costs (to itemize)",
      quantity: 1,
      unitCostDollars: Number(need[1].replace(/,/g, "")),
      fundingSource: "request",
      factIds: [need[2]],
    });
  }
  lines.push({
    category: "contractual",
    description: "Evaluation and reporting",
    quantity: 1,
    unitCostDollars: 0,
    fundingSource: "request",
    factIds: [],
  });
  return { lines };
}

export const fakeHandlers: Record<string, FakeHandler> = {
  [PURPOSE_PROPOSE]: fakeProposeBudget,
};
