// Chat integrations (worker <-> client): Slack / Microsoft Teams destinations, the events they can
// receive, and the Slack slash-command setup. See docs/INTEGRATIONS.md.

export const INTEGRATION_PROVIDERS = ["slack", "teams"] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const INTEGRATION_PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  slack: "Slack",
  teams: "Microsoft Teams",
};

/** Events a destination can subscribe to. Messages carry titles, counts and links only. */
export const INTEGRATION_EVENTS = [
  "ready_for_review",
  "needs_info",
  "submitted",
  "deadline_reminder",
  "top_match",
  "weekly_digest",
] as const;
export type IntegrationEventKind = (typeof INTEGRATION_EVENTS)[number];

export const INTEGRATION_EVENT_LABELS: Record<IntegrationEventKind, string> = {
  ready_for_review: "Application ready for review",
  needs_info: "Application needs information",
  submitted: "Application submitted",
  deadline_reminder: "Deadline reminders",
  top_match: "New top matches",
  weekly_digest: "Weekly digest",
};

/** One fixed line per event; never built from document, fact or draft text. */
export const INTEGRATION_EVENT_SUMMARIES: Record<IntegrationEventKind, string> = {
  ready_for_review: "A draft is ready. Review and approve it in Grant Autopilot.",
  needs_info: "A draft is waiting for details only your team can provide.",
  submitted: "An application was submitted.",
  deadline_reminder: "A deadline is coming up.",
  top_match: "New grant opportunities match your organization well.",
  weekly_digest: "Your weekly summary is ready.",
};

export const DEFAULT_INTEGRATION_EVENTS: IntegrationEventKind[] = [
  "ready_for_review",
  "needs_info",
  "submitted",
  "deadline_reminder",
];

export const MAX_DESTINATIONS_PER_ORG = 10;
export const MAX_DESTINATION_LABEL = 80;

export type DeliveryHealth = "ok" | "error" | null;

export interface IntegrationDestinationDto {
  id: string;
  provider: IntegrationProvider;
  label: string;
  /** Redacted URL, e.g. "hooks.slack.com/services/T0…/…abcd". The full URL is never returned. */
  urlHint: string;
  events: IntegrationEventKind[];
  enabled: boolean;
  lastStatus: DeliveryHealth;
  /** Short reason code ("http_404", "timeout", …), never a response body. */
  lastError: string | null;
  lastStatusAt: string | null;
  createdAt: string;
}

export interface SlackWorkspaceDto {
  teamId: string;
  teamDomain: string | null;
  connectedAt: string;
  linkedUsers: number;
}

export interface IntegrationsOverviewDto {
  destinations: IntegrationDestinationDto[];
  slack: {
    /** True when the deployment has SLACK_SIGNING_SECRET set (slash commands can be verified). */
    commandsConfigured: boolean;
    /** Request URL to paste into the Slack app's slash command settings. */
    commandUrl: string;
    workspaces: SlackWorkspaceDto[];
    /** The caller's own Slack link in this org, if any. */
    myLink: { teamId: string; linkedAt: string } | null;
  };
}

export interface LinkCodeDto {
  code: string;
  expiresAt: string;
  /** What to type in Slack, e.g. "/grants link ABCDE-FGHIJ". */
  command: string;
}

export interface DestinationTestResultDto {
  ok: boolean;
  status: number | null;
  error: string | null;
}
