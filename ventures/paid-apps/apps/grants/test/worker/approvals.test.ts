// Approval policies: rule matching (first match wins), excludeAuthor, specific approvers, delegation,
// the interplay with the two-person rule (stricter wins), role checks and tenant isolation, driven
// through POST /reviews/:id/decision (submitReviewDecision) and /approval-policies.
import { env } from "cloudflare:workers";
import type { ApprovalPolicyDto, ApprovalStatusDto, DelegationDto } from "@shared/approvals";
import type { ApplicationContent } from "@shared/content";
import type { FunderType, MemberRole } from "@shared/enums";
import { createApp } from "@worker/app";
import {
  applications,
  applicationVersions,
  auditLog,
  funders,
  member,
  opportunities,
} from "@worker/db/schema";
import { notifications } from "@worker/db/schema/notifications";
import { newId } from "@worker/lib/ids";
import { TEST_USER_HEADER } from "@worker/middleware/session";
import { requireOrg } from "@worker/middleware/tenant";
import approvalPolicyRoutes from "@worker/routes/org/approval-policies";
import { pipelineDeps } from "@worker/services/pipeline/deps";
import type { AppEnv } from "@worker/types";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type ApiInit, BASE, createTestOrg, createTestUser, testDb } from "./helpers";

// Hand-written to match db/schema/approvals.ts (`drizzle-kit export` output) until the schema is
// exported from db/schema/index.ts and lands in TEST_SCHEMA_SQL; IF NOT EXISTS keeps it harmless after.
const DDL = [
  `CREATE TABLE IF NOT EXISTS \`approval_policies\` (
    \`org_id\` text PRIMARY KEY NOT NULL, \`rules\` text DEFAULT '[]' NOT NULL, \`updated_by\` text,
    \`created_at\` integer NOT NULL, \`updated_at\` integer NOT NULL,
    FOREIGN KEY (\`org_id\`) REFERENCES \`organization\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`updated_by\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE set null)`,
  `CREATE TABLE IF NOT EXISTS \`approval_delegations\` (
    \`id\` text PRIMARY KEY NOT NULL, \`org_id\` text NOT NULL, \`from_user_id\` text NOT NULL,
    \`to_user_id\` text NOT NULL, \`until\` integer NOT NULL, \`revoked_at\` integer,
    \`revoked_by\` text, \`created_by\` text, \`created_at\` integer NOT NULL,
    FOREIGN KEY (\`org_id\`) REFERENCES \`organization\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`from_user_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`to_user_id\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (\`revoked_by\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE set null,
    FOREIGN KEY (\`created_by\`) REFERENCES \`user\`(\`id\`) ON UPDATE no action ON DELETE set null)`,
  "CREATE INDEX IF NOT EXISTS `approval_delegations_org_to_idx` ON `approval_delegations` (`org_id`,`to_user_id`)",
  "CREATE INDEX IF NOT EXISTS `approval_delegations_org_from_idx` ON `approval_delegations` (`org_id`,`from_user_id`)",
];

// Until app.ts mounts the router (integration pass), mount it on a test instance of the full app.
const app = createApp();
const mount = new Hono<AppEnv>();
mount.use("*", requireOrg("viewer"));
mount.route("/", approvalPolicyRoutes);
app.route("/api/orgs/:orgId/approval-policies", mount);

function call(path: string, init: ApiInit = {}) {
  const { json, as, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("Origin", BASE);
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

type Users = Record<"owner" | "admin" | "editor" | "reviewer" | "reviewer2" | "viewer", string>;

async function addMember(orgId: string, role: MemberRole, name: string) {
  const u = await createTestUser({ name });
  await testDb()
    .insert(member)
    .values({ id: newId("mem"), organizationId: orgId, userId: u.id, role });
  return u.id;
}

/** An org with one member of every role (two reviewers). The owner starts every application. */
async function seedOrg(name = "Approvals Org") {
  const owner = await createTestUser({ name: "Olivia Owner" });
  const { orgId } = await createTestOrg(owner.id, { role: "owner", name });
  const users: Users = {
    owner: owner.id,
    admin: await addMember(orgId, "admin", "Ada Admin"),
    editor: await addMember(orgId, "editor", "Eli Editor"),
    reviewer: await addMember(orgId, "reviewer", "Rosa Reviewer"),
    reviewer2: await addMember(orgId, "reviewer", "Ken Reviewer"),
    viewer: await addMember(orgId, "viewer", "Vic Viewer"),
  };
  return { orgId, users };
}

const CONTENT: ApplicationContent = { sections: [] };

/** An application waiting in review (one_click), with one system-drafted version. */
async function seedApplication(
  orgId: string,
  createdBy: string,
  opts: {
    ask?: number | null;
    funderType?: FunderType;
    funderId?: string;
    tier?: "one_click" | "full_review";
    editedBy?: string;
  } = {},
) {
  const db = testDb();
  let funderId = opts.funderId ?? null;
  if (!funderId && opts.funderType) {
    funderId = newId("fnd");
    await db.insert(funders).values({
      id: funderId,
      name: `Funder ${funderId}`,
      normalizedName: funderId,
      type: opts.funderType,
    });
  }
  const oppId = newId("opp");
  await db.insert(opportunities).values({
    id: oppId,
    source: "manual",
    sourceId: oppId,
    funderId,
    funderName: "A Funder",
    title: "Community Grant",
    submissionMethod: "email",
    submissionEmail: "grants@funder.example.org",
  });
  const appId = newId("app");
  await db.insert(applications).values({
    id: appId,
    orgId,
    opportunityId: oppId,
    title: "Community Grant application",
    status: "in_review",
    reviewTier: opts.tier ?? "one_click",
    requestedAmountCents: opts.ask === undefined ? 1_000_000 : opts.ask,
    createdBy,
  });
  const versionId = newId("ver");
  await db.insert(applicationVersions).values({
    id: versionId,
    orgId,
    applicationId: appId,
    versionNumber: 1,
    content: CONTENT,
    authorType: opts.editedBy ? "user" : "system",
    authorId: opts.editedBy ?? null,
  });
  await db
    .update(applications)
    .set({ currentVersionId: versionId })
    .where(eq(applications.id, appId));
  return { appId, versionId, funderId };
}

type DecisionBody = { status: string; approval?: ApprovalStatusDto & { message: string } };

async function approve(orgId: string, appId: string, as: string) {
  return call(`/api/orgs/${orgId}/reviews/${appId}/decision`, {
    method: "POST",
    as,
    json: { decision: "approved" },
  });
}

async function setPolicy(orgId: string, as: string, rules: unknown[]) {
  const res = await call(`/api/orgs/${orgId}/approval-policies`, {
    method: "PUT",
    as,
    json: { rules },
  });
  return res;
}

async function status(orgId: string, appId: string, as: string): Promise<ApprovalStatusDto> {
  const res = await call(`/api/orgs/${orgId}/approval-policies/status/${appId}`, { as });
  expect(res.status).toBe(200);
  return res.json();
}

async function appStatus(appId: string) {
  const row = await testDb()
    .select({ status: applications.status })
    .from(applications)
    .where(eq(applications.id, appId))
    .get();
  return row?.status;
}

async function setTwoPersonRule(orgId: string, cents: number | null) {
  await env.DB.prepare("UPDATE org_settings SET two_person_rule_above_cents = ? WHERE org_id = ?")
    .bind(cents, orgId)
    .run();
}

const ADMINS: MemberRole[] = ["admin", "owner"];
const REVIEWERS_UP: MemberRole[] = ["reviewer", "editor", "admin", "owner"];

beforeAll(async () => {
  await env.DB.batch(DDL.map((s) => env.DB.prepare(s)));
});

beforeEach(() => {
  vi.spyOn(pipelineDeps, "submit").mockImplementation(async (_ctx, input) => {
    await testDb()
      .update(applications)
      .set({ status: "submitted", submittedAt: new Date() })
      .where(eq(applications.id, input.applicationId));
  });
  vi.spyOn(pipelineDeps, "scheduleDeadlineReminders").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("approval policy API", () => {
  it("returns the default rule when nothing is configured, and admins can save rules", async () => {
    const { orgId, users } = await seedOrg();
    const res = await call(`/api/orgs/${orgId}/approval-policies`, { as: users.viewer });
    expect(res.status).toBe(200);
    const empty = (await res.json()) as ApprovalPolicyDto;
    expect(empty.rules).toEqual([]);
    expect(empty.defaultRule.require).toMatchObject({ approvers: 1, excludeAuthor: false });
    expect(empty.defaultRule.require.roles).toEqual(expect.arrayContaining(REVIEWERS_UP));

    const saved = await setPolicy(orgId, users.admin, [
      {
        name: "Big grants",
        when: { minAmountCents: 5_000_000 },
        require: { approvers: 2, roles: ADMINS, excludeAuthor: true },
      },
    ]);
    expect(saved.status).toBe(200);
    const policy = (await saved.json()) as ApprovalPolicyDto;
    expect(policy.rules).toHaveLength(1);
    expect(policy.rules[0]?.id).toMatch(/^rule_/);
    expect(policy.updatedBy).toBe(users.admin);

    const logged = await testDb()
      .select({ action: auditLog.action, actorId: auditLog.actorId })
      .from(auditLog)
      .where(and(eq(auditLog.orgId, orgId), eq(auditLog.action, "approval_policy.updated")))
      .all();
    expect(logged).toEqual([{ action: "approval_policy.updated", actorId: users.admin }]);
  });

  it("only admins can change the policy; invalid rules are rejected", async () => {
    const { orgId, users } = await seedOrg();
    const rule = {
      name: "Any",
      when: {},
      require: { approvers: 1, roles: REVIEWERS_UP, excludeAuthor: false },
    };
    expect((await setPolicy(orgId, users.editor, [rule])).status).toBe(403);
    expect((await setPolicy(orgId, users.reviewer, [rule])).status).toBe(403);
    // 4 approvers, viewer role, min > max, fewer specific people than approvals: all 400.
    const bad = [
      { ...rule, require: { ...rule.require, approvers: 4 } },
      { ...rule, require: { ...rule.require, roles: ["viewer"] } },
      { ...rule, when: { minAmountCents: 10, maxAmountCents: 5 } },
      { ...rule, require: { ...rule.require, approvers: 2, specificUserIds: [users.admin] } },
    ];
    for (const b of bad) expect((await setPolicy(orgId, users.admin, [b])).status).toBe(400);
    // A specific approver who is a viewer can never approve.
    const viewerOnly = {
      ...rule,
      require: { ...rule.require, specificUserIds: [users.viewer] },
    };
    expect((await setPolicy(orgId, users.admin, [viewerOnly])).status).toBe(400);
  });
});

describe("submitReviewDecision with approval policies", () => {
  it("keeps the single-approver flow when no policy is configured", async () => {
    const { orgId, users } = await seedOrg();
    const { appId } = await seedApplication(orgId, users.owner);
    const res = await approve(orgId, appId, users.reviewer);
    expect(res.status).toBe(200);
    expect(((await res.json()) as DecisionBody).status).toBe("submitted");
  });

  it("matches the first rule that applies and waits for the required approvers", async () => {
    const { orgId, users } = await seedOrg();
    expect(
      (
        await setPolicy(orgId, users.admin, [
          {
            id: "big",
            name: "Big grants",
            when: { minAmountCents: 5_000_000 },
            require: { approvers: 2, roles: ADMINS, excludeAuthor: false },
          },
          {
            id: "federal",
            name: "Federal",
            when: { funderType: "federal" },
            require: { approvers: 1, roles: ADMINS, excludeAuthor: false },
          },
        ])
      ).status,
    ).toBe(200);

    // $100,000: the first rule (2 admins) wins even though the funder is federal too.
    const big = await seedApplication(orgId, users.editor, {
      ask: 10_000_000,
      funderType: "federal",
    });
    const denied = await approve(orgId, big.appId, users.reviewer);
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as { error: { code: string } }).error.code).toBe(
      "approval_not_eligible",
    );

    const first = await approve(orgId, big.appId, users.admin);
    expect(first.status).toBe(200);
    const body = (await first.json()) as DecisionBody;
    expect(body.status).toBe("in_review");
    expect(body.approval).toMatchObject({ satisfied: false, needed: 2, rule: { id: "big" } });
    expect(body.approval?.message).toBe("1 of 2 approvals. Waiting for an admin");
    expect(body.approval?.have).toEqual([{ userId: users.admin, name: "Ada Admin" }]);
    expect(await appStatus(big.appId)).toBe("in_review");

    const s = await status(orgId, big.appId, users.viewer);
    expect(s).toMatchObject({
      needed: 2,
      satisfied: false,
      missingDescription: "Waiting for an admin",
    });

    // The same admin again: 409, nothing changes.
    const again = await approve(orgId, big.appId, users.admin);
    expect(again.status).toBe(409);
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe(
      "already_approved",
    );

    // The people who can still approve were notified (the owner; not the admin who approved).
    const notified = await testDb()
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(eq(notifications.orgId, orgId))
      .all();
    expect(notified.map((n) => n.userId)).toContain(users.owner);
    expect(notified.map((n) => n.userId)).not.toContain(users.admin);

    const done = await approve(orgId, big.appId, users.owner);
    expect(((await done.json()) as DecisionBody).status).toBe("submitted");

    // $10,000 from a federal funder: the second rule (one admin).
    const federal = await seedApplication(orgId, users.editor, {
      ask: 1_000_000,
      funderType: "federal",
    });
    expect((await approve(orgId, federal.appId, users.reviewer)).status).toBe(403);
    expect(
      ((await (await approve(orgId, federal.appId, users.admin)).json()) as DecisionBody).status,
    ).toBe("submitted");

    // $10,000 from a foundation: no rule matches, so the default (any reviewer) applies.
    const small = await seedApplication(orgId, users.editor, {
      ask: 1_000_000,
      funderType: "foundation",
    });
    expect(
      ((await (await approve(orgId, small.appId, users.reviewer)).json()) as DecisionBody).status,
    ).toBe("submitted");

    // Unknown ask: treated as above every threshold, so the "big grants" rule applies.
    const unknown = await seedApplication(orgId, users.editor, { ask: null });
    expect((await status(orgId, unknown.appId, users.viewer)).rule.id).toBe("big");
  });

  it("excludeAuthor: neither the person who started it nor a human editor can approve", async () => {
    const { orgId, users } = await seedOrg();
    await setPolicy(orgId, users.admin, [
      {
        name: "Four eyes",
        when: {},
        require: { approvers: 1, roles: REVIEWERS_UP, excludeAuthor: true },
      },
    ]);
    const { appId } = await seedApplication(orgId, users.owner, { editedBy: users.reviewer });
    expect((await approve(orgId, appId, users.owner)).status).toBe(403);
    expect((await approve(orgId, appId, users.reviewer)).status).toBe(403);
    const s = await status(orgId, appId, users.viewer);
    expect(s.missingDescription).toBe("Waiting for a reviewer or above who didn't write the draft");
    const ok = await approve(orgId, appId, users.reviewer2);
    expect(((await ok.json()) as DecisionBody).status).toBe("submitted");
  });

  it("specific approvers: only the named people can approve", async () => {
    const { orgId, users } = await seedOrg();
    await setPolicy(orgId, users.admin, [
      {
        name: "Rosa signs",
        when: { tier: "one_click" },
        require: {
          approvers: 1,
          roles: ADMINS,
          specificUserIds: [users.reviewer],
          excludeAuthor: false,
        },
      },
    ]);
    const { appId } = await seedApplication(orgId, users.editor);
    expect((await status(orgId, appId, users.viewer)).missingDescription).toBe(
      "Waiting for Rosa Reviewer",
    );
    // Roles are ignored when specific people are named: the admin cannot approve.
    expect((await approve(orgId, appId, users.admin)).status).toBe(403);
    const ok = await approve(orgId, appId, users.reviewer);
    expect(((await ok.json()) as DecisionBody).status).toBe("submitted");

    // The rule targets one-click reviews only: a full review falls back to the default.
    const full = await seedApplication(orgId, users.editor, { tier: "full_review" });
    expect((await status(orgId, full.appId, users.viewer)).rule.id).toBe("default");
  });
});

describe("delegation", () => {
  async function rosaOnlyOrg() {
    const o = await seedOrg();
    await setPolicy(o.orgId, o.users.admin, [
      {
        name: "Rosa signs",
        when: {},
        require: {
          approvers: 1,
          roles: REVIEWERS_UP,
          specificUserIds: [o.users.reviewer],
          excludeAuthor: false,
        },
      },
    ]);
    return o;
  }
  const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

  it("lets a delegate approve on the delegator's behalf, until it is revoked", async () => {
    const { orgId, users } = await rosaOnlyOrg();
    const created = await call(`/api/orgs/${orgId}/approval-policies/delegations`, {
      method: "POST",
      as: users.reviewer,
      json: { fromUserId: users.reviewer, toUserId: users.reviewer2, until: inDays(7) },
    });
    expect(created.status).toBe(201);
    const dlg = (await created.json()) as DelegationDto;
    expect(dlg).toMatchObject({ fromName: "Rosa Reviewer", toName: "Ken Reviewer" });

    const list = await call(`/api/orgs/${orgId}/approval-policies/delegations`, {
      as: users.viewer,
    });
    expect(((await list.json()) as { items: DelegationDto[] }).items.map((d) => d.id)).toEqual([
      dlg.id,
    ]);

    const a1 = await seedApplication(orgId, users.editor);
    const ok = await approve(orgId, a1.appId, users.reviewer2);
    expect(((await ok.json()) as DecisionBody).status).toBe("submitted");

    // Revoked: Ken's approval no longer counts.
    const revoked = await call(`/api/orgs/${orgId}/approval-policies/delegations/${dlg.id}`, {
      method: "DELETE",
      as: users.reviewer,
    });
    expect(revoked.status).toBe(200);
    const a2 = await seedApplication(orgId, users.editor);
    expect((await approve(orgId, a2.appId, users.reviewer2)).status).toBe(403);

    const actions = await testDb()
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(and(eq(auditLog.orgId, orgId), eq(auditLog.targetId, dlg.id)))
      .all();
    expect(actions.map((a) => a.action).sort()).toEqual([
      "approval.delegation_created",
      "approval.delegation_revoked",
    ]);
  });

  it("counts the delegator and the delegate as one approval", async () => {
    const { orgId, users } = await seedOrg();
    await setPolicy(orgId, users.admin, [
      {
        name: "Two named",
        when: {},
        require: {
          approvers: 2,
          roles: REVIEWERS_UP,
          specificUserIds: [users.reviewer, users.admin],
          excludeAuthor: false,
        },
      },
    ]);
    await call(`/api/orgs/${orgId}/approval-policies/delegations`, {
      method: "POST",
      as: users.reviewer,
      json: { fromUserId: users.reviewer, toUserId: users.reviewer2, until: inDays(3) },
    });
    const { appId } = await seedApplication(orgId, users.editor);
    const r1 = (await (await approve(orgId, appId, users.reviewer)).json()) as DecisionBody;
    expect(r1.approval?.message).toBe("1 of 2 approvals. Waiting for Ada Admin");
    // Ken stands in for Rosa, who already approved: his approval can't add a second one.
    expect((await approve(orgId, appId, users.reviewer2)).status).toBe(403);
    const r2 = (await (await approve(orgId, appId, users.admin)).json()) as DecisionBody;
    expect(r2.status).toBe("submitted");
  });

  it("shows who approved on whose behalf", async () => {
    const { orgId, users } = await seedOrg();
    await setPolicy(orgId, users.admin, [
      {
        name: "Two named",
        when: {},
        require: {
          approvers: 2,
          roles: REVIEWERS_UP,
          specificUserIds: [users.reviewer, users.admin],
          excludeAuthor: false,
        },
      },
    ]);
    // An admin sets up a delegation for someone else (out of office).
    const res = await call(`/api/orgs/${orgId}/approval-policies/delegations`, {
      method: "POST",
      as: users.admin,
      json: { fromUserId: users.reviewer, toUserId: users.reviewer2, until: inDays(3) },
    });
    expect(res.status).toBe(201);
    const { appId } = await seedApplication(orgId, users.editor);
    await approve(orgId, appId, users.reviewer2);
    const s = await status(orgId, appId, users.viewer);
    expect(s.have).toEqual([
      {
        userId: users.reviewer2,
        name: "Ken Reviewer",
        onBehalfOf: { userId: users.reviewer, name: "Rosa Reviewer" },
      },
    ]);
  });

  it("validates who may delegate, to whom and for how long", async () => {
    const { orgId, users } = await seedOrg();
    const post = (as: string, json: Record<string, unknown>) =>
      call(`/api/orgs/${orgId}/approval-policies/delegations`, { method: "POST", as, json });
    const base = { fromUserId: users.reviewer, toUserId: users.reviewer2, until: inDays(5) };
    // Someone else's authority: only admins.
    expect((await post(users.editor, base)).status).toBe(403);
    // Viewers can't delegate at all (route role) nor receive.
    expect((await post(users.viewer, { ...base, fromUserId: users.viewer })).status).toBe(403);
    expect((await post(users.reviewer, { ...base, toUserId: users.viewer })).status).toBe(400);
    expect((await post(users.reviewer, { ...base, toUserId: users.reviewer })).status).toBe(400);
    expect((await post(users.reviewer, { ...base, until: inDays(-1) })).status).toBe(400);
    expect((await post(users.reviewer, { ...base, until: inDays(120) })).status).toBe(400);
    // Someone not involved can't end it (an admin can).
    const dlg = (await (await post(users.reviewer, base)).json()) as DelegationDto;
    const del = (as: string) =>
      call(`/api/orgs/${orgId}/approval-policies/delegations/${dlg.id}`, {
        method: "DELETE",
        as,
      });
    expect((await del(users.editor)).status).toBe(403);
    expect((await del(users.admin)).status).toBe(200);
  });
});

describe("two-person rule interplay", () => {
  it("raises the default rule to two people above the threshold", async () => {
    const { orgId, users } = await seedOrg();
    await setTwoPersonRule(orgId, 500_000);
    const { appId } = await seedApplication(orgId, users.owner, { ask: 1_000_000 });
    const first = (await (await approve(orgId, appId, users.reviewer)).json()) as DecisionBody;
    expect(first.status).toBe("in_review");
    expect(first.approval).toMatchObject({ needed: 2, twoPersonRule: true });
    const second = (await (await approve(orgId, appId, users.reviewer2)).json()) as DecisionBody;
    expect(second.status).toBe("submitted");

    // Below the threshold one approval is enough.
    const small = await seedApplication(orgId, users.owner, { ask: 400_000 });
    const one = (await (await approve(orgId, small.appId, users.reviewer)).json()) as DecisionBody;
    expect(one.status).toBe("submitted");
  });

  it("uses the stricter of the policy and the two-person rule", async () => {
    const { orgId, users } = await seedOrg();
    await setTwoPersonRule(orgId, 500_000);
    await setPolicy(orgId, users.admin, [
      {
        id: "three",
        name: "Three reviewers",
        when: { minAmountCents: 5_000_000 },
        require: { approvers: 3, roles: REVIEWERS_UP, excludeAuthor: false },
      },
      {
        id: "one-admin",
        name: "One admin",
        when: {},
        require: { approvers: 1, roles: ADMINS, excludeAuthor: false },
      },
    ]);
    // Policy says 3, two-person rule says 2: 3.
    const big = await seedApplication(orgId, users.editor, { ask: 6_000_000 });
    expect(await status(orgId, big.appId, users.viewer)).toMatchObject({
      needed: 3,
      twoPersonRule: true,
    });
    // Policy says 1 admin, two-person rule says 2 people: 2 admins.
    const mid = await seedApplication(orgId, users.editor, { ask: 1_000_000 });
    const s = await status(orgId, mid.appId, users.viewer);
    expect(s).toMatchObject({ needed: 2, rule: { id: "one-admin" } });
    expect(s.missingDescription).toBe("Waiting for 2 more admins");
    expect((await approve(orgId, mid.appId, users.reviewer)).status).toBe(403);
    await approve(orgId, mid.appId, users.admin);
    const done = (await (await approve(orgId, mid.appId, users.owner)).json()) as DecisionBody;
    expect(done.status).toBe("submitted");
  });
});

describe("role checks and tenant isolation", () => {
  it("viewers cannot approve; other orgs cannot read or use this org's policy", async () => {
    const a = await seedOrg("Org A");
    const b = await seedOrg("Org B");
    await setPolicy(a.orgId, a.users.admin, [
      {
        name: "A rule",
        when: {},
        require: { approvers: 2, roles: REVIEWERS_UP, excludeAuthor: false },
      },
    ]);
    const { appId } = await seedApplication(a.orgId, a.users.owner);
    expect((await approve(a.orgId, appId, a.users.viewer)).status).toBe(403);

    // Org B's admin: 404 on org A's routes, and org A's application through org B's router.
    expect(
      (await call(`/api/orgs/${a.orgId}/approval-policies`, { as: b.users.admin })).status,
    ).toBe(404);
    expect(
      (await call(`/api/orgs/${b.orgId}/approval-policies/status/${appId}`, { as: b.users.admin }))
        .status,
    ).toBe(404);
    expect((await approve(b.orgId, appId, b.users.admin)).status).toBe(404);

    // Org B's policy is its own (empty), and can't name org A's members.
    const bPolicy = (await (
      await call(`/api/orgs/${b.orgId}/approval-policies`, { as: b.users.viewer })
    ).json()) as ApprovalPolicyDto;
    expect(bPolicy.rules).toEqual([]);
    const cross = await setPolicy(b.orgId, b.users.admin, [
      {
        name: "Cross",
        when: {},
        require: {
          approvers: 1,
          roles: REVIEWERS_UP,
          specificUserIds: [a.users.reviewer],
          excludeAuthor: false,
        },
      },
    ]);
    expect(cross.status).toBe(400);

    // Delegations: can't delegate to another org's member; can't see or end another org's.
    const inA = await call(`/api/orgs/${a.orgId}/approval-policies/delegations`, {
      method: "POST",
      as: a.users.reviewer,
      json: {
        fromUserId: a.users.reviewer,
        toUserId: a.users.reviewer2,
        until: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    const dlg = (await inA.json()) as DelegationDto;
    const toOutsider = await call(`/api/orgs/${b.orgId}/approval-policies/delegations`, {
      method: "POST",
      as: b.users.reviewer,
      json: {
        fromUserId: b.users.reviewer,
        toUserId: a.users.reviewer2,
        until: new Date(Date.now() + 86_400_000).toISOString(),
      },
    });
    expect(toOutsider.status).toBe(400);
    const bList = (await (
      await call(`/api/orgs/${b.orgId}/approval-policies/delegations`, { as: b.users.admin })
    ).json()) as { items: DelegationDto[] };
    expect(bList.items).toEqual([]);
    expect(
      (
        await call(`/api/orgs/${b.orgId}/approval-policies/delegations/${dlg.id}`, {
          method: "DELETE",
          as: b.users.admin,
        })
      ).status,
    ).toBe(404);

    // Org A's application still needs its two approvals (org B changed nothing).
    expect(await status(a.orgId, appId, a.users.viewer)).toMatchObject({ needed: 2, have: [] });
  });
});
