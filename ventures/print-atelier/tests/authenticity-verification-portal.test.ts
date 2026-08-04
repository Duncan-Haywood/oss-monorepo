import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  registerCertificate,
  verifyCertificateOfAuthenticity,
  summarizeAuthenticityPortal,
  generateConvexAuthenticitySchema,
  clearAuthenticityStoreForTesting,
  CertificateRecord,
  VerificationLookupRequest,
} from "../src/lib/authenticity-verification-portal.js";

describe("authenticity-verification-portal", () => {
  beforeEach(() => {
    clearAuthenticityStoreForTesting();
  });

  const validCert: CertificateRecord = {
    certificateId: "cert_monet_007",
    printTitle: "Water Lilies Edition #7",
    artistName: "Claude Monet Estate",
    editionNumber: 7,
    totalEditionSize: 50,
    digitalSignatureHash: "0xabc123def456789",
    paperType: "Hahnemühle Photo Rag 308gsm",
    printStudioName: "Atelier Paris Fine Art",
    currentOwnerId: "user_collector_88",
    status: "valid_verified",
    provenanceHistory: [
      { eventType: "minted", timestamp: 1735689600000, description: "Minted at Atelier Paris" },
      { eventType: "transferred", timestamp: 1738368000000, description: "Acquired by Collector #88" },
    ],
    createdAt: 1735689600000,
  };

  const stolenCert: CertificateRecord = {
    ...validCert,
    certificateId: "cert_stolen_009",
    status: "flagged_stolen",
  };

  describe("verifyCertificateOfAuthenticity", () => {
    it("verifies valid certificate with 100% confidence when digital signature matches", () => {
      registerCertificate(validCert);

      const request: VerificationLookupRequest = {
        certificateId: "cert_monet_007",
        requestorSessionId: "session_web_001",
        providedSignatureHash: "0xabc123def456789",
      };

      const result = verifyCertificateOfAuthenticity(request);

      assert.equal(result.certificateId, "cert_monet_007");
      assert.equal(result.isAuthentic, true);
      assert.equal(result.verificationConfidencePercent, 100);
      assert.equal(result.editionString, "7/50");
      assert.equal(result.provenanceCount, 2);
    });

    it("rejects verification for stolen flagged certificate", () => {
      registerCertificate(stolenCert);

      const request: VerificationLookupRequest = {
        certificateId: "cert_stolen_009",
        requestorSessionId: "session_web_002",
      };

      const result = verifyCertificateOfAuthenticity(request);

      assert.equal(result.isAuthentic, false);
      assert.equal(result.status, "flagged_stolen");
      assert.equal(result.verificationConfidencePercent, 0);
      assert.ok(result.message.includes("stolen or compromised"));
    });

    it("flags non-existent certificate ID as unverified", () => {
      const request: VerificationLookupRequest = {
        certificateId: "cert_fake_999",
        requestorSessionId: "session_web_003",
      };

      const result = verifyCertificateOfAuthenticity(request);

      assert.equal(result.isAuthentic, false);
      assert.equal(result.status, "unverified");
    });
  });

  describe("summarizeAuthenticityPortal", () => {
    it("summarizes total certificates, verifications, and success rate", () => {
      registerCertificate(validCert);
      verifyCertificateOfAuthenticity({ certificateId: "cert_monet_007", requestorSessionId: "s1" });
      verifyCertificateOfAuthenticity({ certificateId: "cert_fake_999", requestorSessionId: "s2" });

      const summary = summarizeAuthenticityPortal();

      assert.equal(summary.totalCertificatesIssued, 1);
      assert.equal(summary.totalVerificationsProcessed, 2);
      assert.equal(summary.authenticVerificationCount, 1);
      assert.equal(summary.flaggedCounterfeitCount, 1);
      assert.equal(summary.verificationSuccessRatePercent, 50.0);
    });
  });

  describe("Convex schema", () => {
    it("generates valid Convex schema definition for authenticity_certificates", () => {
      const schema = generateConvexAuthenticitySchema();

      assert.ok(schema.includes("export const authenticity_certificates = defineTable({"));
      assert.ok(schema.includes(".index(\"by_artist\", [\"artistName\"])"));
    });
  });
});
