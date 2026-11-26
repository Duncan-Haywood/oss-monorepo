// Org membership + invitations (our own tables; Better Auth's organization plugin is NOT used).
// Every query is scoped by orgId; role rules:
//  - admin+ may invite, change roles and remove members;
//  - only owners may grant `owner` or modify/remove an existing owner;
//  - the last owner can never be demoted or removed.
import { type MemberRole, ROLE_RANK } from "@shared/enums";
import { and, asc, count, desc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { invitation, member, organization, user } from "../../db/schema";
import { AppError, conflict, forbidden, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import type { SessionUser, Tenant } from "../../types";
import { renderEmail } from "../email-templates";
import { audit } from "../privacy/audit";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export type InvitationStatus = "pending" | "accepted" | "canceled";

export interface MemberListItem {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRole;
  createdAt: Date;
}

export type InvitationRow = typeof invitation.$inferSelect;

export interface Membership {
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: MemberRole;
}

/** `newId` has no member/invitation prefixes yet; derive them from the shared generator. */
export const memberId = () => newId("org").replace(/^org_/, "mem_");
export const invitationId = () => newId("org").replace(/^org_/, "inv_");

const asRole = (r: string | null | undefined): MemberRole =>
  r && r in ROLE_RANK ? (r as MemberRole) : "viewer";

const normalizeEmail = (e: string) => e.trim().toLowerCase();

const memberColumns = {
  id: member.id,
  userId: member.userId,
  name: user.name,
  email: user.email,
  role: member.role,
  createdAt: member.createdAt,
};

export async function listMembers(ctx: AppContext, orgId: string): Promise<MemberListItem[]> {
  const rows = await ctx.db
    .select(memberColumns)
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, orgId))
    .orderBy(asc(member.createdAt));
  return rows.map((r) => ({ ...r, role: asRole(r.role) }));
}

async function getMember(ctx: AppContext, orgId: string, id: string) {
  const row = await ctx.db
    .select(memberColumns)
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.id, id), eq(member.organizationId, orgId)))
    .get();
  if (!row) throw notFound("Member");
  return { ...row, role: asRole(row.role) };
}

async function ownerCount(ctx: AppContext, orgId: string): Promise<number> {
  const row = await ctx.db
    .select({ n: count() })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.role, "owner")))
    .get();
  return row?.n ?? 0;
}

export async function listMemberships(ctx: AppContext, userId: string): Promise<Membership[]> {
  const rows = await ctx.db
    .select({
      orgId: organization.id,
      orgName: organization.name,
      orgSlug: organization.slug,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt));
  return rows.map((r) => ({ ...r, role: asRole(r.role) }));
}

// ---------------------------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------------------------

export async function createInvitation(
  ctx: AppContext,
  tenant: Tenant,
  input: { email: string; role: MemberRole },
  requestId?: string,
): Promise<InvitationRow> {
  const email = normalizeEmail(input.email);
  if (input.role === "owner" && tenant.role !== "owner") {
    throw forbidden("Only owners can invite owners");
  }
  const org = await ctx.db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, tenant.orgId))
    .get();
  if (!org) throw notFound("Organization");

  const existingMember = await ctx.db
    .select({ id: member.id })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, tenant.orgId), eq(user.email, email)))
    .get();
  if (existingMember) throw conflict("That person is already a member of this organization");

  // Re-inviting replaces any pending invitation for the same email.
  await ctx.db
    .update(invitation)
    .set({ status: "canceled" })
    .where(
      and(
        eq(invitation.organizationId, tenant.orgId),
        eq(invitation.email, email),
        eq(invitation.status, "pending"),
      ),
    );

  const row: InvitationRow = {
    id: invitationId(),
    organizationId: tenant.orgId,
    email,
    role: input.role,
    status: "pending",
    expiresAt: new Date(ctx.now().getTime() + INVITATION_TTL_MS),
    inviterId: tenant.userId,
    createdAt: ctx.now(),
  };
  await ctx.db.insert(invitation).values(row);

  const inviter = await ctx.db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, tenant.userId))
    .get();
  try {
    const msg = renderEmail(
      "invitation",
      {
        orgName: org.name,
        inviterName: inviter?.name,
        role: input.role,
        email,
        invitationId: row.id,
        expiresInDays: Math.round(INVITATION_TTL_MS / 86_400_000),
      },
      { appUrl: ctx.env.APP_URL },
    );
    await ctx.email.send({ to: [email], subject: msg.subject, text: msg.text, html: msg.html });
  } catch (e) {
    // The invitation still exists; admins can copy the link or re-invite.
    ctx.logger.warn("invitation.email_failed", { invitationId: row.id, error: String(e) });
  }

  await audit(ctx, {
    orgId: tenant.orgId,
    actorType: "user",
    actorId: tenant.userId,
    action: "member.invited",
    targetType: "invitation",
    targetId: row.id,
    metadata: { role: input.role },
    requestId,
  });
  return row;
}

export async function listInvitations(
  ctx: AppContext,
  orgId: string,
  opts: { status?: InvitationStatus } = { status: "pending" },
): Promise<InvitationRow[]> {
  const where = opts.status
    ? and(eq(invitation.organizationId, orgId), eq(invitation.status, opts.status))
    : eq(invitation.organizationId, orgId);
  return ctx.db.select().from(invitation).where(where).orderBy(desc(invitation.createdAt));
}

export async function revokeInvitation(
  ctx: AppContext,
  tenant: Tenant,
  id: string,
  requestId?: string,
): Promise<void> {
  const row = await ctx.db
    .select()
    .from(invitation)
    .where(and(eq(invitation.id, id), eq(invitation.organizationId, tenant.orgId)))
    .get();
  if (!row) throw notFound("Invitation");
  if (row.status !== "pending") throw conflict("Invitation is no longer pending");
  await ctx.db
    .update(invitation)
    .set({ status: "canceled" })
    .where(and(eq(invitation.id, id), eq(invitation.organizationId, tenant.orgId)));
  await audit(ctx, {
    orgId: tenant.orgId,
    actorType: "user",
    actorId: tenant.userId,
    action: "member.invitation_revoked",
    targetType: "invitation",
    targetId: id,
    requestId,
  });
}

const myInvitationColumns = {
  id: invitation.id,
  orgId: invitation.organizationId,
  orgName: organization.name,
  email: invitation.email,
  role: invitation.role,
  status: invitation.status,
  expiresAt: invitation.expiresAt,
  createdAt: invitation.createdAt,
};

/**
 * Pending, unexpired invitations addressed to the signed-in user's email (for the invite page).
 *
 * The invitation id is a bearer secret delivered only to the invited mailbox. Email+password
 * sign-up does not prove mailbox ownership, so an account whose email is NOT verified gets an
 * empty list: otherwise anyone could register with an invitee's address, read the id here and join
 * the org. Unverified users accept with the id from the emailed link (see getMyInvitation).
 */
export async function listMyInvitations(ctx: AppContext, me: SessionUser) {
  if (!me.emailVerified) return [];
  const rows = await ctx.db
    .select(myInvitationColumns)
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(and(eq(invitation.email, normalizeEmail(me.email)), eq(invitation.status, "pending")))
    .orderBy(desc(invitation.createdAt))
    .limit(50);
  const now = ctx.now().getTime();
  return rows
    .filter((r) => r.expiresAt.getTime() > now)
    .map((r) => ({ ...r, role: asRole(r.role) }));
}

/** One invitation by id (the id from the emailed link), only if it was sent to my email. */
export async function getMyInvitation(ctx: AppContext, me: SessionUser, id: string) {
  const row = await ctx.db
    .select(myInvitationColumns)
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(and(eq(invitation.id, id), eq(invitation.email, normalizeEmail(me.email))))
    .get();
  // Same 404 for "no such id" and "sent to someone else": ids cannot be probed.
  if (!row) throw notFound("Invitation");
  return { ...row, role: asRole(row.role) };
}

export async function acceptInvitation(
  ctx: AppContext,
  me: SessionUser,
  id: string,
  requestId?: string,
): Promise<Membership> {
  const row = await ctx.db.select().from(invitation).where(eq(invitation.id, id)).get();
  if (!row) throw notFound("Invitation");
  if (normalizeEmail(row.email) !== normalizeEmail(me.email)) {
    throw forbidden("This invitation was sent to a different email address");
  }
  if (row.status !== "pending") throw conflict("This invitation is no longer valid");
  if (row.expiresAt.getTime() <= ctx.now().getTime()) {
    throw new AppError(410, "invitation_expired", "This invitation has expired");
  }
  const role = asRole(row.role);
  // Claim the invitation first (conditional on still pending) so concurrent accepts, or a revoke
  // racing an accept, can never both succeed: single use is enforced by the database.
  const claimed = await ctx.db
    .update(invitation)
    .set({ status: "accepted" })
    .where(
      and(
        eq(invitation.id, id),
        eq(invitation.organizationId, row.organizationId),
        eq(invitation.status, "pending"),
      ),
    )
    .returning({ id: invitation.id });
  if (claimed.length === 0) throw conflict("This invitation is no longer valid");
  const existing = await ctx.db
    .select({ id: member.id, role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, row.organizationId), eq(member.userId, me.id)))
    .get();
  if (!existing) {
    // onConflictDoNothing: a concurrent join of the same user (member_org_user_uq) is harmless.
    await ctx.db
      .insert(member)
      .values({ id: memberId(), organizationId: row.organizationId, userId: me.id, role })
      .onConflictDoNothing();
  }
  await audit(ctx, {
    orgId: row.organizationId,
    actorType: "user",
    actorId: me.id,
    action: "member.joined",
    targetType: "invitation",
    targetId: id,
    metadata: { role: existing ? asRole(existing.role) : role, alreadyMember: !!existing },
    requestId,
  });
  const org = await ctx.db
    .select({ name: organization.name, slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, row.organizationId))
    .get();
  return {
    orgId: row.organizationId,
    orgName: org?.name ?? "",
    orgSlug: org?.slug ?? "",
    role: existing ? asRole(existing.role) : role,
  };
}

// ---------------------------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------------------------

export async function changeMemberRole(
  ctx: AppContext,
  tenant: Tenant,
  id: string,
  role: MemberRole,
  requestId?: string,
): Promise<MemberListItem> {
  const target = await getMember(ctx, tenant.orgId, id);
  if (target.role === role) return target;
  if ((role === "owner" || target.role === "owner") && tenant.role !== "owner") {
    throw forbidden("Only owners can grant or change the owner role");
  }
  if (target.role === "owner" && (await ownerCount(ctx, tenant.orgId)) <= 1) {
    throw conflict("An organization must keep at least one owner");
  }
  await ctx.db
    .update(member)
    .set({ role })
    .where(and(eq(member.id, id), eq(member.organizationId, tenant.orgId)));
  await audit(ctx, {
    orgId: tenant.orgId,
    actorType: "user",
    actorId: tenant.userId,
    action: "member.role_changed",
    targetType: "member",
    targetId: id,
    metadata: { from: target.role, to: role },
    requestId,
  });
  return { ...target, role };
}

export async function removeMember(
  ctx: AppContext,
  tenant: Tenant,
  id: string,
  requestId?: string,
): Promise<void> {
  const target = await getMember(ctx, tenant.orgId, id);
  if (target.role === "owner") {
    if (tenant.role !== "owner") throw forbidden("Only owners can remove an owner");
    if ((await ownerCount(ctx, tenant.orgId)) <= 1) {
      throw conflict("An organization must keep at least one owner");
    }
  }
  await ctx.db
    .delete(member)
    .where(and(eq(member.id, id), eq(member.organizationId, tenant.orgId)));
  await audit(ctx, {
    orgId: tenant.orgId,
    actorType: "user",
    actorId: tenant.userId,
    action: "member.removed",
    targetType: "member",
    targetId: id,
    metadata: { role: target.role },
    requestId,
  });
}
