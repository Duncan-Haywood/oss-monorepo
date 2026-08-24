import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractStripeWebhookCaseEventTypes } from "./webhook-event-audit";
import { STRIPE_WEBHOOK_HANDLED_EVENT_TYPES } from "./webhook-event-types";

describe("extractStripeWebhookCaseEventTypes", () => {
  it("extracts every case label from a switch statement, deduped and sorted", () => {
    const source = `
      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
          break;
        }
        case "invoice.paid": {
          break;
        }
      }
    `;
    expect(extractStripeWebhookCaseEventTypes(source)).toEqual([
      "checkout.session.async_payment_succeeded",
      "checkout.session.completed",
      "invoice.paid",
    ]);
  });

  it("ignores non-case-label text", () => {
    expect(extractStripeWebhookCaseEventTypes("no switch here")).toEqual([]);
  });
});

describe("STRIPE_WEBHOOK_HANDLED_EVENT_TYPES stays in sync with route.ts", () => {
  it("matches route.ts's switch statement exactly (stripe-webhook-event-selection-docs-gap)", () => {
    const routeSource = readFileSync(
      path.resolve(__dirname, "../../app/api/stripe/webhook/route.ts"),
      "utf8",
    );
    const actual = extractStripeWebhookCaseEventTypes(routeSource);
    const documented = [...STRIPE_WEBHOOK_HANDLED_EVENT_TYPES].sort();
    expect(actual).toEqual(documented);
  });
});
