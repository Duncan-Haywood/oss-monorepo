import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  processPayoutTaxLedger,
  exportTaxLedgerReport,
  generateConvexPayoutTaxLedgerSchema,
  getPayoutTaxLedgerEntry,
  clearTaxLedgerStoreForTesting,
  ArtistTaxProfile,
  TAX_REPORTING_THRESHOLD_USD_CENTS,
} from "../src/lib/payout-tax-ledger.js";

describe("payout-tax-ledger", () => {
  beforeEach(() => {
    clearTaxLedgerStoreForTesting();
  });

  const verifiedUSArtist: ArtistTaxProfile = {
    artistId: "artist_us_001",
    legalName: "Jane Doe",
    taxFormType: "W9_US_RESIDENT",
    isFormVerified: true,
    countryCode: "US",
    ytdGrossPayoutUsdCents: 50000, // $500.00 USD
  };

  const unverifiedNonUSArtist: ArtistTaxProfile = {
    artistId: "artist_de_002",
    legalName: "Hans Müller",
    taxFormType: "W8BEN_NON_US_INDIVIDUAL",
    isFormVerified: false,
    countryCode: "DE",
    ytdGrossPayoutUsdCents: 55000, // $550.00 USD
  };

  describe("processPayoutTaxLedger", () => {
    it("processes 0% tax withholding for verified US artist below threshold", () => {
      const entry = processPayoutTaxLedger(verifiedUSArtist, 20000, "entry_001");

      assert.equal(entry.artistId, "artist_us_001");
      assert.equal(entry.grossPayoutUsdCents, 20000);
      assert.equal(entry.withholdingRatePercent, 0.0);
      assert.equal(entry.taxWithheldUsdCents, 0);
      assert.equal(entry.netPayoutUsdCents, 20000);
      assert.equal(entry.requires1099K, true); // $500 + $200 = $700 (crosses $600 threshold)
      assert.equal(entry.isPayoutBlockedForTaxForm, false); // Form is verified!
    });

    it("blocks payout and applies 30% statutory withholding for unverified W-8BEN crossing $600 threshold", () => {
      const entry = processPayoutTaxLedger(unverifiedNonUSArtist, 10000, "entry_002");

      assert.equal(entry.artistId, "artist_de_002");
      assert.equal(entry.grossPayoutUsdCents, 10000);
      assert.equal(entry.withholdingRatePercent, 30.0);
      assert.equal(entry.taxWithheldUsdCents, 3000);
      assert.equal(entry.isPayoutBlockedForTaxForm, true); // Unverified over $600!
      assert.equal(entry.netPayoutUsdCents, 0); // Net is $0 until tax form is uploaded
      assert.ok(entry.notes.some((n) => n.includes("Tax Compliance Block")));
    });

    it("applies 24% backup withholding for unverified US W-9", () => {
      const unverifiedUSArtist: ArtistTaxProfile = {
        artistId: "artist_us_003",
        legalName: "John Smith",
        taxFormType: "W9_US_RESIDENT",
        isFormVerified: false,
        countryCode: "US",
        ytdGrossPayoutUsdCents: 10000,
      };

      const entry = processPayoutTaxLedger(unverifiedUSArtist, 10000, "entry_003");

      assert.equal(entry.withholdingRatePercent, 24.0);
      assert.equal(entry.taxWithheldUsdCents, 2400);
      assert.equal(entry.netPayoutUsdCents, 7600);
      assert.equal(entry.isPayoutBlockedForTaxForm, false); // Under $600 YTD
    });
  });

  describe("exportTaxLedgerReport", () => {
    it("generates CSV export and aggregates total gross, withheld, and net payouts", () => {
      const e1 = processPayoutTaxLedger(verifiedUSArtist, 20000, "entry_001");
      const e2 = processPayoutTaxLedger(unverifiedNonUSArtist, 10000, "entry_002");

      const report = exportTaxLedgerReport([e1, e2]);

      assert.equal(report.totalEntries, 2);
      assert.equal(report.totalGrossUsdCents, 30000);
      assert.equal(report.totalTaxWithheldUsdCents, 3000);
      assert.equal(report.blockedPayoutsCount, 1);
      assert.equal(report.requires1099KCount, 2);
      assert.ok(report.csvExportHeader.includes("EntryID,ArtistID,LegalName"));
      assert.equal(report.csvRows.length, 2);
    });
  });

  describe("store & Convex schema", () => {
    it("caches and retrieves payout tax ledger entry by entry ID", () => {
      processPayoutTaxLedger(verifiedUSArtist, 20000, "entry_001");
      const cached = getPayoutTaxLedgerEntry("entry_001");

      assert.ok(cached);
      assert.equal(cached?.artistId, "artist_us_001");
    });

    it("generates valid Convex schema definition for payout_tax_ledgers", () => {
      const schema = generateConvexPayoutTaxLedgerSchema();
      assert.ok(schema.includes("export const payout_tax_ledgers = defineTable({"));
      assert.ok(schema.includes(".index(\"by_blocked\", [\"isPayoutBlockedForTaxForm\"])"));
    });
  });
});
