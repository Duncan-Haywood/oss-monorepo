// Accounts: real Better Auth sign-up, shop creation, invitations and member roles.
import { describe, expect, it } from "vitest";
import { addMember, api, BASE, json, setupTenant } from "./helpers";

function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0] ?? "")
    .filter((c) => c && !c.endsWith("="))
    .join("; ");
}

async function signUp(email: string) {
  const res = await api("/api/auth/sign-up/email", {
    method: "POST",
    headers: { Origin: BASE },
    json: { email, password: "correct-horse-battery", name: "Shop Owner" },
  });
  expect(res.status).toBe(200);
  return cookieFrom(res);
}

describe("accounts and shops", () => {
  it("signs up, creates a shop, and lists the membership", async () => {
    const cookie = await signUp("owner@shop.example.test");
    const created = await json<{ orgId: string }>(
      api("/api/orgs", {
        method: "POST",
        headers: { Cookie: cookie, Origin: BASE },
        json: { name: "Acme Machine" },
      }),
      201,
    );
    const me = await json<{ memberships: { orgId: string; role: string }[] }>(
      api("/api/me", { headers: { Cookie: cookie } }),
    );
    expect(me.memberships).toEqual([
      expect.objectContaining({ orgId: created.orgId, role: "owner", orgName: "Acme Machine" }),
    ]);
    const org = await json<{ settings: { displayName: string; defaultQuantities: number[] } }>(
      api(`/api/orgs/${created.orgId}`, { headers: { Cookie: cookie } }),
    );
    expect(org.settings).toMatchObject({ displayName: "Acme Machine", defaultQuantities: [1] });
  });

  it("blocks cross-origin writes", async () => {
    const t = await setupTenant();
    const res = await api(t.path("/quotes"), {
      method: "POST",
      as: t.userId,
      headers: { Origin: "https://evil.example" },
      json: {},
    });
    expect(res.status).toBe(403);
  });

  it("invites by link; only the invited address can accept", async () => {
    const t = await setupTenant();
    const inv = await json<{ token: string; acceptUrl: string }>(
      api(t.path("/members/invitations"), {
        method: "POST",
        as: t.userId,
        json: { email: "estimator@shop.example.test", role: "estimator" },
      }),
      201,
    );
    expect(inv.acceptUrl).toContain(`/invite/${inv.token}`);
    const other = await signUp("someone-else@shop.example.test");
    const wrong = await api(`/api/invitations/${inv.token}/accept`, {
      method: "POST",
      headers: { Cookie: other, Origin: BASE },
    });
    expect(wrong.status).toBe(403);
    const right = await signUp("estimator@shop.example.test");
    const ok = await json<{ orgId: string }>(
      api(`/api/invitations/${inv.token}/accept`, {
        method: "POST",
        headers: { Cookie: right, Origin: BASE },
      }),
    );
    expect(ok.orgId).toBe(t.orgId);
    const members = await json<{ items: { email: string; role: string }[] }>(
      api(t.path("/members"), { as: t.userId }),
    );
    expect(members.items.map((m) => m.role).sort()).toEqual(["estimator", "owner"]);
    const reuse = await api(`/api/invitations/${inv.token}/accept`, {
      method: "POST",
      headers: { Cookie: right, Origin: BASE },
    });
    expect(reuse.status).toBe(404);
    const after = await json<{ items: unknown[] }>(api(t.path("/members"), { as: t.userId }));
    expect(after.items).toHaveLength(2);
  });

  it("a revoked invitation cannot be accepted", async () => {
    const t = await setupTenant();
    const inv = await json<{ id: string; token: string }>(
      api(t.path("/members/invitations"), {
        method: "POST",
        as: t.userId,
        json: { email: "late@shop.example.test", role: "viewer" },
      }),
      201,
    );
    const revoked = await api(t.path(`/members/invitations/${inv.id}`), {
      method: "DELETE",
      as: t.userId,
    });
    expect(revoked.status).toBe(204);
    const cookie = await signUp("late@shop.example.test");
    const res = await api(`/api/invitations/${inv.token}/accept`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: BASE },
    });
    expect(res.status).toBe(404);
  });

  it("admins manage members; nobody removes the last owner; admins can't mint owners", async () => {
    const t = await setupTenant();
    const admin = await addMember(t.orgId, "admin");
    const members = await json<{ items: { id: string; role: string }[] }>(
      api(t.path("/members"), { as: t.userId }),
    );
    const owner = members.items.find((m) => m.role === "owner");
    const demote = await api(t.path(`/members/${owner?.id}`), {
      method: "PATCH",
      as: t.userId,
      json: { role: "admin" },
    });
    expect(demote.status).toBe(409);
    const mint = await api(t.path("/members/invitations"), {
      method: "POST",
      as: admin,
      json: { email: "x@example.test", role: "owner" },
    });
    expect(mint.status).toBe(403);
    const remove = await api(t.path(`/members/${owner?.id}`), { method: "DELETE", as: admin });
    expect(remove.status).toBe(403);
    const selfRemove = await api(t.path(`/members/${owner?.id}`), {
      method: "DELETE",
      as: t.userId,
    });
    expect(selfRemove.status).toBe(409);
  });
});
