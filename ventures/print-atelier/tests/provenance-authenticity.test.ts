import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  verifyCertificateOfAuthenticity,
  formatEditionLabel,
  summarizeProvenanceRecords,
  generateConvexProvenanceSchema,
  provenanceStore,
  ProvenanceRecord,
} from "../src/lib/provenance-authenticity";

describe("provenance-authenticity", () => {
  beforeEach(() => {
    provenanceStore.clear();
  });

  const sampleRecord: ProvenanceRecord = {
    certificateId: "cert_999",
    artworkId: "art_mona_lisa_01",
    nfcTagChipUid: "04A1B2C3D4E5F6",
    nfcTagSignature: "sig_secp256k1_valid_hash_123",
    editionType: "limited_edition",
    editionNumber: 5,
    totalEditions: 50,
    artistDigitalSignature: "artist_sig_elena_key_88",
    mintedAtTimestamp: 1770000000000,
    currentOwnerId: "collector_usr_77",
    transferHistory: [
      { fromOwnerId: "gallery_primary", toOwnerId: "collector_usr_77", transferredAtTimestamp: 1770500000000 },
    ],
  };

  describe("verifyCertificateOfAuthenticity", () => {
    it("verifies authentic NFC tag and valid limited edition bounds", () => {
      const result = verifyCertificateOfAuthenticity(
        sampleRecord,
        "04A1B2C3D4E5F6",
        "sig_secp256k1_valid_hash_123"
      );

      assert.equal(result.certificateId, "cert_999");
      assert.equal(result.status, "verified");
      assert.equal(result.isAuthentic, true);
      assert.equal(result.editionLabel, "Limited Edition 5/50");
      assert.equal(result.provenanceChainLength, 1);
    });

    it("detects tamper when NFC chip UID does not match", () => {
      const result = verifyCertificateOfAuthenticity(
        sampleRecord,
        "CLONED_CHIP_UID_00",
        "sig_secp256k1_valid_hash_123"
      );

      assert.equal(result.status, "tamper_detected");
      assert.equal(result.isAuthentic, false);
      assert.ok(result.notes.some((n) => n.includes("NFC chip UID mismatch")));
    });

    it("detects invalid cryptographic signature", () => {
      const result = verifyCertificateOfAuthenticity(
        sampleRecord,
        "04A1B2C3D4E5F6",
        "INVALID_CHIP_SIGNATURE"
      );

      assert.equal(result.status, "nfc_signature_invalid");
      assert.equal(result.isAuthentic, false);
    });

    it("flags invalid edition numbering out of bounds", () => {
      const invalidEditionRecord: ProvenanceRecord = {
        ...sampleRecord,
        editionNumber: 55,
        totalEditions: 50,
      };

      const result = verifyCertificateOfAuthenticity(
        invalidEditionRecord,
        "04A1B2C3D4E5F6",
        "sig_secp256k1_valid_hash_123"
      );

      assert.equal(result.status, "invalid_edition_number");
      assert.equal(result.isAuthentic, false);
      assert.ok(result.notes.some((n) => n.includes("Invalid edition bounds")));
    });
  });

  describe("formatEditionLabel", () => {
    it("formats labels for original, limited, artist proof, and open edition", () => {
      assert.equal(formatEditionLabel({ ...sampleRecord, editionType: "original" }), "Original 1/1");
      assert.equal(formatEditionLabel({ ...sampleRecord, editionType: "artist_proof", editionNumber: 2 }), "Artist Proof AP-2");
      assert.equal(formatEditionLabel({ ...sampleRecord, editionType: "open_edition" }), "Open Edition");
    });
  });

  describe("summarizeProvenanceRecords", () => {
    it("aggregates minted, verified, tamper counts, and transfer averages", () => {
      const v1 = verifyCertificateOfAuthenticity(sampleRecord, "04A1B2C3D4E5F6", "sig_secp256k1_valid_hash_123");
      const v2 = verifyCertificateOfAuthenticity(sampleRecord, "CLONED_UID", "sig_secp256k1_valid_hash_123");

      const summary = summarizeProvenanceRecords([v1, v2]);

      assert.equal(summary.totalCertificatesMinted, 2);
      assert.equal(summary.verifiedCount, 1);
      assert.equal(summary.tamperCount, 1);
      assert.equal(summary.averageTransfersPerArtwork, 1);
    });

    it("handles empty results list", () => {
      const summary = summarizeProvenanceRecords([]);
      assert.equal(summary.totalCertificatesMinted, 0);
      assert.equal(summary.verifiedCount, 0);
    });
  });

  describe("provenanceStore & Convex schema", () => {
    it("registers and retrieves record in store", () => {
      provenanceStore.registerRecord(sampleRecord);
      const retrieved = provenanceStore.getRecord("cert_999");

      assert.ok(retrieved);
      assert.equal(retrieved?.artworkId, "art_mona_lisa_01");
    });

    it("generates valid Convex schema definition for provenance_certificates", () => {
      const schema = generateConvexProvenanceSchema();
      assert.ok(schema.includes("export const provenance_certificates = defineTable({"));
      assert.ok(schema.includes(".index(\"by_nfc_uid\", [\"nfcTagChipUid\"])"));
    });
  });
});
