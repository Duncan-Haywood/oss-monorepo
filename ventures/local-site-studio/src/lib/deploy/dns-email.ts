/**
 * Pure HTML formatter for the post-payment DNS handoff email.
 * Kept free of db/server-only imports so Vitest can cover escaping.
 */

import { escapeHtmlForEmail } from "@/lib/inquiries/reply";
import type { DeployHandoff } from "./types";

/**
 * Thrown instead of rendering go-live instructions that would name a hostname
 * or link the platform was never configured to own. Carries the fields that
 * were empty so the operator log says which env var to set.
 */
export class DeployInstructionsBlockedError extends Error {
  readonly missingFields: readonly string[];

  constructor(missingFields: readonly string[]) {
    super(
      "Refusing to render go-live DNS instructions: the handoff has no " +
        `${missingFields.join(", ")}. This handoff was created while ` +
        "NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_PRODUCTION_DOMAIN were unset (see " +
        "the handoff notes); set them and re-run the handoff rather than " +
        "sending the customer a hostname nobody owns.",
    );
    this.name = "DeployInstructionsBlockedError";
    this.missingFields = missingFields;
  }
}

/**
 * Refuse to build a customer-facing instruction block from a handoff whose
 * customer-facing fields were withheld. buildHandoffRecord leaves them empty
 * (rather than filling in a guess) when the platform root domain or public app
 * origin is unconfigured — an empty <strong></strong> in a "point your DNS
 * here" email is the failure mode this exists to prevent.
 */
export function assertDeployInstructionsReady(handoff: DeployHandoff): void {
  const missingFields: string[] = [];
  if (!handoff.suggestedHost.trim()) missingFields.push("suggestedHost");
  if (!handoff.previewUrl.trim()) missingFields.push("previewUrl");
  if (!handoff.contactFormUrl.trim()) missingFields.push("contactFormUrl");
  if (handoff.dnsInstructions.length === 0) missingFields.push("dnsInstructions");
  if (missingFields.length > 0) {
    throw new DeployInstructionsBlockedError(missingFields);
  }
}

export function formatDnsInstructionsForEmail(handoff: DeployHandoff): string {
  assertDeployInstructionsReady(handoff);
  const rows = handoff.dnsInstructions
    .map((d) => {
      const type = escapeHtmlForEmail(d.type);
      const host = escapeHtmlForEmail(d.host);
      const value = escapeHtmlForEmail(d.value);
      const purpose = escapeHtmlForEmail(d.purpose);
      return `<li><code>${type}</code> <strong>${host}</strong> → <code>${value}</code> — ${purpose}</li>`;
    })
    .join("");
  const suggestedHost = escapeHtmlForEmail(handoff.suggestedHost);
  const previewUrl = escapeHtmlForEmail(handoff.previewUrl);
  const contactFormUrl = escapeHtmlForEmail(handoff.contactFormUrl);
  return `
    <p style="margin-bottom: 12px;">Your production hostname: <strong>${suggestedHost}</strong></p>
    <p style="margin-bottom: 8px;">DNS records to add (or ask us to configure):</p>
    <ul style="margin-bottom: 16px;">${rows}</ul>
    <p style="margin-bottom: 12px;">Preview (live now): <a href="${previewUrl}">${previewUrl}</a></p>
    <p style="margin-bottom: 12px;">Contact form endpoint: <code>${contactFormUrl}</code></p>
  `;
}
