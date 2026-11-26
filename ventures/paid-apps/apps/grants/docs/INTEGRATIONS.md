# Slack and Microsoft Teams integrations

Charity staff spend their day in Slack or Teams, so Grant Autopilot posts notifications there and
accepts quick updates from Slack. Approvals still happen in the app.

- Code: `src/worker/services/integrations/**`, `db/schema/integrations.ts`,
  `routes/org/integrations.ts` (`/api/orgs/:orgId/integrations`), `routes/integrations-public.ts`
  (`POST /api/integrations/slack/command`), the settings page
  `src/client/routes/org/settings/integrations.tsx`, and contracts in `src/shared/integrations.ts`.
- Tests: `services/integrations/integrations.test.ts` (unit) and `test/worker/integrations.test.ts`
  (workerd).

## What was checked against the vendor docs (2026-11-19)

| Topic | What we found | Source |
| --- | --- | --- |
| Slack request signing | Headers `X-Slack-Signature` and `X-Slack-Request-Timestamp`. Base string `v0:{timestamp}:{raw body}`, HMAC-SHA256 keyed with the signing secret, hex digest, prefix `v0=`. Compare in constant time. Reject timestamps more than 5 minutes from local time. The unit test checks Slack's own published example. | docs.slack.dev/authentication/verifying-requests-from-slack |
| Slack slash commands | Sent as `application/x-www-form-urlencoded` with `team_id`, `user_id`, `text`, `response_url`, etc. Must be acknowledged with HTTP 200 within 3 seconds. `response_type: "ephemeral"` (the default) replies only to the caller. The page does not state `response_url` limits; we rely on Slack's long-standing 30-minute limit. | docs.slack.dev/interactivity/implementing-slash-commands |
| Slack incoming webhooks | `https://hooks.slack.com/services/{team}/{service}/{secret}`, JSON `text` plus Block Kit `blocks`. Success is `200 ok`. Errors include `invalid_payload`, `no_service`, `channel_not_found` and `channel_is_archived`, mostly as 4xx. The URL is a secret. | docs.slack.dev/messaging/sending-messages-using-incoming-webhooks |
| Slack OAuth v2 ("Add to Slack") | `slack.com/oauth/v2/authorize` with `client_id`, `scope`, optional `redirect_uri` and `state` (verify it). The `code` is exchanged with `oauth.v2.access` within 10 minutes and the response carries `team.id`. An app without public distribution can only be installed in its own workspace (`invalid_team_for_non_distributed_app`). | docs.slack.dev/authentication/installing-with-oauth |
| Teams connectors | **Office 365 Connectors (including connector-based Incoming Webhooks) were retired in May 2026.** Microsoft recommends the Workflows app ("When a Teams webhook request is received", template "Send webhook alerts to a channel") or a bot. Workflows accept Adaptive Card and MessageCard payloads (28 KB max, about 4 requests per second). Workflows belong to the user who created them, so add co-owners. | learn.microsoft.com/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook (updated 2026-10-28) |
| Teams Workflows URL hosts | New trigger URLs use `https://{env}.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/{id}/triggers/manual/paths/invoke?api-version=1&…&sig=…`. Older ones use `https://{region}.logic.azure.com:443/workflows/{id}/triggers/manual/paths/invoke?api-version=2016-06-01&…&sig=…`. Third-party write-ups (Microsoft message MC1181996, topedia, classmethod) say the logic.azure.com URLs were due to stop on 2025-11-30. Microsoft has no primary page that documents the new format in full. | see "Limitations" |

## Setup

### Slack notifications (incoming webhook)

1. At api.slack.com/apps, open the Grant Autopilot app (see the slash command setup below) or any app
   in your workspace. Turn on **Incoming Webhooks**, click **Add New Webhook**, and pick the channel.
2. In Grant Autopilot, an admin opens **Settings → Integrations → Add a channel**, chooses Slack,
   pastes the URL, picks events, and clicks **Test**.

### Teams notifications (Workflows)

1. In the Teams channel, choose **More options (…) → Workflows**, then the template **Send webhook
   alerts to a channel**. Pick the team and channel, save, and copy the webhook link.
2. In Grant Autopilot, add it as a Microsoft Teams channel, then click **Test**. Add a co-owner to
   the workflow so it keeps working if its creator leaves.

### Slack quick updates (`/grants`)

1. **Once per deployment:** create a Slack app from the manifest on the settings page (the slash
   command `/grants` points at `{APP_URL}/api/integrations/slack/command`, with scopes `commands` and
   `incoming-webhook`). Install it and set its signing secret with
   `wrangler secret put SLACK_SIGNING_SECRET`.
2. **Connect the workspace (admin):** under Settings → Integrations, choose **Create a connect
   code**, then type `/grants connect ABCDE-FGHJK` in Slack. This binds the Slack `team_id` to the
   org.
3. **Link each person (editor or above):** choose **Link my Slack account**, then type
   `/grants link ABCDE-FGHJK` in Slack.
4. **Use it:** type `/grants update We opened a second pantry in March and served 300 families.`
   Slack replies only to you: "Got it — N facts proposed for review", with a link to the facts page.

Codes are 10 characters (50 bits), single-use, valid for 15 minutes, and stored only as a SHA-256
hash. A new code replaces the person's previous one.

## How it works

**Outbound.** `notify()` (services/notifications) now also calls
`forwardNotificationToIntegrations()`. That maps `application.ready_for_review`,
`application.needs_info`, `submission.sent` and `match.top` to chat events. It uses the notification's
title and link only and **drops `body`**. `sendIntegrationEvent(ctx, orgId, event)` writes one
`integration_deliveries` row per subscribed destination. The unique `(destination_id, event_key)`
index means a retried workflow step or a second `notify()` call sends nothing new. It then queues
`integrations.deliver { orgId, deliveryId }`, which carries ids only.

The job claims the row (`pending → sending`), decrypts the URL, validates it again and renders the
message:

- Slack: Block Kit with a header, title, count fields, an app link and an "approvals happen in the
  app" note.
- Teams: an Adaptive Card 1.4 with an `Action.OpenUrl` button.

The job POSTs with a 10-second timeout and `redirect: "manual"`, then handles the response:

| Response | What happens |
| --- | --- |
| 2xx | Marked `sent`. |
| 429, 5xx or a connection error | Retried with backoff (15 s to 300 s), up to 5 attempts. |
| Other 4xx | Marked `failed`. A 404 or 410 means the webhook was deleted, so the destination is paused. |
| Timeout | Not retried, because the provider may already have posted it. |

Destination health (`lastStatus`, `lastError` as a code such as `http_404`) appears on the settings
page. Provider response bodies are never stored or logged.

**Inbound.** The signature is verified over the raw body before anything is parsed. Then:

1. `team_id` must belong to a connected workspace, otherwise 404.
2. The Slack user must be linked.
3. The linked member's **current** role must be editor or above. This is checked on every command,
   and a removed member's link is deleted.

The text (10 to 4,000 characters) goes to the company-updates module
(`services/updates#createQuickUpdate`, the same path as `POST /updates`). That module creates an
`update_note` document, and extraction proposes facts. When extraction is still queued, we reply at
once and the `integrations.slack_followup` job posts the count to Slack's `response_url` later. That
URL is checked to be `hooks.slack.com/commands/…`, stored encrypted, and expires after 30 minutes.

## Security model

- **Approvals stay in the app (v1).** Chat messages link to the review screen and carry no
  approve, confirm or submit buttons:
  - approving sends money-relevant text to a funder, so the approver should see the whole draft,
    its citations and flags, signed in as themselves;
  - anyone in a channel can click a chat button, and chat messages get forwarded and screenshotted;
  - a button would need its own signed, expiring, single-use, per-user authorization, plus an
    audit trail as good as the in-app one (see the roadmap).

  Slack updates create only **proposed** facts. Nothing is auto-confirmed, and autopilot still
  requires every cited fact to be confirmed (ARCHITECTURE.md, "Anti-fabrication").
- **No content in chat.** A message is built from a fixed label and summary per event, a title, whole
  numbers and an app link. Nothing else is rendered: no document text, fact statements, drafts,
  interview answers or `notify()` bodies.
  - The weekly digest sends counts only, never the gap questions or the facts.
  - Titles are cleaned to a single line of at most 150 characters with control and zero-width
    characters removed, and `scheme://` is broken up so a title is not clickable.
  - On Slack, `<`, `>` and `&` are escaped, which neutralizes `<!channel>` and `<url|text>`.
  - On Teams, characters that start markdown links or emphasis are removed.
  - The app link must pass `isSafeAppLink` and point inside the org.
- **SSRF.** Slack destinations must be exactly `hooks.slack.com/services/{T}/{B}/{secret}`. Teams
  destinations must be a subdomain of `powerplatform.com` (which covers
  `*.environment.api.powerplatform.com`) or `logic.azure.com`, with a `/workflows/…/triggers/…` path
  and a `sig`. Both must use https on the default port with no credentials or fragment, and the
  shared `assertSafeUrl` guard also runs (private and loopback IPs, internal TLDs, wildcard DNS).
  Office 365 connector hosts are refused with an explanation. Redirects are never followed, and the
  URL is validated again before every send.
- **Secrets at rest.** Webhook URLs and response URLs are encrypted with AES-256-GCM through
  WebCrypto. The key is HKDF-SHA-256 of `INTEGRATIONS_KEY`, or `AUTH_SECRET` when that is unset. The
  ciphertext is `"{keyId}.{iv}.{ct}"`, and its additional data binds it to its org and row id. The
  API returns only a redacted hint, and queue messages carry ids only. Setting `INTEGRATIONS_KEY`
  later does not strand older rows, because `as1` rows still decrypt with `AUTH_SECRET`. Re-encrypting
  them is a manual step for now.
- **Replay.** The signature window is 5 minutes. Within it, a replayed update with the same text
  reuses the existing document (deduplicated by SHA-256), and codes are single-use.
- **Tenancy.** Every query filters by the tenant's `orgId`. Another org's destination or workspace
  ids return 404. A workspace binds to exactly one org, and another org's connect code gets "already
  connected". A link code works only in the workspace of its own org.
- **Roles.**
  - Any member can read the settings page, where URLs are redacted.
  - Destinations, connect codes and disconnecting a workspace need admin or above.
  - Link codes and `/grants update` need editor or above.
  - Anyone can unlink themselves.
- **Audit.** These actions write `audit_log` rows (metadata has no text):
  `integration.destination_added`, `integration.destination_updated`,
  `integration.destination_removed`, `integration.slack_connected`,
  `integration.slack_user_linked`, `integration.slack_disconnected`, `integration.slack_update`,
  plus the `document.uploaded` row written by ingestion.

## Limitations (v1)

- **One Slack app per deployment** (`SLACK_SIGNING_SECRET`). It works for a dedicated or self-hosted
  deployment, or for workspaces where the operator installed the app. Multi-workspace SaaS
  distribution needs the OAuth install flow (roadmap).
- **No email-based user linking.** Looking up a Slack user's email needs a bot token with
  `users:read.email`, which needs OAuth. Users link with one-time codes instead.
- **No Teams inbound.** Updates from Teams need a bot (roadmap).
- **Teams hosts and formats are partly unverified.** Microsoft has no primary page that fully
  documents the new URL format. Government clouds (`*.logic.azure.us`, `*.powerplatform.us`) and
  GovSlack (`slack-gov.com`) are not accepted yet.
- **Chat clients may still autolink bare domains in titles.** A title like "evil.example" can become a
  link even though `scheme://` is defanged. The titles come from our own catalog or the org's own
  imports.
- **Timeouts drop the message.** A delivery that times out is marked failed and not retried, to keep
  at-most-once delivery.
- **No retention sweep yet.** Delivery rows and receipts are kept until a sweep deletes them
  (suggested: 90 days for deliveries, 1 day for receipts).

## Roadmap

1. **Slack app with "Add to Slack" (OAuth v2).** Add the authorize redirect with a signed `state`
   (orgId, userId, nonce, expiry) and a callback that exchanges the code with `oauth.v2.access`. The
   callback binds `team.id` (or `enterprise.id`), stores the bot token encrypted, and can create the
   incoming webhook (`incoming-webhook` scope). That replaces connect codes and adds email user
   linking (`users.lookupByEmail`).
2. **Teams bot** (Bot Framework or the Microsoft 365 Agents Toolkit) for proactive messages and a
   `grants update` message extension, with Entra ID user mapping.
3. **Approve in Slack, safely.** Use signed one-time links rather than buttons. Each link is an HMAC
   token bound to the application version, the user and the action, expires in about 15 minutes, and
   is single-use. It opens an in-app confirmation page that shows the draft summary and flags and
   needs a live session. The audit row records the channel. Never one-click from the chat message.
4. Per-destination digest timing, a delivery log in the UI, and Teams government clouds.

## Integration pass (not applied: foundation files)

Each change below goes into a file owned by the foundation or another module. Until they are applied,
tests mount the routers and create the tables themselves.

```diff
# src/worker/db/schema/index.ts
+export * from "./integrations";
```

```diff
# src/worker/app.ts
+import integrationsPublicRoutes from "./routes/integrations-public";
+import integrationRoutes from "./routes/org/integrations";
 ...
   app.route("/api/billing/webhook", billingWebhookRoutes);
+  // Slack-signed (SLACK_SIGNING_SECRET); outside the Origin check and session.
+  app.route("/api/integrations", integrationsPublicRoutes);
 ...
   org.route("/notifications", notificationRoutes);
+  org.route("/integrations", integrationRoutes);
```

```diff
# src/worker/middleware/request-limits.ts (BODY_RULES, before the default JSON rule)
+  // Slack slash commands: signed form posts (application/x-www-form-urlencoded).
+  {
+    name: "slack_command",
+    path: /^\/api\/integrations\/slack\/command$/,
+    methods: ["POST"],
+    maxBytes: 16 * 1024,
+    requireJson: false,
+  },
```

```diff
# src/worker/env.ts (Secrets)
+  /** Signing secret of the Slack app that owns the /grants slash command. */
+  SLACK_SIGNING_SECRET?: string;
+  /** Optional dedicated key for encrypting integration secrets (falls back to AUTH_SECRET). */
+  INTEGRATIONS_KEY?: string;
```

After this, `services/integrations/env.ts#integrationEnv` can be inlined as `ctx.env`.

```diff
# src/worker/queues/messages.ts
+  | { type: "integrations.deliver"; orgId: string; deliveryId: string } // integrations: one chat delivery
+  | { type: "integrations.slack_followup"; orgId: string; receiptId: string } // integrations: fact count to Slack

# src/worker/queues/handlers.ts
+import * as integrations from "../services/integrations/jobs";
 ...
+  "integrations.deliver": integrations.deliverIntegration,
+  "integrations.slack_followup": integrations.slackUpdateFollowup,
```

After this, `services/integrations/queue.ts` can call `enqueue()` and drop its cast.

```diff
# src/worker/lib/ids.ts (IdPrefix), optional; services/integrations/ids.ts then uses newId directly
+  | "itg" | "dlv" | "slr"
```

```diff
# src/worker/services/digest/send.ts: weekly digest and deadline reminders to chat
+import { deadlineReminderEvent, sendIntegrationEvent, weeklyDigestEvent } from "../integrations";
 ...sendWeeklyDigests, right after the `digestIsEmpty(digest)` check:
+      await sendIntegrationEvent(ctx, orgId, weeklyDigestEvent(digest)); // dedupe weekly:{week}
 ...sendDeadlineNudges, first line inside `for (const d of due) {`:
+    await sendIntegrationEvent(
+      ctx,
+      d.orgId,
+      deadlineReminderEvent({
+        orgId: d.orgId,
+        applicationId: d.id,
+        title: d.title,
+        daysLeft: daysUntil(d.deadline, now),
+        threshold: d.days,
+      }),
+    ); // dedupe deadline:{appId}:{days}; never throws
```

```diff
# src/client/router.tsx
+import { IntegrationsSettingsPage } from "./routes/org/settings/integrations";
 ...
+    r("/settings/integrations", IntegrationsSettingsPage),

# src/client/routes/org/settings/settings-nav.tsx (TABS, after "Privacy & data"; import Plug from lucide-react)
+  {
+    label: "Integrations",
+    path: "integrations",
+    to: "/orgs/$orgId/settings/integrations",
+    icon: Plug,
+  },
```

After this, remove the `as SettingsTab` cast in `integrations.tsx`.

Also:

- **Secrets.** Run `wrangler secret put SLACK_SIGNING_SECRET`, and optionally
  `wrangler secret put INTEGRATIONS_KEY` (32 or more random bytes). There are no binding changes.
- **Migration.** Six tables: `integration_destinations`, `integration_deliveries`,
  `slack_workspaces`, `slack_user_links`, `integration_link_codes`, `slack_command_receipts`. They all
  have `org_id` with `ON DELETE CASCADE`, so `tenantTables()` covers export and deletion once the
  index exports them.
- **Tests.** Delete the hand-written `DDL` block in `test/worker/integrations.test.ts` once the
  schema is exported.
- **Docs.** Add an integrations row to the MODULES.md and ARCHITECTURE.md ownership tables.
