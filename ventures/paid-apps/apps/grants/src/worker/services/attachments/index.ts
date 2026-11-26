// Public API of the attachments module: the per-application attachments checklist and letters of
// support (partner upload links). See checklist.ts and letters.ts.
export {
  ATTACHMENT_MATCH_PURPOSE,
  type AttachmentRow,
  attachmentFilename,
  getChecklist,
  linkLetterToChecklist,
  loadAttachmentFiles,
  MISSING_ATTACHMENT_PREFIX,
  prepareSubmissionAttachments,
  type SubmissionAttachments,
  suggestWithAi,
  syncChecklist,
  updateChecklistItem,
} from "./checklist";
export { fakeHandlers } from "./fake-llm";
export {
  checkLetterDraft,
  LETTER_DRAFT_PURPOSE,
  type LetterDraftOutput,
  suggestedOutline,
  templateDraft,
} from "./letter-text";
export {
  createSupportLetter,
  draftLetterRequest,
  factsAboutPartner,
  listSupportLetters,
  publicLetterInfo,
  REMINDER_DAYS,
  receivePartnerLetter,
  resolveLetterToken,
  type SupportLetterRow,
  sendDueLetterReminders,
  sendSupportLetter,
  updateSupportLetter,
} from "./letters";
export { matchRequirement, validateLlmMatches } from "./match";
export {
  deriveLetterToken,
  hashLetterToken,
  LETTER_TOKEN_RE,
  LETTER_TOKEN_TTL_MS,
  letterUploadUrl,
} from "./tokens";
