// Whether newsletter (marketing) email may be sent, and why not. Pure: reads env only.
import type { Env } from "../../env";

export type MarketingBlocker =
  | "disabled" // MARKETING_EMAIL_ENABLED is not "true"
  | "no_postal_address" // MARKETING_POSTAL_ADDRESS is empty (CAN-SPAM requires one)
  | "no_token_secret"; // AUTH_SECRET missing: unsubscribe links cannot be signed

export interface MarketingConfig {
  /** True only when every requirement holds: the cron may send the nurture sequence. */
  sendingEnabled: boolean;
  blockers: MarketingBlocker[];
  postalAddress: string | null;
  /** Secret that signs unsubscribe links. */
  tokenSecret: string | null;
}

// Partial: an unset var reads as "off" (the generated binding types mark vars as always present).
type MarketingEnv = Partial<
  Pick<Env, "MARKETING_EMAIL_ENABLED" | "MARKETING_POSTAL_ADDRESS" | "AUTH_SECRET">
>;

export function marketingConfig(env: MarketingEnv): MarketingConfig {
  const postalAddress = env.MARKETING_POSTAL_ADDRESS?.trim() || null;
  const tokenSecret = env.AUTH_SECRET || null;
  const blockers: MarketingBlocker[] = [];
  if (env.MARKETING_EMAIL_ENABLED !== "true") blockers.push("disabled");
  if (!postalAddress) blockers.push("no_postal_address");
  if (!tokenSecret) blockers.push("no_token_secret");
  return { sendingEnabled: blockers.length === 0, blockers, postalAddress, tokenSecret };
}
