// Input validation for org creation, profile and settings. Pure zod: safe to unit test in Node.
import { ORG_TYPES } from "@shared/enums";
import { z } from "zod";
import { AUTOMATION_LEVELS } from "../review/automation";

export const MAX_LIST_ITEMS = 20;
/** Upper bound for any money setting: $10B in cents. */
const MAX_CENTS = 1_000_000_000_000;

/** Trim strings; "" becomes null so forms can clear optional fields. */
const blankToNull = (v: unknown) => {
  if (typeof v !== "string") return v;
  const t = v.trim();
  return t === "" ? null : t;
};

/** Optional, nullable, trimmed text field. */
const optText = (max: number) =>
  z.preprocess(blankToNull, z.string().max(max).nullable()).optional();

/** Accepts "swif.org" as "https://swif.org"; only http(s) URLs are allowed. */
const normalizeUrl = (v: unknown) => {
  const t = blankToNull(v);
  if (typeof t !== "string") return t;
  return /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
};
const httpUrl = z.url({ protocol: /^https?$/, hostname: z.regexes.domain }).max(500);
const optUrl = z.preprocess(normalizeUrl, httpUrl.nullable()).optional();

const stringList = z
  .array(z.string().trim().min(1).max(120))
  .max(MAX_LIST_ITEMS)
  .transform((xs) => [...new Set(xs)]);

export const EIN_RE = /^\d{2}-\d{7}$/;
export const UEI_RE = /^[A-Z0-9]{12}$/;

const einField = z
  .preprocess(blankToNull, z.string().regex(EIN_RE, "EIN must look like NN-NNNNNNN").nullable())
  .optional();
const ueiField = z
  .preprocess((v) => {
    const t = blankToNull(v);
    return typeof t === "string" ? t.toUpperCase() : t;
  }, z.string().regex(UEI_RE, "UEI must be 12 letters/digits").nullable())
  .optional();

const currentYear = () => new Date().getUTCFullYear();

/**
 * Names are shown in email subjects, the UI and LLM prompts: one line, no control characters
 * (CR/LF, NUL, tabs...), no Unicode line/paragraph separators.
 */
const hasControlChars = (s: string) => /[\p{Cc}\u2028\u2029]/u.test(s);
const nameField = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !hasControlChars(s), "Must be a single line of text");

export const createOrgSchema = z.object({
  name: nameField(120),
  legalName: nameField(200),
  orgType: z.enum(ORG_TYPES),
  city: optText(100),
  state: optText(60),
  websiteUrl: optUrl,
  focusAreas: stringList.optional(),
  serviceAreas: stringList.optional(),
  /** Checked explicitly (=== true) so the error message is specific. */
  acceptTerms: z.unknown().optional(),
  policyVersion: z.string().max(40).optional(),
});
export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export const profilePatchSchema = z.object({
  /** Display name (organization.name). The slug never changes. */
  name: nameField(120).optional(),
  legalName: nameField(200).optional(),
  dba: optText(200),
  orgType: z.enum(ORG_TYPES).optional(),
  ein: einField,
  uei: ueiField,
  websiteUrl: optUrl,
  addressLine1: optText(200),
  addressLine2: optText(200),
  city: optText(100),
  state: optText(60),
  postalCode: optText(20),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "Use a 2-letter country code")
    .transform((s) => s.toUpperCase())
    .optional(),
  contactName: optText(200),
  contactEmail: z.preprocess(blankToNull, z.email().max(254).nullable()).optional(),
  contactPhone: optText(40),
  foundedYear: z
    .number()
    .int()
    .min(1700)
    .refine((y) => y <= currentYear(), "Founded year cannot be in the future")
    .nullable()
    .optional(),
  focusAreas: stringList.optional(),
  serviceAreas: stringList.optional(),
  /** true marks onboarding complete (sets onboardingCompletedAt); false clears it. */
  onboardingCompleted: z.boolean().optional(),
});
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

const centsField = z.number().int().min(0).max(MAX_CENTS);

export const settingsPatchSchema = z.object({
  autopilotEnabled: z.boolean().optional(),
  autoSubmitMaxCents: centsField.optional(),
  fullReviewAboveCents: centsField.optional(),
  minFitScoreForAuto: z.number().int().min(0).max(100).optional(),
  highLikelihoodThreshold: z.number().min(0).max(1).optional(),
  reviewFirstSubmissionPerFunder: z.boolean().optional(),
  maxAutoSubmissionsPerMonth: z.number().int().min(0).max(100).optional(),
  allowUnconfirmedFactsInDrafts: z.boolean().optional(),
  autoDraftTopN: z.number().int().min(0).max(10).optional(),
  notifyEmails: z
    .array(z.email().max(254))
    .max(MAX_LIST_ITEMS)
    .transform((xs) => [...new Set(xs.map((e) => e.toLowerCase()))])
    .optional(),
  allowWebsiteCrawl: z.boolean().optional(),
  storeVoiceRecordings: z.boolean().optional(),
  /** null = keep raw files until deleted. */
  rawFileRetentionDays: z.number().int().min(1).max(3650).nullable().optional(),
  // --- automation level + per-stage checkpoints (services/review/automation.ts) ---
  /** supervised/full let autopilot submit: they record the autopilot_submission consent. */
  automationLevel: z.enum(AUTOMATION_LEVELS).optional(),
  /** null = reset to the level's preset default. */
  requireMatchApproval: z.boolean().nullable().optional(),
  requireFactConfirmation: z.boolean().nullable().optional(),
  requireDraftReview: z.boolean().nullable().optional(),
  requireSubmissionApproval: z.boolean().nullable().optional(),
  requireFollowupApproval: z.boolean().nullable().optional(),
  /** Asks above this need two different approving reviewers; null = off. */
  twoPersonRuleAboveCents: centsField.nullable().optional(),
});
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
