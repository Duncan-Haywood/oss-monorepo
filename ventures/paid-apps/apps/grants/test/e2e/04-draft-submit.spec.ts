// Demo story (d): seed the sample org (POST /api/demo/seed) -> open an opportunity -> Draft
// application -> detail shows executive summary, a citation popover with a source quote and the flags
// panel -> Approve & submit -> submission recorded.
//
// A second test builds the same preconditions WITHOUT the demo seed (paste a mission statement,
// confirm its facts, import an RFP as a private opportunity) so drafting is covered even if seeding
// breaks.
//
// Steps that depend on features still being built call `test.fixme(<feature missing>, reason)` at
// run time, so the test turns itself back on as soon as the endpoint/page lands.
import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import {
  apiSignUp,
  fixmeIfStub,
  fixturePath,
  newOrgSession,
  orgPath,
  originHeaders,
  waitForApi,
} from "./helpers";

interface MeDto {
  memberships: { orgId: string; orgName: string }[];
}
interface ApplicationDetail {
  id: string;
  status: string;
  currentVersion: {
    executiveSummary?: string;
    content: { sections: { key: string; paragraphs: { claims: { factIds: string[] }[] }[] }[] };
  } | null;
  flags: unknown[];
  citedFacts: { id: string; sourceQuote?: string | null }[];
}

/** From an opportunity detail page: Draft application -> cited draft -> Approve & submit. */
async function draftThroughSubmission(page: Page, oid: string) {
  const opportunityId = new URL(page.url()).pathname.split("/").pop() as string;
  const draftButton = page.getByRole("button", { name: "Draft application" });
  const inProgress = page.getByText(/application for this grant is already in progress/i);
  await expect(draftButton.or(inProgress).first()).toBeVisible({ timeout: 30_000 });

  if (await draftButton.isVisible()) {
    // 3. Draft application (the user's click).
    const drafted = waitForApi(page, "POST", new RegExp(`/api/orgs/${oid}/applications$`));
    await draftButton.click();
    const draftRes = await drafted;
    test.fixme(
      draftRes.status() === 404,
      "POST /api/orgs/:orgId/applications is not implemented (src/worker/routes/org/applications.ts)",
    );
    expect(draftRes.ok(), `draft -> ${draftRes.status()} ${await draftRes.text()}`).toBe(true);
  } else {
    // Autopilot already started a draft for this match (orgSettings.autoDraftTopN): open it.
    const res = await page.request.get(`/api/orgs/${oid}/applications`);
    expect(res.ok()).toBe(true);
    const { items } = (await res.json()) as {
      items: { id: string; opportunity?: { id: string }; opportunityId?: string }[];
    };
    const app = items.find((a) => (a.opportunity?.id ?? a.opportunityId) === opportunityId);
    expect(app, "autopilot draft for this opportunity").toBeTruthy();
    await page.goto(orgPath(oid, `/applications/${app?.id}`));
  }
  await expect(page).toHaveURL(new RegExp(`/orgs/${oid}/applications/[^/?#]+$`));
  const applicationId = new URL(page.url()).pathname.split("/").pop() as string;

  // 4a. API: the pipeline produced a cited draft (runs in the ApplicationPipeline workflow).
  let detail: ApplicationDetail | null = null;
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/orgs/${oid}/applications/${applicationId}`);
        if (!res.ok()) return `HTTP ${res.status()}`;
        detail = (await res.json()) as ApplicationDetail;
        return detail.currentVersion ? "drafted" : `status=${detail.status}`;
      },
      { timeout: 90_000, message: "application never got a currentVersion" },
    )
    .toBe("drafted");
  const version = (detail as unknown as ApplicationDetail).currentVersion;
  expect(version?.content.sections.length ?? 0).toBeGreaterThan(0);
  const citedIds = (version?.content.sections ?? []).flatMap((s) =>
    s.paragraphs.flatMap((p) => p.claims.flatMap((c) => c.factIds)),
  );
  expect(citedIds.length, "draft should cite at least one fact").toBeGreaterThan(0);

  // 4b. UI: executive summary, citation popover with the source quote, flags panel.
  await fixmeIfStub(
    page,
    "Application detail page is still the stub (src/client/routes/org/applications/application-detail.tsx)",
  );
  await expect(page.getByRole("heading", { name: /executive summary/i }).first()).toBeVisible({
    timeout: 60_000,
  });

  const citation = page.getByRole("button", { name: /citation|source|cited|\[\d+\]/i }).first();
  await expect(citation).toBeVisible();
  await citation.click();
  const popover = page.getByRole("dialog").or(page.getByRole("tooltip")).first();
  await expect(popover).toBeVisible();
  await expect(popover).toContainText(/\w+(\s+\w+){3,}/); // a verbatim source quote, not just an id

  await page.keyboard.press("Escape");
  await expect(
    page
      .getByRole("region", { name: /flag/i })
      .or(page.getByRole("heading", { name: /flags|needs attention|open questions/i }))
      .first(),
  ).toBeVisible();

  // 5. Approve & submit (one click; a confirm dialog is optional).
  await page.getByRole("button", { name: /approve.*submit/i }).click();
  const confirmDialog = page.getByRole("dialog");
  if (await confirmDialog.isVisible().catch(() => false)) {
    await confirmDialog
      .getByRole("button", { name: /approve|submit|confirm/i })
      .last()
      .click();
  }
  await expect(page.getByText(/submitted|submission recorded/i).first()).toBeVisible({
    timeout: 60_000,
  });

  // 6. The submission is recorded server-side.
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/orgs/${oid}/submissions`);
        if (!res.ok()) return 0;
        const body = (await res.json()) as { items?: { application?: { id: string } }[] };
        return (body.items ?? []).filter(
          (s) => !s.application || s.application.id === applicationId,
        ).length;
      },
      { timeout: 60_000 },
    )
    .toBeGreaterThan(0);
}

test("seeded demo org → draft application → cited draft + flags → approve & submit", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await apiSignUp(page, "draft");

  // 1. Seed the fictional demo org for this user.
  const seed = await page.request.post("/api/demo/seed", { headers: originHeaders(page) });
  test.fixme(
    seed.status() === 404,
    "POST /api/demo/seed is not implemented (src/worker/routes/demo.ts has no handler; services/demo/** missing)",
  );
  expect(seed.ok(), `seed -> ${seed.status()} ${await seed.text()}`).toBe(true);
  const seeded = (await seed.json().catch(() => ({}))) as {
    orgId?: string;
    org?: { id?: string };
    id?: string;
  };
  let orgId = seeded.orgId ?? seeded.org?.id ?? seeded.id;
  if (!orgId) {
    const me = (await (await page.request.get("/api/me")).json()) as MeDto;
    orgId = me.memberships.at(-1)?.orgId;
  }
  expect(orgId, "seed response should identify the demo org").toBeTruthy();
  const oid = orgId as string;

  // 2. Open an opportunity from the catalog.
  await page.goto(orgPath(oid, "/opportunities"));
  const firstOpportunity = page.getByRole("heading", { level: 3 }).getByRole("link").first();
  await expect(firstOpportunity).toBeVisible({ timeout: 30_000 });
  await firstOpportunity.click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${oid}/opportunities/[^/?#]+$`));

  await draftThroughSubmission(page, oid);
});

test("self-built org (pasted doc + imported RFP) → draft → approve & submit", async ({ page }) => {
  test.setTimeout(240_000);
  const { orgId: oid } = await newOrgSession(page, "rfp");
  const headers = originHeaders(page);

  // Turn off autopilot drafting so the "Draft application" click below is what starts the draft.
  const settings = await page.request.patch(`/api/orgs/${oid}/settings`, {
    headers,
    data: { autoDraftTopN: 0 },
  });
  expect(settings.ok(), `settings -> ${settings.status()} ${await settings.text()}`).toBe(true);

  // Facts: paste the mission statement, then confirm everything it proposed.
  const pasted = await page.request.post(`/api/orgs/${oid}/documents/text`, {
    headers,
    data: {
      title: "Mission statement",
      kind: "mission_statement",
      text: readFileSync(fixturePath("mission-statement.txt"), "utf8"),
    },
  });
  expect(pasted.ok(), `paste -> ${pasted.status()} ${await pasted.text()}`).toBe(true);
  let ids: string[] = [];
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/orgs/${oid}/facts?status=proposed`);
        ids = res.ok()
          ? ((await res.json()) as { items: { id: string }[] }).items.map((f) => f.id)
          : [];
        return ids.length;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  const bulk = await page.request.post(`/api/orgs/${oid}/facts/bulk-confirm`, {
    headers,
    data: { ids },
  });
  expect(bulk.ok(), `bulk-confirm -> ${bulk.status()} ${await bulk.text()}`).toBe(true);

  // Opportunity: import an RFP (private to this org).
  const rfp = await page.request.post(`/api/orgs/${oid}/imports/rfp`, {
    headers,
    multipart: {
      file: {
        name: "rfp.txt",
        mimeType: "text/plain",
        buffer: readFileSync(fixturePath("rfp.txt")),
      },
    },
  });
  test.fixme(rfp.status() === 404, "POST /imports/rfp is not implemented");
  expect(rfp.ok(), `import rfp -> ${rfp.status()} ${await rfp.text()}`).toBe(true);
  const opportunity = (await rfp.json()) as { id: string; title: string };

  await page.goto(orgPath(oid, `/opportunities/${opportunity.id}`));
  await expect(page.getByRole("heading", { level: 1, name: opportunity.title })).toBeVisible();

  await draftThroughSubmission(page, oid);
});
