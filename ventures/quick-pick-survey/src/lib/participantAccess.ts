import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

/**
 * Which of a set of participant ids the caller is allowed to read.
 *
 * `/api/insights` and `/api/session/status` both take a map of participant
 * ids straight from the request body and answer with what that participant
 * has told the app: a full item ranking in the first case, per-domain
 * progress in the second. Neither checked who was asking.
 *
 * A participant row is one of two things, and the rule differs:
 *
 * - **Attached to an account.** The caller must be signed in as that account.
 *   This is the case that matters, because it is the couples case. The app's
 *   central promise is that a partner sees aggregate comparisons and never an
 *   individual answer — `docs/DATA-COLLECTION.md` states it, and
 *   `couple.integration.test.ts` holds the couple route to it. That promise
 *   was worth exactly as much as the secrecy of a cuid, and two people who
 *   share a phone, a browser profile, or a screenshot of a screen do not have
 *   that secrecy. Holding the id was enough to read the ranking, repeatedly,
 *   long after the device was handed back.
 *
 * - **Anonymous.** There is no account to check against, and the id is by
 *   design the only thing that identifies that session — it lives in the
 *   caller's own localStorage. Requiring a sign-in here would lock people out
 *   of their own answers before they make an account, which is the entire
 *   onboarding. So an anonymous participant stays readable by whoever holds
 *   its id, and that is a deliberate limit rather than an oversight: the fix
 *   for someone who wants their answers behind a credential is to make an
 *   account, which is what the app asks them to do anyway.
 *
 * One query, not one per id, because both call sites are already doing a
 * fan-out and this sits in front of it.
 */
export async function accessibleParticipantIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();

  const [user, rows] = await Promise.all([
    getSessionUser(),
    prisma.participant.findMany({
      where: { id: { in: ids } },
      select: { id: true, userId: true },
    }),
  ]);

  return new Set(
    rows.filter((p) => p.userId === null || p.userId === user?.id).map((p) => p.id)
  );
}
