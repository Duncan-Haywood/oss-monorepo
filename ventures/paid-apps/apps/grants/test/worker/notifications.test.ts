// In-app notifications: role fan-out, preferences, dedupe, link safety, per-user isolation and
// cross-tenant 404s, plus one wired event source (privacy export ready -> the requester).
import { env } from "cloudflare:workers";
import type { MemberRole } from "@shared/enums";
import { isSafeAppLink, type NotificationDto } from "@shared/notifications";
import { createApp } from "@worker/app";
import { createAppContext } from "@worker/context";
import { member } from "@worker/db/schema";
import { notifications } from "@worker/db/schema/notifications";
import { newId } from "@worker/lib/ids";
import { TEST_USER_HEADER } from "@worker/middleware/session";
import { requireOrg } from "@worker/middleware/tenant";
import notificationRoutes from "@worker/routes/org/notifications";
import { listForUser, notify, unreadCount } from "@worker/services/notifications";
import type { AppEnv } from "@worker/types";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type ApiInit, BASE, createTestOrg, createTestUser, testDb } from "./helpers";

// Hand-written to match db/schema/notifications.ts (`drizzle-kit export` output) until the schema is
// exported from db/schema/index.ts and lands in TEST_SCHEMA_SQL; IF NOT EXISTS keeps it harmless after.
const DDL = [
  `CREATE TABLE IF NOT EXISTS \`notifications\` (
    \`id\` text PRIMARY KEY NOT NULL, \`org_id\` text NOT NULL, \`user_id\` text NOT NULL,
    \`kind\` text NOT NULL, \`title\` text NOT NULL, \`body\` text DEFAULT '' NOT NULL, \`link\` text,
    \`severity\` text DEFAULT 'info' NOT NULL, \`dedupe_key\` text, \`read_at\` integer,
    \`created_at\` integer NOT NULL,
    FOREIGN KEY (\`org_id\`) REFERENCES \`organization\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    CONSTRAINT "notifications_link_app_path" CHECK("notifications"."link" is null or (substr("notifications"."link", 1, 1) = '/' and instr("notifications"."link", '//') = 0)),
    CONSTRAINT "notifications_severity" CHECK("notifications"."severity" in ('info', 'success', 'warning', 'action')))`,
  "CREATE INDEX IF NOT EXISTS `notifications_user_org_read_created_idx` ON `notifications` (`user_id`,`org_id`,`read_at`,`created_at`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `notifications_user_org_dedupe_uq` ON `notifications` (`user_id`,`org_id`,`dedupe_key`)",
  `CREATE TABLE IF NOT EXISTS \`notification_preferences\` (
    \`user_id\` text NOT NULL, \`org_id\` text NOT NULL, \`kind\` text NOT NULL,
    \`in_app\` integer DEFAULT true NOT NULL, \`email\` integer DEFAULT false NOT NULL,
    \`updated_at\` integer NOT NULL,
    PRIMARY KEY(\`user_id\`, \`org_id\`, \`kind\`),
    FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`org_id\`) REFERENCES \`organization\`(\`id\`) ON UPDATE no action ON DELETE cascade)`,
];

// Until app.ts mounts the router (integration pass), mount it on a test instance of the full app.
const app = createApp();
const mount = new Hono<AppEnv>();
mount.use("*", requireOrg("viewer"));
mount.route("/", notificationRoutes);
app.route("/api/orgs/:orgId/notifications", mount);

function napi(path: string, init: ApiInit = {}) {
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
    env,
  );
}

const ctx = () => createAppContext(env);

async function addMember(orgId: string, role: MemberRole, userId?: string) {
  const id = userId ?? (await createTestUser({ name: role })).id;
  await testDb()
    .insert(member)
    .values({ id: newId("mem"), organizationId: orgId, userId: id, role });
  return id;
}

/** An org with one member of every role. */
async function orgWithEveryRole() {
  const owner = await createTestUser({ name: "owner" });
  const { orgId } = await createTestOrg(owner.id, { role: "owner" });
  const users: Record<MemberRole, string> = {
    owner: owner.id,
    admin: await addMember(orgId, "admin"),
    editor: await addMember(orgId, "editor"),
    reviewer: await addMember(orgId, "reviewer"),
    viewer: await addMember(orgId, "viewer"),
  };
  return { orgId, users };
}

async function recipientsOf(orgId: string, kind: string) {
  const rows = await testDb()
    .select({ userId: notifications.userId })
    .from(notifications)
    .where(and(eq(notifications.orgId, orgId), eq(notifications.kind, kind as never)))
    .all();
  return rows.map((r) => r.userId).sort();
}

beforeAll(async () => {
  await env.DB.batch(DDL.map((s) => env.DB.prepare(s)));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notify() fan-out", () => {
  it("fans out by role group and filters explicit ids to current members", async () => {
    const { orgId, users } = await orgWithEveryRole();
    const outsider = await createTestUser();

    const admins = await notify(ctx(), {
      orgId,
      recipients: "admins",
      kind: "export.ready",
      title: "Admins only",
    });
    expect(admins.created).toBe(2);
    expect(await recipientsOf(orgId, "export.ready")).toEqual([users.owner, users.admin].sort());

    await notify(ctx(), {
      orgId,
      recipients: "editors",
      kind: "application.ready_for_review",
      title: "Editors and up",
    });
    expect(await recipientsOf(orgId, "application.ready_for_review")).toEqual(
      [users.owner, users.admin, users.editor].sort(),
    );

    await notify(ctx(), {
      orgId,
      recipients: "members",
      kind: "submission.sent",
      title: "Everyone",
    });
    expect(await recipientsOf(orgId, "submission.sent")).toEqual(Object.values(users).sort());

    const explicit = await notify(ctx(), {
      orgId,
      recipients: [users.viewer, outsider.id, users.viewer, ""],
      kind: "match.top",
      title: "Explicit list",
    });
    expect(explicit.created).toBe(1);
    expect(await recipientsOf(orgId, "match.top")).toEqual([users.viewer]);
  });

  it("is idempotent per dedupeKey and clips long text", async () => {
    const { orgId, users } = await orgWithEveryRole();
    const input = {
      orgId,
      recipients: "admins" as const,
      kind: "application.needs_info" as const,
      title: "x".repeat(500),
      body: "y".repeat(5_000),
      dedupeKey: "needs_info:app_1:ver_1",
    };
    expect((await notify(ctx(), input)).created).toBe(2);
    expect((await notify(ctx(), input)).created).toBe(0);
    const { items } = await listForUser(ctx(), { orgId, userId: users.admin });
    expect(items).toHaveLength(1);
    expect(items[0]?.title.length).toBeLessThanOrEqual(200);
    expect(items[0]?.body.length).toBeLessThanOrEqual(1_000);
    // A different event key is a new notification.
    expect((await notify(ctx(), { ...input, dedupeKey: "needs_info:app_1:ver_2" })).created).toBe(
      2,
    );
  });

  it("never throws: storage failures are logged and reported as created: 0", async () => {
    const c = ctx();
    const warn = vi.spyOn(c.logger, "warn");
    vi.spyOn(c.db, "select").mockImplementation(() => {
      throw new Error("D1 is down");
    });
    await expect(
      notify(c, { orgId: "org_missing", recipients: "members", kind: "export.ready", title: "x" }),
    ).resolves.toEqual({ created: 0 });
    expect(warn).toHaveBeenCalledWith(
      "notifications.notify_failed",
      expect.objectContaining({ kind: "export.ready" }),
    );
  });
});

describe("links", () => {
  it("accepts only app-relative paths", () => {
    for (const ok of ["/orgs/org_1/applications/app_1", "/orgs/o/opportunities?minFit=80", "/"]) {
      expect(isSafeAppLink(ok), ok).toBe(true);
    }
    for (const bad of [
      "",
      "orgs/x",
      "https://evil.example",
      "//evil.example",
      "/orgs//x",
      "/\\evil.example",
      "/\t/evil.example",
      "javascript:alert(1)",
      `/${"a".repeat(600)}`,
    ]) {
      expect(isSafeAppLink(bad), bad).toBe(false);
    }
  });

  it("drops an unsafe link (the notification is still sent) and the DB rejects one too", async () => {
    const { orgId, users } = await orgWithEveryRole();
    const c = ctx();
    const warn = vi.spyOn(c.logger, "warn");
    for (const [i, link] of [
      "//evil.example/x",
      "https://evil.example",
      "/\\evil.example",
    ].entries()) {
      await notify(c, {
        orgId,
        recipients: [users.owner],
        kind: "match.top",
        title: `bad ${i}`,
        link,
      });
    }
    await notify(c, {
      orgId,
      recipients: [users.owner],
      kind: "match.top",
      title: "good",
      link: `/orgs/${orgId}/opportunities/opp_1`,
    });
    expect(warn).toHaveBeenCalledWith("notifications.unsafe_link_dropped", expect.anything());
    const { items } = await listForUser(c, { orgId, userId: users.owner });
    const byTitle = Object.fromEntries(items.map((n) => [n.title, n.link]));
    expect(byTitle).toEqual({
      "bad 0": null,
      "bad 1": null,
      "bad 2": null,
      good: `/orgs/${orgId}/opportunities/opp_1`,
    });

    await expect(
      testDb()
        .insert(notifications)
        .values({
          id: newId("ntf"),
          orgId,
          userId: users.owner,
          kind: "match.top",
          title: "direct",
          link: "//evil.example",
        }),
    ).rejects.toThrow();
  });
});

describe("preferences", () => {
  it("defaults, updates the caller's own row per org, and notify() respects in-app off", async () => {
    const { orgId, users } = await orgWithEveryRole();
    const other = await createTestOrg(users.viewer, { role: "owner" });

    const initial = await napi(`/api/orgs/${orgId}/notifications/preferences`, {
      as: users.viewer,
    });
    expect(initial.status).toBe(200);
    const defaults = (await initial.json()) as {
      items: { kind: string; inApp: boolean; email: boolean }[];
    };
    expect(defaults.items.every((p) => p.inApp)).toBe(true);
    expect(defaults.items.find((p) => p.kind === "application.ready_for_review")?.email).toBe(true);
    expect(defaults.items.find((p) => p.kind === "match.top")?.email).toBe(false);

    const put = await napi(`/api/orgs/${orgId}/notifications/preferences`, {
      method: "PUT",
      as: users.viewer,
      json: {
        items: [
          { kind: "submission.sent", inApp: false },
          { kind: "match.top", email: true },
        ],
      },
    });
    expect(put.status).toBe(200);
    const updated = (await put.json()) as typeof defaults;
    expect(updated.items.find((p) => p.kind === "submission.sent")).toMatchObject({
      inApp: false,
      email: false,
    });
    expect(updated.items.find((p) => p.kind === "match.top")).toMatchObject({
      inApp: true,
      email: true,
    });

    // Another member's and another org's preferences are untouched.
    const ownerPrefs = (await (
      await napi(`/api/orgs/${orgId}/notifications/preferences`, { as: users.owner })
    ).json()) as typeof defaults;
    expect(ownerPrefs.items.find((p) => p.kind === "submission.sent")?.inApp).toBe(true);
    const otherOrgPrefs = (await (
      await napi(`/api/orgs/${other.orgId}/notifications/preferences`, { as: users.viewer })
    ).json()) as typeof defaults;
    expect(otherOrgPrefs.items.find((p) => p.kind === "submission.sent")?.inApp).toBe(true);

    await notify(ctx(), { orgId, recipients: "members", kind: "submission.sent", title: "Sent" });
    expect(await recipientsOf(orgId, "submission.sent")).toEqual(
      [users.owner, users.admin, users.editor, users.reviewer].sort(),
    );
    await notify(ctx(), {
      orgId: other.orgId,
      recipients: "members",
      kind: "submission.sent",
      title: "Sent",
    });
    expect(await recipientsOf(other.orgId, "submission.sent")).toEqual([users.viewer]);
  });

  it("rejects unknown kinds and empty updates", async () => {
    const { orgId, users } = await orgWithEveryRole();
    for (const json of [{ items: [{ kind: "nope", inApp: false }] }, { items: [] }, {}]) {
      const res = await napi(`/api/orgs/${orgId}/notifications/preferences`, {
        method: "PUT",
        as: users.owner,
        json,
      });
      expect(res.status).toBe(400);
    }
  });
});

describe("routes: the caller's own rows only", () => {
  async function seed() {
    const { orgId, users } = await orgWithEveryRole();
    const c = ctx();
    const start = Date.parse("2026-11-01T00:00:00Z");
    for (const [i, title] of ["one", "two", "three"].entries()) {
      c.now = () => new Date(start + i * 1_000);
      await notify(c, {
        orgId,
        recipients: "editors",
        kind: "application.ready_for_review",
        title,
        link: `/orgs/${orgId}/applications/app_${title}`,
        severity: "action",
      });
    }
    return { orgId, users };
  }

  const list = async (orgId: string, as: string, qs = "") => {
    const res = await napi(`/api/orgs/${orgId}/notifications${qs}`, { as });
    return {
      status: res.status,
      body: (await res.json()) as { items: NotificationDto[]; nextCursor: string | null },
    };
  };
  const countOf = async (orgId: string, as: string) => {
    const res = await napi(`/api/orgs/${orgId}/notifications/count`, { as });
    return ((await res.json()) as { unread: number }).unread;
  };

  it("lists newest first with cursor pagination and an unread filter, and counts unread", async () => {
    const { orgId, users } = await seed();
    const page1 = await list(orgId, users.editor, "?limit=2");
    expect(page1.status).toBe(200);
    expect(page1.body.items.map((n) => n.title)).toEqual(["three", "two"]);
    expect(page1.body.items[0]).toMatchObject({
      kind: "application.ready_for_review",
      severity: "action",
      readAt: null,
      link: `/orgs/${orgId}/applications/app_three`,
    });
    expect(page1.body.items[0]).not.toHaveProperty("userId");
    expect(page1.body.nextCursor).toBeTruthy();
    const page2 = await list(orgId, users.editor, `?limit=2&cursor=${page1.body.nextCursor}`);
    expect(page2.body.items.map((n) => n.title)).toEqual(["one"]);
    expect(page2.body.nextCursor).toBeNull();
    expect((await list(orgId, users.editor, "?cursor=%%%")).status).toBe(400);

    expect(await countOf(orgId, users.editor)).toBe(3);
    // Viewers got nothing (not in "editors") but may still use the endpoints.
    expect((await list(orgId, users.viewer)).body.items).toEqual([]);
    expect(await countOf(orgId, users.viewer)).toBe(0);

    const target = page1.body.items[1] as NotificationDto;
    const read = await napi(`/api/orgs/${orgId}/notifications/${target.id}/read`, {
      method: "POST",
      as: users.editor,
    });
    expect(read.status).toBe(200);
    expect(((await read.json()) as NotificationDto).readAt).toBeTruthy();
    expect(await countOf(orgId, users.editor)).toBe(2);
    const unread = await list(orgId, users.editor, "?unread=1");
    expect(unread.body.items.map((n) => n.title)).toEqual(["three", "one"]);
  });

  it("cannot read or mark another member's notifications", async () => {
    const { orgId, users } = await seed();
    const adminItems = (await list(orgId, users.admin)).body.items;
    const adminRow = adminItems[0] as NotificationDto;

    // The editor's list never contains the admin's rows (same event, different recipient rows).
    const editorIds = (await list(orgId, users.editor)).body.items.map((n) => n.id);
    expect(editorIds).not.toContain(adminRow.id);

    const res = await napi(`/api/orgs/${orgId}/notifications/${adminRow.id}/read`, {
      method: "POST",
      as: users.editor,
    });
    expect(res.status).toBe(404);

    const all = await napi(`/api/orgs/${orgId}/notifications/read-all`, {
      method: "POST",
      as: users.editor,
    });
    expect(await all.json()).toEqual({ updated: 3 });
    expect(await countOf(orgId, users.editor)).toBe(0);
    expect(await countOf(orgId, users.admin)).toBe(3);
    expect(await unreadCount(ctx(), { orgId, userId: users.owner })).toBe(3);
  });

  it("404s across tenants: non-members, and another org's ids via this org's route", async () => {
    const { orgId, users } = await seed();
    const stranger = await createTestUser();
    await createTestOrg(stranger.id);
    for (const path of ["", "/count", "/preferences"]) {
      const res = await napi(`/api/orgs/${orgId}/notifications${path}`, { as: stranger.id });
      expect(res.status, path).toBe(404);
    }
    const victimId = ((await list(orgId, users.editor)).body.items[0] as NotificationDto).id;
    const mark = await napi(`/api/orgs/${orgId}/notifications/${victimId}/read`, {
      method: "POST",
      as: stranger.id,
    });
    expect(mark.status).toBe(404);
    expect(
      (await napi(`/api/orgs/${orgId}/notifications/read-all`, { method: "POST", as: stranger.id }))
        .status,
    ).toBe(404);

    // The editor is also in a second org: org B's notification is invisible from org A and can't be
    // marked through org A's route.
    const orgB = await createTestOrg(users.editor, { role: "editor" });
    await notify(ctx(), {
      orgId: orgB.orgId,
      recipients: "members",
      kind: "match.top",
      title: "B",
    });
    const bId = ((await list(orgB.orgId, users.editor)).body.items[0] as NotificationDto).id;
    expect((await list(orgId, users.editor)).body.items.map((n) => n.id)).not.toContain(bId);
    const cross = await napi(`/api/orgs/${orgId}/notifications/${bId}/read`, {
      method: "POST",
      as: users.editor,
    });
    expect(cross.status).toBe(404);
    expect(await countOf(orgB.orgId, users.editor)).toBe(1);

    expect((await napi(`/api/orgs/${orgId}/notifications`)).status).toBe(401);
  });
});

describe("wired sources", () => {
  it("privacy export ready notifies only the requester", async () => {
    const { orgId, users } = await orgWithEveryRole();
    const res = await napi(`/api/orgs/${orgId}/privacy/exports`, {
      method: "POST",
      as: users.admin,
    });
    expect(res.status).toBeLessThan(300);
    const { items } = await listForUser(ctx(), { orgId, userId: users.admin });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "export.ready",
      severity: "success",
      link: `/orgs/${orgId}/settings/privacy`,
    });
    expect(await unreadCount(ctx(), { orgId, userId: users.owner })).toBe(0);
  });
});
