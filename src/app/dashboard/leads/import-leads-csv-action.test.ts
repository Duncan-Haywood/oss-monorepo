import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for importLeadsCsvAction — the operator bulk
 * inventory path (parseLeadsCsv + partitionLeadsByExistingSlugs + per-row
 * LEAD_UPSERT_CONVEX_PRIMARY fail-closed).
 *
 * csv-import / upsert-persist helper suites cover parse, collision message,
 * and the requireConvex constant. This suite locks the dashboard action glue:
 * requireOperatorAuth, empty CSV, no-valid-leads parse failure, success
 * upsert + revalidate, existing-slug skip (no upsert), in-batch duplicate
 * slug skip after earlier insert, ConvexPrimaryWriteError per-row retry
 * message (other rows may still import), all-fail → success:false, and
 * Error / non-Error throws from the outer catch.
 */

const requireOperatorAuth = vi.fn();
vi.mock("@/lib/auth/operator", () => ({
  requireOperatorAuth: (...args: unknown[]) => requireOperatorAuth(...args),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

const getLeads = vi.fn();
const upsertLead = vi.fn();

vi.mock("@/lib/db", () => ({
  listOpenCheckoutSessions: vi.fn(),
  getLeadBySlug: vi.fn(),
  recordCheckoutRecoverySent: vi.fn(),
  getCommerceCatalog: vi.fn(),
  updateLeadStage: vi.fn(),
  upsertLead: (...args: unknown[]) => upsertLead(...args),
  updateClientInquiryStatus: vi.fn(),
  getClientInquiryById: vi.fn(),
  recordClientInquiryReply: vi.fn(),
  getLeads: (...args: unknown[]) => getLeads(...args),
  listOrders: vi.fn(),
  recordLeadOutreach: vi.fn(),
  listUnrepliedInquiries: vi.fn(),
  updateLeadNotes: vi.fn(),
  updateLeadSnooze: vi.fn(),
  applyColdLeadDisposition: vi.fn(),
  upsertMarketingPack: vi.fn(),
  listMarketingPacksForMonth: vi.fn(),
  getMarketingPack: vi.fn(),
  upsertCommerceCatalog: vi.fn(),
  listCommerceCatalogs: vi.fn(),
  getCommerceOrderByStripeSessionId: vi.fn(),
  markCommerceOrderPaidOut: vi.fn(),
  upsertClientVoicePack: vi.fn(),
  getClientVoicePackByLeadSlug: vi.fn(),
  listClientVoicePacks: vi.fn(),
  listUnpaidCommerceOrders: vi.fn(),
}));

vi.mock("@/lib/email/resend", () => ({
  sendOutreachEmail: vi.fn(),
  sendOutreachFollowUp2: vi.fn(),
  sendOutreachFollowUp3: vi.fn(),
  sendInquiryReply: vi.fn(),
  sendOperatorDailyDigest: vi.fn(),
  sendStarterUpsellEmail: vi.fn(),
  sendMarketingPackToClientEmail: vi.fn(),
  sendClientVoicePackToClientEmail: vi.fn(),
}));

vi.mock("@/lib/leads/upsert-persist", () => ({
  LEAD_UPSERT_CONVEX_PRIMARY: { requireConvex: true },
}));

class MockConvexPrimaryWriteError extends Error {
  constructor(message = "Convex primary write failed") {
    super(message);
    this.name = "ConvexPrimaryWriteError";
  }
}

vi.mock("@/lib/payments/convex-primary", () => ({
  ConvexPrimaryWriteError: MockConvexPrimaryWriteError,
}));

function csvFor(...rows: string[][]): string {
  const header =
    "businessName,category,city,state,address,phone,email,services,tagline,description,recommendedTier,slug";
  return [header, ...rows.map((r) => r.join(","))].join("\n");
}

const salonRow = [
  "Blue River Salon",
  "salon",
  "Denver",
  "CO",
  "1200 Blake St",
  "(303) 555-0100",
  "hello@blueriversalon.example",
  "Haircuts; Color",
  "Calm appointments",
  "Salon in RiNo",
  "complete",
  "blue-river-salon",
];

const cafeRow = [
  "Demo Cafe",
  "restaurant",
  "Austin",
  "TX",
  "100 Main St",
  "(512) 555-0100",
  "owner@demo.cafe",
  "Coffee; Pastries",
  "Neighborhood cafe",
  "Coffee shop",
  "starter",
  "demo-cafe",
];

describe("importLeadsCsvAction", () => {
  beforeEach(() => {
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    revalidatePath.mockReset();
    getLeads.mockReset().mockResolvedValue([]);
    upsertLead.mockReset().mockResolvedValue(undefined);
  });

  it("returns auth error without parsing or upserting", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { importLeadsCsvAction } = await import("./actions");
    const res = await importLeadsCsvAction({ csvText: csvFor(salonRow) });
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getLeads).not.toHaveBeenCalled();
    expect(upsertLead).not.toHaveBeenCalled();
  });

  it("rejects empty CSV text without calling getLeads", async () => {
    const { importLeadsCsvAction } = await import("./actions");
    const res = await importLeadsCsvAction({ csvText: "   " });
    expect(res).toEqual({
      success: false,
      error: "CSV text is empty",
    });
    expect(getLeads).not.toHaveBeenCalled();
    expect(upsertLead).not.toHaveBeenCalled();
  });

  it("hard-rejects over-long csvText before parse / getLeads / upsert", async () => {
    const { MAX_CSV_IMPORT_TEXT_LENGTH } = await import(
      "@/lib/leads/csv-import",
    );
    const over = "x".repeat(MAX_CSV_IMPORT_TEXT_LENGTH + 1);
    expect(over.length).toBeGreaterThan(MAX_CSV_IMPORT_TEXT_LENGTH);
    const { importLeadsCsvAction } = await import("./actions");
    const res = await importLeadsCsvAction({ csvText: over });
    expect(res).toEqual({
      success: false,
      error: "CSV text is too long",
    });
    expect(getLeads).not.toHaveBeenCalled();
    expect(upsertLead).not.toHaveBeenCalled();
  });

  it("accepts exactly MAX_CSV_IMPORT_TEXT_LENGTH when the CSV still parses", async () => {
    const { MAX_CSV_IMPORT_TEXT_LENGTH } = await import(
      "@/lib/leads/csv-import",
    );
    // Pad a valid one-row CSV up to exact max with trailing spaces (ignored by
    // the parser) so length-gate accepts and upsert still runs.
    const base = csvFor(salonRow);
    const pad = " ".repeat(MAX_CSV_IMPORT_TEXT_LENGTH - base.length);
    const exact = base + pad;
    expect(exact.length).toBe(MAX_CSV_IMPORT_TEXT_LENGTH);
    const { importLeadsCsvAction } = await import("./actions");
    const res = await importLeadsCsvAction({ csvText: exact });
    expect(res.success).toBe(true);
    expect(upsertLead).toHaveBeenCalledOnce();
  });

  it("returns parse failure when CSV has no valid leads", async () => {
    const { importLeadsCsvAction } = await import("./actions");
    const res = await importLeadsCsvAction({
      csvText: csvFor([
        "",
        "salon",
        "Denver",
        "CO",
        "",
        "",
        "",
        "",
        "",
        "",
        "complete",
        "missing-name",
      ]),
    });
    expect(res.success).toBe(false);
    expect(res.imported).toBe(0);
    expect(upsertLead).not.toHaveBeenCalled();
    expect(getLeads).not.toHaveBeenCalled();
  });

  it("upserts fresh rows with LEAD_UPSERT_CONVEX_PRIMARY and revalidates", async () => {
    const { importLeadsCsvAction } = await import("./actions");
    const res = await importLeadsCsvAction({
      csvText: csvFor(salonRow, cafeRow),
      dataSource: "csv_import",
      defaultStage: "discovered",
    });

    expect(res).toMatchObject({
      success: true,
      imported: 2,
      slugs: ["blue-river-salon", "demo-cafe"],
      skipped: 0,
    });
    expect(upsertLead).toHaveBeenCalledTimes(2);
    expect(upsertLead).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        slug: "blue-river-salon",
        businessName: "Blue River Salon",
        dataSource: "csv_import",
        stage: "discovered",
      }),
      { requireConvex: true },
    );
    expect(upsertLead).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        slug: "demo-cafe",
        businessName: "Demo Cafe",
      }),
      { requireConvex: true },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/preview/blue-river-salon");
    expect(revalidatePath).toHaveBeenCalledWith("/preview/demo-cafe");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("soft-caps an over-long dataSource before upsert", async () => {
    const { MAX_LEAD_DATA_SOURCE_LENGTH } = await import(
      "@/lib/leads/create-fields"
    );
    const long = "batch-".repeat(20);
    const { importLeadsCsvAction } = await import("./actions");
    const res = await importLeadsCsvAction({
      csvText: csvFor(salonRow),
      dataSource: long,
    });

    expect(res).toMatchObject({ success: true, imported: 1 });
    expect(upsertLead).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "blue-river-salon",
        dataSource: long.slice(0, MAX_LEAD_DATA_SOURCE_LENGTH),
      }),
      { requireConvex: true },
    );
  });

  it("skips existing slugs without calling upsertLead for collisions", async () => {
    getLeads.mockResolvedValue([{ slug: "blue-river-salon" }]);
    const { existingLeadSlugConflictMessage } = await import(
      "@/lib/leads/csv-import"
    );
    const { importLeadsCsvAction } = await import("./actions");
    const res = await importLeadsCsvAction({
      csvText: csvFor(salonRow, cafeRow),
    });

    expect(res).toMatchObject({
      success: true,
      imported: 1,
      slugs: ["demo-cafe"],
      skipped: 1,
    });
    expect(res.errors).toEqual(
      expect.arrayContaining([
        {
          row: 0,
          message: existingLeadSlugConflictMessage("blue-river-salon"),
        },
      ]),
    );
    expect(upsertLead).toHaveBeenCalledOnce();
    expect(upsertLead).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "demo-cafe" }),
      { requireConvex: true },
    );
  });

  it("auto-suffixes in-batch duplicate slugs at parse time and upserts both", async () => {
    const duplicateSecond = [...salonRow];
    duplicateSecond[0] = "Blue River Salon Copy";
    // same explicit slug column as first row — parseLeadsCsv suffixes -2
    const { importLeadsCsvAction } = await import("./actions");
    const res = await importLeadsCsvAction({
      csvText: csvFor(salonRow, duplicateSecond),
    });

    expect(res).toMatchObject({
      success: true,
      imported: 2,
      slugs: ["blue-river-salon", "blue-river-salon-2"],
      skipped: 0,
    });
    expect(upsertLead).toHaveBeenCalledTimes(2);
    expect(upsertLead).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ slug: "blue-river-salon" }),
      { requireConvex: true },
    );
    expect(upsertLead).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        slug: "blue-river-salon-2",
        businessName: "Blue River Salon Copy",
      }),
      { requireConvex: true },
    );
  });

  it("fails closed per-row on ConvexPrimaryWriteError and still imports siblings", async () => {
    upsertLead
      .mockRejectedValueOnce(new MockConvexPrimaryWriteError())
      .mockResolvedValueOnce(undefined);
    const { importLeadsCsvAction } = await import("./actions");
    const res = await importLeadsCsvAction({
      csvText: csvFor(salonRow, cafeRow),
    });

    expect(res).toMatchObject({
      success: true,
      imported: 1,
      slugs: ["demo-cafe"],
      skipped: 1,
    });
    expect(res.errors).toEqual(
      expect.arrayContaining([
        {
          row: 1,
          message:
            "Could not save this lead in the shared store — other instances may not see it. Retry import for this row.",
        },
      ]),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/preview/demo-cafe");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    expect(revalidatePath).not.toHaveBeenCalledWith("/preview/blue-river-salon");
  });

  it("returns success:false when every fresh row fails Convex primary write", async () => {
    upsertLead.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { importLeadsCsvAction } = await import("./actions");
    const res = await importLeadsCsvAction({
      csvText: csvFor(salonRow),
    });

    expect(res).toMatchObject({
      success: false,
      imported: 0,
      skipped: 1,
      error:
        "Could not save this lead in the shared store — other instances may not see it. Retry import for this row.",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    expect(revalidatePath).not.toHaveBeenCalledWith("/preview/blue-river-salon");
  });

  it("returns success:false when every row is an existing-slug collision", async () => {
    getLeads.mockResolvedValue([
      { slug: "blue-river-salon" },
      { slug: "demo-cafe" },
    ]);
    const { existingLeadSlugConflictMessage } = await import(
      "@/lib/leads/csv-import"
    );
    const { importLeadsCsvAction } = await import("./actions");
    const res = await importLeadsCsvAction({
      csvText: csvFor(salonRow, cafeRow),
    });

    expect(res).toMatchObject({
      success: false,
      imported: 0,
      skipped: 2,
      error: existingLeadSlugConflictMessage("blue-river-salon"),
    });
    expect(upsertLead).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("surfaces unexpected Error messages from getLeads", async () => {
    getLeads.mockRejectedValue(new Error("db offline"));
    const { importLeadsCsvAction } = await import("./actions");
    const res = await importLeadsCsvAction({
      csvText: csvFor(salonRow),
    });
    expect(res).toEqual({
      success: false,
      error: "db offline",
    });
    expect(upsertLead).not.toHaveBeenCalled();
  });

  it("surfaces non-Error throws as Unknown error", async () => {
    getLeads.mockRejectedValue("boom");
    const { importLeadsCsvAction } = await import("./actions");
    const res = await importLeadsCsvAction({
      csvText: csvFor(salonRow),
    });
    expect(res).toEqual({
      success: false,
      error: "Unknown error",
    });
    expect(upsertLead).not.toHaveBeenCalled();
  });

  it("surfaces unexpected Error messages from a non-Convex upsert failure as a row error", async () => {
    upsertLead.mockRejectedValue(new Error("sqlite locked"));
    const { importLeadsCsvAction } = await import("./actions");
    const res = await importLeadsCsvAction({
      csvText: csvFor(salonRow),
    });
    expect(res).toMatchObject({
      success: false,
      imported: 0,
      error: "sqlite locked",
    });
    expect(res.errors).toEqual(
      expect.arrayContaining([{ row: 1, message: "sqlite locked" }]),
    );
  });
});
