/**
 * Pure helper for auditing that STRIPE_WEBHOOK_HANDLED_EVENT_TYPES
 * (webhook-event-types.ts, the list /docs/launch-checklist renders as the
 * operator's Stripe Dashboard "Select events" setup step) stays in sync
 * with the actual `case "..."` labels in
 * src/app/api/stripe/webhook/route.ts's event-type switch statement. See
 * webhook-event-types.ts's file header for why this matters
 * (stripe-webhook-event-selection-docs-gap).
 *
 * Takes route.ts's raw source text (read via node:fs by the test, never
 * imported as a module) rather than importing route.ts directly — route.ts
 * pulls in the Stripe SDK, @/lib/db, and other server-only dependencies that
 * have no business being evaluated just to list switch-case labels, and a
 * text scan is also immune to any of route.ts's own runtime behavior.
 */

/** Matches every `case "some.event.type":` label in a switch statement. */
const CASE_EVENT_TYPE = /case\s+"([a-z]+(?:\.[a-z_]+)+)":/g;

export function extractStripeWebhookCaseEventTypes(
  routeSource: string,
): string[] {
  const found = new Set<string>();
  for (const match of routeSource.matchAll(CASE_EVENT_TYPE)) {
    found.add(match[1]!);
  }
  return [...found].sort();
}
