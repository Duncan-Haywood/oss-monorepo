// DTOs for the attachments checklist and letters of support (worker <-> client).
//   org:GET  /applications/:id/attachments            -> AttachmentChecklistDto
//   org:PATCH /applications/:id/attachments/:itemId   -> AttachmentItemDto
//   org:POST /applications/:id/attachments/suggest    -> AttachmentChecklistDto (optional AI matching)
//   org:GET  /applications/:id/support-letters        -> { items: SupportLetterDto[] }
//   org:POST /applications/:id/support-letters        -> SupportLetterDto
//   org:POST /applications/:id/support-letters/:id/send -> SupportLetterDto
//   org:PATCH /applications/:id/support-letters/:id   -> SupportLetterDto
//   GET  /api/letters/:token                          -> PublicLetterInfoDto (no login)
//   POST /api/letters/:token/upload (multipart file, consent=true) -> PublicLetterUploadResultDto

export const ATTACHMENT_ITEM_STATUSES = ["missing", "matched", "uploaded", "waived"] as const;
export type AttachmentItemStatus = (typeof ATTACHMENT_ITEM_STATUSES)[number];

export type AttachmentMatchSourceDto = "kind" | "keyword" | "ai" | "staff" | "partner" | "cleared";

export interface AttachmentDocumentRef {
  id: string;
  title: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
}

export interface AttachmentItemDto {
  id: string;
  applicationId: string;
  requirementName: string;
  required: boolean;
  description: string;
  status: AttachmentItemStatus;
  documentId: string | null;
  document: AttachmentDocumentRef | null;
  matchSource: AttachmentMatchSourceDto | null;
  note: string | null;
  updatedAt: string;
}

export interface AttachmentChecklistDto {
  items: AttachmentItemDto[];
  /** Required items still missing (they block submission, not drafting). */
  missingRequired: number;
  /** Total size of the files that would be emailed with the application. */
  totalBytes: number;
  /** Files are attached to funder emails only up to this total; above it the guide lists them. */
  emailLimitBytes: number;
}

/** PATCH body: pick an existing document, record a fresh upload, waive (reason required) or clear. */
export type AttachmentPatchInput =
  | { action: "pick"; documentId: string }
  | { action: "uploaded"; documentId: string }
  | { action: "waive"; reason: string }
  | { action: "clear" };

export const SUPPORT_LETTER_STATUS_VALUES = ["draft", "sent", "received", "declined"] as const;
export type SupportLetterStatusDto = (typeof SUPPORT_LETTER_STATUS_VALUES)[number];

export interface SupportLetterFactDto {
  id: string;
  statement: string;
}

export interface SupportLetterDto {
  id: string;
  applicationId: string;
  partnerName: string;
  partnerEmail: string;
  status: SupportLetterStatusDto;
  dueAt: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  tokenExpiresAt: string | null;
  receivedDocumentId: string | null;
  emailSubject: string;
  emailIntro: string;
  outline: string[];
  draftSource: "ai" | "template" | "staff";
  facts: SupportLetterFactDto[];
  note: string | null;
  reminderCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupportLetterCreateInput {
  partnerName: string;
  partnerEmail: string;
  /** ISO date or datetime. Defaults to 7 days before the application deadline (or 21 days out). */
  dueAt?: string;
  /** Partner facts to cite; defaults to the org's partner facts that name the partner. */
  factIds?: string[];
  note?: string;
}

export interface SupportLetterPatchInput {
  partnerName?: string;
  partnerEmail?: string;
  dueAt?: string | null;
  emailIntro?: string;
  outline?: string[];
  note?: string | null;
  /** Staff can record a decline or a letter that arrived another way (with documentId). */
  status?: "declined" | "received";
  documentId?: string;
}

export interface PublicLetterInfoDto {
  orgName: string;
  grantTitle: string;
  partnerName: string;
  dueAt: string | null;
  maxBytes: number;
  acceptedTypes: string[];
}

export interface PublicLetterUploadResultDto {
  received: true;
}

/** Max partner letter size and allowed types (PDF/DOCX). */
export const LETTER_MAX_BYTES = 10 * 1024 * 1024;
export const LETTER_ACCEPTED_EXTENSIONS = [".pdf", ".docx"] as const;
/** Funder emails carry the matched attachment files only up to this total. */
export const EMAIL_ATTACHMENTS_MAX_BYTES = 10 * 1024 * 1024;
