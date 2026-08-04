import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";

/**
 * Fail-closed write options for Complete client voice pack persist
 * (upsertClientVoicePack).
 *
 * getClientVoicePackByLeadSlug / listClientVoicePacks / listClientVoicePacksDue
 * (pipeline-health + digest Complete voice packs due + Email voice pack
 * precondition) all read Convex-first. generateClientVoicePackAction must pass
 * CLIENT_VOICE_PACK_CONVEX_PRIMARY so a Convex mutation failure surfaces to the
 * operator instead of claiming Generate voice success after a SQLite-only
 * write — otherwise other instances still show voice-packs-due debt and Email
 * voice pack cannot find the row.
 *
 * Twin of MARKETING_PACK_CONVEX_PRIMARY (Growth/Complete marketing Generate).
 * Regenerating replaces the one-row-per-lead pack (idempotent replace).
 */

/** Fail-closed write options for client_voice_packs upserts. */
export const CLIENT_VOICE_PACK_CONVEX_PRIMARY: ConvexPrimaryWriteOptions = {
  requireConvex: true,
};
