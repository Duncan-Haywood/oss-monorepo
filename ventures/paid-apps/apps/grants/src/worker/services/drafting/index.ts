// Public API of the drafting module: import from "@worker/services/drafting".
export {
  DEFAULT_SECTIONS,
  draftApplication,
  redraftSection,
  requirementSections,
  usableFacts,
} from "./draft";
export { PROMPT_VERSION, REQUESTED_AMOUNT_REF } from "./prompts";
export { countWords, countWordsInText, renderPlainText, renderSectionText } from "./text";
export type {
  DraftInput,
  DraftingFact,
  DraftingOpportunity,
  DraftResult,
  RedraftInput,
} from "./types";
