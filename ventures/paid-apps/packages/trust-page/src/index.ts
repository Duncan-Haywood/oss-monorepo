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

import { grantsProfile } from "./profiles/grants.ts";
import { sellerBooksProfile } from "./profiles/seller-books.ts";
import type { TrustProfile } from "./types.ts";

/** Profiles by app directory name (apps/<id>). */
export const PROFILES: Readonly<Record<string, TrustProfile>> = {
  grants: grantsProfile,
  "seller-books": sellerBooksProfile,
};
