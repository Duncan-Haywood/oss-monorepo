// Public API of the eligibility module: import from "@worker/services/eligibility".
export { ASSESS_PURPOSE, overallVerdict, validateAssessments } from "./assess";
export { EXTRACT_PURPOSE, finalizeCriteria, renderOpportunityText } from "./criteria";
export { decideDeterministically, type EligibilityProfile } from "./deterministic";
export {
  checkEligibility,
  ELIGIBILITY_MAX_AGE_MS,
  type EligibilityCheck,
  type ExtractCriteriaResult,
  ensureEligibility,
  extractCriteria,
  getEligibility,
  toEligibilityProfile,
} from "./service";
