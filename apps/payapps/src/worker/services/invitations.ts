// Invitations: an admin invites someone by email, with or without a PayApps account, and that
// person accepts once signed in with the same, verified address.
//
// Rules:
//  - admin+ invites, lists and cancels; owners are never invited (ownership is granted to a member);
//  - an invitation carries no bearer secret: it is accepted by id only by a signed-in user whose
//    verified email equals the invited address, so a forwarded email or a guessed id gets nobody in;
//  - pending invitations count toward the plan's seat limit when inviting, and the limit is checked
//    again on accept (the plan may have changed in between);
//  - re-inviting an address replaces its pending invitation (and its 7-day clock);
//  - invitation emails are throttled per company (INVITE_EMAIL_THROTTLE) so a company account
//    cannot be used to mail strangers in bulk;
//  - logs carry ids only, never an address.
import type { InvitationDto, MyInvitationDto } from "@shared/api/types";
import { type MemberRole, ROLE_RANK } from "@shared/enums";
import { and, count, desc, eq, gt } from "drizzle-orm";
import type { AppContext } from "../context";
import { invitation, member, organization, user } from "../db/schema";
import { AppError, conflict, forbidden, notFound, tooManyRequests } from "../lib/errors";
import { newId } from "../lib/ids";
import type { SessionUser, Tenant } from "../types";
import { isHardened } from "./auth/auth";
import { allowSend, invitationEmail } from "./auth/emails";
import { assertCanAddMember, orgPlan, usage } from "./billing";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITE_EMAIL_THROTTLE = { limit: 20, windowMs: 60 * 60 * 1000 };

const asRole = (r: string): MemberRole => (r in ROLE_RANK ? (r as MemberRole) : "viewer");
const normalizeEmail = (e: string) => e.trim().toLowerCase();

export const livePending = (ctx: AppContext) =>
  and(eq(invitation.status, "pending"), gt(invitation.expiresAt, ctx.now()));

export async function pendingCount(ctx: AppContext, orgId: string) {
  const row = await ctx.db
    .select({ n: count() })
    .from(invitation)
    .where(and(eq(invitation.organizationId, orgId), livePending(ctx)))
    .get();
  return row?.n ?? 0;
}

/** Seats: members plus live pending invitations must stay within the plan. */
async function assertSeatForInvite(ctx: AppContext, orgId: string, replacing: boolean) {
  const [{ plan }, used, pending] = await Promise.all([
    orgPlan(ctx, orgId),
    usage(ctx, orgId),
    pendingCount(ctx, orgId),
  ]);
  if (plan.maxMembers === null) return;
  const taken = used.members + pending - (replacing ? 1 : 0);
  if (taken >= plan.maxMembers) {
    throw new AppError(
      402,
      "payment_required",
      `The ${plan.name} plan allows ${plan.maxMembers} user${plan.maxMembers === 1 ? "" : "s"}, counting pending invitations. Cancel an invitation or upgrade on the Billing page.`,
    );
  }
}

export async function createInvitation(
  ctx: AppContext,
  tenant: Tenant,
  input: { email: string; role: MemberRole },
): Promise<InvitationDto> {
  const email = normalizeEmail(input.email);
  if (input.role === "owner")
    throw forbidden("Owners are not invited: invite, then change the role");
  const org = await ctx.db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, tenant.orgId))
    .get();
  if (!org) throw notFound("Organization");

  const alreadyMember = await ctx.db
    .select({ id: member.id })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, tenant.orgId), eq(user.email, email)))
    .get();
  if (alreadyMember) throw conflict("That person is already a member of this company");

  const previous = await ctx.db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, tenant.orgId),
        eq(invitation.email, email),
        livePending(ctx),
      ),
    )
    .get();
  await assertSeatForInvite(ctx, tenant.orgId, Boolean(previous));

  // Refuse before creating anything, so a throttled admin is not left with silent invitations.
  const { limit, windowMs } = INVITE_EMAIL_THROTTLE;
  if (!(await allowSend(ctx, `invite:${tenant.orgId}`, limit, windowMs))) {
    ctx.logger.warn("invitation.throttled", { orgId: tenant.orgId });
    throw tooManyRequests(`A company can send ${limit} invitations an hour. Try again later.`);
  }

  const now = ctx.now();
  const id = newId("inv");
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
  await ctx.db.batch([
    ctx.db
      .update(invitation)
      .set({ status: "canceled" })
      .where(
        and(
          eq(invitation.organizationId, tenant.orgId),
          eq(invitation.email, email),
          eq(invitation.status, "pending"),
        ),
      ),
    ctx.db.insert(invitation).values({
      id,
      organizationId: tenant.orgId,
      email,
      role: input.role,
      status: "pending",
      expiresAt,
      inviterId: tenant.userId,
      createdAt: now,
    }),
  ]);

  const inviter = await ctx.db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, tenant.userId))
    .get();
  let emailSent = false;
  try {
    const msg = invitationEmail(
      {
        email,
        orgName: org.name,
        inviterName: inviter?.name ?? null,
        role: input.role,
        days: Math.round(INVITATION_TTL_MS / 86_400_000),
      },
      ctx.env,
    );
    await ctx.email.send({ to: [email], subject: msg.subject, text: msg.text, html: msg.html });
    // A fake (tests, offline demo) or log-only sender sends nothing a person will read.
    emailSent = ctx.email.delivers;
  } catch (e) {
    // The invitation stands: the admin is told to let the person know another way.
    ctx.logger.warn("invitation.email_failed", { invitationId: id, error: String(e) });
  }
  ctx.logger.info("invitation.created", { orgId: tenant.orgId, invitationId: id });
  return {
    id,
    email,
    role: input.role,
    inviterName: inviter?.name ?? null,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
    emailSent,
  };
}

/** Live pending invitations of one company, newest first (admins only; the route checks). */
export async function listInvitations(ctx: AppContext, orgId: string): Promise<InvitationDto[]> {
  const rows = await ctx.db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      inviterName: user.name,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    })
    .from(invitation)
    .leftJoin(user, eq(user.id, invitation.inviterId))
    .where(and(eq(invitation.organizationId, orgId), livePending(ctx)))
    .orderBy(desc(invitation.createdAt));
  return rows.map((r) => ({
    ...r,
    role: asRole(r.role),
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function cancelInvitation(ctx: AppContext, tenant: Tenant, id: string) {
  const done = await ctx.db
    .update(invitation)
    .set({ status: "canceled" })
    .where(
      and(
        eq(invitation.id, id),
        eq(invitation.organizationId, tenant.orgId),
        eq(invitation.status, "pending"),
      ),
    )
    .returning({ id: invitation.id });
  if (done.length === 0) throw notFound("Pending invitation");
  ctx.logger.info("invitation.canceled", { orgId: tenant.orgId, invitationId: id });
}

/**
 * Whether the signed-in user has shown they hold their address. The local plain-http offline demo
 * (FAKE_EXTERNALS=true) sends no mail, so nobody there can verify: it trusts the typed address.
 * Never on production or HTTPS (isHardened), and never in tests.
 */
function holdsAddress(ctx: AppContext, me: SessionUser): boolean {
  if (me.emailVerified) return true;
  return ctx.env.FAKE_EXTERNALS === "true" && ctx.env.APP_ENV !== "test" && !isHardened(ctx.env);
}

/**
 * Invitations addressed to me. Empty until my address is verified: email+password sign-up alone
 * does not prove I own the mailbox, and an unverified account must not see who invited that address.
 */
export async function listMyInvitations(
  ctx: AppContext,
  me: SessionUser,
): Promise<MyInvitationDto[]> {
  if (!holdsAddress(ctx, me)) return [];
  const inviter = user;
  const rows = await ctx.db
    .select({
      id: invitation.id,
      orgId: invitation.organizationId,
      orgName: organization.name,
      role: invitation.role,
      inviterName: inviter.name,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .leftJoin(inviter, eq(inviter.id, invitation.inviterId))
    .where(and(eq(invitation.email, normalizeEmail(me.email)), livePending(ctx)))
    .orderBy(desc(invitation.createdAt))
    .limit(50);
  return rows.map((r) => ({ ...r, role: asRole(r.role), expiresAt: r.expiresAt.toISOString() }));
}

/** The invitation if it is addressed to me; the same 404 otherwise, so ids cannot be probed. */
async function myInvitation(ctx: AppContext, me: SessionUser, id: string) {
  if (!holdsAddress(ctx, me)) {
    throw forbidden("Confirm your email address first: open the link we sent when you signed up");
  }
  const row = await ctx.db
    .select()
    .from(invitation)
    .where(and(eq(invitation.id, id), eq(invitation.email, normalizeEmail(me.email))))
    .get();
  if (!row) throw notFound("Invitation");
  if (row.status !== "pending") throw conflict("This invitation is no longer open");
  if (row.expiresAt.getTime() <= ctx.now().getTime()) {
    throw new AppError(410, "invitation_expired", "This invitation has expired: ask for a new one");
  }
  return row;
}

export async function acceptInvitation(
  ctx: AppContext,
  me: SessionUser,
  id: string,
): Promise<{ orgId: string; role: MemberRole }> {
  const row = await myInvitation(ctx, me, id);
  const role = asRole(row.role);
  const existing = await ctx.db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, row.organizationId), eq(member.userId, me.id)))
    .get();
  if (!existing) await assertCanAddMember(ctx, row.organizationId);
  // Claim first, conditional on still pending: a cancel racing an accept, or two accepts, cannot
  // both win.
  const claimed = await ctx.db
    .update(invitation)
    .set({ status: "accepted" })
    .where(and(eq(invitation.id, id), eq(invitation.status, "pending")))
    .returning({ id: invitation.id });
  if (claimed.length === 0) throw conflict("This invitation is no longer open");
  if (!existing) {
    await ctx.db
      .insert(member)
      .values({ id: newId("mem"), organizationId: row.organizationId, userId: me.id, role })
      .onConflictDoNothing();
  }
  ctx.logger.info("invitation.accepted", {
    orgId: row.organizationId,
    invitationId: id,
    userId: me.id,
  });
  return { orgId: row.organizationId, role: existing ? asRole(existing.role) : role };
}

export async function declineInvitation(ctx: AppContext, me: SessionUser, id: string) {
  await myInvitation(ctx, me, id);
  await ctx.db
    .update(invitation)
    .set({ status: "declined" })
    .where(and(eq(invitation.id, id), eq(invitation.status, "pending")));
  ctx.logger.info("invitation.declined", { invitationId: id, userId: me.id });
}
