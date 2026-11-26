export {
  assertHonestText,
  isIsoDate,
  isSecurityContact,
  isValidSource,
  profileSources,
  SECTION_IDS,
  TrustClaimError,
  validateProfile,
} from "./guard.ts";
export { grantsProfile } from "./profiles/grants.ts";
export { sellerBooksProfile } from "./profiles/seller-books.ts";
export {
  escapeHtml,
  NO_CERTIFICATION_NOTE,
  type RenderOptions,
  renderTrustDocument,
  renderTrustSection,
  SECTION_TITLES,
  STATUS_LABELS,
} from "./render.ts";
export {
  generateSecurityTxt,
  MAX_EXPIRY_DAYS,
  type SecurityTxtFields,
  securityTxtForProfile,
} from "./security-txt.ts";
export type { Claim, ClaimStatus, SectionId, Subprocessor, TrustProfile } from "./types.ts";

import { sellerBooksProfile } from "./profiles/seller-books.ts";
import type { TrustProfile } from "./types.ts";

/**
 * Profiles by app directory name (apps/<id>). grants is not listed: apps/grants stayed in the
 * private repository when the paid apps moved here (2026-11-26; it names a client under an NDA),
 * so its profile's sources do not exist in this tree. grantsProfile stays exported as the
 * fixture the guard and render tests use.
 */
export const PROFILES: Readonly<Record<string, TrustProfile>> = {
  "seller-books": sellerBooksProfile,
};
