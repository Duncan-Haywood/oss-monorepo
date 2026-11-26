// Self-service deletion of the signed-in user's account (not an org: see privacy's DELETE /privacy/org).
// Requires re-authentication, and refuses while the user is the last owner of any organization.
import { and, count, eq, inArray, like, or } from "drizzle-orm";
import type { AppContext } from "../../context";
import { account, member, organization, user, verification } from "../../db/schema";
import { chunk, D1_IN_CHUNK } from "../../lib/chunk";
import { AppError } from "../../lib/errors";
import type { SessionUser } from "../../types";
import { audit } from "../privacy/audit";
import { THROTTLE_IDENTIFIER_PREFIX } from "./emails";
import { listMemberships } from "./members";
import { verifyPassword } from "./password";

/** Accounts without a password (Google-only) re-authenticate by having signed in this recently. */
export const REAUTH_WINDOW_MS = 10 * 60 * 1000;

export interface CurrentSession {
  id: string;
  createdAt: Date;
}

/** Orgs where `userId` is an owner and no other owner exists. */
export async function orgsWhereLastOwner(
  ctx: AppContext,
  userId: string,
): Promise<{ orgId: string; orgName: string }[]> {
  const owned = await ctx.db
    .select({ orgId: organization.id, orgName: organization.name })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, userId), eq(member.role, "owner")));
  if (owned.length === 0) return [];
  const counts = (
    await Promise.all(
      chunk(
        owned.map((o) => o.orgId),
        D1_IN_CHUNK,
      ).map((orgIds) =>
        ctx.db
          .select({ orgId: member.organizationId, n: count() })
          .from(member)
          .where(and(inArray(member.organizationId, orgIds), eq(member.role, "owner")))
          .groupBy(member.organizationId),
      ),
    )
  ).flat();
  const owners = new Map(counts.map((c) => [c.orgId, c.n]));
  return owned.filter((o) => (owners.get(o.orgId) ?? 0) <= 1);
}

async function reauthenticate(
  ctx: AppContext,
  me: SessionUser,
  password: string | undefined,
  current: CurrentSession | null,
): Promise<void> {
  const credential = await ctx.db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, me.id), eq(account.providerId, "credential")))
    .get();
  if (credential?.password) {
    if (!password || !(await verifyPassword({ hash: credential.password, password }))) {
      throw new AppError(403, "invalid_password", "That password is incorrect.");
    }
    return;
  }
  const fresh =
    current !== null && ctx.now().getTime() - current.createdAt.getTime() <= REAUTH_WINDOW_MS;
  if (!fresh) {
    throw new AppError(
      403,
      "reauth_required",
      "For your security, sign out and sign in again, then delete your account within 10 minutes.",
    );
  }
}

export async function deleteAccount(
  ctx: AppContext,
  me: SessionUser,
  input: { password?: string },
  current: CurrentSession | null,
  requestId?: string,
): Promise<void> {
  await reauthenticate(ctx, me, input.password, current);

  const blocking = await orgsWhereLastOwner(ctx, me.id);
  if (blocking.length > 0) {
    const names = blocking.map((o) => o.orgName).join(", ");
    throw new AppError(
      409,
      "last_owner",
      `You're the only owner of ${names}. Make another member an owner or delete the organization first, then delete your account.`,
      { orgs: blocking },
    );
  }

  for (const m of await listMemberships(ctx, me.id)) {
    await audit(ctx, {
      orgId: m.orgId,
      actorType: "user",
      actorId: me.id,
      action: "member.account_deleted",
      targetType: "user",
      targetId: me.id,
      metadata: { role: m.role },
      requestId,
    });
  }

  // Outstanding reset tokens (value = userId) and send-throttle rows for this user.
  await ctx.db
    .delete(verification)
    .where(
      or(
        and(like(verification.identifier, "reset-password:%"), eq(verification.value, me.id)),
        like(verification.identifier, `${THROTTLE_IDENTIFIER_PREFIX}%:${me.id}`),
      ),
    );
  // Cascades: sessions, accounts, memberships, invitations they sent; authored rows are set null.
  await ctx.db.delete(user).where(eq(user.id, me.id));
  ctx.logger.info("auth.account_deleted", { userId: me.id });
}
