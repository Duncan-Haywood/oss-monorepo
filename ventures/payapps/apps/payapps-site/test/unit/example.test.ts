// The home page's worked example is computed by the app's pay-app math; these pin the figures a
// person can check by hand, so a change in the math or the example shows up here first.
import { buildSite } from "@site/build";
import { exampleApplication } from "@site/example";
import { describe, expect, it } from "vitest";

describe("home page worked example", () => {
  it("is application #2 with hand-checkable G702-style totals", () => {
    const app = exampleApplication();
    const s = app.summary;
    expect(app.number).toBe(2);
    expect(s.contractSumToDateCents).toBe(21_000_000);
    // 58,800 (line 1) + 31,000 (line 2) + 12,300 stored (line 3)
    expect(s.totalCompletedAndStoredCents).toBe(10_210_000);
    expect(s.totalRetainageCents).toBe(1_021_000);
    // application #1: 33,600 work + 24,800 stored, less 10%
    expect(s.lessPreviousCertificatesCents).toBe(5_256_000);
    expect(s.currentPaymentDueCents).toBe(3_933_000);
    expect(app.lines.map((l) => l.percentCompleteBps)).toEqual([7000, 5000, 3000, 0]);
  });

  it("is on the home page, labelled as an example, with no inline styles", () => {
    const home =
      buildSite({ siteUrl: "https://marisstella.app/payapps", appUrl: null }).get("index.html") ??
      "";
    expect(home).toContain("Worked example");
    expect(home).toContain("a made-up electrical job");
    expect(home).toContain("$39,330.00");
    expect(home).not.toContain("style=");
  });
});

describe("home page app screenshots", () => {
  it("shows each committed still at its real size, with alt text and lazy loading", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { SHOTS_DIR } = await import("@site/catalogue");
    const home =
      buildSite({ siteUrl: "https://marisstella.app/payapps", appUrl: null }).get("index.html") ??
      "";
    const imgs = [...home.matchAll(/<img src="\/payapps\/shots\/([^"]+)"([^>]*)>/g)];
    expect(imgs.map((m) => m[1]).sort()).toEqual(readdirSync(SHOTS_DIR).sort());
    for (const [, name, attrs] of imgs) {
      // A VP8X WebP header stores canvas width-1 and height-1 as 24-bit little-endian at 24 and 27.
      const b = readFileSync(`${SHOTS_DIR}/${name}`);
      expect(b.subarray(12, 16).toString("latin1"), name).toBe("VP8X");
      const w = b.readUIntLE(24, 3) + 1;
      const h = b.readUIntLE(27, 3) + 1;
      const [, cw, ch] = /width="(\d+)" height="(\d+)"/.exec(attrs ?? "") ?? [];
      // The phone still is captured at 2x; the attributes give its CSS size.
      const scale = w / Number(cw);
      expect([1, 2], `${name} is ${w}x${h}, attributes say ${cw}x${ch}`).toContain(scale);
      expect(h / scale, name).toBe(Number(ch));
      expect(attrs).toMatch(/loading="lazy"/);
      expect(attrs).toMatch(/alt="[^"]{40,}"/);
    }
    expect(home).toContain("Nothing here is a customer's job.");
  });
});
