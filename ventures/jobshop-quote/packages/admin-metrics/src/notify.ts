// Owner notifications: "new paid subscription" (sent by each product's webhook) and the daily
// digest (sent by apps/admin's cron). Off unless OWNER_NOTIFICATIONS is "on" AND the app has a real
// email sender configured AND PLATFORM_ADMIN_EMAILS names someone. Only the personal data the
// owner needs goes in: names, the account owner's email, the org and the plan.
import type { AdminAccountDto, AdminSignupDto, MoneyByCurrency } from "./contract.ts";
import { parseAdminEmails } from "./gate.ts";

export interface OwnerNotifyEnv {
  OWNER_NOTIFICATIONS?: string;
  PLATFORM_ADMIN_EMAILS?: string;
}

/** Recipients when notifications are switched on; [] means "do not send". */
export function ownerRecipients(env: OwnerNotifyEnv, senderConfigured: boolean): string[] {
  if (!senderConfigured) return [];
  if ((env.OWNER_NOTIFICATIONS ?? "").trim().toLowerCase() !== "on") return [];
  return parseAdminEmails(env.PLATFORM_ADMIN_EMAILS);
}

export interface OwnerEmail {
  subject: string;
  text: string;
}

/** Formats minor units for an email or the console (no FX; 2-decimal currencies assumed unless JPY-like). */
export function formatMoney(m: MoneyByCurrency): string {
  const zeroDecimal = ["JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD"].includes(m.currency);
  const major = zeroDecimal ? m.amountMinor : m.amountMinor / 100;
  return `${m.currency} ${major.toLocaleString("en-US", {
    minimumFractionDigits: zeroDecimal ? 0 : 2,
    maximumFractionDigits: zeroDecimal ? 0 : 2,
  })}`;
}

const oneLine = (s: string | null | undefined, max = 120) =>
  (s ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, max);

export function newPaidSubscriptionEmail(input: {
  productName: string;
  orgName: string;
  planKey: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
  mrr?: MoneyByCurrency | null;
}): OwnerEmail {
  const org = oneLine(input.orgName);
  const lines = [
    `New paid subscription in ${oneLine(input.productName)}.`,
    "",
    `Organization: ${org}`,
    `Plan: ${oneLine(input.planKey, 40)}`,
    `Account owner: ${oneLine(input.ownerName) || "(no name)"}${input.ownerEmail ? ` <${oneLine(input.ownerEmail, 254)}>` : ""}`,
    `Recorded price: ${input.mrr ? `${formatMoney(input.mrr)} per month (from the Paddle webhook)` : "not recorded on this event"}`,
    "",
    "Sent because OWNER_NOTIFICATIONS is on for this app. Switch it off on the worker to stop these.",
  ];
  return {
    subject: `[${oneLine(input.productName, 40)}] New paid subscription: ${org.slice(0, 60)}`,
    text: lines.join("\n"),
  };
}

export interface DigestProduct {
  productName: string;
  /** false = the product could not be read (shown as such, never as zero). */
  ok: boolean;
  error?: string;
  signups: (AdminAccountDto | AdminSignupDto)[];
  trialsStarted: AdminAccountDto[];
  cancellations: AdminAccountDto[];
}

/** The daily digest of the last 24 hours across products. */
export function dailyDigestEmail(input: {
  day: string;
  products: DigestProduct[];
  mrr: MoneyByCurrency[];
}): OwnerEmail {
  const out: string[] = [`Daily digest for the 24 hours before ${input.day} 00:00 UTC.`, ""];
  let signups = 0;
  let trials = 0;
  let cancels = 0;
  for (const p of input.products) {
    out.push(`== ${oneLine(p.productName)}`);
    if (!p.ok) {
      out.push(`  Could not read this product: ${oneLine(p.error) || "unknown error"}`, "");
      continue;
    }
    signups += p.signups.length;
    trials += p.trialsStarted.length;
    cancels += p.cancellations.length;
    out.push(`  Sign-ups: ${p.signups.length}`);
    for (const s of p.signups.slice(0, 20)) {
      if ("orgName" in s) {
        out.push(
          `    - ${oneLine(s.orgName)}${s.owner ? ` (${oneLine(s.owner.name) || "no name"} <${oneLine(s.owner.email, 254)}>)` : ""}`,
        );
      } else {
        out.push(`    - ${oneLine(s.name) || "(no name)"} <${oneLine(s.email, 254)}>`);
      }
    }
    if (p.signups.length > 20) out.push(`    … and ${p.signups.length - 20} more`);
    out.push(`  Trials started: ${p.trialsStarted.length}`);
    for (const a of p.trialsStarted.slice(0, 20))
      out.push(`    - ${oneLine(a.orgName)} (${oneLine(a.planKey) || "?"})`);
    out.push(`  Cancellations: ${p.cancellations.length}`);
    for (const a of p.cancellations.slice(0, 20))
      out.push(`    - ${oneLine(a.orgName)} (${oneLine(a.planKey) || "?"})`);
    out.push("");
  }
  out.push(
    `MRR now (recorded Paddle prices, per currency): ${input.mrr.length ? input.mrr.map(formatMoney).join(", ") : "none recorded"}`,
    "",
    "Sent by the owner console (apps/admin) because DIGEST_ENABLED is on. Switch it off on the worker to stop these.",
  );
  return {
    subject: `Daily digest ${input.day}: ${signups} sign-ups, ${trials} trials, ${cancels} cancellations`,
    text: out.join("\n"),
  };
}
