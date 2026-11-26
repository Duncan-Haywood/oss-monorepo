// Funder relationship tracker: auto-linking (match, application, award, prospect), stage rules,
// timeline merge, contacts/interactions CRUD with roles, privacy export + deletion of contacts,
// next-step reminders and cross-tenant isolation.
import { env } from "cloudflare:workers";
import type {
  FunderContactDto,
  FunderDetailResponse,
  FunderListResponse,
  FunderRelationDto,
} from "@shared/api/funders";
import type { ApplicationStatus } from "@shared/enums";
import { createAppContext } from "@worker/context";
import {
  applications,
  auditLog,
  funders,
  member,
  notifications,
  opportunities,
  opportunityMatches,
} from "@worker/db/schema";
import { awards } from "@worker/db/schema/awards";
import {
  orgFunderContacts,
  orgFunderInteractions,
  orgFunderRelations,
} from "@worker/db/schema/funder-relations";
import { funderProfiles, orgProspects } from "@worker/db/schema/prospects";
import type { Env } from "@worker/env";
import { newId } from "@worker/lib/ids";
import { runDueNextSteps } from "@worker/services/funders-crm";
import { deleteOrganizationData } from "@worker/services/privacy/deletion";
import { buildOrgExport } from "@worker/services/privacy/export";
import { tenantTables } from "@worker/services/privacy/tenant-tables";
import { and, eq } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { api, createTestUser, setupTenant, testDb } from "./helpers";

// Until the integration pass adds awards.ts to db/schema/index.ts, TEST_SCHEMA_SQL lacks these
// tables. IF NOT EXISTS keeps this a no-op afterwards. DDL = `drizzle-kit export` of awards.ts.
const AWARDS_DDL = [
  "CREATE TABLE IF NOT EXISTS `awards` ( `id` text PRIMARY KEY NOT NULL, `org_id` text NOT NULL, `application_id` text, `project_id` text, `title` text NOT NULL, `funder_name` text NOT NULL, `amount_cents` integer, `start_date` text, `end_date` text, `grant_number` text, `terms_notes` text DEFAULT '' NOT NULL, `fact_id` text, `created_by` text, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null, FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null )",
  "CREATE INDEX IF NOT EXISTS `awards_org_idx` ON `awards` (`org_id`,`created_at`)",
  "CREATE UNIQUE INDEX IF NOT EXISTS `awards_org_app_uq` ON `awards` (`org_id`,`application_id`)",
  "CREATE TABLE IF NOT EXISTS `award_reports` ( `id` text PRIMARY KEY NOT NULL, `org_id` text NOT NULL, `award_id` text NOT NULL, `kind` text NOT NULL, `period_start` text NOT NULL, `period_end` text NOT NULL, `due_at` integer NOT NULL, `status` text DEFAULT 'upcoming' NOT NULL, `version_content` text, `version_number` integer DEFAULT 0 NOT NULL, `grounding_report` text, `flags` text DEFAULT '[]' NOT NULL, `checkin_interview_ids` text DEFAULT '[]' NOT NULL, `submitted_at` integer, `submitted_ref` text, `submitted_by` text, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`award_id`) REFERENCES `awards`(`id`) ON UPDATE no action ON DELETE cascade, FOREIGN KEY (`submitted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null )",
];

beforeAll(async () => {
  await env.DB.batch(AWARDS_DDL.map((s) => env.DB.prepare(s)));
});

const ctx = () => createAppContext(env as unknown as Env);
const db = () => testDb();

async function seedFunder(name: string) {
  const id = newId("fnd");
  const normalizedName = `${name.toLowerCase()} ${id}`.replace(/[^a-z0-9]+/g, " ").trim();
  await db()
    .insert(funders)
    .values({ id, name: `${name} ${id}`, normalizedName, type: "foundation" });
  return { id, name: `${name} ${id}`, normalizedName };
}

async function seedOpportunity(
  funder: { id: string; name: string },
  over: Partial<typeof opportunities.$inferInsert> = {},
) {
  const id = newId("opp");
  await db()
    .insert(opportunities)
    .values({
      id,
      source: "manual",
      sourceId: id,
      funderId: funder.id,
      funderName: funder.name,
      title: `Youth program grant ${id}`,
      status: "posted",
      closeDate: new Date(Date.now() + 30 * 86_400_000),
      ...over,
    });
  return id;
}

async function seedApplication(
  orgId: string,
  opportunityId: string,
  status: ApplicationStatus,
  over: Partial<typeof applications.$inferInsert> = {},
) {
  const id = newId("app");
  await db()
    .insert(applications)
    .values({ id, orgId, opportunityId, title: "Youth program", status, ...over });
  return id;
}

async function list(orgId: string, as: string, query = "") {
  const res = await api(`/api/orgs/${orgId}/funders${query}`, { as });
  expect(res.status).toBe(200);
  return (await res.json()) as FunderListResponse;
}

async function detail(orgId: string, id: string, as: string) {
  const res = await api(`/api/orgs/${orgId}/funders/${id}`, { as });
  expect(res.status).toBe(200);
  return (await res.json()) as FunderDetailResponse;
}

const post = (path: string, as: string, json: unknown) => api(path, { method: "POST", as, json });
const patch = (path: string, as: string, json: unknown) => api(path, { method: "PATCH", as, json });

describe("funders: auto-linking", () => {
  it("links a funder when a match is shortlisted, then follows applications to applied / funded", async () => {
    const t = await setupTenant();
    const f = await seedFunder("Mesa Community Fund");
    const opp = await seedOpportunity(f);
    await db()
      .insert(opportunityMatches)
      .values({ id: newId("mat"), orgId: t.orgId, opportunityId: opp, status: "shortlisted" });

    let res = await list(t.orgId, t.userId);
    expect(res.items).toHaveLength(1);
    const rel = res.items[0] as FunderListResponse["items"][number];
    expect(rel).toMatchObject({
      funderId: f.id,
      stage: "cultivating",
      origin: "match",
      stageSource: "auto",
    });
    expect(res.counts.cultivating).toBe(1);

    const appId = await seedApplication(t.orgId, opp, "submitted");
    res = await list(t.orgId, t.userId);
    expect(res.items).toHaveLength(1); // same relation, not a second one
    expect(res.items[0]).toMatchObject({ id: rel.id, stage: "applied", applicationCount: 1 });

    await db()
      .update(applications)
      .set({ status: "awarded", awardedAmountCents: 2_500_000, outcomeAt: new Date() })
      .where(eq(applications.id, appId));
    res = await list(t.orgId, t.userId);
    expect(res.items[0]).toMatchObject({ stage: "funded", awardedCents: 2_500_000 });

    const audits = await db()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, t.orgId), eq(auditLog.action, "funder_relation.auto_linked")));
    expect(audits).toHaveLength(1);
  });

  it("creates a relation from an application alone, and only declined applications mean declined", async () => {
    const t = await setupTenant();
    const f = await seedFunder("Juniper Trust");
    const opp = await seedOpportunity(f);
    await seedApplication(t.orgId, opp, "declined");
    const res = await list(t.orgId, t.userId);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      funderId: f.id,
      origin: "application",
      stage: "declined",
    });
  });

  it("links a manual award by funder name and marks it funded", async () => {
    const t = await setupTenant();
    const f = await seedFunder("Red Rock Foundation");
    await db()
      .insert(awards)
      .values({
        id: `awd_${newId("org").slice(4)}`,
        orgId: t.orgId,
        title: "After-school tutoring",
        funderName: f.name,
        amountCents: 1_000_000,
      });
    const res = await list(t.orgId, t.userId);
    expect(res.items).toHaveLength(1);
    // The name matched the catalog funder, so the relation is linked to it.
    expect(res.items[0]).toMatchObject({
      origin: "award",
      stage: "funded",
      funderId: f.id,
      awardedCents: 1_000_000,
    });
  });

  it("links a prospect marked researching (not a new one) with its EIN and 990-PF giving", async () => {
    const t = await setupTenant();
    const ein = String(Math.floor(100_000_000 + Math.random() * 899_999_999));
    const ein2 = String(Number(ein) + 1)
      .padStart(9, "0")
      .slice(0, 9);
    for (const [e, name] of [
      [ein, "Pinon Family Foundation"],
      [ein2, "Untouched Foundation"],
    ] as const) {
      await db()
        .insert(funderProfiles)
        .values({
          ein: e,
          source: "propublica",
          name,
          totalGivingCents: 180_000_000,
          latestFilingYear: 2024,
          propublicaUrl: `https://projects.propublica.org/nonprofits/organizations/${e}`,
          fetchedAt: new Date(),
        });
    }
    await db()
      .insert(orgProspects)
      .values([
        { id: newId("prs"), orgId: t.orgId, ein, status: "researching", fitScore: 81 },
        { id: newId("prs"), orgId: t.orgId, ein: ein2, status: "new", fitScore: 90 },
      ]);
    const res = await list(t.orgId, t.userId);
    expect(res.items).toHaveLength(1);
    const rel = res.items[0] as FunderListResponse["items"][number];
    expect(rel).toMatchObject({ prospectEin: ein, origin: "prospect", stage: "cultivating" });

    const d = await detail(t.orgId, rel.id, t.userId);
    expect(d.prospect).toMatchObject({
      ein,
      totalGivingCents: 180_000_000,
      latestFilingYear: 2024,
      fitScore: 81,
    });
    expect(d.prospect?.attribution.text).toMatch(/ProPublica/);
    expect(d.timeline.past.find((i) => i.kind === "prospect")?.detail).toMatch(
      /990-PF 2024: \$1,800,000/,
    );
  });

  it("never overrides a stage a person chose, until they hand it back to auto", async () => {
    const t = await setupTenant();
    const f = await seedFunder("Canyon Fund");
    const opp = await seedOpportunity(f);
    await seedApplication(t.orgId, opp, "declined");
    const [rel] = (await list(t.orgId, t.userId)).items;
    const id = (rel as FunderListResponse["items"][number]).id;

    expect(
      (await patch(`/api/orgs/${t.orgId}/funders/${id}`, t.userId, { stage: "dormant" })).status,
    ).toBe(200);
    const opp2 = await seedOpportunity(f);
    await seedApplication(t.orgId, opp2, "in_review");
    expect((await list(t.orgId, t.userId)).items[0]).toMatchObject({
      stage: "dormant",
      stageSource: "manual",
    });

    const back = await patch(`/api/orgs/${t.orgId}/funders/${id}`, t.userId, { stage: "auto" });
    expect(((await back.json()) as FunderRelationDto).stage).toBe("applied");
  });
});

describe("funders: detail + timeline", () => {
  it("merges applications, outcomes, awards, reports, interactions and next step in date order", async () => {
    const t = await setupTenant();
    const f = await seedFunder("Timeline Foundation");
    const opp = await seedOpportunity(f);
    const day = (n: number) => new Date(Date.UTC(2026, 0, n, 12));
    const appId = await seedApplication(t.orgId, opp, "awarded", {
      createdAt: day(1),
      submittedAt: day(5),
      outcomeAt: day(20),
      awardedAmountCents: 500_000,
    });
    const awardId = `awd_${newId("org").slice(4)}`;
    await db()
      .insert(awards)
      .values({
        id: awardId,
        orgId: t.orgId,
        applicationId: appId,
        title: "Youth program",
        funderName: f.name,
        amountCents: 500_000,
        createdAt: day(20),
      });
    await env.DB.prepare(
      "INSERT INTO award_reports (id, org_id, award_id, kind, period_start, period_end, due_at, status, created_at, updated_at) VALUES (?, ?, ?, 'final', '2026-01-01', '2026-12-31', ?, 'upcoming', ?, ?)",
    )
      .bind(
        `rpt_${newId("org").slice(4)}`,
        t.orgId,
        awardId,
        Date.UTC(2099, 0, 31),
        Date.now(),
        Date.now(),
      )
      .run();

    const [rel] = (await list(t.orgId, t.userId)).items;
    const id = (rel as FunderListResponse["items"][number]).id;
    const logged = await post(`/api/orgs/${t.orgId}/funders/${id}/interactions`, t.userId, {
      kind: "call",
      occurredAt: day(10).toISOString(),
      summary: "Program officer suggested a site visit",
    });
    expect(logged.status).toBe(201);
    await patch(`/api/orgs/${t.orgId}/funders/${id}`, t.userId, {
      nextStepAt: "2099-01-15T09:00:00.000Z",
      nextStepNote: "Invite to the spring showcase",
    });

    const d = await detail(t.orgId, id, t.userId);
    expect(d.timeline.past.map((i) => i.id.split(":")[0])).toEqual([
      "award", // day 20: recorded with the outcome, so it reads as the newer of the two
      "outcome", // day 20
      "interaction", // day 10
      "submitted", // day 5
      "application", // day 1
    ]);
    expect(d.timeline.upcoming.map((i) => i.kind)).toEqual(["next_step", "report"]);
    expect(d.timeline.past.find((i) => i.kind === "outcome")?.title).toBe(
      "Awarded $5,000: Youth program",
    );
    expect(d.relation.stage).toBe("funded");
    expect(d.canEdit).toBe(true);
  });

  it("lists the funder's open opportunities for starting an application", async () => {
    const t = await setupTenant();
    const f = await seedFunder("Open Doors Fund");
    const open = await seedOpportunity(f);
    await seedOpportunity(f, { status: "closed" });
    await seedOpportunity(f, { closeDate: new Date(Date.now() - 86_400_000) });
    const other = await setupTenant();
    await seedOpportunity(f, { privateToOrgId: other.orgId }); // another org's private import
    const created = await post(`/api/orgs/${t.orgId}/funders`, t.userId, {
      displayName: f.name,
      funderId: f.id,
    });
    expect(created.status).toBe(201);
    const rel = (await created.json()) as FunderRelationDto;
    expect(rel).toMatchObject({ origin: "manual", stage: "prospect", stageSource: "auto" });
    const d = await detail(t.orgId, rel.id, t.userId);
    expect(d.openOpportunities.map((o) => o.id)).toEqual([open]);
    expect(d.funder?.id).toBe(f.id);

    const dupe = await post(`/api/orgs/${t.orgId}/funders`, t.userId, {
      displayName: "x",
      funderId: f.id,
    });
    expect(dupe.status).toBe(409);
  });
});

describe("funders: contacts, interactions and roles", () => {
  it("lets editors manage contacts and interactions; viewers read but cannot write", async () => {
    const t = await setupTenant();
    const created = await post(`/api/orgs/${t.orgId}/funders`, t.userId, {
      displayName: "Sunrise Foundation",
      tags: ["education", "Education", " local "],
    });
    const rel = (await created.json()) as FunderRelationDto;
    expect(rel.tags).toEqual(["education", "local"]);
    const base = `/api/orgs/${t.orgId}/funders/${rel.id}`;

    const c = await post(`${base}/contacts`, t.userId, {
      name: "Dana Program",
      role: "Program officer",
      email: "dana@sunrise.example",
      preferredContact: "email",
    });
    expect(c.status).toBe(201);
    const contact = (await c.json()) as FunderContactDto;
    const upd = await patch(`${base}/contacts/${contact.id}`, t.userId, { phone: "505-555-0100" });
    expect(((await upd.json()) as FunderContactDto).phone).toBe("505-555-0100");

    const i = await post(`${base}/interactions`, t.userId, {
      kind: "meeting",
      occurredAt: new Date().toISOString(),
      summary: "Coffee",
      contactId: contact.id,
    });
    expect(i.status).toBe(201);
    const interaction = (await i.json()) as { id: string; createdByName: string };
    expect(interaction.createdByName).toBe("Test User");

    // Audit metadata never carries the contact's personal data.
    const audits = await db().select().from(auditLog).where(eq(auditLog.orgId, t.orgId));
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        "funder_relation.created",
        "funder_contact.created",
        "funder_contact.updated",
        "funder_interaction.logged",
      ]),
    );
    expect(JSON.stringify(audits)).not.toMatch(/dana@sunrise|505-555|Dana Program/);

    const viewer = await createTestUser();
    await db()
      .insert(member)
      .values({ id: newId("mem"), organizationId: t.orgId, userId: viewer.id, role: "viewer" });
    const contacts = await api(`${base}/contacts`, { as: viewer.id });
    expect(contacts.status).toBe(200);
    expect(((await contacts.json()) as { items: unknown[] }).items).toHaveLength(1);
    expect((await list(t.orgId, viewer.id)).canEdit).toBe(false);
    expect((await post(`${base}/contacts`, viewer.id, { name: "X" })).status).toBe(403);
    expect((await patch(base, viewer.id, { stage: "funded" })).status).toBe(403);
    expect(
      (await post(`/api/orgs/${t.orgId}/funders`, viewer.id, { displayName: "Y" })).status,
    ).toBe(403);
    expect(
      (await api(`${base}/interactions/${interaction.id}`, { method: "DELETE", as: viewer.id }))
        .status,
    ).toBe(403);

    expect(
      (await api(`${base}/interactions/${interaction.id}`, { method: "DELETE", as: t.userId }))
        .status,
    ).toBe(204);
    expect(
      (await api(`${base}/contacts/${contact.id}`, { method: "DELETE", as: t.userId })).status,
    ).toBe(204);
    expect((await patch(base, t.userId, { ownerId: viewer.id })).status).toBe(200);
    expect((await patch(base, t.userId, { ownerId: "usr_not_a_member" })).status).toBe(400);
  });

  it("sends a due next step to the owner's notification center once", async () => {
    const t = await setupTenant();
    const created = await post(`/api/orgs/${t.orgId}/funders`, t.userId, {
      displayName: "Reminder Fund",
      ownerId: t.userId,
      nextStepAt: new Date(Date.now() - 60_000).toISOString(),
      nextStepNote: "Send the thank-you letter",
    });
    const rel = (await created.json()) as FunderRelationDto;
    const first = await runDueNextSteps(ctx());
    expect(first.notified).toBeGreaterThanOrEqual(1);
    const mine = await db()
      .select()
      .from(notifications)
      .where(and(eq(notifications.orgId, t.orgId), eq(notifications.userId, t.userId)));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      kind: "followup.due",
      title: "Next step with Reminder Fund",
      link: `/orgs/${t.orgId}/funders/${rel.id}`,
    });
    await runDueNextSteps(ctx());
    const again = await db().select().from(notifications).where(eq(notifications.orgId, t.orgId));
    expect(again).toHaveLength(1);
  });
});

describe("funders: privacy", () => {
  it("tenantTables() covers relations, contacts and interactions", () => {
    const names = tenantTables().map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "org_funder_relations",
        "org_funder_contacts",
        "org_funder_interactions",
      ]),
    );
  });

  it("includes contacts in the org export and deletes them with the org (and only that org)", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const mk = async (orgId: string, userId: string, email: string) => {
      const rel = (await (
        await post(`/api/orgs/${orgId}/funders`, userId, { displayName: "Shared Name Foundation" })
      ).json()) as FunderRelationDto;
      await post(`/api/orgs/${orgId}/funders/${rel.id}/contacts`, userId, { name: "Pat", email });
      await post(`/api/orgs/${orgId}/funders/${rel.id}/interactions`, userId, {
        kind: "email",
        occurredAt: new Date().toISOString(),
        summary: "Intro",
      });
      return rel;
    };
    await mk(a.orgId, a.userId, "pat@a.example");
    await mk(b.orgId, b.userId, "pat@b.example");

    const { bytes, manifest } = await buildOrgExport(ctx(), a.orgId);
    expect(manifest.tables.org_funder_contacts).toBe(1);
    expect(manifest.tables.org_funder_relations).toBe(1);
    expect(manifest.tables.org_funder_interactions).toBe(1);
    const files = unzipSync(bytes);
    const contacts = JSON.parse(strFromU8(files["data/org_funder_contacts.json"] as Uint8Array));
    expect(contacts).toEqual([expect.objectContaining({ name: "Pat", email: "pat@a.example" })]);
    expect(JSON.stringify(contacts)).not.toContain("pat@b.example");

    const receipt = await deleteOrganizationData(ctx(), a.orgId, a.userId);
    expect(receipt?.rows.org_funder_contacts).toBe(1);
    for (const table of [orgFunderContacts, orgFunderInteractions, orgFunderRelations]) {
      expect(await db().select().from(table).where(eq(table.orgId, a.orgId))).toHaveLength(0);
      expect(await db().select().from(table).where(eq(table.orgId, b.orgId))).toHaveLength(1);
    }
  });
});

describe("funders: tenant isolation", () => {
  it("never shows or changes another org's relations, contacts or interactions", async () => {
    const a = await setupTenant();
    const b = await setupTenant();
    const f = await seedFunder("Isolation Fund");
    const opp = await seedOpportunity(f);
    await seedApplication(a.orgId, opp, "submitted");
    const [rel] = (await list(a.orgId, a.userId)).items;
    const id = (rel as FunderListResponse["items"][number]).id;
    const contact = (await (
      await post(`/api/orgs/${a.orgId}/funders/${id}/contacts`, a.userId, { name: "Secret Person" })
    ).json()) as FunderContactDto;

    // B sees nothing of A (the shared global funder does not create a relation for B).
    expect((await list(b.orgId, b.userId)).items).toHaveLength(0);
    // B cannot reach A's relation through B's org…
    for (const path of ["", "/contacts", "/interactions"]) {
      expect(
        (await api(`/api/orgs/${b.orgId}/funders/${id}${path}`, { as: b.userId })).status,
      ).toBe(404);
    }
    expect(
      (await patch(`/api/orgs/${b.orgId}/funders/${id}`, b.userId, { stage: "funded" })).status,
    ).toBe(404);
    expect(
      (
        await patch(`/api/orgs/${b.orgId}/funders/${id}/contacts/${contact.id}`, b.userId, {
          name: "x",
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await post(`/api/orgs/${b.orgId}/funders/${id}/interactions`, b.userId, {
          kind: "call",
          occurredAt: new Date().toISOString(),
          summary: "x",
        })
      ).status,
    ).toBe(404);
    // …nor through A's org (not a member).
    expect((await api(`/api/orgs/${a.orgId}/funders/${id}`, { as: b.userId })).status).toBe(404);
    expect((await api(`/api/orgs/${a.orgId}/funders`, { as: b.userId })).status).toBe(404);

    // B's own relation cannot cite A's contact in an interaction.
    const bRel = (await (
      await post(`/api/orgs/${b.orgId}/funders`, b.userId, { displayName: "B's funder" })
    ).json()) as FunderRelationDto;
    const cross = await post(`/api/orgs/${b.orgId}/funders/${bRel.id}/interactions`, b.userId, {
      kind: "call",
      occurredAt: new Date().toISOString(),
      summary: "x",
      contactId: contact.id,
    });
    expect(cross.status).toBe(404);
    const still = await db()
      .select()
      .from(orgFunderContacts)
      .where(eq(orgFunderContacts.id, contact.id))
      .get();
    expect(still?.name).toBe("Secret Person");
  });
});
