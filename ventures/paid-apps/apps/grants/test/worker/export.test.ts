// GET /api/orgs/:orgId/applications/:id/export — an application drafted inline by the real pipeline
// (FakeLlm), then exported as DOCX / HTML / text; headers, versions, audit and tenant isolation.
import { env } from "cloudflare:workers";
import type { ApplicationDto } from "@shared/api/types";
import { createApp } from "@worker/app";
import { auditLog, facts, member, opportunities, subscriptions } from "@worker/db/schema";
import { newId } from "@worker/lib/ids";
import { TEST_USER_HEADER } from "@worker/middleware/session";
import { requireOrg } from "@worker/middleware/tenant";
import exportRoutes from "@worker/routes/org/application-export";
import type { AppEnv } from "@worker/types";
import { and, eq } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { assertWellFormed } from "../xml-well-formed";
import { api, BASE, createTestUser, setupTenant, testDb } from "./helpers";

// Until app.ts mounts the router (integration pass), mount it on a test instance of the full app,
// exactly as it will be: under /api/orgs/:orgId/applications behind requireOrg("viewer").
const app = createApp();
const exportMount = new Hono<AppEnv>();
exportMount.use("*", requireOrg("viewer"));
exportMount.route("/", exportRoutes);
app.route("/api/orgs/:orgId/applications", exportMount);

const get = (path: string, as: string) =>
  app.fetch(new Request(`${BASE}${path}`, { headers: { [TEST_USER_HEADER]: as } }), env);

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const s = {} as { orgId: string; userId: string; appId: string; versionId: string };

beforeAll(async () => {
  const t = await setupTenant("owner");
  const db = testDb();
  await db.insert(subscriptions).values({ orgId: t.orgId, planKey: "comp", status: "comp" });
  const oppId = newId("opp");
  await db.insert(opportunities).values({
    id: oppId,
    source: "manual",
    sourceId: oppId,
    funderName: "Gallup Community Foundation",
    title: "Workforce Pathways Grant",
    summary: "Supports job training in construction trades for adults in McKinley County.",
    awardCeilingCents: 2_500_000,
    closeDate: new Date("2027-01-15T00:00:00Z"),
    submissionMethod: "portal",
    submissionUrl: "https://funder.example.org/apply",
    requirements: {
      sections: [
        {
          key: "need_statement",
          title: "Statement of need",
          prompt: "Describe the need your program addresses.",
          kind: "narrative",
          required: true,
          wordLimit: 300,
          charLimit: null,
          guidance: "",
        },
      ],
      attachments: [],
      eligibilityCriteria: [],
      submissionInstructions: "",
      complete: true,
    },
  });
  for (const statement of [
    "Southwest Indian Foundation runs a construction trades training program in Gallup, New Mexico.",
    "The trades program trained 42 adults in 2025.",
    "Southwest Indian Foundation serves Navajo and Zuni families in McKinley County.",
  ]) {
    await db.insert(facts).values({
      id: newId("fct"),
      orgId: t.orgId,
      category: "program",
      statement,
      sourceQuote: statement,
      status: "confirmed",
      sourceType: "user_entered",
    });
  }
  const res = await api(`/api/orgs/${t.orgId}/applications`, {
    method: "POST",
    as: t.userId,
    json: { opportunityId: oppId },
  });
  expect(res.status).toBe(201);
  const created = (await res.json()) as ApplicationDto;
  expect(created.currentVersionId).toBeTruthy();
  Object.assign(s, {
    orgId: t.orgId,
    userId: t.userId,
    appId: created.id,
    versionId: created.currentVersionId,
  });
}, 120_000);

const exportPath = (query = "", appId = s.appId, orgId = s.orgId) =>
  `/api/orgs/${orgId}/applications/${appId}/export${query}`;

describe("GET /applications/:id/export", () => {
  it("returns a valid DOCX with download headers (default format)", async () => {
    const res = await get(exportPath(), s.userId);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(DOCX);
    expect(res.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="[a-z0-9-]+-v1\.docx"$/,
    );
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("X-Export-Version-Id")).toBe(s.versionId);
    const parts = unzipSync(new Uint8Array(await res.arrayBuffer()));
    for (const part of [
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
      "word/styles.xml",
      "word/_rels/document.xml.rels",
      "docProps/core.xml",
      "docProps/app.xml",
    ]) {
      expect(parts[part], part).toBeDefined();
    }
    for (const [name, bytes] of Object.entries(parts)) {
      expect(() => assertWellFormed(strFromU8(bytes)), name).not.toThrow();
    }
    const doc = strFromU8(parts["word/document.xml"] ?? new Uint8Array());
    expect(doc).toContain("Test Org"); // legal name from the profile
    expect(doc).toContain("Describe the need your program addresses.");
    expect(doc).toContain("January 15, 2027");
    expect(doc).toMatch(/Word count: \d+ \/ 300/);
    expect(doc).not.toContain(">Citations<");
  });

  it("returns printable HTML and portal text; citations=1 adds the appendix", async () => {
    const html = await get(exportPath("?format=html&citations=1"), s.userId);
    expect(html.status).toBe(200);
    expect(html.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(html.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="[a-z0-9-]+-v1\.html"$/,
    );
    expect(html.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    const body = await html.text();
    expect(body).toContain("@page");
    expect(body).toContain("<h1>Citations</h1>");

    const txt = await get(exportPath("?format=txt&cover=1"), s.userId);
    expect(txt.status).toBe(200);
    expect(txt.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(txt.headers.get("Content-Disposition")).toMatch(/\.txt"$/);
    const text = await txt.text();
    expect(text).toContain("PROMPT:\nDescribe the need your program addresses.");
    expect(text).toMatch(/Words: \d+ \/ 300 words/);
    expect(text).toContain("REVIEWER NOTES");
  });

  it("exports a specific version, 404s an unknown one and rejects a bad format", async () => {
    const ok = await get(exportPath(`?format=txt&versionId=${s.versionId}`), s.userId);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("X-Export-Version-Id")).toBe(s.versionId);
    expect((await get(exportPath("?versionId=ver_nope"), s.userId)).status).toBe(404);
    expect((await get(exportPath("?format=pdf"), s.userId)).status).toBe(400);
    expect((await get(exportPath("", "app_nope"), s.userId)).status).toBe(404);
  });

  it("audits application.exported", async () => {
    await get(exportPath("?format=html"), s.userId);
    const rows = await testDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, s.orgId), eq(auditLog.action, "application.exported")))
      .all();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.at(-1)).toMatchObject({
      actorId: s.userId,
      targetType: "application",
      targetId: s.appId,
    });
    expect(rows.map((r) => (r.metadata as { format: string }).format)).toContain("html");
  });

  it("allows viewers", async () => {
    const viewer = await createTestUser();
    await testDb()
      .insert(member)
      .values({ id: newId("mem"), organizationId: s.orgId, userId: viewer.id, role: "viewer" });
    expect((await get(exportPath("?format=txt"), viewer.id)).status).toBe(200);
  });

  it("is a 404 across tenants", async () => {
    const other = await setupTenant("owner");
    // Another org's member asking through their own org...
    const viaOwnOrg = await get(exportPath("", s.appId, other.orgId), other.userId);
    expect(viaOwnOrg.status).toBe(404);
    expect(viaOwnOrg.headers.get("Content-Type")).toContain("application/json");
    // ...or through the victim's org id.
    expect((await get(exportPath(), other.userId)).status).toBe(404);
  });
});
