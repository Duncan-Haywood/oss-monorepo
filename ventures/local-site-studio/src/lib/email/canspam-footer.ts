/**
 * The CAN-SPAM footer is an artifact with legal content, so it is built here
 * and it refuses rather than guesses.
 *
 * 15 U.S.C. §7704(a) requires of every commercial message:
 *   (a)(1) sender identification that is not materially false or misleading;
 *   (a)(3) a functioning opt-out mechanism the recipient can actually reach;
 *   (a)(5)(A)(iii) a *valid physical postal address* of the sender.
 *
 * Each of those three is env-sourced in this venture, and each had a literal
 * fallback that became the shipped value because the Deployment
 * (platform/k8s/apps/local-site-studio/deployment.yaml) sets no env at all:
 *
 *   NEXT_PUBLIC_BRAND_NAME       unset → "Your Brand"                       (a)(1)
 *   NEXT_PUBLIC_APP_URL          unset → http://localhost:3000/api/unsub... (a)(3)
 *   NEXT_PUBLIC_COMPANY_ADDRESS  unset → "[Registered business address —
 *                                         Colorado, USA]"                   (a)(5)
 *
 * A bracketed stub is not a postal address, a localhost link is not an opt-out
 * a recipient can use, and "Your Brand" does not identify a sender. There is no
 * safe substitute value to reach for: inventing an address would be worse than
 * the placeholder, not better. So an unset variable blocks the artifact and
 * names itself, and the caller must not transmit.
 *
 * Placeholder detection is delegated to the readiness modules that already
 * back the operator dashboard banners, so the send gate and the banner can
 * never disagree about what counts as configured.
 *
 * Pure: `assessCanSpamFooter` takes resolved values; `canSpamFooterFromEnv`
 * reads brand.ts + process.env for production call sites.
 */

import { brand } from "../brand";
import { isBrandNameConfigured } from "../brand/brand-name-env-readiness";
import { isCompanyAddressConfigured } from "../brand/company-address-env-readiness";
import { isAppUrlConfigured } from "../seo/app-url-env-readiness";

export const CAN_SPAM_FOOTER_ENV_NAMES = [
  "NEXT_PUBLIC_BRAND_NAME",
  "NEXT_PUBLIC_COMPANY_ADDRESS",
  "NEXT_PUBLIC_APP_URL",
] as const;

export type CanSpamFooterEnvName = (typeof CAN_SPAM_FOOTER_ENV_NAMES)[number];

/** Resolved values as they would appear in the footer, before validation. */
export type CanSpamFooterInputs = {
  /** brand.name — the "sent by" line. */
  brandName: string | undefined;
  /** brand.legalEntity — has a real registered fallback, not a placeholder. */
  legalEntity: string;
  /** brand.postalAddress — the §7704(a)(5) physical address. */
  postalAddress: string | undefined;
  /** NEXT_PUBLIC_APP_URL — origin of the unsubscribe + privacy links. */
  appUrl: string | undefined;
};

export type CanSpamFooter = {
  brandName: string;
  legalEntity: string;
  postalAddress: string;
  /** Origin with any trailing slash stripped. */
  baseUrl: string;
};

export type CanSpamFooterResult =
  | ({ ok: true } & CanSpamFooter)
  | {
      ok: false;
      /** Env vars that must be set before this message may be transmitted. */
      missing: CanSpamFooterEnvName[];
      /** Operator-facing sentence naming the variables and the obligation. */
      reason: string;
    };

/** Why each variable is required, for the refusal message. */
const OBLIGATION_BY_ENV: Record<CanSpamFooterEnvName, string> = {
  NEXT_PUBLIC_BRAND_NAME:
    "sender identification (15 U.S.C. §7704(a)(1)) — the footer would say the placeholder brand name",
  NEXT_PUBLIC_COMPANY_ADDRESS:
    "a valid physical postal address (15 U.S.C. §7704(a)(5)) — the footer would carry the bracketed placeholder",
  NEXT_PUBLIC_APP_URL:
    "a reachable opt-out link (15 U.S.C. §7704(a)(3)) — the unsubscribe URL would point at localhost",
};

/** Operator-facing refusal sentence. Names every missing variable, not just the first. */
export function describeCanSpamRefusal(
  missing: readonly CanSpamFooterEnvName[],
): string {
  const clauses = missing.map((name) => `${name} (${OBLIGATION_BY_ENV[name]})`);
  return (
    "Refusing to send: the CAN-SPAM footer cannot be built. " +
    `Set ${clauses.join("; and ")}.`
  );
}

/**
 * Validate the resolved footer values. Returns the footer, or the named env
 * vars blocking it. Never substitutes a value for a missing one.
 */
export function assessCanSpamFooter(
  inputs: CanSpamFooterInputs,
): CanSpamFooterResult {
  const missing: CanSpamFooterEnvName[] = [];
  if (!isBrandNameConfigured(inputs.brandName)) {
    missing.push("NEXT_PUBLIC_BRAND_NAME");
  }
  if (!isCompanyAddressConfigured(inputs.postalAddress)) {
    missing.push("NEXT_PUBLIC_COMPANY_ADDRESS");
  }
  if (!isAppUrlConfigured(inputs.appUrl)) {
    missing.push("NEXT_PUBLIC_APP_URL");
  }

  if (missing.length > 0) {
    return { ok: false, missing, reason: describeCanSpamRefusal(missing) };
  }

  return {
    ok: true,
    brandName: inputs.brandName!.trim(),
    legalEntity: inputs.legalEntity.trim(),
    postalAddress: inputs.postalAddress!.trim(),
    baseUrl: inputs.appUrl!.trim().replace(/\/$/, ""),
  };
}

/** Production call site: resolve from brand.ts getters + process.env. */
export function canSpamFooterFromEnv(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): CanSpamFooterResult {
  return assessCanSpamFooter({
    brandName: brand.name,
    legalEntity: brand.legalEntity,
    postalAddress: brand.postalAddress,
    appUrl: env.NEXT_PUBLIC_APP_URL,
  });
}
