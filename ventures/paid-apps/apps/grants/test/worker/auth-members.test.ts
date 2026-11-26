import { testFakes } from "@worker/context";
import { auditLog, invitation, member } from "@worker/db/schema";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { api, createTestOrg, createTestUser, setupTenant, signUp, testDb } from "./helpers";

interface MemberItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

async function members(orgId: string, as: string) {
  const res = await api(`/api/orgs/${orgId}/members`, { as });
  expect(res.status).toBe(200);
  return ((await res.json()) as { items: MemberItem[] }).items;
}

async function addMember(orgId: string, role: string, email?: string) {
  const u = await createTestUser(email ? { email } : {});
  const id = `mem_${crypto.randomUUID().replace(/-/g, "")}`;
  await testDb().insert(member).values({ id, organizationId: orgId, userId: u.id, role });
  return { userId: u.id, memberId: id, email: u.email };
}

describe("members & invitations", () => {
  it("lists members with name and email", async () => {
    const t = await setupTenant("owner");
    const items = await members(t.orgId, t.userId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      userId: t.userId,
      name: "Test User",
      email: t.user.email,
      role: "owner",
    });
  });

  it("invite → email → sign up → accept → member with invited role", async () => {
    const t = await setupTenant("owner");
    const email = `invitee-${crypto.randomUUID()}@example.test`;
    const before = testFakes.email.sent.length;

    const res = await api(`/api/orgs/${t.orgId}/members/invitations`, {
      method: "POST",
      as: t.userId,
      json: { email: email.toUpperCase(), role: "editor" },
    });
    expect(res.status).toBe(201);
    const inv = (await res.json()) as { id: string; email: string; status: string; role: string };
    expect(inv).toMatchObject({ email, status: "pending", role: "editor" });

    const sent = testFakes.email.sent.slice(before).find((m) => m.to.includes(email));
    expect(sent?.text).toContain(`http://localhost:5173/invite/${inv.id}`);

    const list = await api(`/api/orgs/${t.orgId}/members/invitations`, { as: t.userId });
    const listed = ((await list.json()) as { items: { id: string }[] }).items;
    expect(listed.map((i) => i.id)).toContain(inv.id);

    // A different signed-in user cannot accept it.
    const stranger = await signUp();
    const wrong = await api(`/api/me/invitations/${inv.id}/accept`, {
      method: "POST",
      headers: { Cookie: stranger.cookie },
    });
    expect(wrong.status).toBe(403);

    // A stranger cannot look the invitation up by id either (same 404 as an unknown id).
    const peek = await api(`/api/me/invitations/${inv.id}`, {
      headers: { Cookie: stranger.cookie },
    });
    expect(peek.status).toBe(404);

    // The invitee signs up with the invited email (real cookie flow, email NOT verified). Anyone
    // can register any address, so the invitation id (a bearer secret sent only to the mailbox)
    // must not be listed by email match; the id from the emailed link still works.
    const invitee = await signUp({ email });
    const mine = await api("/api/me/invitations", { headers: { Cookie: invitee.cookie } });
    expect(((await mine.json()) as { items: { id: string }[] }).items).toEqual([]);
    const byLink = await api(`/api/me/invitations/${inv.id}`, {
      headers: { Cookie: invitee.cookie },
    });
    expect(byLink.status).toBe(200);
    expect(await byLink.json()).toMatchObject({ id: inv.id, orgId: t.orgId, role: "editor" });
    const accept = await api(`/api/me/invitations/${inv.id}/accept`, {
      method: "POST",
      headers: { Cookie: invitee.cookie },
    });
    expect(accept.status).toBe(200);
    expect(await accept.json()).toMatchObject({ orgId: t.orgId, role: "editor" });

    const me = await api("/api/me", { headers: { Cookie: invitee.cookie } });
    const meBody = (await me.json()) as { memberships: { orgId: string; role: string }[] };
    expect(meBody.memberships).toEqual([
      expect.objectContaining({ orgId: t.orgId, role: "editor" }),
    ]);

    // Single use.
    const again = await api(`/api/me/invitations/${inv.id}/accept`, {
      method: "POST",
      headers: { Cookie: invitee.cookie },
    });
    expect(again.status).toBe(409);

    const audits = await testDb()
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.orgId, t.orgId));
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining(["member.invited", "member.joined"]),
    );
  });

  it("rejects expired and revoked invitations", async () => {
    const t = await setupTenant("owner");
    const invitee = await signUp();
    const res = await api(`/api/orgs/${t.orgId}/members/invitations`, {
      method: "POST",
      as: t.userId,
      json: { email: invitee.email, role: "viewer" },
    });
    const inv = (await res.json()) as { id: string };

    await testDb()
      .update(invitation)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invitation.id, inv.id));
    const expired = await api(`/api/me/invitations/${inv.id}/accept`, {
      method: "POST",
      headers: { Cookie: invitee.cookie },
    });
    expect(expired.status).toBe(410);

    const res2 = await api(`/api/orgs/${t.orgId}/members/invitations`, {
      method: "POST",
      as: t.userId,
      json: { email: invitee.email, role: "viewer" },
    });
    const inv2 = (await res2.json()) as { id: string };
    const revoke = await api(`/api/orgs/${t.orgId}/members/invitations/${inv2.id}`, {
      method: "DELETE",
      as: t.userId,
    });
    expect(revoke.status).toBe(200);
    const revoked = await api(`/api/me/invitations/${inv2.id}/accept`, {
      method: "POST",
      headers: { Cookie: invitee.cookie },
    });
    expect(revoked.status).toBe(409);
  });

  it("lists invitations by email only for verified accounts (e.g. Google sign-in)", async () => {
    const t = await setupTenant("owner");
    const verified = await createTestUser(); // emailVerified: true
    const res = await api(`/api/orgs/${t.orgId}/members/invitations`, {
      method: "POST",
      as: t.userId,
      json: { email: verified.email, role: "reviewer" },
    });
    const inv = (await res.json()) as { id: string };
    const mine = await api("/api/me/invitations", { as: verified.id });
    expect(((await mine.json()) as { items: { id: string }[] }).items.map((i) => i.id)).toEqual([
      inv.id,
    ]);
  });

  it("validates invitation input and blocks inviting existing members", async () => {
    const t = await setupTenant("owner");
    const bad = await api(`/api/orgs/${t.orgId}/members/invitations`, {
      method: "POST",
      as: t.userId,
      json: { email: "not-an-email", role: "editor" },
    });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("validation_error");
    const dup = await api(`/api/orgs/${t.orgId}/members/invitations`, {
      method: "POST",
      as: t.userId,
      json: { email: t.user.email, role: "editor" },
    });
    expect(dup.status).toBe(409);
  });

  it("non-admins cannot invite, change roles or remove members", async () => {
    const t = await setupTenant("owner");
    const editor = await addMember(t.orgId, "editor");
    const viewer = await addMember(t.orgId, "viewer");

    const invite = await api(`/api/orgs/${t.orgId}/members/invitations`, {
      method: "POST",
      as: editor.userId,
      json: { email: "x@example.test", role: "viewer" },
    });
    expect(invite.status).toBe(403);
    const patch = await api(`/api/orgs/${t.orgId}/members/${viewer.memberId}`, {
      method: "PATCH",
      as: editor.userId,
      json: { role: "admin" },
    });
    expect(patch.status).toBe(403);
    const del = await api(`/api/orgs/${t.orgId}/members/${viewer.memberId}`, {
      method: "DELETE",
      as: editor.userId,
    });
    expect(del.status).toBe(403);
    // ...but can read the member list.
    expect(await members(t.orgId, viewer.userId)).toHaveLength(3);
  });

  it("enforces owner rules: only owners grant owner; last owner is protected", async () => {
    const t = await setupTenant("owner");
    const ownerMemberId = (await members(t.orgId, t.userId))[0]?.id ?? "";
    const admin = await addMember(t.orgId, "admin");
    const editor = await addMember(t.orgId, "editor");

    // Admin can change non-owner roles...
    const ok = await api(`/api/orgs/${t.orgId}/members/${editor.memberId}`, {
      method: "PATCH",
      as: admin.userId,
      json: { role: "reviewer" },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ id: editor.memberId, role: "reviewer" });

    // ...but cannot grant owner, nor demote/remove an owner, nor invite an owner.
    const grant = await api(`/api/orgs/${t.orgId}/members/${editor.memberId}`, {
      method: "PATCH",
      as: admin.userId,
      json: { role: "owner" },
    });
    expect(grant.status).toBe(403);
    const demote = await api(`/api/orgs/${t.orgId}/members/${ownerMemberId}`, {
      method: "PATCH",
      as: admin.userId,
      json: { role: "viewer" },
    });
    expect(demote.status).toBe(403);
    const inviteOwner = await api(`/api/orgs/${t.orgId}/members/invitations`, {
      method: "POST",
      as: admin.userId,
      json: { email: "boss@example.test", role: "owner" },
    });
    expect(inviteOwner.status).toBe(403);

    // The sole owner cannot demote or remove themselves.
    const selfDemote = await api(`/api/orgs/${t.orgId}/members/${ownerMemberId}`, {
      method: "PATCH",
      as: t.userId,
      json: { role: "admin" },
    });
    expect(selfDemote.status).toBe(409);
    const selfRemove = await api(`/api/orgs/${t.orgId}/members/${ownerMemberId}`, {
      method: "DELETE",
      as: t.userId,
    });
    expect(selfRemove.status).toBe(409);

    // Owner promotes the admin to owner; now the original owner may step down.
    const promote = await api(`/api/orgs/${t.orgId}/members/${admin.memberId}`, {
      method: "PATCH",
      as: t.userId,
      json: { role: "owner" },
    });
    expect(promote.status).toBe(200);
    const stepDown = await api(`/api/orgs/${t.orgId}/members/${ownerMemberId}`, {
      method: "PATCH",
      as: t.userId,
      json: { role: "admin" },
    });
    expect(stepDown.status).toBe(200);

    // Admin removes a regular member.
    const remove = await api(`/api/orgs/${t.orgId}/members/${editor.memberId}`, {
      method: "DELETE",
      as: t.userId,
    });
    expect(remove.status).toBe(200);
    const left = await testDb()
      .select()
      .from(member)
      .where(and(eq(member.organizationId, t.orgId), eq(member.id, editor.memberId)));
    expect(left).toHaveLength(0);
  });

  it("is tenant-isolated (404 across orgs)", async () => {
    const a = await setupTenant("owner");
    const b = await setupTenant("owner");
    const bMember = await addMember(b.orgId, "editor");
    const bInv = await api(`/api/orgs/${b.orgId}/members/invitations`, {
      method: "POST",
      as: b.userId,
      json: { email: "someone@example.test", role: "viewer" },
    });
    const bInvId = ((await bInv.json()) as { id: string }).id;

    // Non-member of org A.
    expect((await api(`/api/orgs/${a.orgId}/members`, { as: b.userId })).status).toBe(404);
    // A's owner targeting B's member/invitation ids through A's routes.
    const patch = await api(`/api/orgs/${a.orgId}/members/${bMember.memberId}`, {
      method: "PATCH",
      as: a.userId,
      json: { role: "viewer" },
    });
    expect(patch.status).toBe(404);
    const del = await api(`/api/orgs/${a.orgId}/members/${bMember.memberId}`, {
      method: "DELETE",
      as: a.userId,
    });
    expect(del.status).toBe(404);
    const revoke = await api(`/api/orgs/${a.orgId}/members/invitations/${bInvId}`, {
      method: "DELETE",
      as: a.userId,
    });
    expect(revoke.status).toBe(404);
    const aList = await api(`/api/orgs/${a.orgId}/members/invitations`, { as: a.userId });
    expect(((await aList.json()) as { items: unknown[] }).items).toHaveLength(0);
  });

  it("second org membership shows up in /api/me", async () => {
    const t = await setupTenant("owner");
    await createTestOrg(t.userId, { name: "Second", role: "viewer" });
    const me = await api("/api/me", { as: t.userId });
    const body = (await me.json()) as { memberships: { role: string }[] };
    expect(body.memberships.map((m) => m.role).sort()).toEqual(["owner", "viewer"]);
  });
});
