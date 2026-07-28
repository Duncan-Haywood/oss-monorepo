/**
 * Shared screen-reader announcement for `/dashboard/leads`'s single
 * process-wide `useTransition()` (`leads-client.tsx`). ~64 of that
 * component's row/panel action buttons (Billing, Upsell, Send Email N,
 * Snooze, Sync to Stripe, etc.) disable on the shared `isPending` flag but
 * give no accessible feedback that a click registered — see
 * leads-client-pending-announcement-deferred-needs-rtl-infra in
 * BUSINESS_DECISIONS for why a per-button label/aria-label edit does not
 * actually fix this: most of these buttons' accessible name comes from a
 * *static* `dashboardRowActionAriaLabel(...)` call that never varies with
 * `isPending`, and the component's own documented focus-loss-on-disable
 * race (dashboard-focus-restore-async-transition-race) means a button's
 * label at the instant it disables is not reliably what focus/announcement
 * would pick up anyway. A single shared aria-live region driven by
 * `isPending` alone sidesteps both problems: it is decoupled from any one
 * button's focus/label state, so it announces regardless of which of the
 * ~64 action buttons triggered the transition.
 *
 * Deliberately a plain, node-testable pure function (no JSX, no DOM) so the
 * message-selection logic itself is proven by a normal Vitest case without
 * needing the jsdom/@testing-library/react render-test infra this repo does
 * not have — see the same BUSINESS_DECISIONS entry's reasoning for treating
 * this as a new-capability addition (nothing was ever announced before) and
 * verifying it via new unit tests + a dev-server smoke check rather than the
 * git-stash regression technique used for behavioral bug fixes.
 */

export const PENDING_OPERATION_ANNOUNCEMENT_MESSAGE = "Working…";

/** Text for the shared `aria-live="assertive"` status region — empty (not rendered as a live announcement) when idle. */
export function pendingOperationAnnouncementText(isPending: boolean): string {
  return isPending ? PENDING_OPERATION_ANNOUNCEMENT_MESSAGE : "";
}
