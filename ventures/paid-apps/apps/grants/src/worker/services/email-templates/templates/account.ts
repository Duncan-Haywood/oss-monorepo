// Account and team emails: invitations, email verification, password reset, data export,
// organization deletion and billing. These are service emails (no "manage notifications" link).
import type { MemberRole } from "@shared/enums";
import {
  display,
  formatDate,
  formatMoney,
  optional,
  plural,
  roleWithArticle,
  seg,
} from "../format";
import { type EmailContent, PRODUCT_NAME, type TemplateContext } from "../layout";

const hi = (name: string | null | undefined) => `Hi ${display(name, "there")},`;

// ---- invitation ------------------------------------------------------------------------------

export interface InvitationData {
  orgName: string;
  inviterName?: string | null;
  role: MemberRole;
  /** The invited address (the invitee must sign in with it). */
  email: string;
  invitationId: string;
  expiresInDays?: number;
}

export function invitation(d: InvitationData, t: TemplateContext): EmailContent {
  const org = display(d.orgName, "an organization");
  const inviter = display(d.inviterName, "A colleague");
  const email = display(d.email, "your email address");
  const days = d.expiresInDays ?? 7;
  return {
    subject: `You're invited to join ${org} on ${PRODUCT_NAME}`,
    preheader: `${inviter} invited you to join ${org} as ${roleWithArticle(d.role)}.`,
    heading: `Join ${org} on ${PRODUCT_NAME}`,
    blocks: [
      {
        type: "paragraph",
        text: `${inviter} invited you to join ${org} on ${PRODUCT_NAME} as ${roleWithArticle(d.role)}.`,
      },
      {
        type: "button",
        label: "Accept the invitation",
        url: t.url(`/invite/${seg(d.invitationId)}`),
        showUrl: true,
      },
      {
        type: "paragraph",
        text: `Sign in (or create an account) with ${email} to accept. This link expires in ${plural(days, "day")}.`,
      },
    ],
    footer: {
      reason: `You received this email because ${inviter} invited ${email} to join ${org} on ${PRODUCT_NAME}. If you weren't expecting it, you can ignore it.`,
    },
  };
}

// ---- verifyEmail / passwordReset / existingAccount -------------------------------------------

export interface VerifyEmailData {
  name?: string | null;
  email: string;
  /** Verification token; the link opens the SPA page `/verify-email?token=…`. */
  token: string;
  expiresInHours?: number;
}

export function verifyEmail(d: VerifyEmailData, t: TemplateContext): EmailContent {
  const email = display(d.email, "this address");
  const hours = d.expiresInHours ?? 24;
  return {
    subject: `Confirm your email for ${PRODUCT_NAME}`,
    preheader: `Confirm that ${email} is your email address.`,
    heading: "Confirm your email address",
    greeting: hi(d.name),
    blocks: [
      { type: "paragraph", text: `Please confirm that ${email} is your email address.` },
      {
        type: "button",
        label: "Confirm email",
        url: t.url(`/verify-email?token=${encodeURIComponent(d.token)}`),
        showUrl: true,
      },
      {
        type: "note",
        text: `This link expires in ${plural(hours, "hour")}. If you didn't create a ${PRODUCT_NAME} account, you can ignore this email.`,
      },
    ],
    footer: {
      reason: `You received this email because someone signed up for ${PRODUCT_NAME} with ${email}.`,
    },
  };
}

export interface PasswordResetData {
  name?: string | null;
  email: string;
  /** Reset token; the link opens the SPA page `/reset-password?token=…`. */
  token: string;
  expiresInMinutes?: number;
}

export function passwordReset(d: PasswordResetData, t: TemplateContext): EmailContent {
  const email = display(d.email, "your account");
  const minutes = d.expiresInMinutes ?? 60;
  const expiry = minutes % 60 === 0 ? plural(minutes / 60, "hour") : plural(minutes, "minute");
  return {
    subject: `Reset your ${PRODUCT_NAME} password`,
    preheader: `Choose a new password for ${email}.`,
    heading: "Reset your password",
    greeting: hi(d.name),
    blocks: [
      { type: "paragraph", text: `Someone asked to reset the password for ${email}.` },
      {
        type: "button",
        label: "Choose a new password",
        url: t.url(`/reset-password?token=${encodeURIComponent(d.token)}`),
        showUrl: true,
      },
      {
        type: "note",
        text: `This link expires in ${expiry} and works once. Resetting signs you out everywhere. If you didn't ask for this, ignore this email; your password stays the same.`,
      },
    ],
    footer: {
      reason: `You received this email because a password reset was requested for ${email} on ${PRODUCT_NAME}.`,
    },
  };
}

export interface ExistingAccountData {
  name?: string | null;
  email: string;
}

export function existingAccount(d: ExistingAccountData, t: TemplateContext): EmailContent {
  const email = display(d.email, "your address");
  return {
    subject: `You already have a ${PRODUCT_NAME} account`,
    heading: "You already have an account",
    greeting: hi(d.name),
    blocks: [
      {
        type: "paragraph",
        text: `Someone tried to create a ${PRODUCT_NAME} account with ${email}, but you already have one. If that was you, sign in instead.`,
      },
      { type: "button", label: "Sign in", url: t.url("/login") },
      { type: "link", label: "Forgot your password? Reset it", url: t.url("/forgot-password") },
      { type: "note", text: "If this wasn't you, no action is needed." },
    ],
    footer: {
      reason: `You received this email because someone tried to sign up for ${PRODUCT_NAME} with ${email}.`,
    },
  };
}

// ---- exportReady -----------------------------------------------------------------------------

export interface ExportReadyData {
  orgId: string;
  orgName: string;
  requestedByName?: string | null;
  /** When the download link stops working. */
  expiresAt?: Date | string | null;
}

export function exportReady(d: ExportReadyData, t: TemplateContext): EmailContent {
  const org = display(d.orgName, "your organization");
  const by = optional(d.requestedByName);
  const expires = formatDate(d.expiresAt);
  return {
    subject: `Your data export for ${org} is ready`,
    preheader: "Download it from Privacy & data settings.",
    heading: "Your data export is ready",
    blocks: [
      {
        type: "paragraph",
        text: `The data export${by ? ` ${by} requested` : " you requested"} for ${org} is ready to download.`,
      },
      {
        type: "button",
        label: "Download the export",
        url: t.orgUrl(d.orgId, "/settings/privacy"),
      },
      {
        type: "note",
        text: `You'll need to sign in to download it.${expires ? ` The download is available until ${expires}.` : ""}`,
      },
    ],
    footer: {
      reason: `You received this email because a data export was requested for ${org} on ${PRODUCT_NAME}.`,
    },
  };
}

// ---- orgDeletionScheduled --------------------------------------------------------------------

export interface OrgDeletionScheduledData {
  orgId: string;
  orgName: string;
  /** When the organization and its data will be permanently deleted. */
  deletionAt: Date | string;
  requestedByName?: string | null;
  /** Only say it can be canceled when the product actually allows it. */
  canCancel?: boolean;
}

export function orgDeletionScheduled(
  d: OrgDeletionScheduledData,
  t: TemplateContext,
): EmailContent {
  const org = display(d.orgName, "your organization");
  const by = display(d.requestedByName, "An owner");
  const when = formatDate(d.deletionAt);
  return {
    subject: `${org} is scheduled for deletion`,
    preheader: when ? `Permanent deletion on ${when}.` : "Permanent deletion is scheduled.",
    heading: `${org} is scheduled for deletion`,
    blocks: [
      {
        type: "paragraph",
        text: `${by} asked to permanently delete ${org} and its data from ${PRODUCT_NAME}.`,
      },
      {
        type: "details",
        rows: [
          { label: "Organization", value: org },
          { label: "Deletion date", value: when ?? "As soon as possible" },
        ],
      },
      {
        type: "callout",
        tone: "warning",
        text: d.canCancel
          ? "After deletion, documents, facts, drafts and submissions can't be recovered. An owner can cancel before the deletion date in Privacy & data settings."
          : "After deletion, documents, facts, drafts and submissions can't be recovered. If you didn't expect this, contact an owner of your organization right away.",
      },
      {
        type: "button",
        label: "Open Privacy & data settings",
        url: t.orgUrl(d.orgId, "/settings/privacy"),
      },
    ],
    footer: {
      reason: `You received this email because you're a member of ${org} on ${PRODUCT_NAME}.`,
    },
  };
}

// ---- paymentFailed / subscriptionChanged -----------------------------------------------------

export interface PaymentFailedData {
  orgId: string;
  orgName: string;
  planName?: string | null;
  amountCents?: number | null;
  /** When the payment provider will retry, if known. */
  nextRetryAt?: Date | string | null;
  /** When paid features stop if the payment isn't fixed, if known. */
  accessEndsAt?: Date | string | null;
}

export function paymentFailed(d: PaymentFailedData, t: TemplateContext): EmailContent {
  const org = display(d.orgName, "your organization");
  const plan = optional(d.planName);
  const amount = formatMoney(d.amountCents);
  const retry = formatDate(d.nextRetryAt);
  const ends = formatDate(d.accessEndsAt);
  return {
    subject: `Payment failed for ${org}'s ${PRODUCT_NAME} plan`,
    preheader: "Update your payment method to keep your plan active.",
    heading: "We couldn't process your payment",
    blocks: [
      {
        type: "paragraph",
        text: `The payment${amount ? ` of ${amount}` : ""} for ${org}'s ${plan ? `${plan} plan` : "plan"} didn't go through.${retry ? ` We'll try again on ${retry}.` : ""}`,
      },
      {
        type: "paragraph",
        text: ends
          ? `Update your payment method before ${ends} to keep your plan active.`
          : "Update your payment method to keep your plan active.",
      },
      {
        type: "button",
        label: "Update payment method",
        url: t.orgUrl(d.orgId, "/settings/billing"),
      },
    ],
    footer: {
      reason: `You received this email because this address manages billing for ${org} on ${PRODUCT_NAME}.`,
    },
  };
}

export type SubscriptionChange = "started" | "upgraded" | "downgraded" | "canceled" | "renewed";

export interface SubscriptionChangedData {
  orgId: string;
  orgName: string;
  change: SubscriptionChange;
  previousPlan?: string | null;
  newPlan?: string | null;
  effectiveAt?: Date | string | null;
}

export function subscriptionChanged(d: SubscriptionChangedData, t: TemplateContext): EmailContent {
  const org = display(d.orgName, "your organization");
  const plan = optional(d.newPlan);
  const prev = optional(d.previousPlan);
  const when = formatDate(d.effectiveAt);
  const planText = plan ? `the ${plan} plan` : "a new plan";
  const copy: Record<SubscriptionChange, { subject: string; text: string }> = {
    started: {
      subject: `${org}'s ${plan ? `${plan} plan` : "subscription"} is active`,
      text: `${org} is now on ${planText}${when ? ` as of ${when}` : ""}.`,
    },
    upgraded: {
      subject: `${org} upgraded to ${planText}`,
      text: `${org} moved${prev ? ` from the ${prev} plan` : ""} to ${planText}${when ? ` on ${when}` : ""}.`,
    },
    downgraded: {
      subject: `${org} is moving to ${planText}`,
      text: `${org} is moving${prev ? ` from the ${prev} plan` : ""} to ${planText}${when ? ` on ${when}` : ""}.`,
    },
    canceled: {
      subject: `${org}'s subscription is canceled`,
      text: `${org}'s ${prev ? `${prev} plan` : "subscription"} is canceled${when ? ` and ends on ${when}` : ""}.`,
    },
    renewed: {
      subject: `${org}'s subscription renewed`,
      text: `${org}'s ${plan ? `${plan} plan` : "subscription"} renewed${when ? ` on ${when}` : ""}.`,
    },
  };
  const c = copy[d.change];
  return {
    subject: c.subject,
    heading: "Your subscription changed",
    blocks: [
      { type: "paragraph", text: c.text },
      {
        type: "button",
        label: "View plan & billing",
        url: t.orgUrl(d.orgId, "/settings/billing"),
      },
    ],
    footer: {
      reason: `You received this email because this address manages billing for ${org} on ${PRODUCT_NAME}.`,
    },
  };
}
