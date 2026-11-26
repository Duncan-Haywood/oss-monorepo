// Integrations end to end in workerd: destinations (role checks, SSRF-safe URLs, encryption at rest,
// cross-tenant 404s), notify() fan-out with at-most-once delivery and retries, and the Slack slash
// command (signature, replay window, workspace/user linking, proposed facts for the linked org only).
import { env } from "cloudflare:workers";
import type { MemberRole } from "@shared/enums";
import type {
  IntegrationDestinationDto,
  IntegrationsOverviewDto,
  LinkCodeDto,
} from "@shared/integrations";
import { createApp } from "@worker/app";
import { createAppContext } from "@worker/context";
import { documents, facts, member } from "@worker/db/schema";
import {
  integrationDeliveries,
  integrationDestinations,
  slackCommandReceipts,
  slackUserLinks,
  slackWorkspaces,
} from "@worker/db/schema/integrations";
import type { Env } from "@worker/env";
import { newId } from "@worker/lib/ids";
import { contextMiddleware } from "@worker/middleware/context";
import { TEST_USER_HEADER } from "@worker/middleware/session";
import { requireOrg } from "@worker/middleware/tenant";
import integrationsPublicRoutes from "@worker/routes/integrations-public";
import integrationRoutes from "@worker/routes/org/integrations";
import {
  encryptSecret,
  integrationOutbox,
  sendIntegrationEvent,
  setIntegrationTransport,
  signSlackRequest,
  slackUpdateFollowup,
} from "@worker/services/integrations";
import { receiptAad } from "@worker/services/integrations/slack-command";
import { notify } from "@worker/services/notifications";
import type { AppEnv } from "@worker/types";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type ApiInit, BASE, createTestOrg, createTestUser, testDb } from "./helpers";
// Built at runtime so no Slack-webhook-shaped literal is committed (GitHub push protection).
const FAKE_SLACK_SECRET = "abcd" + "efghijklmnopqrstuvwx";

// Generated with `drizzle-kit export` from db/schema/integrations.ts; needed until the schema is
// exported from db/schema/index.ts and lands in TEST_SCHEMA_SQL (IF NOT EXISTS keeps it harmless).
const DDL = [
  "CREATE TABLE IF NOT EXISTS `integration_deliveries` (`id` text PRIMARY KEY NOT NULL, `org_id` text NOT NULL, `destination_id` text NOT NULL, `event_key` text NOT NULL, `event` text NOT NULL, `status` text DEFAULT 'pending' NOT NULL, `attempts` integer DEFAULT 0 NOT NULL, `last_error` text, `sent_at` integer, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`destination_id`) REFERENCES `integration_destinations`(`id`) ON UPDATE no action ON DELETE cascade)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `integration_deliveries_dest_event_uq` ON `integration_deliveries` (`destination_id`,`event_key`)",
  "CREATE INDEX IF NOT EXISTS `integration_deliveries_org_created_idx` ON `integration_deliveries` (`org_id`,`created_at`)",
  "CREATE TABLE IF NOT EXISTS `integration_destinations` (`id` text PRIMARY KEY NOT NULL, `org_id` text NOT NULL, `provider` text NOT NULL, `label` text NOT NULL, `url_cipher` text NOT NULL, `url_hint` text NOT NULL, `events` text NOT NULL, `enabled` integer DEFAULT true NOT NULL, `created_by` text, `last_status` text, `last_error` text, `last_status_at` integer, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null)",
  "CREATE INDEX IF NOT EXISTS `integration_destinations_org_idx` ON `integration_destinations` (`org_id`)",
  "CREATE TABLE IF NOT EXISTS `integration_link_codes` (`code_hash` text PRIMARY KEY NOT NULL, `org_id` text NOT NULL, `user_id` text NOT NULL, `purpose` text NOT NULL, `expires_at` integer NOT NULL, `used_at` integer, `created_at` integer NOT NULL, FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade)",
  "CREATE INDEX IF NOT EXISTS `integration_link_codes_org_idx` ON `integration_link_codes` (`org_id`)",
  "CREATE TABLE IF NOT EXISTS `slack_command_receipts` (`id` text PRIMARY KEY NOT NULL, `org_id` text NOT NULL, `document_id` text NOT NULL, `response_url_cipher` text NOT NULL, `attempts` integer DEFAULT 0 NOT NULL, `status` text DEFAULT 'waiting' NOT NULL, `expires_at` integer NOT NULL, `created_at` integer NOT NULL, FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade)",
  "CREATE INDEX IF NOT EXISTS `slack_command_receipts_org_idx` ON `slack_command_receipts` (`org_id`)",
  "CREATE TABLE IF NOT EXISTS `slack_user_links` (`team_id` text NOT NULL, `slack_user_id` text NOT NULL, `org_id` text NOT NULL, `user_id` text NOT NULL, `created_at` integer NOT NULL, PRIMARY KEY(`team_id`, `slack_user_id`), FOREIGN KEY (`team_id`) REFERENCES `slack_workspaces`(`team_id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade)",
  "CREATE INDEX IF NOT EXISTS `slack_user_links_org_user_idx` ON `slack_user_links` (`org_id`,`user_id`)",
  "CREATE TABLE IF NOT EXISTS `slack_workspaces` (`team_id` text PRIMARY KEY NOT NULL, `org_id` text NOT NULL, `team_domain` text, `connected_by` text, `created_at` integer NOT NULL, FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`connected_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null)",
  "CREATE INDEX IF NOT EXISTS `slack_workspaces_org_idx` ON `slack_workspaces` (`org_id`)",
];

const SLACK_SECRET = "slack-signing-secret-for-tests-0123";
const testEnv = { ...env, SLACK_SIGNING_SECRET: SLACK_SECRET } as Env;

// Until app.ts mounts the routers (integration pass): the org router on the full app, and the
// public router the way app.ts will mount it (before the Origin check, session and JSON body rule).
const app = createApp();
const mount = new Hono<AppEnv>();
mount.use("*", requireOrg("viewer"));
mount.route("/", integrationRoutes);
app.route("/api/orgs/:orgId/integrations", mount);

const pub = new Hono<AppEnv>();
pub.use("*", contextMiddleware);
pub.route("/api/integrations", integrationsPublicRoutes);

function iapi(path: string, init: ApiInit = {}) {
  const { json, as, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set("Content-Type", "application/json");
  if (as) headers.set(TEST_USER_HEADER, as);
  return app.fetch(
    new Request(`${BASE}${path}`, {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    }),
    testEnv,
  );
}

const ctx = () => createAppContext(testEnv);
const nowSec = () => Math.floor(Date.now() / 1000);

async function slack(
  fields: Record<string, string>,
  opts: { secret?: string; ts?: number; tamper?: boolean; noSig?: boolean } = {},
) {
  const body = new URLSearchParams({
    token: "deprecated",
    team_domain: "acme",
    command: "/grants",
    response_url: "https://hooks.slack.com/commands/T1/1/abc",
    ...fields,
  }).toString();
  const headers = new Headers({ "Content-Type": "application/x-www-form-urlencoded" });
  if (!opts.noSig) {
    const signed = await signSlackRequest(opts.secret ?? SLACK_SECRET, body, opts.ts ?? nowSec());
    for (const [k, v] of Object.entries(signed)) headers.set(k, v);
  }
  const res = await pub.fetch(
    new Request(`${BASE}/api/integrations/slack/command`, {
      method: "POST",
      headers,
      body: opts.tamper ? body.replace("update", "update%20TAMPERED") : body,
    }),
    testEnv,
  );
  return { res, json: (await res.json()) as { response_type: string; text: string } };
}

async function addMember(orgId: string, role: MemberRole) {
  const u = await createTestUser({ name: `${role} person` });
  await testDb()
    .insert(member)
    .values({ id: newId("mem"), organizationId: orgId, userId: u.id, role });
  return u.id;
}

async function orgWithRoles(name = "Org") {
  const owner = await createTestUser({ name: "Owner Person" });
  const { orgId } = await createTestOrg(owner.id, { role: "owner", name });
  return {
    orgId,
    owner: owner.id,
    admin: await addMember(orgId, "admin"),
    editor: await addMember(orgId, "editor"),
    viewer: await addMember(orgId, "viewer"),
  };
}

const SLACK_URL = `https://hooks.slack.com/services/T0ACME001/B0ACME001/${FAKE_SLACK_SECRET}`;
const TEAMS_URL =
  "https://default0a1b2c3d.d1.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/abc123/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=SIGabc123";

async function addDestination(
  orgId: string,
  as: string,
  body: Partial<{ provider: string; label: string; url: string; events: string[] }> = {},
) {
  return iapi(`/api/orgs/${orgId}/integrations/destinations`, {
    method: "POST",
    as,
    json: {
      provider: "slack",
      label: "#grants",
      url: SLACK_URL,
      events: ["ready_for_review", "needs_info", "top_match"],
      ...body,
    },
  });
}

beforeAll(async () => {
  await env.DB.batch(DDL.map((s) => env.DB.prepare(s)));
});

beforeEach(() => {
  integrationOutbox.length = 0;
});

afterEach(() => {
  setIntegrationTransport(null);
});

describe("destinations", () => {
  it("admins add Slack and Teams destinations; the URL is encrypted and never returned", async () => {
    const o = await orgWithRoles();
    const res = await addDestination(o.orgId, o.admin);
    expect(res.status).toBe(201);
    const dto = (await res.json()) as IntegrationDestinationDto;
    expect(dto.urlHint).toContain("hooks.slack.com");
    expect(JSON.stringify(dto)).not.toContain("abcdefghijklmnopqrstuvwx");

    const row = await testDb()
      .select()
      .from(integrationDestinations)
      .where(eq(integrationDestinations.id, dto.id))
      .get();
    expect(row?.urlCipher).toBeTruthy();
    expect(row?.urlCipher).not.toContain("hooks.slack.com");

    const teams = await addDestination(o.orgId, o.owner, {
      provider: "teams",
      label: "Grants channel",
      url: TEAMS_URL,
    });
    expect(teams.status).toBe(201);

    const list = (await (
      await iapi(`/api/orgs/${o.orgId}/integrations`, { as: o.viewer })
    ).json()) as IntegrationsOverviewDto;
    expect(list.destinations.map((d) => d.provider).sort()).toEqual(["slack", "teams"]);
    expect(JSON.stringify(list)).not.toContain("SIGabc123");
    expect(list.slack.commandsConfigured).toBe(true);
    expect(list.slack.commandUrl).toBe(`${BASE}/api/integrations/slack/command`);
  });

  it("enforces roles: editors and viewers cannot manage destinations", async () => {
    const o = await orgWithRoles();
    expect((await addDestination(o.orgId, o.editor)).status).toBe(403);
    expect((await addDestination(o.orgId, o.viewer)).status).toBe(403);
    const created = (await (
      await addDestination(o.orgId, o.admin)
    ).json()) as IntegrationDestinationDto;
    const path = `/api/orgs/${o.orgId}/integrations/destinations/${created.id}`;
    expect(
      (await iapi(path, { method: "PATCH", as: o.editor, json: { enabled: false } })).status,
    ).toBe(403);
    expect((await iapi(path, { method: "DELETE", as: o.editor })).status).toBe(403);
    expect((await iapi(`${path}/test`, { method: "POST", as: o.editor })).status).toBe(403);
    expect(
      (
        await iapi(`/api/orgs/${o.orgId}/integrations/slack/connect-code`, {
          method: "POST",
          as: o.editor,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await iapi(`/api/orgs/${o.orgId}/integrations/slack/link-code`, {
          method: "POST",
          as: o.viewer,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await iapi(`/api/orgs/${o.orgId}/integrations/slack/link-code`, {
          method: "POST",
          as: o.editor,
        })
      ).status,
    ).toBe(201);
  });

  it("rejects non-provider and internal URLs (SSRF) with a clear error", async () => {
    const o = await orgWithRoles();
    for (const [provider, url] of [
      [
        "slack",
        `https://hooks.slack.com.evil.example/services/T0ACME001/B0ACME001/${FAKE_SLACK_SECRET}`,
      ],
      ["slack", "http://169.254.169.254/latest/meta-data/"],
      ["slack", "https://127.0.0.1/services/T0ACME001/B0ACME001/abcdefghijklmnopqrstuvwx"],
      ["slack", TEAMS_URL],
      ["teams", "https://contoso.webhook.office.com/webhookb2/abc/IncomingWebhook/def/ghi"],
      ["teams", "https://localhost/workflows/x/triggers/manual?sig=1"],
      ["teams", SLACK_URL],
    ]) {
      const res = await addDestination(o.orgId, o.admin, { provider, url });
      expect(res.status, url).toBe(400);
      const err = (await res.json()) as { error: { code: string } };
      expect(err.error.code).toBe("invalid_webhook_url");
    }
    const rows = await testDb()
      .select()
      .from(integrationDestinations)
      .where(eq(integrationDestinations.orgId, o.orgId))
      .all();
    expect(rows).toHaveLength(0);
  });

  it("another org's admin gets 404 for this org's destinations and workspaces", async () => {
    const a = await orgWithRoles("A");
    const b = await orgWithRoles("B");
    const created = (await (
      await addDestination(a.orgId, a.admin)
    ).json()) as IntegrationDestinationDto;
    for (const [method, path] of [
      ["PATCH", `/api/orgs/${b.orgId}/integrations/destinations/${created.id}`],
      ["DELETE", `/api/orgs/${b.orgId}/integrations/destinations/${created.id}`],
      ["POST", `/api/orgs/${b.orgId}/integrations/destinations/${created.id}/test`],
    ] as const) {
      const res = await iapi(path, {
        method,
        as: b.admin,
        json: method === "PATCH" ? { enabled: false } : undefined,
      });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    // Non-members of A cannot even see A's integrations.
    expect((await iapi(`/api/orgs/${a.orgId}/integrations`, { as: b.admin })).status).toBe(404);
    const still = await testDb()
      .select()
      .from(integrationDestinations)
      .where(eq(integrationDestinations.id, created.id))
      .get();
    expect(still?.enabled).toBe(true);
  });

  it("Test sends a fixed message, and removing a destination deletes it", async () => {
    const o = await orgWithRoles();
    const created = (await (
      await addDestination(o.orgId, o.admin)
    ).json()) as IntegrationDestinationDto;
    const res = await iapi(`/api/orgs/${o.orgId}/integrations/destinations/${created.id}/test`, {
      method: "POST",
      as: o.admin,
    });
    expect(await res.json()).toEqual({ ok: true, status: 200, error: null });
    expect(integrationOutbox).toHaveLength(1);
    expect(integrationOutbox[0]?.url).toBe(SLACK_URL);
    const del = await iapi(`/api/orgs/${o.orgId}/integrations/destinations/${created.id}`, {
      method: "DELETE",
      as: o.admin,
    });
    expect(del.status).toBe(204);
    const list = (await (
      await iapi(`/api/orgs/${o.orgId}/integrations`, { as: o.admin })
    ).json()) as IntegrationsOverviewDto;
    expect(list.destinations).toHaveLength(0);
  });
});

describe("notify() fan-out to Slack / Teams", () => {
  it("delivers subscribed events once per event, with titles and links only", async () => {
    const o = await orgWithRoles();
    await addDestination(o.orgId, o.admin); // ready_for_review, needs_info, top_match
    await addDestination(o.orgId, o.admin, {
      provider: "teams",
      url: TEAMS_URL,
      events: ["submitted"],
    });
    const input = {
      orgId: o.orgId,
      recipients: "editors" as const,
      kind: "application.ready_for_review" as const,
      title: "Ready for review: Youth Fund 2027",
      body: "CONFIDENTIAL budget narrative: we served 9,999 people",
      link: `/orgs/${o.orgId}/applications/app_x`,
      severity: "action" as const,
      dedupeKey: "review:app_x:ver_1",
    };
    await notify(ctx(), input);
    await notify(ctx(), input); // retried step: no second message
    expect(integrationOutbox).toHaveLength(1);
    const sent = JSON.stringify(integrationOutbox[0]?.body);
    expect(integrationOutbox[0]?.url).toBe(SLACK_URL);
    expect(sent).toContain("Youth Fund 2027");
    expect(sent).toContain(`${BASE}/orgs/${o.orgId}/applications/app_x`);
    expect(sent).not.toContain("CONFIDENTIAL");
    expect(sent).not.toContain("9,999");

    // Not subscribed anywhere -> nothing; export.ready is never a chat event.
    await notify(ctx(), { ...input, kind: "export.ready", dedupeKey: "export:1" });
    expect(integrationOutbox).toHaveLength(1);

    // The Teams destination gets only "submitted", as an Adaptive Card.
    await notify(ctx(), {
      ...input,
      kind: "submission.sent",
      title: "Submitted: Youth Fund 2027",
      dedupeKey: "submitted:sub_1",
    });
    expect(integrationOutbox).toHaveLength(2);
    const card = integrationOutbox[1]?.body as {
      attachments: { contentType: string; content: { type: string } }[];
    };
    expect(card.attachments[0]?.contentType).toBe("application/vnd.microsoft.card.adaptive");
    expect(card.attachments[0]?.content.type).toBe("AdaptiveCard");

    const rows = await testDb()
      .select()
      .from(integrationDeliveries)
      .where(eq(integrationDeliveries.orgId, o.orgId))
      .all();
    expect(rows.map((r) => r.status).sort()).toEqual(["sent", "sent"]);
  });

  it("never sends another org's events, and drops links outside the org", async () => {
    const a = await orgWithRoles("A");
    const b = await orgWithRoles("B");
    await addDestination(a.orgId, a.admin);
    await notify(ctx(), {
      orgId: b.orgId,
      recipients: "editors",
      kind: "application.needs_info",
      title: "B's app",
      link: `/orgs/${b.orgId}/applications/app_b`,
      dedupeKey: "needs_info:app_b:v1",
    });
    expect(integrationOutbox).toHaveLength(0);
    const r = await sendIntegrationEvent(ctx(), a.orgId, {
      kind: "needs_info",
      title: "x",
      link: `/orgs/${b.orgId}/applications/app_b`,
      dedupeKey: "k1",
    });
    expect(r.queued).toBe(0);
  });

  it("retries 5xx/429 with backoff, fails permanently on 4xx, and disables a removed webhook", async () => {
    const o = await orgWithRoles();
    await addDestination(o.orgId, o.admin);
    const statuses = [503, 429, 200];
    const seen: number[] = [];
    setIntegrationTransport(async () => {
      const s = statuses.shift() ?? 200;
      seen.push(s);
      return s === 200
        ? { kind: "ok", status: 200 }
        : { kind: "retry", status: s, error: `http_${s}` };
    });
    await sendIntegrationEvent(ctx(), o.orgId, {
      kind: "top_match",
      title: "3 new top matches",
      link: `/orgs/${o.orgId}/opportunities`,
      dedupeKey: "top_match:opp_1",
    });
    expect(seen).toEqual([503, 429, 200]);
    const ok = await testDb()
      .select()
      .from(integrationDeliveries)
      .where(
        and(
          eq(integrationDeliveries.orgId, o.orgId),
          eq(integrationDeliveries.eventKey, "top_match:opp_1"),
        ),
      )
      .get();
    expect(ok?.status).toBe("sent");
    expect(ok?.attempts).toBe(3);

    let calls = 0;
    setIntegrationTransport(async () => {
      calls++;
      return { kind: "fail", status: 404, error: "http_404" };
    });
    await sendIntegrationEvent(ctx(), o.orgId, {
      kind: "top_match",
      title: "Another",
      link: `/orgs/${o.orgId}/opportunities`,
      dedupeKey: "top_match:opp_2",
    });
    expect(calls).toBe(1);
    const dest = await testDb()
      .select()
      .from(integrationDestinations)
      .where(eq(integrationDestinations.orgId, o.orgId))
      .get();
    expect(dest?.enabled).toBe(false);
    expect(dest?.lastError).toBe("http_404");

    // A timeout is ambiguous: never retried (at most once).
    calls = 0;
    await testDb()
      .update(integrationDestinations)
      .set({ enabled: true })
      .where(eq(integrationDestinations.orgId, o.orgId));
    setIntegrationTransport(async () => {
      calls++;
      return { kind: "fail", status: null, error: "timeout" };
    });
    await sendIntegrationEvent(ctx(), o.orgId, {
      kind: "top_match",
      title: "Timeout",
      link: `/orgs/${o.orgId}/opportunities`,
      dedupeKey: "top_match:opp_3",
    });
    expect(calls).toBe(1);
  });
});

async function connectedOrg(name = "Org") {
  const o = await orgWithRoles(name);
  const teamId = `T${newId("org").slice(4, 14).toUpperCase()}`;
  const code = (await (
    await iapi(`/api/orgs/${o.orgId}/integrations/slack/connect-code`, {
      method: "POST",
      as: o.admin,
    })
  ).json()) as LinkCodeDto;
  expect(code.command).toBe(`/grants connect ${code.code}`);
  const connect = await slack({
    team_id: teamId,
    user_id: "UADMIN01",
    text: `connect ${code.code}`,
  });
  expect(connect.res.status).toBe(200);
  expect(connect.json.text).toContain("Connected");
  return { ...o, teamId };
}

async function linkSlackUser(orgId: string, userId: string, teamId: string, slackUserId: string) {
  const code = (await (
    await iapi(`/api/orgs/${orgId}/integrations/slack/link-code`, { method: "POST", as: userId })
  ).json()) as LinkCodeDto;
  return slack({ team_id: teamId, user_id: slackUserId, text: `link ${code.code.toLowerCase()}` });
}

const UPDATE =
  "We served 1,240 families in Gallup in 2025. Our new food pantry program opened in March 2026 with 12 volunteers.";

describe("Slack slash command", () => {
  it("verifies the signature: valid ok, tampered / wrong secret / replayed / unsigned 401", async () => {
    const o = await connectedOrg();
    const ok = await slack({ team_id: o.teamId, user_id: "UADMIN01", text: "help" });
    expect(ok.res.status).toBe(200);
    expect(ok.json.response_type).toBe("ephemeral");
    expect(ok.json.text).toContain("/grants update");

    const fields = { team_id: o.teamId, user_id: "UADMIN01", text: `update ${UPDATE}` };
    expect((await slack(fields, { tamper: true })).res.status).toBe(401);
    expect((await slack(fields, { secret: "not-the-secret" })).res.status).toBe(401);
    expect((await slack(fields, { ts: nowSec() - 6 * 60 })).res.status).toBe(401);
    expect((await slack(fields, { noSig: true })).res.status).toBe(401);
    const docs = await testDb().select().from(documents).where(eq(documents.orgId, o.orgId)).all();
    expect(docs).toHaveLength(0);
  });

  it("unknown workspace -> 404 (after the signature check)", async () => {
    const res = await slack({ team_id: "TUNKNOWN99", user_id: "U1", text: `update ${UPDATE}` });
    expect(res.res.status).toBe(404);
    expect(res.json.text).toContain("isn't connected");
  });

  it("an update creates PROPOSED facts in the linked org only, and replies with the count", async () => {
    const a = await connectedOrg("A");
    const b = await orgWithRoles("B");
    const linked = await linkSlackUser(a.orgId, a.editor, a.teamId, "UEDITOR1");
    expect(linked.json.text).toContain("Linked");

    const res = await slack({ team_id: a.teamId, user_id: "UEDITOR1", text: `update ${UPDATE}` });
    expect(res.res.status).toBe(200);
    const m = res.json.text.match(/Got it — (\d+) facts? proposed for review/);
    expect(m, res.json.text).not.toBeNull();
    const n = Number(m?.[1]);
    expect(n).toBeGreaterThan(0);
    expect(res.json.text).toContain(`${BASE}/orgs/${a.orgId}/knowledge/facts`);

    const docs = await testDb().select().from(documents).where(eq(documents.orgId, a.orgId)).all();
    expect(docs).toHaveLength(1);
    expect(docs[0]?.kind).toBe("update_note");
    expect(docs[0]?.uploadedBy).toBe(a.editor);
    const aFacts = await testDb().select().from(facts).where(eq(facts.orgId, a.orgId)).all();
    expect(aFacts.length).toBe(n);
    expect(aFacts.every((f) => f.status === "proposed")).toBe(true);
    expect(aFacts.every((f) => f.sourceDocumentId === docs[0]?.id)).toBe(true);
    expect(await testDb().select().from(facts).where(eq(facts.orgId, b.orgId)).all()).toHaveLength(
      0,
    );
    expect(
      await testDb().select().from(documents).where(eq(documents.orgId, b.orgId)).all(),
    ).toHaveLength(0);

    // A replay of the same text inside the window reuses the document (no second extraction).
    const again = await slack({ team_id: a.teamId, user_id: "UEDITOR1", text: `update ${UPDATE}` });
    expect(again.res.status).toBe(200);
    expect(
      await testDb().select().from(documents).where(eq(documents.orgId, a.orgId)).all(),
    ).toHaveLength(1);
  });

  it("the queued follow-up posts the fact count to response_url exactly once", async () => {
    const o = await connectedOrg();
    await linkSlackUser(o.orgId, o.editor, o.teamId, "UEDITOR2");
    await slack({ team_id: o.teamId, user_id: "UEDITOR2", text: `update ${UPDATE}` });
    const doc = await testDb().select().from(documents).where(eq(documents.orgId, o.orgId)).get();
    const receiptId = "slr_test_1";
    await testDb()
      .insert(slackCommandReceipts)
      .values({
        id: receiptId,
        orgId: o.orgId,
        documentId: doc?.id ?? "",
        responseUrlCipher: await encryptSecret(
          testEnv,
          "https://hooks.slack.com/commands/T1/1/abc",
          receiptAad(o.orgId, receiptId),
        ),
        expiresAt: new Date(Date.now() + 60_000),
      });
    integrationOutbox.length = 0;
    const job = { type: "integrations.slack_followup" as const, orgId: o.orgId, receiptId };
    await slackUpdateFollowup(ctx(), job);
    await slackUpdateFollowup(ctx(), job);
    expect(integrationOutbox).toHaveLength(1);
    expect(integrationOutbox[0]?.url).toBe("https://hooks.slack.com/commands/T1/1/abc");
    expect(JSON.stringify(integrationOutbox[0]?.body)).toMatch(/proposed for review/);
    // The wrong org cannot drive another org's receipt.
    await slackUpdateFollowup(ctx(), { ...job, orgId: "org_other" });
    expect(integrationOutbox).toHaveLength(1);
  });

  it("requires a linked Slack user with editor access who is still a member", async () => {
    const o = await connectedOrg();
    const unlinked = await slack({
      team_id: o.teamId,
      user_id: "USTRANGER",
      text: `update ${UPDATE}`,
    });
    expect(unlinked.json.text).toContain("Link your Slack account first");

    // Viewers cannot even get a link code; a viewer linked earlier (then demoted) is refused.
    await linkSlackUser(o.orgId, o.editor, o.teamId, "UDEMOTED");
    await testDb()
      .update(member)
      .set({ role: "viewer" })
      .where(and(eq(member.organizationId, o.orgId), eq(member.userId, o.editor)));
    const demoted = await slack({
      team_id: o.teamId,
      user_id: "UDEMOTED",
      text: `update ${UPDATE}`,
    });
    expect(demoted.json.text).toContain("needs editor access");

    await testDb()
      .delete(member)
      .where(and(eq(member.organizationId, o.orgId), eq(member.userId, o.editor)));
    const removed = await slack({
      team_id: o.teamId,
      user_id: "UDEMOTED",
      text: `update ${UPDATE}`,
    });
    expect(removed.json.text).toContain("no longer a member");
    const link = await testDb()
      .select()
      .from(slackUserLinks)
      .where(and(eq(slackUserLinks.teamId, o.teamId), eq(slackUserLinks.slackUserId, "UDEMOTED")))
      .get();
    expect(link).toBeUndefined();
    expect(
      await testDb().select().from(documents).where(eq(documents.orgId, o.orgId)).all(),
    ).toHaveLength(0);
  });

  it("codes are single-use, purpose-bound and org-bound", async () => {
    const a = await connectedOrg("A");
    const b = await orgWithRoles("B");
    // B's member code cannot link into A's workspace.
    const bCode = (await (
      await iapi(`/api/orgs/${b.orgId}/integrations/slack/link-code`, {
        method: "POST",
        as: b.editor,
      })
    ).json()) as LinkCodeDto;
    const cross = await slack({ team_id: a.teamId, user_id: "UB1", text: `link ${bCode.code}` });
    expect(cross.json.text).toContain("not valid");

    const aCode = (await (
      await iapi(`/api/orgs/${a.orgId}/integrations/slack/link-code`, {
        method: "POST",
        as: a.editor,
      })
    ).json()) as LinkCodeDto;
    // A link code is not a connect code.
    const wrongPurpose = await slack({
      team_id: "TOTHER0001",
      user_id: "U9",
      text: `connect ${aCode.code}`,
    });
    expect(wrongPurpose.json.text).toContain("not valid");
    expect(
      (await slack({ team_id: a.teamId, user_id: "UA1", text: `link ${aCode.code}` })).json.text,
    ).toContain("Linked");
    expect(
      (await slack({ team_id: a.teamId, user_id: "UA2", text: `link ${aCode.code}` })).json.text,
    ).toContain("not valid");

    // B's admin cannot take over A's workspace.
    const bConnect = (await (
      await iapi(`/api/orgs/${b.orgId}/integrations/slack/connect-code`, {
        method: "POST",
        as: b.admin,
      })
    ).json()) as LinkCodeDto;
    const takeover = await slack({
      team_id: a.teamId,
      user_id: "UB2",
      text: `connect ${bConnect.code}`,
    });
    expect(takeover.json.text).toContain("already connected to another");
    const ws = await testDb()
      .select()
      .from(slackWorkspaces)
      .where(eq(slackWorkspaces.teamId, a.teamId))
      .get();
    expect(ws?.orgId).toBe(a.orgId);
  });

  it("admins see and disconnect workspaces; other orgs get 404", async () => {
    const a = await connectedOrg("A");
    const b = await orgWithRoles("B");
    const overview = (await (
      await iapi(`/api/orgs/${a.orgId}/integrations`, { as: a.admin })
    ).json()) as IntegrationsOverviewDto;
    expect(overview.slack.workspaces.map((w) => w.teamId)).toEqual([a.teamId]);
    expect(overview.slack.myLink?.teamId).toBe(a.teamId);
    expect(
      (
        await iapi(`/api/orgs/${b.orgId}/integrations/slack/workspaces/${a.teamId}`, {
          method: "DELETE",
          as: b.admin,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await iapi(`/api/orgs/${a.orgId}/integrations/slack/workspaces/${a.teamId}`, {
          method: "DELETE",
          as: a.editor,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await iapi(`/api/orgs/${a.orgId}/integrations/slack/workspaces/${a.teamId}`, {
          method: "DELETE",
          as: a.admin,
        })
      ).status,
    ).toBe(204);
    const after = await slack({ team_id: a.teamId, user_id: "UADMIN01", text: `update ${UPDATE}` });
    expect(after.res.status).toBe(404);
  });
});
