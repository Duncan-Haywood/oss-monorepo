// The strip at the top of every page. Before launch it said "in development, not yet offered for
// sale" by hand; since the first deploy (2026-11-27) sign-ups are open and the Free plan works,
// so it says that, and whether paid plans are on sale comes from the Worker (`/api/health`
// `checkout`: a billing provider is configured), not from a sentence someone has to remember to
// change. While the health check is loading or fails it says the cautious thing (not on sale).
// The "check every figure" line is the disclaimer and is always there.

export const CHECK_FIGURES = "Check every figure before you send it.";

export function statusBanner(checkout: boolean | undefined): string {
  return checkout === true
    ? `PayApps: free on one job, paid plans for more. ${CHECK_FIGURES}`
    : `PayApps is open and free on one job; paid plans are not on sale yet. ${CHECK_FIGURES}`;
}
