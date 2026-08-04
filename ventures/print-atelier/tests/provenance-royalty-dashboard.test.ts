import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  generateProvenanceQrUrl,
  verifyArtworkProvenance,
  calculateSecondaryResaleRoyalties,
  ProvenanceCertificate,
  SecondaryResaleTransaction,
} from "../src/lib/provenance-royalty-dashboard.ts";

describe("Art Collector Provenance & Resale Royalties Engine", () => {
  it("generates deterministic QR verification URLs for provenance certificates", () => {
    const url = generateProvenanceQrUrl("https://printatelier.com", "CERT-8849", "a1b2c3d4e5f6789");
    assert.equal(url, "https://printatelier.com/verify/CERT-8849?hash=a1b2c3d4e5f6");
  });

  it("verifies authentic certificates with matching cryptographic signatures", () => {
    const certificate: ProvenanceCertificate = {
      certificateId: "CERT-1001",
      editionNumber: 2,
      editionTotal: 10,
      artworkTitle: "Urban Dawn",
      artistName: "Sophia Lin",
      originalSalePriceUsd: 4_000,
      originalSaleDate: "2024-05-10",
      currentOwnerName: "Art Fund Alpha",
      currentOwnerWalletOrEmail: "alpha@artfund.com",
      signatureHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    };

    const validResult = verifyArtworkProvenance(
      certificate,
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );

    assert.equal(validResult.isValid, true);
    assert.equal(validResult.status, "AUTHENTIC_RECORDED");
    assert.equal(validResult.editionLabel, "2 of 10");
    assert.ok(validResult.qrVerificationUrl.includes("CERT-1001"));

    const invalidHashResult = verifyArtworkProvenance(certificate, "wronghash123456789");

    assert.equal(invalidHashResult.isValid, false);
    assert.equal(invalidHashResult.status, "SIGNATURE_MISMATCH");
  });

  it("handles missing certificate records gracefully", () => {
    const missingResult = verifyArtworkProvenance(null, "somehash");

    assert.equal(missingResult.isValid, false);
    assert.equal(missingResult.status, "RECORD_NOT_FOUND");
    assert.equal(missingResult.certificateId, "UNKNOWN");
  });

  it("calculates secondary market resale volume, royalties earned, and appreciation", () => {
    const certificates: ProvenanceCertificate[] = [
      {
        certificateId: "cert-1",
        editionNumber: 1,
        editionTotal: 5,
        artworkTitle: "Golden Hour",
        artistName: "Marcus Vance",
        originalSalePriceUsd: 5_000,
        originalSaleDate: "2023-01-15",
        currentOwnerName: "Collector A",
        currentOwnerWalletOrEmail: "a@ex.com",
        signatureHash: "hash111",
      },
      {
        certificateId: "cert-2",
        editionNumber: 2,
        editionTotal: 5,
        artworkTitle: "Golden Hour",
        artistName: "Marcus Vance",
        originalSalePriceUsd: 5_000,
        originalSaleDate: "2023-01-16",
        currentOwnerName: "Collector B",
        currentOwnerWalletOrEmail: "b@ex.com",
        signatureHash: "hash222",
      },
    ];

    const transactions: SecondaryResaleTransaction[] = [
      {
        transactionId: "tx-100",
        certificateId: "cert-1",
        resalePriceUsd: 10_000, // 100% appreciation
        resaleDate: "2025-06-01",
        sellerIdentifier: "Collector A",
        buyerIdentifier: "Gallery X",
        marketplaceName: "SuperRare Fine Art",
        contractRoyaltyPercentage: 10, // $1,000 royalty
      },
      {
        transactionId: "tx-101",
        certificateId: "cert-2",
        resalePriceUsd: 7_500, // 50% appreciation
        resaleDate: "2025-07-15",
        sellerIdentifier: "Collector B",
        buyerIdentifier: "Museum Y",
        marketplaceName: "Sotheby's Digital",
        contractRoyaltyPercentage: 10, // $750 royalty
      },
    ];

    const summary = calculateSecondaryResaleRoyalties(certificates, transactions);

    assert.equal(summary.length, 1);
    assert.equal(summary[0].artistName, "Marcus Vance");
    assert.equal(summary[0].totalSecondaryVolumeUsd, 17_500);
    assert.equal(summary[0].totalRoyaltiesEarnedUsd, 1_750);
    assert.equal(summary[0].resaleCount, 2);
    assert.equal(summary[0].averageAppreciationPercentage, 75); // (100% + 50%) / 2
  });
});
