// Orgs (shops), members and invitation links.
import { type MemberRole, ROLE_RANK } from "@shared/enums";
import { and, asc, eq, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { invitation, member, organization, shopSettings, user } from "../../db/schema";
import { conflict, forbidden, notFound } from "../../lib/errors";
import { sha256Hex } from "../../lib/hash";
import { newId, newToken } from "../../lib/ids";
import { assertCanInvite, assertSeatForNewMember } from "../billing";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "shop";

/** Creates the shop, its settings row and the owner membership. */
export async function createOrg(ctx: AppContext, userId: string, input: { name: string }) {
  const orgId = newId("org");
  const slug = `${slugify(input.name)}-${orgId.slice(4, 10)}`;
  await ctx.db.batch([
    ctx.db.insert(organization).values({ id: orgId, name: input.name, slug }),
    ctx.db.insert(shopSettings).values({ orgId, displayName: input.name }),
    ctx.db
      .insert(member)
      .values({ id: newId("mem"), organizationId: orgId, userId, role: "owner" }),
  ]);
  return { orgId };
}

export async function listMemberships(ctx: AppContext, userId: string) {
  return ctx.db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(organization.name))
    .all();
}

export async function listMembers(ctx: AppContext, orgId: string) {
  return ctx.db
    .select({
      id: member.id,
      userId: member.userId,
      role: member.role,
      name: user.name,
      email: user.email,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId))
    .orderBy(asc(member.createdAt))
    .all();
}

/** Only an owner may grant or change "owner"; nobody below admin manages members. */
function assertCanAssign(actorRole: MemberRole, role: MemberRole) {
  if (role === "owner" && actorRole !== "owner") throw forbidden("Only an owner can add owners");
  if (ROLE_RANK[actorRole] < ROLE_RANK.admin) throw forbidden("Admins manage members");
}

export async function createInvitation(
  ctx: AppContext,
  orgId: string,
  actor: { userId: string; role: MemberRole },
  input: { email: string; role: MemberRole },
) {
  assertCanAssign(actor.role, input.role);
  await assertCanInvite(ctx, orgId);
  const email = input.email.trim().toLowerCase();
  const token = newToken();
  const id = newId("inv");
  await ctx.db.insert(invitation).values({
    id,
    organizationId: orgId,
    email,
    role: input.role,
    tokenHash: await sha256Hex(token),
    inviterId: actor.userId,
    expiresAt: new Date(ctx.now().getTime() + INVITATION_TTL_MS),
  });
  const acceptUrl = `${ctx.env.APP_URL.replace(/\/+$/, "")}/invite/${token}`;
  return { id, email, role: input.role, token, acceptUrl };
}

export async function listInvitations(ctx: AppContext, orgId: string) {
  return ctx.db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    })
    .from(invitation)
    .where(eq(invitation.organizationId, orgId))
    .orderBy(asc(invitation.createdAt))
    .all();
}

export async function revokeInvitation(ctx: AppContext, orgId: string, id: string) {
  const res = await ctx.db
    .update(invitation)
    .set({ status: "revoked" })
    .where(and(eq(invitation.id, id), eq(invitation.organizationId, orgId)))
    .returning({ id: invitation.id });
  if (res.length === 0) throw notFound("Invitation");
}

/**
 * The signed-in user accepts an invitation addressed to their email. Where sign-in requires a
 * verified address, accepting does too: an account created before verification was switched on (or
 * one never confirmed) must not join a shop just by claiming the invited address.
 */
export async function acceptInvitation(
  ctx: AppContext,
  me: { id: string; email: string; emailVerified: boolean },
  token: string,
  opts: { requireVerifiedEmail: boolean },
) {
  if (opts.requireVerifiedEmail && !me.emailVerified) {
    throw forbidden("Confirm your email address before accepting an invitation");
  }
  const inv = await ctx.db
    .select()
    .from(invitation)
    .where(eq(invitation.tokenHash, await sha256Hex(token)))
    .get();
  if (inv?.status !== "pending" || inv.expiresAt.getTime() < ctx.now().getTime()) {
    throw notFound("Invitation");
  }
  if (inv.email !== me.email.trim().toLowerCase()) {
    throw forbidden("This invitation was sent to a different email address");
  }
  // Already a member (double click, re-invite): no new seat is taken, so the plan is not checked.
  const existing = await ctx.db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, inv.organizationId), eq(member.userId, me.id)))
    .get();
  if (!existing) await assertSeatForNewMember(ctx, inv.organizationId);
  // One batch (a D1 transaction): claim the still-pending invitation, then add the membership.
  // A revoked or already-used invitation claims no row and nothing is added; a membership that
  // already exists (double click, re-invite) is left as is.
  const [claimed] = await ctx.db.batch([
    ctx.db
      .update(invitation)
      .set({ status: "accepted" })
      .where(and(eq(invitation.id, inv.id), eq(invitation.status, "pending")))
      .returning({ id: invitation.id }),
    ctx.db
      .insert(member)
      .select(
        ctx.db
          .select({
            id: sql<string>`${newId("mem")}`.as("id"),
            organizationId: invitation.organizationId,
            userId: sql<string>`${me.id}`.as("user_id"),
            role: invitation.role,
            createdAt: sql<Date>`${Date.now()}`.as("created_at"),
          })
          .from(invitation)
          .where(and(eq(invitation.id, inv.id), eq(invitation.status, "accepted"))),
      )
      .onConflictDoNothing(),
  ]);
  if (claimed.length === 0) throw notFound("Invitation");
  return { orgId: inv.organizationId };
}

/**
 * SQL guard evaluated in the same statement as the write: the row is not an owner, or another owner
 * remains. Two owners demoting or removing each other at once cannot leave a shop with none.
 */
const keepsAnOwner = (orgId: string, memberId: string) =>
  sql`(${member.role} <> 'owner' or (select count(*) from ${member} m2 where m2.organization_id = ${orgId} and m2.role = 'owner' and m2.id <> ${memberId}) > 0)`;

export async function changeMemberRole(
  ctx: AppContext,
  orgId: string,
  actorRole: MemberRole,
  memberId: string,
  role: MemberRole,
) {
  assertCanAssign(actorRole, role);
  const row = await ctx.db
    .select()
    .from(member)
    .where(and(eq(member.id, memberId), eq(member.organizationId, orgId)))
    .get();
  if (!row) throw notFound("Member");
  if (row.role === "owner" && actorRole !== "owner")
    throw forbidden("Only an owner can change an owner");
  const res = await ctx.db
    .update(member)
    .set({ role })
    .where(
      and(
        eq(member.id, memberId),
        eq(member.organizationId, orgId),
        role === "owner" ? undefined : keepsAnOwner(orgId, memberId),
      ),
    )
    .returning({ id: member.id });
  if (res.length === 0) throw conflict("A shop needs at least one owner");
}

export async function removeMember(
  ctx: AppContext,
  orgId: string,
  actorRole: MemberRole,
  memberId: string,
) {
  if (ROLE_RANK[actorRole] < ROLE_RANK.admin) throw forbidden("Admins manage members");
  const row = await ctx.db
    .select()
    .from(member)
    .where(and(eq(member.id, memberId), eq(member.organizationId, orgId)))
    .get();
  if (!row) throw notFound("Member");
  if (row.role === "owner" && actorRole !== "owner") {
    throw forbidden("Only an owner can remove an owner");
  }
  const res = await ctx.db
    .delete(member)
    .where(
      and(eq(member.id, memberId), eq(member.organizationId, orgId), keepsAnOwner(orgId, memberId)),
    )
    .returning({ id: member.id });
  if (res.length === 0) throw conflict("A shop needs at least one owner");
}
