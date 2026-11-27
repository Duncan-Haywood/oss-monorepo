// Invitations: admins invite by email; the verified holder of that address accepts.
import type { InvitationDto, MeDto, MyInvitationDto } from "@shared/api/types";
import { testFakes } from "@worker/context";
import { invitation, user } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { INVITE_EMAIL_THROTTLE } from "@worker/services/invitations";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, BASE, call, createTestUser, grantPlan, setupTenant, testDb } from "./helpers";

const freshEmail = (tag = "crew") => `${tag}-${crypto.randomUUID()}@example.test`;

async function userWithEmail(email: string, emailVerified = true) {
  const id = newId("usr");
  await testDb().insert(user).values({ id, name: "Invited Person", email, emailVerified });
  return id;
}

const invite = (orgId: string, as: string, email: string, role = "editor", expect = 201) =>
  call<InvitationDto>(`/api/orgs/${orgId}/members/invitations`, {
    method: "POST",
    as,
    expect,
    json: { email, role },
  });

const myInvitations = (as: string) =>
  call<{ items: MyInvitationDto[] }>("/api/me/invitations", { as }).then((r) => r.items);

describe("invitations", () => {
  it("invites an address with no account; that person signs up, sees it and joins", async () => {
    const t = await setupTenant("owner");
    await grantPlan(t.orgId);
    const email = freshEmail();
    const before = testFakes.email.sent.length;
    const inv = await invite(t.orgId, t.userId, email.toUpperCase());
    expect(inv.email).toBe(email);
    expect(inv.role).toBe("editor");
    expect(inv.emailSent).toBe(false); // the in-memory fake delivers nothing a person reads

    const mail = testFakes.email.sent.slice(before).filter((m) => m.to.includes(email));
    expect(mail).toHaveLength(1);
    expect(mail[0]?.subject).toBe("You're invited to a company on PayApps");
    expect(mail[0]?.text).toContain("Test Mechanical");
    expect(mail[0]?.text).toContain(`${BASE}/invitations`);
    expect(mail[0]?.text).not.toContain(inv.id); // no bearer id in the email

    const list = await call<{ items: InvitationDto[] }>(
      `/api/orgs/${t.orgId}/members/invitations`,
      { as: t.userId },
    );
    expect(list.items.map((i) => i.id)).toEqual([inv.id]);

    const invitee = await userWithEmail(email);
    const mine = await myInvitations(invitee);
    expect(mine).toEqual([
      expect.objectContaining({ id: inv.id, orgId: t.orgId, orgName: "Test Mechanical" }),
    ]);
    const joined = await call<{ orgId: string; role: string }>(
      `/api/me/invitations/${inv.id}/accept`,
      { method: "POST", as: invitee },
    );
    expect(joined).toEqual({ orgId: t.orgId, role: "editor" });
    const me = await call<MeDto>("/api/me", { as: invitee });
    expect(me.memberships).toEqual([
      { orgId: t.orgId, orgName: "Test Mechanical", role: "editor" },
    ]);
    // Single use, and gone from both lists.
    await call(`/api/me/invitations/${inv.id}/accept`, {
      method: "POST",
      as: invitee,
      expect: 409,
    });
    expect(await myInvitations(invitee)).toEqual([]);
    const after = await call<{ items: InvitationDto[] }>(
      `/api/orgs/${t.orgId}/members/invitations`,
      { as: t.userId },
    );
    expect(after.items).toEqual([]);
  });

  it("only the verified holder of the invited address can see or accept it", async () => {
    const t = await setupTenant("owner");
    await grantPlan(t.orgId);
    const email = freshEmail();
    const inv = await invite(t.orgId, t.userId, email);

    const someoneElse = await createTestUser();
    expect(await myInvitations(someoneElse.id)).toEqual([]);
    await call(`/api/me/invitations/${inv.id}/accept`, {
      method: "POST",
      as: someoneElse.id,
      expect: 404,
    });

    // Signed up with the address but never confirmed it: proves nothing about the mailbox.
    const unverified = await userWithEmail(email, false);
    expect(await myInvitations(unverified)).toEqual([]);
    await call(`/api/me/invitations/${inv.id}/accept`, {
      method: "POST",
      as: unverified,
      expect: 403,
    });
    await call("/api/me/invitations", { expect: 401 });
  });

  it("is managed by admins only, and stays inside its company", async () => {
    const t = await setupTenant("owner");
    await grantPlan(t.orgId);
    const editor = await createTestUser();
    await call(`/api/orgs/${t.orgId}/members`, {
      method: "POST",
      as: t.userId,
      expect: 201,
      json: { email: editor.email, role: "editor" },
    });
    await invite(t.orgId, editor.id, freshEmail(), "viewer", 403);
    await call(`/api/orgs/${t.orgId}/members/invitations`, { as: editor.id, expect: 403 });

    const inv = await invite(t.orgId, t.userId, freshEmail());
    const other = await setupTenant("owner");
    // Not a member: the company is not even confirmed to exist.
    await call(`/api/orgs/${t.orgId}/members/invitations`, { as: other.userId, expect: 404 });
    await call(`/api/orgs/${other.orgId}/members/invitations/${inv.id}`, {
      method: "DELETE",
      as: other.userId,
      expect: 404,
    });
    const still = await call<{ items: InvitationDto[] }>(
      `/api/orgs/${t.orgId}/members/invitations`,
      { as: t.userId },
    );
    expect(still.items.map((i) => i.id)).toEqual([inv.id]);
  });

  it("refuses owners, existing members and bad addresses", async () => {
    const t = await setupTenant("owner");
    await grantPlan(t.orgId);
    await invite(t.orgId, t.userId, freshEmail(), "owner", 400);
    await invite(t.orgId, t.userId, "not an address", "viewer", 400);
    const me = await testDb().select().from(user).where(eq(user.id, t.userId)).get();
    await invite(t.orgId, t.userId, me?.email ?? "", "viewer", 409);
  });

  it("a canceled, declined or expired invitation cannot be accepted", async () => {
    const t = await setupTenant("owner");
    await grantPlan(t.orgId);

    const a = freshEmail();
    const canceled = await invite(t.orgId, t.userId, a);
    await call(`/api/orgs/${t.orgId}/members/invitations/${canceled.id}`, {
      method: "DELETE",
      as: t.userId,
    });
    const aUser = await userWithEmail(a);
    await call(`/api/me/invitations/${canceled.id}/accept`, {
      method: "POST",
      as: aUser,
      expect: 409,
    });

    const b = freshEmail();
    const declined = await invite(t.orgId, t.userId, b);
    const bUser = await userWithEmail(b);
    await call(`/api/me/invitations/${declined.id}/decline`, { method: "POST", as: bUser });
    await call(`/api/me/invitations/${declined.id}/accept`, {
      method: "POST",
      as: bUser,
      expect: 409,
    });

    const c = freshEmail();
    const expired = await invite(t.orgId, t.userId, c);
    await testDb()
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitation.id, expired.id));
    const cUser = await userWithEmail(c);
    expect(await myInvitations(cUser)).toEqual([]);
    await call(`/api/me/invitations/${expired.id}/accept`, {
      method: "POST",
      as: cUser,
      expect: 410,
    });
  });

  it("re-inviting replaces the pending invitation", async () => {
    const t = await setupTenant("owner");
    await grantPlan(t.orgId);
    const email = freshEmail();
    const first = await invite(t.orgId, t.userId, email, "viewer");
    const second = await invite(t.orgId, t.userId, email, "editor");
    const list = await call<{ items: InvitationDto[] }>(
      `/api/orgs/${t.orgId}/members/invitations`,
      { as: t.userId },
    );
    expect(list.items.map((i) => [i.id, i.role])).toEqual([[second.id, "editor"]]);
    const invitee = await userWithEmail(email);
    await call(`/api/me/invitations/${first.id}/accept`, {
      method: "POST",
      as: invitee,
      expect: 409,
    });
  });

  it("pending invitations count toward the plan's seats, checked again on accept", async () => {
    const free = await setupTenant("owner");
    await invite(free.orgId, free.userId, freshEmail(), "viewer", 402); // Free: one user

    const t = await setupTenant("owner");
    await grantPlan(t.orgId, "solo", "active"); // Solo: two users
    const email = freshEmail();
    const inv = await invite(t.orgId, t.userId, email);
    await invite(t.orgId, t.userId, freshEmail(), "viewer", 402);
    await invite(t.orgId, t.userId, email, "viewer"); // re-invite takes no new seat

    // The plan lapses to Free before the person accepts.
    await grantPlan(t.orgId, "solo", "canceled");
    const invitee = await userWithEmail(email);
    const pending = await myInvitations(invitee);
    expect(pending).toHaveLength(1);
    await call(`/api/me/invitations/${pending[0]?.id}/accept`, {
      method: "POST",
      as: invitee,
      expect: 402,
    });
    // Still open, so it can be accepted after an upgrade.
    await grantPlan(t.orgId, "solo", "active");
    await call(`/api/me/invitations/${pending[0]?.id}/accept`, { method: "POST", as: invitee });
    expect(inv.id).not.toBe(pending[0]?.id);
  });

  it("throttles invitation emails per company", async () => {
    const t = await setupTenant("owner");
    await grantPlan(t.orgId);
    for (let i = 0; i < INVITE_EMAIL_THROTTLE.limit; i++) {
      await invite(t.orgId, t.userId, freshEmail(`bulk${i}`), "viewer");
    }
    await invite(t.orgId, t.userId, freshEmail("one-too-many"), "viewer", 429);
  });

  it("escapes customer-typed names in the HTML part", async () => {
    const t = await setupTenant("owner");
    await grantPlan(t.orgId);
    const email = freshEmail();
    const before = testFakes.email.sent.length;
    await testDb()
      .update(user)
      .set({ name: '<img src=x onerror="alert(1)">' })
      .where(eq(user.id, t.userId));
    await invite(t.orgId, t.userId, email);
    const mail = testFakes.email.sent.slice(before).find((m) => m.to.includes(email));
    expect(mail?.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(mail?.html).not.toContain("<img");
  });
});

it("responds 401 to signed-out invitation actions", async () => {
  const res = await api("/api/me/invitations/inv_x/accept", {
    method: "POST",
    headers: { Origin: BASE },
  });
  expect(res.status).toBe(401);
});
