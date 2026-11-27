// Public legal documents (bundled from docs/legal/*.md) and each user's acceptance of them.
import {
  LEGAL_DOC_KEYS,
  type LegalDocDto,
  type LegalDocKey,
  type LegalDocSummary,
  type LegalStatusDto,
  POLICY_VERSION,
} from "@shared/legal";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { legalAcceptances } from "../../db/schema";
import { LEGAL_DOCUMENTS } from "./documents";

export function listLegalDocs(): LegalDocSummary[] {
  return LEGAL_DOC_KEYS.map((key) => {
    const { title, updatedAt } = LEGAL_DOCUMENTS[key];
    return { key, title, version: POLICY_VERSION, updatedAt };
  });
}

export function getLegalDoc(key: LegalDocKey): LegalDocDto {
  const { title, updatedAt, markdown } = LEGAL_DOCUMENTS[key];
  return { key, title, version: POLICY_VERSION, updatedAt, markdown };
}

export async function legalStatus(ctx: AppContext, userId: string): Promise<LegalStatusDto> {
  const row = await ctx.db
    .select({ acceptedAt: legalAcceptances.acceptedAt })
    .from(legalAcceptances)
    .where(
      and(eq(legalAcceptances.userId, userId), eq(legalAcceptances.policyVersion, POLICY_VERSION)),
    )
    .get();
  return { version: POLICY_VERSION, acceptedAt: row ? row.acceptedAt.toISOString() : null };
}

/**
 * Records that the user accepted the current version. The client sends the version it showed, so
 * an acceptance of text that changed in the meantime is refused rather than recorded against the
 * new version. Accepting twice keeps the first time.
 */
export async function acceptLegal(
  ctx: AppContext,
  userId: string,
  version: string,
): Promise<LegalStatusDto | null> {
  if (version !== POLICY_VERSION) return null;
  await ctx.db
    .insert(legalAcceptances)
    .values({ userId, policyVersion: POLICY_VERSION })
    .onConflictDoNothing();
  return legalStatus(ctx, userId);
}
