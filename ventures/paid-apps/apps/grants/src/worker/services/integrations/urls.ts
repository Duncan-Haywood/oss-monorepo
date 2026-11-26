// Webhook URL validation. Admins paste these URLs and we POST to them, so they are an SSRF surface:
// we accept only exact, known provider hosts over https on the default port, run the shared SSRF
// guard on top, and never follow redirects when delivering (deliver.ts).
//
// Verified 2026-11-19 (see docs/INTEGRATIONS.md):
//  - Slack incoming webhooks: https://hooks.slack.com/services/{team}/{service}/{secret}
//  - Teams Workflows ("When a Teams webhook request is received"): new trigger URLs are
//    https://{env}.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/{id}/triggers/manual/paths/invoke?...&sig=...
//    and older ones https://{region}.logic.azure.com:443/workflows/{id}/triggers/manual/paths/invoke?...&sig=...
//  - Office 365 Connector URLs (*.webhook.office.com, outlook.office.com) were retired (May 2026).
import type { IntegrationProvider } from "@shared/integrations";
import { assertSafeUrl, UnsafeUrlError } from "../imports/url-safety";

export class WebhookUrlError extends Error {
  constructor(
    public readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "WebhookUrlError";
  }
}

export const SLACK_WEBHOOK_HOST = "hooks.slack.com";
const SLACK_PATH = /^\/services\/[A-Z0-9]{6,20}\/[A-Z0-9]{6,20}\/[A-Za-z0-9]{16,64}$/;

/** Microsoft hosts that serve Workflows / Power Automate webhook triggers (suffix match). */
export const TEAMS_WEBHOOK_HOST_SUFFIXES = [
  ".environment.api.powerplatform.com",
  ".api.powerplatform.com",
  ".powerplatform.com",
  ".logic.azure.com",
] as const;

const RETIRED_CONNECTOR_HOSTS = [/\.webhook\.office\.com$/, /^outlook\.office(365)?\.com$/];

const MAX_URL_LENGTH = 2048;

function baseChecks(input: string): URL {
  const raw = input.trim();
  if (!raw) throw new WebhookUrlError("empty", "Paste the webhook URL");
  if (raw.length > MAX_URL_LENGTH) throw new WebhookUrlError("too_long", "That URL is too long");
  let url: URL;
  try {
    url = assertSafeUrl(raw);
  } catch (e) {
    const reason = e instanceof UnsafeUrlError ? e.reason : "invalid";
    throw new WebhookUrlError(reason, "That is not a valid public webhook URL");
  }
  if (url.protocol !== "https:") throw new WebhookUrlError("scheme", "Webhook URLs must use https");
  if (url.port !== "") throw new WebhookUrlError("port", "Webhook URLs must use the default port");
  if (url.hash) throw new WebhookUrlError("fragment", "Remove the # part of the URL");
  return url;
}

const hostOf = (url: URL) => url.hostname.toLowerCase().replace(/\.$/, "");

export function validateSlackWebhookUrl(input: string): URL {
  const url = baseChecks(input);
  if (hostOf(url) !== SLACK_WEBHOOK_HOST) {
    throw new WebhookUrlError(
      "host",
      "Slack webhook URLs start with https://hooks.slack.com/services/",
    );
  }
  if (url.search || !SLACK_PATH.test(url.pathname)) {
    throw new WebhookUrlError(
      "path",
      "That does not look like a Slack incoming webhook URL (https://hooks.slack.com/services/…)",
    );
  }
  return url;
}

export function validateTeamsWebhookUrl(input: string): URL {
  const url = baseChecks(input);
  const host = hostOf(url);
  if (RETIRED_CONNECTOR_HOSTS.some((re) => re.test(host))) {
    throw new WebhookUrlError(
      "retired_connector",
      "Office 365 Connector webhooks were retired by Microsoft. Create a Teams Workflows webhook instead.",
    );
  }
  const known = TEAMS_WEBHOOK_HOST_SUFFIXES.some(
    (suffix) => host.endsWith(suffix) && host.length > suffix.length,
  );
  if (!known) {
    throw new WebhookUrlError(
      "host",
      "Teams webhook URLs come from the Workflows app (…powerplatform.com or …logic.azure.com)",
    );
  }
  const path = url.pathname.toLowerCase();
  if (!path.includes("/workflows/") || !path.includes("/triggers/")) {
    throw new WebhookUrlError("path", "That does not look like a Teams Workflows webhook URL");
  }
  if (!url.searchParams.get("sig")) {
    throw new WebhookUrlError("path", "The Workflows URL is missing its sig= part; copy it again");
  }
  return url;
}

export function validateWebhookUrl(provider: IntegrationProvider, input: string): URL {
  return provider === "slack" ? validateSlackWebhookUrl(input) : validateTeamsWebhookUrl(input);
}

/** Display-only hint that does not reveal the secret parts of the URL. */
export function redactWebhookUrl(url: URL): string {
  const host = hostOf(url);
  const parts = url.pathname.split("/").filter(Boolean);
  const tail = (parts.at(-1) ?? "").slice(-4);
  if (host === SLACK_WEBHOOK_HOST) {
    const team = parts[1] ?? "";
    return `${host}/services/${team.slice(0, 3)}…/…${tail}`;
  }
  const sig = url.searchParams.get("sig") ?? "";
  return `${host.length > 40 ? `…${host.slice(-36)}` : host}/…/invoke?sig=…${sig.slice(-4)}`;
}

/** Slack's response_url for a slash command: only ever hooks.slack.com/commands/… */
export function validateSlackResponseUrl(input: string | null | undefined): URL | null {
  if (!input) return null;
  try {
    const url = baseChecks(input);
    if (hostOf(url) !== SLACK_WEBHOOK_HOST || !url.pathname.startsWith("/commands/")) return null;
    return url;
  } catch {
    return null;
  }
}
