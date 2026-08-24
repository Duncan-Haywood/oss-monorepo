/**
 * Shared field-length caps for Starter contact-form CRM + notify.
 *
 * insertClientInquiry historically sliced only `message` to 5000 chars, while
 * POST /api/contact/[slug] built the sold skipSuppression notify from the raw
 * request body — so a public (rate-limited) form could email multi-MB HTML to
 * lead.email/support while the inbox row stored a truncated message.
 * Soft-cap once here and reuse the same strings for persist + notify.
 */

export const MAX_CONTACT_MESSAGE_LENGTH = 5000;
export const MAX_CONTACT_NAME_LENGTH = 200;
/** Practical upper bound for an email address (local + @ + domain). */
export const MAX_CONTACT_EMAIL_LENGTH = 320;
export const MAX_CONTACT_PHONE_LENGTH = 40;
/** Referer / source strings can be long; bound abuse without rejecting legit URLs. */
export const MAX_CONTACT_SOURCE_LENGTH = 500;

export interface ContactFormFields {
  name: string;
  email: string;
  phone: string;
  message: string;
  source: string;
}

function cap(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Soft-cap contact-form visitor fields. Empty strings stay empty (callers
 * decide required-field policy and "(no message — contact details only)"
 * placeholders after this).
 */
export function normalizeContactFormFields(input: {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  source?: string;
}): ContactFormFields {
  return {
    name: cap(input.name ?? "", MAX_CONTACT_NAME_LENGTH),
    email: cap(input.email ?? "", MAX_CONTACT_EMAIL_LENGTH),
    phone: cap(input.phone ?? "", MAX_CONTACT_PHONE_LENGTH),
    message: cap(input.message ?? "", MAX_CONTACT_MESSAGE_LENGTH),
    source: cap(input.source ?? "", MAX_CONTACT_SOURCE_LENGTH),
  };
}
