/**
 * Legal entity and product branding.
 * Override via NEXT_PUBLIC_* env vars in production.
 */
export const company = {
  legalName: process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Maris Stella Labs",
  productName: process.env.NEXT_PUBLIC_APP_NAME ?? "Local Site Studio",
  location: process.env.NEXT_PUBLIC_COMPANY_LOCATION ?? "Colorado, USA",
  /** CAN-SPAM requires a valid physical postal address in outreach emails. */
  postalAddress:
    process.env.NEXT_PUBLIC_COMPANY_ADDRESS ??
    "[Registered business address — Colorado, USA]",
  supportEmail:
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@marisstellalabs.com",
  emailFrom: process.env.EMAIL_FROM ?? "noreply@marisstellalabs.com",
} as const;

export function legalFooterLine(year = new Date().getFullYear()): string {
  return `© ${year} ${company.legalName} · ${company.location}`;
}

export function outreachSenderLine(): string {
  return `${company.legalName} · ${company.location}`;
}
