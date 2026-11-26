// API response DTOs = DB rows as JSON (Date -> ISO string). Import these types in the client.
// Type-only import of the Drizzle schema: no server code is bundled into the client.
import type * as s from "@worker/db/schema";

type Ser<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Ser<U>[]
    : T extends object
      ? { [K in keyof T]: Ser<T[K]> }
      : T;
export type Serialized<T> = { [K in keyof T]: Ser<T[K]> };

export type OrgProfileDto = Serialized<typeof s.orgProfiles.$inferSelect>;
export type OrgSettingsDto = Serialized<typeof s.orgSettings.$inferSelect>;
export type DocumentDto = Serialized<typeof s.documents.$inferSelect>;
export type ChunkDto = Serialized<typeof s.documentChunks.$inferSelect>;
export type FactDto = Serialized<typeof s.facts.$inferSelect>;
export type ProjectDto = Serialized<typeof s.projects.$inferSelect>;
export type InterviewDto = Serialized<typeof s.interviews.$inferSelect>;
export type InterviewTurnDto = Serialized<typeof s.interviewTurns.$inferSelect>;
export type OpportunityDto = Serialized<typeof s.opportunities.$inferSelect>;
export type MatchDto = Serialized<typeof s.opportunityMatches.$inferSelect>;
export type ApplicationDto = Serialized<typeof s.applications.$inferSelect>;
export type ApplicationVersionDto = Serialized<typeof s.applicationVersions.$inferSelect>;
export type FlagDto = Serialized<typeof s.applicationFlags.$inferSelect>;
export type ReviewDto = Serialized<typeof s.reviews.$inferSelect>;
export type FeedbackDto = Serialized<typeof s.feedback.$inferSelect>;
export type SubmissionDto = Serialized<typeof s.submissions.$inferSelect>;
export type FollowupDto = Serialized<typeof s.followups.$inferSelect>;
export type ConsentDto = Serialized<typeof s.consentRecords.$inferSelect>;
export type AuditEntryDto = Serialized<typeof s.auditLog.$inferSelect>;
export type DataExportDto = Serialized<typeof s.dataExports.$inferSelect>;
export type SubscriptionDto = Serialized<typeof s.subscriptions.$inferSelect>;

/** Every list endpoint returns this shape. */
export interface ListResponse<T> {
  items: T[];
  nextCursor?: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export type MemberDto = Serialized<import("@worker/services/auth/members").MemberListItem>;
export type InvitationDto = Serialized<typeof s.invitation.$inferSelect>;
