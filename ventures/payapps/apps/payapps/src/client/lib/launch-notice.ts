// The strip above every page. It says what a visitor can do today, read from the public plan list
// (`GET /api/billing/plans`), so it cannot keep saying "not for sale" after checkout turns on, or
// claim paid plans are on sale while checkout is dark (BILLING_PROVIDER=none). `checkoutAvailable`
// is the deployment's switch; a plan's `purchasable` is catalog data and true while checkout is dark
// (2026-11-27: keying on it made the live strip say paid plans were on sale). Until the list loads,
// or if it fails, only the disclaimer shows: no claim either way.

export interface PlanList {
  checkoutAvailable?: boolean;
}

export const CHECK_FIGURES = "Check every figure before you send it.";

export function launchNotice(list: PlanList | null | undefined): string {
  if (!list || typeof list.checkoutAvailable !== "boolean") return CHECK_FIGURES;
  const lead = list.checkoutAvailable
    ? "PayApps is open: free on one active job, paid plans for more jobs."
    : "PayApps is open on the Free plan (one active job, no card). Paid plans are not on sale yet.";
  return `${lead} ${CHECK_FIGURES}`;
}
