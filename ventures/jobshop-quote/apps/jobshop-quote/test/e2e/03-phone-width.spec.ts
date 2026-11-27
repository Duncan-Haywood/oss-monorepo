// No page of the signed-in app may scroll sideways on a 390 px phone (the width scripts/phone-width.mjs
// checks by hand). A wide table inside its own overflow-x-auto box is fine; the page itself must not be.
// Data is seeded through the API so the quote has a fully priced line (the nine-column price table is
// what once pushed the page to 509 px).
import { expect, test } from "@playwright/test";
import { api, RFQ_EMAIL, signUpWithShop } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });

test("every signed-in page fits a 390 px screen", async ({ page, baseURL }) => {
  const base = baseURL as string;
  const { orgId, orgPath } = await signUpWithShop(page, { tag: "phone", shop: "Phone Width Shop" });
  const org = (p: string) => `/api/orgs/${orgId}${p}`;
  const call = <T = { id: string }>(method: string, path: string, data?: unknown) =>
    api<T>(page.request, base, method, path, data);

  const mill = await call("POST", org("/rate-card/machines"), {
    name: "Haas VF-2",
    kind: "mill_3axis",
    hourlyRateCents: 9_500,
  });
  const al = await call("POST", org("/rate-card/materials"), {
    name: "Aluminum 6061-T6 plate",
    pricingBasis: "per_lb",
    pricePerLbCents: 450,
    densityLbPerIn3: 0.0975,
    scrapBps: 1_000,
    minChargeCents: 2_500,
  });
  const rfq = await call("POST", org("/rfqs"), {
    subject: "RFQ - brackets and spacers",
    bodyText: RFQ_EMAIL,
  });
  await call("POST", org(`/rfqs/${rfq.id}/extract`), {});
  const detail = await call<{ parts: { id: string }[] }>("GET", org(`/rfqs/${rfq.id}`));
  for (const part of detail.parts) {
    await call("PATCH", org(`/rfqs/${rfq.id}/parts/${part.id}`), { confirmed: true });
  }
  const quote = await call("POST", org("/quotes"), { rfqId: rfq.id });
  const full = await call<{ lines: { id: string; inputs: Record<string, unknown> }[] }>(
    "GET",
    org(`/quotes/${quote.id}`),
  );
  const line = full.lines[0];
  if (!line) throw new Error("the quote has no line");
  await call("PATCH", org(`/quotes/${quote.id}/lines/${line.id}`), {
    inputs: {
      ...line.inputs,
      material: {
        materialId: al.id,
        blank: { shape: "rect", lengthIn: 4, widthIn: 3, thicknessIn: 0.5 },
        partsPerStock: null,
      },
      operations: [
        { machineId: mill.id, label: "Op 10 mill", setupMinutes: 60, cycleMinutesPerPart: 12 },
        { machineId: mill.id, label: "Op 20 flip", setupMinutes: 30, cycleMinutesPerPart: 6 },
      ],
      extras: [{ label: "Cert of conformance", perPartCents: 0, lotCents: 2_500 }],
    },
  });

  const pages = [
    "",
    `/quotes/${quote.id}`,
    "/win-loss",
    "/rfqs",
    `/rfqs/${rfq.id}`,
    "/rate-card",
    "/routings",
    "/team",
    "/billing",
  ];
  const wide: string[] = [];
  const measure = async (name: string) => {
    await page.waitForLoadState("networkidle");
    // A route that does not exist renders "Page not found" outside the app layout: fail, not pass.
    await expect(page.locator("main")).not.toBeEmpty();
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const over = [...document.querySelectorAll("body *")]
        .map((el) => ({ el, right: el.getBoundingClientRect().right }))
        .filter((x) => x.right > vw + 1)
        .sort((a, b) => b.right - a.right)
        .slice(0, 3)
        .map((x) => `${x.el.tagName.toLowerCase()}.${String(x.el.className).slice(0, 60)}`);
      return { vw, sw: document.documentElement.scrollWidth, over };
    });
    if (r.sw > r.vw) wide.push(`${name}: ${r.sw} px (${r.over.join(" | ")})`);
  };
  for (const p of pages) {
    await page.goto(orgPath + p);
    await measure(p || "/");
  }
  // The spreadsheet import is a panel on the rate card, opened by its button.
  await page.goto(`${orgPath}/rate-card`);
  await page.getByRole("button", { name: "Import…" }).click();
  await measure("/rate-card (import panel open)");
  // The priced quote really is the wide case being checked.
  await page.goto(`${orgPath}/quotes/${quote.id}`);
  await expect(page.getByText("priced", { exact: true })).toBeVisible();
  expect(wide, "pages that scroll sideways on a 390 px screen").toEqual([]);
});
