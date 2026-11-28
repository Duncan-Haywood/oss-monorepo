// The module landing pages (src/site/module-data.ts): one per built part of the app, honest,
// indexed and linked.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSite, fileFor } from "@site/build";
import type { Launch } from "@site/config";
import { esc } from "@site/html";
import { MODULES } from "@site/module-data";
import { moduleFaqs } from "@site/modules";
import { allRoutes, publicRoutes } from "@site/routes";
import { describe, expect, it } from "vitest";

const SITE = "https://example.test/jobshop";
const OPEN: Launch = {
  appUrl: "https://app.example.test",
  open: true,
  aiReading: false,
  inboundEmail: false,
  paidPlans: false,
};
const CLOSED: Launch = { ...OPEN, appUrl: null, open: false };
const open = buildSite({ siteUrl: SITE, basePath: "/jobshop", launch: OPEN });
const closed = buildSite({ siteUrl: SITE, basePath: "/jobshop", launch: CLOSED });
const ROADMAP = join(__dirname, "../../../jobshop-quote/ROADMAP.md");

function graph(doc: string): Record<string, unknown>[] {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(doc);
  if (!m?.[1]) throw new Error("no JSON-LD");
  return JSON.parse(m[1])["@graph"];
}

describe("module pages", () => {
  it("have unique paths and titles that fit, and never shadow a core page", () => {
    const core = allRoutes(OPEN).filter((r) => !MODULES.some((m) => m.path === r.path));
    const paths = new Set(core.map((r) => r.path));
    for (const m of MODULES) {
      expect(paths.has(m.path), m.path).toBe(false);
      paths.add(m.path);
      expect(`${m.title} · Job Shop Quote`.length, m.path).toBeLessThanOrEqual(70);
      expect(m.description.length, m.path).toBeGreaterThanOrEqual(70);
      expect(m.description.length, m.path).toBeLessThanOrEqual(160);
      expect(m.does.length, m.path).toBeGreaterThanOrEqual(3);
      expect(m.limits.length, m.path).toBeGreaterThanOrEqual(1);
    }
  });

  it("render the module's bullets, limits, FAQ JSON-LD and a sign-up link, with no claims of customers", () => {
    for (const m of MODULES) {
      const doc = open.get(fileFor(m.path)) ?? "";
      expect(doc, m.path).toContain(`<link rel="canonical" href="${SITE}${m.path}">`);
      for (const line of [...m.does, ...m.limits]) expect(doc, line).toContain(esc(line));
      const faq = graph(doc).find((n) => n["@type"] === "FAQPage") as {
        mainEntity: { name: string }[];
      };
      expect(faq.mainEntity.map((q) => q.name)).toEqual(moduleFaqs(OPEN, m).map((f) => f.q));
      expect(doc).toContain('href="https://app.example.test/sign-up?from=jobshop-site%2F');
      expect(doc).not.toMatch(/aggregateRating|testimonial|trusted by|customers love/i);
      expect(doc).toContain("has no customers, reviews or published results yet");
    }
  });

  it("follow the launch switch: early access when closed, paid plans not on sale while dark", () => {
    for (const m of MODULES) {
      const doc = closed.get(fileFor(m.path)) ?? "";
      expect(doc, m.path).toContain('href="/jobshop/early-access"');
      expect(doc).not.toContain("app.example.test/sign-up");
    }
    expect(moduleFaqs(OPEN, MODULES[0] as (typeof MODULES)[number])[0]?.a).toContain(
      "not on sale yet",
    );
  });

  it("give no page to parts that are built but switched off in the hosted app", () => {
    const text = JSON.stringify(MODULES.filter((m) => m.id !== "quickbooks-import"));
    // Inbound RFQ email and the QuickBooks connection are dark (LAUNCH, docs/QUICKBOOKS.md): no
    // module claims them. The import file needs no connection and has its own page, which says the
    // one-click send is not on.
    expect(text).not.toMatch(/QuickBooks|forward(ed)? the RFQ|rfq\+/i);
    const qb = MODULES.find((m) => m.id === "quickbooks-import");
    expect(qb?.limits.join(" ")).toContain("not switched on in the hosted app");
  });

  it("link only pages this site builds", () => {
    const built = new Set(publicRoutes(OPEN).map((r) => r.path));
    for (const m of MODULES) for (const g of m.guides) expect(built.has(g.path), g.path).toBe(true);
  });

  it("are in the sitemap and llms.txt, and linked from how it works", () => {
    for (const files of [open, closed]) {
      for (const m of MODULES) {
        expect(files.get("sitemap.xml")).toContain(`<loc>${SITE}${m.path}</loc>`);
        expect(files.get("llms.txt")).toContain(`(${SITE}${m.path})`);
        expect(files.get("how-it-works.html")).toContain(`href="/jobshop${m.path}"`);
      }
    }
  });

  // The ROADMAP is the source of what is built; each module's page names features it lists as done.
  it.skipIf(!existsSync(ROADMAP))("describe features the app's ROADMAP lists as done", () => {
    const full = readFileSync(ROADMAP, "utf8");
    const done = full.split("\n## Next")[0] ?? "";
    const evidence: Record<string, string[]> = {
      quoting: ["Rate card", "Quote PDF", "Default fallout", "Rate-card workbook"],
      "sheet-metal": ["Sheet-metal operations from a DXF", "Cut speed per material and thickness"],
      // Geometry's finished parts are recorded inside its Next item ("..., done 2026-11-25").
      cad: [
        "Peck time for deep holes",
        "Tap from CAD\" at the machine's seconds per tapped hole, done",
      ],
      "repeat-parts": ["Repeat parts, part 2", "Routings, part 3: suggestions"],
      "material-prices": ["Material price lists, part 2b", "Material priced by the foot"],
      acceptance: ["Customer links: accept or decline online", "Email the quote"],
      "follow-up": ["Quote follow-up", "Quotes about to expire, by email"],
      "win-loss": ["Win/loss analytics, part 3", "Win/loss analytics, part 2"],
      traveler: ["Job traveler"],
      "shop-load": ["Shop load and lead time"],
      "quickbooks-import": ["QuickBooks Online import file"],
    };
    expect(Object.keys(evidence).sort()).toEqual(MODULES.map((m) => m.id).sort());
    for (const [id, needles] of Object.entries(evidence))
      for (const n of needles) {
        const flat = (id === "cad" ? full : done).replace(/\s+/g, " ");
        expect(flat, `${id}: ${n}`).toContain(n);
      }
  });
});
