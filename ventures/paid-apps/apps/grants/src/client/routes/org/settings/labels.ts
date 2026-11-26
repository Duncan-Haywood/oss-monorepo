// Friendly, plain-language labels for enums shown in onboarding + settings.
import type { ConsentScope, DocumentKind, MemberRole, OrgType, PastOutcome } from "@shared/enums";

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  nonprofit_501c3: "501(c)(3) nonprofit",
  tribal_government: "Tribal government",
  tribal_organization: "Tribal organization",
  faith_based: "Faith-based organization",
  community_based: "Community-based organization",
  educational: "School or educational institution",
  government: "Local or state government agency",
  fiscally_sponsored: "Fiscally sponsored project",
  other: "Other",
};

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  mission_statement: "Mission statement",
  charter_bylaws: "Charter or bylaws",
  annual_report: "Annual report",
  financial_statement: "Financial statement / audit / 990",
  budget: "Budget",
  program_description: "Program description",
  past_application: "Past grant application",
  award_letter: "Award letter",
  rejection_letter: "Decline letter",
  letter_of_support: "Letter of support",
  interview_transcript: "Interview transcript",
  website_page: "Website page",
  policy: "Policy",
  other: "Other",
  update_note: "Update note",
};

export const PAST_OUTCOME_LABELS: Record<PastOutcome, string> = {
  awarded: "Awarded",
  declined: "Declined",
  pending: "Still waiting",
  unknown: "Not sure",
};

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  reviewer: "Reviewer",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  owner: "Full control, including billing and deleting the organization.",
  admin: "Manages settings, members, autopilot rules and billing.",
  editor: "Uploads documents, edits facts and drafts applications.",
  reviewer: "Reviews and approves applications before they are submitted.",
  viewer: "Can see everything but cannot change anything.",
};

export const CONSENT_SCOPE_LABELS: Record<ConsentScope, string> = {
  data_processing: "Processing your organization's data",
  document_upload: "Document uploads",
  website_crawl: "Reading your public website",
  ai_interview: "AI interviews",
  voice_recording: "Keeping voice recordings",
  terms_of_service: "Terms of Service",
  privacy_policy: "Privacy Policy",
  autopilot_submission: "Autopilot submissions",
};
