#!/usr/bin/env node
// Phone-width check: no page of the signed-in app may scroll sideways on a 390 px screen.
//
// Run the offline demo first (`pnpm demo`, port 5199 or DEMO_PORT), then:
//   node scripts/phone-width.mjs [--width 390]
// The same check runs in CI as test/e2e/03-phone-width.spec.ts (`pnpm test:e2e`); this script is for
// trying another width by hand. Its page list once held /rate-card/import and /account, which are not
// routes: it measured the "Page not found" screen and printed "ok".
// Needs Playwright with a Chromium (`require("playwright")`); it is not an app dependency.
//
// It signs up a throwaway demo user, makes a shop with a small rate card, turns the synthetic RFQ
// in test/fixtures/rfq.ts into a quote with one fully priced line (the nine-column price table is
// what used to push the page to 509 px), then loads each page and compares the document's
// scrollWidth with the viewport. Elements that scroll inside their own box (a wide table in an
// overflow-x-auto wrapper) are fine; the page itself must not. Exit 1 lists the widest offenders.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const widthArg = process.argv.indexOf("--width");
const WIDTH = widthArg > 0 ? Number(process.argv[widthArg + 1]) : 390;
const BASE = `http://localhost:${process.env.DEMO_PORT ?? 5199}`;
const fixture = readFileSync(
  fileURLToPath(new URL("../test/fixtures/rfq.ts", import.meta.url)),
  "utf8",
);
const RFQ_EMAIL = fixture.split("`")[1];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 844 }, baseURL: BASE });
const headers = { Origin: BASE };
async function call(method, path, data) {
  const res = await ctx.request.fetch(path, { method, data, headers });
  if (!res.ok()) throw new Error(`${method} ${path}: ${res.status()} ${await res.text()}`);
  return res.json().catch(() => ({}));
}

try {
  await call("POST", "/api/auth/sign-up/email", {
    name: "Phone width check",
    email: `phone-width-${Date.now()}@example.test`,
    password: "phone-width-check-only",
  });
  const legal = await call("GET", "/api/legal");
  await call("POST", "/api/me/legal/accept", { version: legal.items[0].version });
  const { orgId } = await call("POST", "/api/orgs", { name: "Phone Width Machine Shop" });
  const org = (p) => `/api/orgs/${orgId}${p}`;

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
  await call("POST", org("/rate-card/finishing-ops"), {
    name: "Anodize Type II black",
    perPartCents: 300,
    lotChargeCents: 15_000,
    outsideService: true,
  });

  const rfq = await call("POST", org("/rfqs"), {
    subject: "RFQ - brackets and spacers",
    bodyText: RFQ_EMAIL,
  });
  await call("POST", org(`/rfqs/${rfq.id}/extract`), {});
  const detail = await call("GET", org(`/rfqs/${rfq.id}`));
  for (const part of detail.parts ?? []) {
    await call("PATCH", org(`/rfqs/${rfq.id}/parts/${part.id}`), { confirmed: true });
  }
  const quote = await call("POST", org("/quotes"), { rfqId: rfq.id });
  const full = await call("GET", org(`/quotes/${quote.id}`));
  const line = full.lines[0];
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

  const app = `/app/${orgId}`;
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
  const page = await ctx.newPage();
  const failures = [];
  for (const p of pages) {
    await page.goto(app + p);
    await page.waitForLoadState("networkidle");
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
    const ok = r.sw <= r.vw;
    console.log(`${ok ? "ok  " : "FAIL"} ${p || "/"} page width ${r.sw} on a ${r.vw} px screen`);
    if (!ok) failures.push(`${p || "/"}: ${r.over.join(" | ")}`);
  }
  if (failures.length) {
    console.error(`\n${failures.length} page(s) scroll sideways:\n${failures.join("\n")}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
