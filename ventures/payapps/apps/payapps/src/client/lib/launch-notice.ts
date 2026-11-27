// The strip above every page. It says what a visitor can do today, read from the public plan list
// (`GET /api/billing/plans`), so it cannot keep saying "not for sale" after checkout turns on, or
// claim paid plans are on sale while checkout is dark (BILLING_PROVIDER=none). Until the list loads,
// or if it fails, only the disclaimer shows: no claim either way.

export interface NoticePlan {
  key: string;
  purchasable: boolean;
}

export const CHECK_FIGURES = "Check every figure before you send it.";

export function launchNotice(plans: NoticePlan[] | null | undefined): string {
  if (!plans || plans.length === 0) return CHECK_FIGURES;
  const onSale = plans.some((p) => p.key !== "free" && p.purchasable);
  const lead = onSale
    ? "PayApps is open: free on one active job, paid plans for more jobs."
    : "PayApps is open on the Free plan (one active job, no card). Paid plans are not on sale yet.";
  return `${lead} ${CHECK_FIGURES}`;
}
