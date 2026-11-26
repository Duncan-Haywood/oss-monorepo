// Public API of the updates module ("company updates": quick updates, the "What's new?" check-in
// agenda, staleness status and nudges). Other modules import from here only.
export {
  buildUpdateAgenda,
  rankUpdateThemes,
  sinceLabel,
  UPDATE_AGENDA_SIZE,
  UPDATE_MAX_QUESTIONS,
  UPDATE_THEMES,
  type UpdateAgendaTopic,
  updateInterviewTitle,
} from "./agenda";
export {
  type CheckInNudge,
  dashboardCheckInNudge,
  digestCheckInNudge,
  isFirstDigestOfMonth,
} from "./nudges";
export {
  createQuickUpdate,
  getLastUpdateAt,
  getQuickUpdate,
  getUpdateStatus,
  loadAgendaFacts,
  loadUpdateAgenda,
  MAX_UPDATE_CHARS,
  type QuickUpdateInput,
  type QuickUpdateResult,
  type UpdateStatus,
  updateNoteTitle,
} from "./service";
