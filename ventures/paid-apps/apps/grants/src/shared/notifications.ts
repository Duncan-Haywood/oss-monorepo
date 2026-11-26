// In-app notification contracts (worker <-> client): kinds, severities, DTOs and the link rule.
// A notification belongs to exactly one recipient (user) in one org; see services/notifications.

export const NOTIFICATION_KINDS = [
  "application.ready_for_review",
  "application.needs_info",
  "submission.sent",
  "followup.due",
  "match.top",
  "export.ready",
  "watchlist.opportunity_found",
  "support_letter.received",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_SEVERITIES = ["info", "success", "warning", "action"] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  "application.ready_for_review": "Application ready for review",
  "application.needs_info": "Application needs your input",
  "submission.sent": "Submission sent",
  "followup.due": "Follow-up due",
  "match.top": "New top match",
  "export.ready": "Data export ready",
  "watchlist.opportunity_found": "Grant found on your watchlist",
  "support_letter.received": "Letter of support received",
};

/**
 * Defaults when a member never changed a kind. In-app is always on; email (sent by the digest/email
 * work, not here) defaults on only for kinds that ask someone to act.
 */
export const NOTIFICATION_DEFAULTS: Record<NotificationKind, { inApp: boolean; email: boolean }> = {
  "application.ready_for_review": { inApp: true, email: true },
  "application.needs_info": { inApp: true, email: true },
  "submission.sent": { inApp: true, email: false },
  "followup.due": { inApp: true, email: true },
  "match.top": { inApp: true, email: false },
  "export.ready": { inApp: true, email: false },
  "watchlist.opportunity_found": { inApp: true, email: false },
  "support_letter.received": { inApp: true, email: true },
};

export const MAX_NOTIFICATION_LINK_LENGTH = 500;

/**
 * True for an app-relative path the SPA can navigate to: starts with "/", no "//" anywhere (so
 * never protocol-relative), no backslash (browsers read "/\host" as "//host") and no control
 * characters (the URL parser drops tabs/newlines, so "/\t/host" would become "//host").
 */
export function isSafeAppLink(link: unknown): link is string {
  if (typeof link !== "string") return false;
  if (link.length < 1 || link.length > MAX_NOTIFICATION_LINK_LENGTH) return false;
  if (!link.startsWith("/") || link.includes("//") || link.includes("\\")) return false;
  for (let i = 0; i < link.length; i++) {
    const code = link.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  return true;
}

export interface NotificationDto {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** App-relative path (see isSafeAppLink), or null. */
  link: string | null;
  severity: NotificationSeverity;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListDto {
  items: NotificationDto[];
  nextCursor: string | null;
}

export interface NotificationCountDto {
  unread: number;
}

export interface NotificationPreferenceDto {
  kind: NotificationKind;
  label: string;
  inApp: boolean;
  email: boolean;
}
