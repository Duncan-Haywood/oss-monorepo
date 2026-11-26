// Public surface of the knowledge module for other modules (drafting, grounding, matching, interview,
// pipeline). Import from "@worker/services/knowledge" (or "../knowledge"), not from internal files.
export {
  type ChecklistTopic,
  type CoverageItem,
  type CoverageStatus,
  computeCoverage,
  KNOWLEDGE_CHECKLIST,
} from "./checklist";
export {
  type AcceptedFact,
  acceptExtractedFacts,
  PURPOSE_EXTRACT_DOCUMENT,
  PURPOSE_EXTRACT_INTERVIEW,
} from "./extract";
export {
  confirmFact,
  createUserFact,
  type DraftingFactsOptions,
  type FactRow,
  getCoverage,
  getFact,
  getFactsByIds,
  getFactsForDrafting,
  getFactsSummary,
  listFacts,
} from "./facts";
export { formatFactsForPrompt, type PromptFact } from "./format";
export {
  type ExtractionStats,
  extractDocumentFactsFor,
  extractInterviewFactsFor,
} from "./jobs";
export { getProject, getProjectDetail, listProjects, type ProjectRow } from "./projects";
export {
  applySupersede,
  type FactLink,
  findSupersedeCandidate,
  loadSupersedeCandidates,
  SUPERSEDE_OVERLAP,
  type SupersedeLinks,
  withSupersedeLinks,
} from "./supersede";
export { normalizeForMatch, quoteInText, StatementIndex } from "./text";
