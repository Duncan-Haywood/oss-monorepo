// Chat integrations (OWNER: integrations): Slack / Teams notification destinations, their
// deliveries (one row per event per destination = at-most-once), and the Slack slash-command
// bindings (workspace -> org, Slack user -> member) with one-time link codes.
// Secrets (webhook URLs, Slack response_urls) are stored AES-GCM encrypted (services/integrations/crypto.ts).
import type {
  DeliveryHealth,
  IntegrationEventKind,
  IntegrationProvider,
} from "@shared/integrations";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { bool, createdAt, json, ts, updatedAt } from "./_columns";
import { organization, user } from "./auth";

export const integrationDestinations = sqliteTable(
  "integration_destinations",
  {
    id: text("id").primaryKey(), // itg_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: text("provider").$type<IntegrationProvider>().notNull(),
    label: text("label").notNull(),
    /** Encrypted webhook URL ("<keyId>.<iv>.<ciphertext>"); the URL itself is a bearer secret. */
    urlCipher: text("url_cipher").notNull(),
    /** Redacted, display-only form of the URL. */
    urlHint: text("url_hint").notNull(),
    events: json<IntegrationEventKind[]>("events").notNull(),
    enabled: bool("enabled").notNull().default(true),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    lastStatus: text("last_status").$type<DeliveryHealth>(),
    lastError: text("last_error"),
    lastStatusAt: ts("last_status_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("integration_destinations_org_idx").on(t.orgId)],
);

export type IntegrationDeliveryStatus = "pending" | "sending" | "sent" | "failed" | "skipped";

/** The event as stored for delivery: titles, counts and an app link only (see events.ts). */
export interface StoredIntegrationEvent {
  kind: IntegrationEventKind;
  title: string;
  link: string;
  counts?: { label: string; value: number }[];
}

export const integrationDeliveries = sqliteTable(
  "integration_deliveries",
  {
    id: text("id").primaryKey(), // dlv_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    destinationId: text("destination_id")
      .notNull()
      .references(() => integrationDestinations.id, { onDelete: "cascade" }),
    /** Per-event idempotency key (e.g. `review:{appId}:{versionId}`). */
    eventKey: text("event_key").notNull(),
    event: json<StoredIntegrationEvent>("event").notNull(),
    status: text("status").$type<IntegrationDeliveryStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    sentAt: ts("sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("integration_deliveries_dest_event_uq").on(t.destinationId, t.eventKey),
    index("integration_deliveries_org_created_idx").on(t.orgId, t.createdAt),
  ],
);

/** A Slack workspace (team) bound to exactly one org, via `/grants connect <code>`. */
export const slackWorkspaces = sqliteTable(
  "slack_workspaces",
  {
    teamId: text("team_id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    teamDomain: text("team_domain"),
    connectedBy: text("connected_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("slack_workspaces_org_idx").on(t.orgId)],
);

/** A Slack user in a connected workspace, linked to one member of that workspace's org. */
export const slackUserLinks = sqliteTable(
  "slack_user_links",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => slackWorkspaces.teamId, { onDelete: "cascade" }),
    slackUserId: text("slack_user_id").notNull(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.teamId, t.slackUserId] }),
    index("slack_user_links_org_user_idx").on(t.orgId, t.userId),
  ],
);

export type LinkCodePurpose = "connect" | "link";

/** One-time codes shown in the app and typed in Slack. Only the SHA-256 of the code is stored. */
export const integrationLinkCodes = sqliteTable(
  "integration_link_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    purpose: text("purpose").$type<LinkCodePurpose>().notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("integration_link_codes_org_idx").on(t.orgId)],
);

/**
 * A `/grants update` whose facts were not extracted yet when we replied: the follow-up job posts the
 * fact count to Slack's response_url (encrypted; Slack accepts it for 30 minutes).
 */
export const slackCommandReceipts = sqliteTable(
  "slack_command_receipts",
  {
    id: text("id").primaryKey(), // slr_...
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    documentId: text("document_id").notNull(),
    responseUrlCipher: text("response_url_cipher").notNull(),
    attempts: integer("attempts").notNull().default(0),
    status: text("status").$type<"waiting" | "replied" | "expired">().notNull().default("waiting"),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("slack_command_receipts_org_idx").on(t.orgId)],
);
