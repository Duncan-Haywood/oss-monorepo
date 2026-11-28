// The /how-to-price-a-rush-job guide: its arithmetic checked by hand, and the page that prints it.
// (apps/jobshop-quote/test/unit/site-rush-example.test.ts checks the same figures against the app's
// costing engine.)
import { buildSite, fileFor } from "@site/build";
import type { Launch } from "@site/config";
import { EXAMPLE as BASE, priceExample, usdCents } from "@site/quote-example";
import { compareRush, normalLine, priceLine, RUSH, rushLine } from "@site/rush-example";
import { describe, expect, it } from "vitest";

const SITE = "https://example.test/jobshop";
const OPEN: Launch = {
  appUrl: "https://app.example.test",
  open: true,
  aiReading: false,
  inboundEmail: false,
  paidPlans: false,
};

describe("rush example arithmetic", () => {
  const rows = compareRush();
  it("prices the normal line as the CNC guide does", () => {
    expect(rows.map((c) => c.normal.totalCents)).toEqual(
      priceExample(BASE).breaks.map((b) => b.totalCents),
    );
  });
  it("matches a hand check of the rush", () => {
    const [one, ten, hundred] = rows;
    // Setups: program 60 min at $123.85 = 12,385; op 1 45 min and op 2 30 min at $147.85 =
    // 11,088.75→11,089 + 7,392.5→7,393; the bumped job 50 min at $123.85 = 10,320.83→10,321.
    expect(one?.rush.setupCents).toBe(12_385 + 11_089 + 7_393 + 10_321);
    // Run, 2 starts at $147.85/h: 14 min 6,899.67→6,900; 8 min 3,942.67→3,943; 4 min 1,971.33→1,971
    expect(one?.rush.runCents).toBe(6_900 + 3_943 + 1_971);
    // Expedited anodize: 2 starts × $5.25 is under the $300 minimum; 104 starts × $5.25 = $546
    expect(one?.rush.finishingCents).toBe(30_000);
    expect(hundred?.rush.finishingCents).toBe(54_600);
    expect(one?.rush.extrasCents).toBe(8_500);
    expect(rows.map((c) => c.rush.unitPriceCents)).toEqual([101_152, 16_531, 8_687]);
    // A flat 25% is short on the small lots and over on the large one.
    expect(one?.flatMinusRushCents).toBeLessThan(0);
    expect(ten?.flatMinusRushCents).toBeLessThan(0);
    expect(hundred?.flatMinusRushCents).toBeGreaterThan(0);
    expect(rows.map((c) => c.premiumBps)).toEqual([7_224, 4_561, 2_124]);
  });
  it("keeps everything else equal between the two lines", () => {
    const n = normalLine();
    const r = rushLine();
    expect(r.blank).toEqual(n.blank);
    expect(r.operations.slice(0, n.operations.length).map((o) => o.cycleMinutesPerPart)).toEqual(
      n.operations.map((o) => o.cycleMinutesPerPart),
    );
    expect(priceLine({ ...r, quantities: [5] })[0]?.quantity).toBe(5);
    expect(() => priceLine({ ...r, quantities: [0] })).toThrow();
  });
});

describe("/how-to-price-a-rush-job", () => {
  const files = buildSite({ siteUrl: SITE, basePath: "/jobshop", launch: OPEN });
  const page = files.get(fileFor("/how-to-price-a-rush-job")) ?? "";
  it("is built, in the sitemap and llms.txt, and linked from the CNC guide, the lead-time page and the footer", () => {
    expect(page).toContain("<h1>How to price a rush job in a machine shop</h1>");
    expect(files.get("sitemap.xml")).toContain(`${SITE}/how-to-price-a-rush-job`);
    expect(files.get("llms.txt")).toContain(`${SITE}/how-to-price-a-rush-job`);
    for (const from of ["/how-to-quote-cnc-machining", "/machine-shop-lead-time", "/"])
      expect(files.get(fileFor(from))).toContain('href="/jobshop/how-to-price-a-rush-job"');
  });
  it("prints the engine-checked figures and labels them made up", () => {
    for (const c of compareRush()) {
      expect(page).toContain(usdCents(c.rush.totalCents));
      expect(page).toContain(usdCents(c.normal.totalCents));
    }
    expect(page).toContain(usdCents(BASE.hourlyRateCents + RUSH.overtimePremiumCents));
    expect(page).toContain("Every number is made up");
    expect(page).toContain("short at 1 part");
    expect(page).not.toMatch(/industry standard|typically charge/i);
  });
});
