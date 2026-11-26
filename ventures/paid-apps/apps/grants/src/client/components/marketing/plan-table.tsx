// Side-by-side plan comparison for /pricing. Every cell comes from PLANS (src/shared/billing/plans.ts),
// so nothing here can drift from billing. Features every plan shares are listed once
// (commonFeatures); the table shows only what a plan adds.
import { Table, Td, Th } from "@client/components/ui";
import { formatCents } from "@client/lib/api";
import { PLAN_LIST, type Plan } from "@shared/billing/plans";
import { Check, Minus } from "lucide-react";
import type * as React from "react";
import { draftsPerMonthLabel, marketingPlans, monthlyPrice } from "./plan-copy";

interface Row {
  label: string;
  cell: (plan: Plan) => React.ReactNode;
}

/** Features listed by every plan we sell, in the cheapest plan's order. */
export function commonFeatures(plans: readonly Plan[] = PLAN_LIST): string[] {
  const forSale = marketingPlans(plans);
  const [first, ...rest] = forSale;
  if (!first) return [];
  return first.features.filter((f) => rest.every((p) => p.features.includes(f)));
}

function extras(plan: Plan, common: readonly string[]) {
  const own = plan.features.filter((f) => !common.includes(f));
  if (own.length === 0) {
    return (
      <>
        <Minus className="h-4 w-4 text-neutral-400" aria-hidden />
        <span className="sr-only">Nothing extra</span>
      </>
    );
  }
  return (
    <ul className="space-y-1.5">
      {own.map((f) => (
        <li key={f} className="flex gap-2">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
          <span>{f}</span>
        </li>
      ))}
    </ul>
  );
}

function rowsFor(plans: readonly Plan[]): Row[] {
  const common = commonFeatures(plans);
  return [
    { label: "Monthly price", cell: (p) => `${monthlyPrice(p)} a month` },
    {
      label: "Yearly price",
      cell: (p) =>
        p.annualPriceCents ? `${formatCents(p.annualPriceCents)} a year` : "Monthly only",
    },
    {
      label: "Application drafts",
      cell: (p) => draftsPerMonthLabel(p.includedApplicationDrafts),
    },
    {
      label: "Grants scored for fit",
      cell: (p) => `Up to ${p.maxOpportunityScoresPerMonth} a month`,
    },
    { label: "Team members", cell: (p) => `Up to ${p.seats}` },
    { label: "Also includes", cell: (p) => extras(p, common) },
  ];
}

export function PlanComparisonTable({ plans = PLAN_LIST }: { plans?: readonly Plan[] }) {
  const forSale = marketingPlans(plans);
  if (forSale.length === 0) return null;
  return (
    <Table className="text-left">
      <caption className="sr-only">Compare plans</caption>
      <thead>
        <tr>
          <Th>
            <span className="sr-only">What's included</span>
          </Th>
          {forSale.map((p) => (
            <Th key={p.key} className="text-sm normal-case tracking-normal text-neutral-900">
              {p.name}
            </Th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-100">
        {rowsFor(forSale).map((row) => (
          <tr key={row.label}>
            <th scope="row" className="px-4 py-3 text-left align-top font-medium text-neutral-700">
              {row.label}
            </th>
            {forSale.map((p) => (
              <Td key={p.key} className="min-w-40 tabular-nums">
                {row.cell(p)}
              </Td>
            ))}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
