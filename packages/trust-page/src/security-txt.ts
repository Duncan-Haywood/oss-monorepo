// security.txt (RFC 9116) generator. Serve the result at /.well-known/security.txt as
// text/plain; charset=utf-8, over HTTPS.
//
// Rules implemented (RFC 9116, https://www.rfc-editor.org/rfc/rfc9116; the RFC was not reachable from
// the session that wrote this, so re-check against it when changing the rules):
//   - Contact: required, one or more; a URI (mailto:, https:, tel:). Listed in order of preference.
//   - Expires: required, exactly once, RFC 3339 date-time. The RFC recommends less than a year ahead;
//     this generator refuses more than 365 days, and refuses a date in the past.
//   - Optional: Encryption, Acknowledgments, Preferred-Languages (once), Canonical, Policy, Hiring.
//     Web URIs in those fields must be https.

import { isMailtoAddress, TrustClaimError } from "./guard.ts";
import type { TrustProfile } from "./types.ts";

export interface SecurityTxtFields {
  contact: readonly string[];
  expires: Date;
  encryption?: readonly string[];
  acknowledgments?: readonly string[];
  preferredLanguages?: readonly string[];
  canonical?: readonly string[];
  policy?: readonly string[];
  hiring?: readonly string[];
  /** Optional comment lines (written with a leading "# "). */
  comments?: readonly string[];
}

export const MAX_EXPIRY_DAYS = 365;
const DAY_MS = 86_400_000;

function assertContact(uri: string): void {
  if (isMailtoAddress(uri)) return;
  if (/^tel:\+?[0-9-]+$/.test(uri)) return;
  if (/^https:\/\/\S+$/.test(uri)) return;
  throw new TrustClaimError(
    `security.txt Contact must be a mailto:, tel: or https: URI (got "${uri}")`,
  );
}

function assertHttps(field: string, uri: string): void {
  if (!/^https:\/\/\S+$/.test(uri)) {
    throw new TrustClaimError(`security.txt ${field} must be an https URI (got "${uri}")`);
  }
}

function assertOneLine(s: string): void {
  if (/[\r\n]/.test(s)) throw new TrustClaimError("security.txt values must be single-line");
}

/** Returns the file body (LF line endings, trailing newline). `now` is injectable for tests. */
export function generateSecurityTxt(f: SecurityTxtFields, now: Date = new Date()): string {
  if (f.contact.length === 0) throw new TrustClaimError("security.txt needs at least one Contact");
  for (const c of f.contact) assertContact(c);
  const t = f.expires.getTime();
  if (Number.isNaN(t)) throw new TrustClaimError("security.txt Expires is not a valid date");
  if (t <= now.getTime()) throw new TrustClaimError("security.txt Expires is in the past");
  if (t - now.getTime() > MAX_EXPIRY_DAYS * DAY_MS) {
    throw new TrustClaimError(`security.txt Expires must be at most ${MAX_EXPIRY_DAYS} days ahead`);
  }
  for (const u of f.encryption ?? []) assertHttps("Encryption", u);
  for (const u of f.acknowledgments ?? []) assertHttps("Acknowledgments", u);
  for (const u of f.canonical ?? []) assertHttps("Canonical", u);
  for (const u of f.policy ?? []) assertHttps("Policy", u);
  for (const u of f.hiring ?? []) assertHttps("Hiring", u);
  for (const l of f.preferredLanguages ?? []) {
    if (!/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(l)) {
      throw new TrustClaimError(`security.txt Preferred-Languages: bad language tag "${l}"`);
    }
  }

  const lines: string[] = [];
  for (const c of f.comments ?? []) {
    assertOneLine(c);
    lines.push(`# ${c}`);
  }
  for (const c of f.contact) lines.push(`Contact: ${c}`);
  lines.push(`Expires: ${f.expires.toISOString()}`);
  for (const u of f.encryption ?? []) lines.push(`Encryption: ${u}`);
  for (const u of f.acknowledgments ?? []) lines.push(`Acknowledgments: ${u}`);
  if (f.preferredLanguages?.length)
    lines.push(`Preferred-Languages: ${f.preferredLanguages.join(", ")}`);
  for (const u of f.canonical ?? []) lines.push(`Canonical: ${u}`);
  for (const u of f.policy ?? []) lines.push(`Policy: ${u}`);
  for (const u of f.hiring ?? []) lines.push(`Hiring: ${u}`);
  for (const l of lines) assertOneLine(l);
  return `${lines.join("\n")}\n`;
}

/**
 * security.txt for a product. Fails closed while the profile has no security contact: a file
 * without a working Contact is worse than none.
 */
export function securityTxtForProfile(
  profile: TrustProfile,
  opts: {
    expires: Date;
    canonicalUrl?: string;
    preferredLanguages?: readonly string[];
  },
  now: Date = new Date(),
): string {
  if (!profile.securityContact) {
    throw new TrustClaimError(
      `${profile.product} has no security contact yet (docs/trust/OWNER-CONFIRM.md); not generating security.txt`,
    );
  }
  return generateSecurityTxt(
    {
      contact: [profile.securityContact],
      expires: opts.expires,
      preferredLanguages: opts.preferredLanguages ?? ["en"],
      ...(opts.canonicalUrl ? { canonical: [opts.canonicalUrl] } : {}),
      ...(profile.disclosurePolicyUrl ? { policy: [profile.disclosurePolicyUrl] } : {}),
    },
    now,
  );
}
