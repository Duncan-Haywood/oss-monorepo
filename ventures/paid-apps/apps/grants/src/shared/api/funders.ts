// Funder relationship tracker contracts (services/funders-crm, routes/org/funders.ts, the
// /orgs/$orgId/funders UI). Dates are ISO strings in JSON; money is integer cents.
import { z } from "zod";

export const FUNDER_STAGES = [
  "prospect",
  "cultivating",
  "applied",
  "funded",
  "declined",
  "dormant",
] as const;
export type FunderStage = (typeof FUNDER_STAGES)[number];

export const FUNDER_STAGE_LABELS: Record<FunderStage, string> = {
  prospect: "Prospect",
  cultivating: "Cultivating",
  applied: "Applied",
  funded: "Funded",
  declined: "Declined",
  dormant: "Dormant",
};

export const FUNDER_INTERACTION_KINDS = [
  "email",
  "call",
  "meeting",
  "site_visit",
  "loi",
  "report",
  "other",
] as const;
export type FunderInteractionKind = (typeof FUNDER_INTERACTION_KINDS)[number];

export const FUNDER_INTERACTION_LABELS: Record<FunderInteractionKind, string> = {
  email: "Email",
  call: "Call",
  meeting: "Meeting",
  site_visit: "Site visit",
  loi: "Letter of inquiry",
  report: "Report",
  other: "Other",
};

/** What created a relation: a person, or the signal that auto-linked it. */
export const FUNDER_RELATION_ORIGINS = [
  "manual",
  "match",
  "application",
  "award",
  "prospect",
] as const;
export type FunderRelationOrigin = (typeof FUNDER_RELATION_ORIGINS)[number];

export const PREFERRED_CONTACT_METHODS = ["email", "phone", "either"] as const;
export type PreferredContactMethod = (typeof PREFERRED_CONTACT_METHODS)[number];

// ------------------------------------------------------------------------------------ inputs

const Tags = z.array(z.string().trim().min(1).max(40)).max(20);
const IsoDateTime = z.iso.datetime({ offset: true });

export const CreateFunderRelationInput = z.object({
  displayName: z.string().trim().min(1).max(300),
  /** Global funder id (fnd_…) from the catalog, when known. */
  funderId: z.string().min(1).max(100).optional(),
  /** Foundation EIN (9 digits, dash optional). */
  prospectEin: z
    .string()
    .regex(/^\d{2}-?\d{7}$/, "Use a 9-digit EIN")
    .optional(),
  stage: z.enum(FUNDER_STAGES).optional(),
  ownerId: z.string().min(1).max(100).nullable().optional(),
  nextStepAt: IsoDateTime.nullable().optional(),
  nextStepNote: z.string().max(1000).optional(),
  tags: Tags.optional(),
});
export type CreateFunderRelationInput = z.infer<typeof CreateFunderRelationInput>;

export const UpdateFunderRelationInput = z
  .object({
    displayName: z.string().trim().min(1).max(300).optional(),
    /** "auto" hands the stage back to the system (it follows applications and awards). */
    stage: z.union([z.enum(FUNDER_STAGES), z.literal("auto")]).optional(),
    ownerId: z.string().min(1).max(100).nullable().optional(),
    nextStepAt: IsoDateTime.nullable().optional(),
    nextStepNote: z.string().max(1000).optional(),
    tags: Tags.optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: "Nothing to update",
  });
export type UpdateFunderRelationInput = z.infer<typeof UpdateFunderRelationInput>;

export const FunderContactInput = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.string().trim().max(200).optional(),
  email: z.email().max(320).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  notes: z.string().max(5000).optional(),
  preferredContact: z.enum(PREFERRED_CONTACT_METHODS).nullable().optional(),
});
export type FunderContactInput = z.infer<typeof FunderContactInput>;
export const FunderContactPatch = FunderContactInput.partial();
export type FunderContactPatch = z.infer<typeof FunderContactPatch>;

export const FunderInteractionInput = z.object({
  kind: z.enum(FUNDER_INTERACTION_KINDS),
  occurredAt: IsoDateTime,
  summary: z.string().trim().min(1).max(5000),
  contactId: z.string().min(1).max(100).nullable().optional(),
});
export type FunderInteractionInput = z.infer<typeof FunderInteractionInput>;
export const FunderInteractionPatch = FunderInteractionInput.partial();
export type FunderInteractionPatch = z.infer<typeof FunderInteractionPatch>;

// ------------------------------------------------------------------------------------ DTOs

export interface FunderRelationDto {
  id: string;
  funderId: string | null;
  prospectEin: string | null;
  displayName: string;
  stage: FunderStage;
  stageSource: "auto" | "manual";
  origin: FunderRelationOrigin;
  ownerId: string | null;
  nextStepAt: string | null;
  nextStepNote: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FunderRelationSummaryDto extends FunderRelationDto {
  ownerName: string | null;
  applicationCount: number;
  awardedCents: number;
  contactCount: number;
  lastInteractionAt: string | null;
}

export interface FunderListResponse {
  items: FunderRelationSummaryDto[];
  counts: Record<FunderStage, number>;
  canEdit: boolean;
}

export interface FunderContactDto {
  id: string;
  relationId: string;
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  notes: string;
  preferredContact: PreferredContactMethod | null;
  createdAt: string;
  updatedAt: string;
}

export interface FunderInteractionDto {
  id: string;
  relationId: string;
  contactId: string | null;
  kind: FunderInteractionKind;
  occurredAt: string;
  summary: string;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
}

export const FUNDER_TIMELINE_KINDS = [
  "application",
  "outcome",
  "award",
  "report",
  "interaction",
  "watch_event",
  "prospect",
  "next_step",
] as const;
export type FunderTimelineKind = (typeof FUNDER_TIMELINE_KINDS)[number];

export interface FunderTimelineItem {
  /** Stable across reloads: "<kind>:<row id>". */
  id: string;
  kind: FunderTimelineKind;
  at: string;
  title: string;
  detail: string | null;
  /** e.g. application status, report status, interaction kind. */
  status: string | null;
  /** App-relative link (under /orgs/:orgId). */
  link: string | null;
}

export interface FunderTimeline {
  /** Dated after `now` (next step, report due dates), soonest first. */
  upcoming: FunderTimelineItem[];
  /** Everything else, newest first. */
  past: FunderTimelineItem[];
}

/** 990-PF giving data from the global funder profile (ProPublica Nonprofit Explorer). */
export interface FunderProspectInfo {
  prospectId: string | null;
  status: string | null;
  fitScore: number | null;
  ein: string;
  name: string;
  city: string | null;
  state: string | null;
  totalGivingCents: number | null;
  totalAssetsCents: number | null;
  latestFilingYear: number | null;
  website: string | null;
  propublicaUrl: string | null;
  attribution: { text: string; source: string; url: string | null; fetchedAt: string };
}

export interface FunderOpenOpportunity {
  id: string;
  title: string;
  closeDate: string | null;
  awardCeilingCents: number | null;
  /** An application for it is already in progress. */
  hasActiveApplication: boolean;
}

export interface FunderDetailResponse {
  relation: FunderRelationDto;
  funder: { id: string; name: string; type: string; websiteUrl: string | null } | null;
  prospect: FunderProspectInfo | null;
  contacts: FunderContactDto[];
  interactions: FunderInteractionDto[];
  timeline: FunderTimeline;
  openOpportunities: FunderOpenOpportunity[];
  /** Org members who can own the relationship (id + name only). */
  members: { userId: string; name: string }[];
  canEdit: boolean;
}
