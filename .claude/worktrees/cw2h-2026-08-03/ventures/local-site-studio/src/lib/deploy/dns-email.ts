/**
 * Pure HTML formatter for the post-payment DNS handoff email.
 * Kept free of db/server-only imports so Vitest can cover escaping.
 */

import { escapeHtmlForEmail } from "@/lib/inquiries/reply";
import type { DeployHandoff } from "./types";

export function formatDnsInstructionsForEmail(handoff: DeployHandoff): string {
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
