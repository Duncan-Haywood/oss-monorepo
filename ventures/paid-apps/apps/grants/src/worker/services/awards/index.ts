// Public API of the awards module (post-award reporting). Other modules import from here only.
export { fakeHandlers } from "./fake-llm";
export {
  REPORT_DRAFT_PURPOSE,
  REPORT_PROMPT_VERSION,
  REPORT_SECTIONS,
  REPORT_SYSTEM_PROMPT,
  ReportDraftOutput,
} from "./prompts";
export {
  draftReport,
  getReportDetail,
  loadReportExportInput,
  pendingReportFollowups,
  SubmitReportInput,
  submitReport,
  UpdateReportInput,
  updateReport,
  verifyReport,
} from "./report";
export {
  gapQuestionFor,
  partitionReportFacts,
  postProcessReport,
  promisedGoals,
  RESULT_CATEGORIES,
  reportCitedFactIds,
  reportGaps,
  verificationContent,
} from "./report-logic";
export {
  asOfInPeriod,
  asOfNotAfter,
  asOfRange,
  awardFactStatement,
  defaultReportSchedule,
  FINAL_REPORT_GRACE_DAYS,
  formatPeriod,
  REPORT_KIND_LABEL,
  REPORT_REMINDER_DAYS,
  reminderDates,
} from "./schedule";
export {
  type AwardReportRow,
  type AwardRow,
  AwardTermsInput,
  addReport,
  CreateAwardInput,
  CreateReportInput,
  createAward,
  createAwardForApplication,
  deleteReport,
  getAwardDetail,
  listAwards,
  loadAward,
  loadReport,
  onApplicationAwarded,
  scheduleReportReminders,
  UpdateAwardInput,
  updateAward,
} from "./service";
