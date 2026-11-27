// Real sign-up through Better Auth, org creation and member management.
import type { MeDto, MemberDto } from "@shared/api/types";
import { describe, expect, it } from "vitest";
import { api, BASE, call, createTestUser, grantPlan, setupTenant } from "./helpers";

const cookieFrom = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0] ?? "")
    .filter((c) => c && !c.endsWith("="))
    .join("; ");

describe("auth and orgs", () => {
  it("signs up, creates an org and lists it in /api/me", async () => {
    const res = await api("/api/auth/sign-up/email", {
      method: "POST",
      headers: { Origin: BASE },
      json: { email: "owner@example.test", password: "correct-horse-battery", name: "Owner" },
    });
    expect(res.status).toBe(200);
    const cookie = cookieFrom(res);
    expect(cookie).toContain("better-auth.session_token=");
    const created = await call<{ orgId: string }>("/api/orgs", {
      method: "POST",
      headers: { Cookie: cookie, Origin: BASE },
      json: { name: "Owner Plumbing" },
      expect: 201,
    });
    const me = await call<MeDto>("/api/me", { headers: { Cookie: cookie } });
    expect(me.memberships).toEqual([
      { orgId: created.orgId, orgName: "Owner Plumbing", role: "owner" },
    ]);
  });

  it("blocks cross-origin writes", async () => {
    const t = await setupTenant();
    const res = await api("/api/orgs", {
      method: "POST",
      as: t.userId,
      headers: { Origin: "https://evil.example" },
      json: { name: "x" },
    });
    expect(res.status).toBe(403);
  });

  it("admins add members by email; the last owner cannot be removed", async () => {
    const t = await setupTenant("owner");
    await grantPlan(t.orgId); // Free allows one user; seat limits are covered in billing.test.ts.
    const other = await createTestUser();
    const added = await call<MemberDto>(`/api/orgs/${t.orgId}/members`, {
      method: "POST",
      as: t.userId,
      expect: 201,
      json: { email: other.email, role: "editor" },
    });
    expect(added.role).toBe("editor");
    const list = await call<{ items: MemberDto[] }>(`/api/orgs/${t.orgId}/members`, {
      as: other.id,
    });
    expect(list.items).toHaveLength(2);
    // Editors cannot manage members.
    const denied = await api(`/api/orgs/${t.orgId}/members/${added.id}`, {
      method: "DELETE",
      as: other.id,
    });
    expect(denied.status).toBe(403);
    const self = list.items.find((m) => m.userId === t.userId);
    const lastOwner = await api(`/api/orgs/${t.orgId}/members/${self?.id}`, {
      method: "DELETE",
      as: t.userId,
    });
    expect(lastOwner.status).toBe(400);
  });
});
