import { describe, expect, it } from "vitest";
import { api, setupTenant } from "./helpers";

describe("tenant isolation (requireOrg)", () => {
  it("rejects anonymous access to org routes", async () => {
    const { orgId } = await setupTenant();
    const res = await api(`/api/orgs/${orgId}/documents`);
    expect(res.status).toBe(401);
  });

  it("returns 404 to members of other orgs", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const res = await api(`/api/orgs/${a.orgId}/documents`, { as: b.userId });
    expect(res.status).toBe(404);
  });
});
