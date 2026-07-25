import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Lead } from "./leads/types";

/**
 * Direct coverage for src/lib/db.ts's own Convex-first/SQLite-fallback
 * ORCHESTRATION — the `if (convexClient) { try { ...; return; } catch {
 * ...fallback... } } ... SQLite fallback` wiring itself, not just the pure
 * helpers it delegates to (sqlite-queries.ts, convex-primary.ts) which
 * already had isolated coverage.
 *
 * Every other test file that touches "@/lib/db" mocks the whole module away
 * (see AGENT_PROTOCOL's "a `\"server-only\"` lib file cannot be
 * Vitest-tested directly" rule) — which means db.ts's actual branch
 * selection (does a Convex success return early without falling through?
 * does a Convex failure correctly choose fail-closed vs fall-back per
 * `options.requireConvex`? does no-Convex-configured skip Convex entirely?)
 * had never once been exercised by an automated test, only by manual
 * `npm run dev` smoke checks. A regression here (e.g. a missing `return;`
 * after a successful Convex call, or a flipped `shouldFallbackToSqliteOnConvexFailure`
 * condition) would pass tsc/lint/the full mocked Vitest suite/a routine dev
 * smoke check, and only surface in production as a silent split-brain or a
 * duplicate external side effect.
 *
 * Follows the pattern AGENT_PROTOCOL documents for this exact situation:
 * mock the "server-only" guard to a no-op and mock "convex/browser"'s
 * ConvexHttpClient to a controllable fake, so the REAL db.ts module body
 * runs against a fake Convex client and a real (but isolated, temp-dir)
 * SQLite file — not a second reimplementation of its logic. Only two
 * representative exports are covered here (getLeads/getLeadBySlug/upsertLead
 * for the ordinary soft-fallback shape, and updateLeadBufferPostedVariantKeys
 * for the `requireConvex` fail-closed shape) rather than all ~76 exports —
 * every other db.ts function shares one of these same two shapes, so this
 * establishes the reusable test scaffold and a first real regression guard
 * rather than a from-scratch rewrite of the whole file's test surface.
 */

vi.mock("server-only", () => ({}));

const convexQuery = vi.fn();
const convexMutation = vi.fn();

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query(...args: unknown[]) {
      return convexQuery(...args);
    }
    mutation(...args: unknown[]) {
      return convexMutation(...args);
    }
  },
}));

type DbModule = typeof import("./db");

const ORIGINAL_ENV = { ...process.env };
const CONVEX_URL = "https://test-deployment.convex.cloud";

let tmpDir: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;

/**
 * (Re)loads the real db.ts module fresh, with NEXT_PUBLIC_CONVEX_URL set
 * (or deleted) beforehand — db.ts computes its module-level `convexClient`
 * singleton once at import time from that env var, so a fresh
 * `vi.resetModules()` + dynamic import per scenario is required to flip
 * "Convex configured" vs "no Convex client at all".
 */
async function loadDb(convexUrl: string | undefined): Promise<DbModule> {
  vi.resetModules();
  if (convexUrl === undefined) {
    delete process.env.NEXT_PUBLIC_CONVEX_URL;
  } else {
    process.env.NEXT_PUBLIC_CONVEX_URL = convexUrl;
  }
  return import("./db");
}

function testLead(slug: string, overrides: Partial<Lead> = {}): Lead {
  return {
    slug,
    businessName: "Test Business",
    category: "restaurant",
    city: "Boulder",
    state: "CO",
    tagline: "A test business",
    description: "A business used only in tests.",
    phone: "(303) 555-0100",
    services: ["Testing"],
    hours: { weekday: "Mon-Fri 9-5", weekend: "Closed" },
    stage: "discovered",
    recommendedTier: "starter",
    ...overrides,
  };
}

describe("db.ts dual-backend orchestration (real module, mocked Convex client)", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lss-db-orchestration-test-"));
    // db.ts derives its SQLite file path from process.cwd() at import time
    // with no override hook — redirect it to an isolated temp dir so this
    // suite never touches the repo's own local.db.
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    convexQuery.mockReset();
    convexMutation.mockReset();
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  describe("getLeads / getLeadBySlug (soft Convex-first, silent SQLite fallback)", () => {
    it("goes straight to SQLite and never calls Convex when no client is configured", async () => {
      const db = await loadDb(undefined);
      await db.upsertLead(testLead("no-convex-lead"));
      const leads = await db.getLeads();
      expect(convexQuery).not.toHaveBeenCalled();
      expect(leads.map((l) => l.slug)).toContain("no-convex-lead");
    });

    it("returns Convex's result directly on success, without falling through to SQLite", async () => {
      // Convex resolves a payload that shares nothing with the SQLite
      // fallback (which would otherwise return the schema's demo-seeded
      // leads) — if the real return-early path were broken (e.g. a missing
      // `return`), this array would come back padded with demo leads too.
      convexQuery.mockResolvedValueOnce([{ slug: "convex-only-lead" }]);
      const db = await loadDb(CONVEX_URL);
      const leads = await db.getLeads();
      expect(leads).toEqual([{ slug: "convex-only-lead" }]);
      expect(convexQuery).toHaveBeenCalledTimes(1);
    });

    it("falls back to SQLite when the Convex query throws", async () => {
      // Seed via the SQLite-only path first (no Convex client for the seed).
      const seedDb = await loadDb(undefined);
      await seedDb.upsertLead(testLead("fallback-read-lead"));

      convexQuery.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      const leads = await db.getLeads();
      expect(leads.map((l) => l.slug)).toContain("fallback-read-lead");
    });

    it("getLeadBySlug returns Convex's object directly on success", async () => {
      convexQuery.mockResolvedValueOnce({ slug: "convex-single-lead" });
      const db = await loadDb(CONVEX_URL);
      const lead = await db.getLeadBySlug("convex-single-lead");
      expect(lead).toEqual({ slug: "convex-single-lead" });
    });
  });

  describe("upsertLead (soft Convex-first write, no requireConvex passed)", () => {
    it("trusts Convex's return value directly on success rather than recomputing via SQLite", async () => {
      // sqliteUpsertLead would return true for this never-before-seen slug
      // (a fresh insert) — mock Convex to resolve false instead, so the
      // assertion only passes if upsertLead actually used Convex's result
      // and returned early rather than falling through to SQLite.
      convexMutation.mockResolvedValueOnce(false);
      const db = await loadDb(CONVEX_URL);
      const result = await db.upsertLead(testLead("convex-write-lead"));
      expect(result).toBe(false);
      expect(convexMutation).toHaveBeenCalledTimes(1);
    });

    it("falls back to a real SQLite write when the Convex mutation throws", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      const result = await db.upsertLead(testLead("fallback-write-lead"));
      expect(result).toBe(true);

      // Confirm it actually landed in SQLite (readable via the same
      // no-Convex-client path used elsewhere in this suite).
      convexQuery.mockRejectedValueOnce(new Error("convex outage (read)"));
      const lead = await db.getLeadBySlug("fallback-write-lead");
      expect(lead?.businessName).toBe("Test Business");
    });
  });

  describe("updateLeadBufferPostedVariantKeys (requireConvex fail-closed write)", () => {
    it("returns after a successful Convex mutation without touching SQLite", async () => {
      convexMutation.mockResolvedValueOnce(undefined);
      const db = await loadDb(CONVEX_URL);
      // No lead with this slug exists in the fresh SQLite file at all — the
      // SQLite fallback branch would throw "Lead with slug ... not found"
      // if the Convex-success path incorrectly fell through to it, so a
      // clean resolve here proves the early `return;` actually ran.
      await expect(
        db.updateLeadBufferPostedVariantKeys("no-sqlite-row-lead", ["k1"], {
          requireConvex: true,
        }),
      ).resolves.toBeUndefined();
      expect(convexMutation).toHaveBeenCalledTimes(1);
    });

    it("throws ConvexPrimaryWriteError instead of silently falling back when requireConvex is set and Convex fails", async () => {
      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.updateLeadBufferPostedVariantKeys("some-lead", ["k1"], { requireConvex: true }),
      ).rejects.toThrow(/updateLeadBufferPostedVariantKeys/);
    });

    it("falls back to a real SQLite write when requireConvex is not set and Convex fails", async () => {
      // Seed the lead row via the SQLite-only path (no Convex client).
      const seedDb = await loadDb(undefined);
      await seedDb.upsertLead(testLead("buffer-lead"));

      convexMutation.mockRejectedValueOnce(new Error("convex outage"));
      const db = await loadDb(CONVEX_URL);
      await expect(
        db.updateLeadBufferPostedVariantKeys("buffer-lead", ["k1", "k2"]),
      ).resolves.toBeUndefined();

      convexQuery.mockRejectedValueOnce(new Error("convex outage (read)"));
      const lead = await db.getLeadBySlug("buffer-lead");
      expect(lead?.bufferPostedVariantKeys).toEqual(["k1", "k2"]);
    });

    it("throws a not-found error via the pure-SQLite path when no Convex client is configured and the slug does not exist", async () => {
      const db = await loadDb(undefined);
      await expect(
        db.updateLeadBufferPostedVariantKeys("missing-slug", ["k1"]),
      ).rejects.toThrow(/not found/i);
      expect(convexMutation).not.toHaveBeenCalled();
    });
  });
});
