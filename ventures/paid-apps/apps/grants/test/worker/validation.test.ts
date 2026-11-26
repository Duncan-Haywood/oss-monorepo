// Every router validates through lib/validate.ts, so a bad body or query returns the standard
// `{ error: { code: "validation_error", message, details } }` envelope (not zod-validator's
// default `{ success: false, error }`). Covers routes that used the default hook before.
import { describe, expect, it } from "vitest";
import { api, setupTenant } from "./helpers";

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
  success?: unknown;
}

async function expectValidationError(res: Response) {
  expect(res.status).toBe(400);
  const body = (await res.json()) as ErrorBody;
  expect(body.success).toBeUndefined();
  expect(body.error.code).toBe("validation_error");
  expect(body.error.message).toBe("Invalid request");
  expect(Array.isArray(body.error.details)).toBe(true);
  expect((body.error.details as unknown[]).length).toBeGreaterThan(0);
  return body;
}

describe("validation errors use the standard error envelope", () => {
  it("POST /privacy/consents with a bad body", async () => {
    const t = await setupTenant("owner");
    const res = await api(`/api/orgs/${t.orgId}/privacy/consents`, {
      method: "POST",
      as: t.userId,
      json: { scope: "not_a_scope", granted: "yes" },
    });
    await expectValidationError(res);
  });

  it("PATCH /submissions/followups/:id with a bad body", async () => {
    const t = await setupTenant("owner");
    const res = await api(`/api/orgs/${t.orgId}/submissions/followups/fup_missing`, {
      method: "PATCH",
      as: t.userId,
      json: { status: "not_a_status" },
    });
    await expectValidationError(res);
  });

  it("POST /opportunities/:id/confirm-submission-email with a bad body", async () => {
    const t = await setupTenant("owner");
    const res = await api(
      `/api/orgs/${t.orgId}/opportunities/opp_missing/confirm-submission-email`,
      { method: "POST", as: t.userId, json: { email: 42 } },
    );
    await expectValidationError(res);
  });

  it("GET /opportunities with a bad query", async () => {
    const t = await setupTenant("owner");
    const res = await api(`/api/orgs/${t.orgId}/opportunities?closingWithinDays=soon`, {
      as: t.userId,
    });
    await expectValidationError(res);
  });

  it("DELETE /privacy/org without confirmName", async () => {
    const t = await setupTenant("owner");
    const res = await api(`/api/orgs/${t.orgId}/privacy/org`, {
      method: "DELETE",
      as: t.userId,
      json: {},
    });
    await expectValidationError(res);
  });
});
