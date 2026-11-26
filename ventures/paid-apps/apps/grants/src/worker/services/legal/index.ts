// Public legal documents. Markdown sources: docs/legal/*.md (bundled into documents.ts).
import {
  LEGAL_DOC_KEYS,
  type LegalDocDto,
  type LegalDocKey,
  type LegalDocSummary,
  POLICY_VERSION,
} from "@shared/legal";
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
