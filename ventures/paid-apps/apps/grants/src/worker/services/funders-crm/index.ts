// Public API of the funder relationship tracker (CRM). Other modules import from here only.
export { getFunderDetail } from "./detail";
export {
  cleanTags,
  deriveStage,
  emptySignals,
  mergeTimeline,
  normalizeEin,
  type StageSignals,
} from "./model";
export {
  type Actor,
  createContact,
  createInteraction,
  createRelation,
  deleteContact,
  deleteInteraction,
  type ListFilter,
  listContacts,
  listInteractions,
  listRelations,
  loadRelation,
  toRelationDto,
  updateContact,
  updateInteraction,
  updateRelation,
} from "./relations";
export { runDueNextSteps } from "./reminders";
export { LINKING_PROSPECT_STATUSES, type SyncResult, syncRelations } from "./sync";
