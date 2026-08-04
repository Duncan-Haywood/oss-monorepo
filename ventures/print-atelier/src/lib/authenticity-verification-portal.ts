/**
 * Automated Fine Art Collector Certificate of Authenticity Verification Portal
 * 
 * Verifies physical and digital print authenticity certificates, cryptographic signatures,
 * edition provenance histories, and protects collectors against counterfeit prints.
 */

export type AuthenticityStatus = "valid_verified" | "flagged_stolen" | "archived" | "unverified";

export interface CertificateRecord {
  certificateId: string;
  printTitle: string;
  artistName: string;
  editionNumber: number;
  totalEditionSize: number;
  digitalSignatureHash: string;
  paperType: string;
  printStudioName: string;
  currentOwnerId: string;
  status: AuthenticityStatus;
  provenanceHistory: Array<{
    eventType: "minted" | "transferred" | "exhibited" | "resold";
    timestamp: number;
    description: string;
  }>;
  createdAt: number;
}

export interface VerificationLookupRequest {
  certificateId: string;
  requestorSessionId: string;
  providedSignatureHash?: string;
}

export interface VerificationResult {
  certificateId: string;
  isAuthentic: boolean;
  status: AuthenticityStatus;
  verificationConfidencePercent: number;
  printTitle?: string;
  artistName?: string;
  editionString?: string;
  provenanceCount: number;
  message: string;
  verifiedAt: number;
}

export interface CertificatePortalSummary {
  totalCertificatesIssued: number;
  totalVerificationsProcessed: number;
  authenticVerificationCount: number;
  flaggedCounterfeitCount: number;
  verificationSuccessRatePercent: number;
}

const certificateStore: Map<string, CertificateRecord> = new Map();
const auditLog: Map<string, VerificationResult> = new Map();

/**
 * Registers a new certificate of authenticity into the portal registry.
 */
export function registerCertificate(record: CertificateRecord): void {
  certificateStore.set(record.certificateId, record);
}

/**
 * Verifies a Certificate of Authenticity against digital signature hashes and registry provenance.
 */
export function verifyCertificateOfAuthenticity(request: VerificationLookupRequest): VerificationResult {
  const { certificateId, providedSignatureHash } = request;
  const cert = certificateStore.get(certificateId);

  if (!cert) {
    const notFoundResult: VerificationResult = {
      certificateId,
      isAuthentic: false,
      status: "unverified",
      verificationConfidencePercent: 0,
      provenanceCount: 0,
      message: "Certificate ID not found in official Print Atelier authenticity registry.",
      verifiedAt: Date.now(),
    };
    auditLog.set(`${certificateId}_${Date.now()}`, notFoundResult);
    return notFoundResult;
  }

  if (cert.status === "flagged_stolen") {
    const stolenResult: VerificationResult = {
      certificateId,
      isAuthentic: false,
      status: "flagged_stolen",
      verificationConfidencePercent: 0,
      printTitle: cert.printTitle,
      artistName: cert.artistName,
      editionString: `${cert.editionNumber}/${cert.totalEditionSize}`,
      provenanceCount: cert.provenanceHistory.length,
      message: "WARNING: Artwork print or certificate has been reported stolen or compromised.",
      verifiedAt: Date.now(),
    };
    auditLog.set(`${certificateId}_${Date.now()}`, stolenResult);
    return stolenResult;
  }

  let confidence = 90;
  let isSignatureMatch = true;

  if (providedSignatureHash) {
    if (providedSignatureHash.toLowerCase() === cert.digitalSignatureHash.toLowerCase()) {
      confidence = 100;
    } else {
      confidence = 20;
      isSignatureMatch = false;
    }
  }

  const isAuthentic = cert.status === "valid_verified" && isSignatureMatch;
  const editionString = `${cert.editionNumber}/${cert.totalEditionSize}`;
  const message = isAuthentic
    ? `Verified authentic print by ${cert.artistName}. Edition ${editionString}.`
    : "Cryptographic signature mismatch; potential counterfeit print.";

  const result: VerificationResult = {
    certificateId,
    isAuthentic,
    status: cert.status,
    verificationConfidencePercent: confidence,
    printTitle: cert.printTitle,
    artistName: cert.artistName,
    editionString,
    provenanceCount: cert.provenanceHistory.length,
    message,
    verifiedAt: Date.now(),
  };

  auditLog.set(`${certificateId}_${Date.now()}`, result);
  return result;
}

/**
 * Summarizes global authenticity verification portal activity.
 */
export function summarizeAuthenticityPortal(): CertificatePortalSummary {
  const totalCertificatesIssued = certificateStore.size;
  const auditEntries = Array.from(auditLog.values());
  const totalVerificationsProcessed = auditEntries.length;

  let authenticVerificationCount = 0;
  let flaggedCounterfeitCount = 0;

  for (const entry of auditEntries) {
    if (entry.isAuthentic) {
      authenticVerificationCount++;
    } else {
      flaggedCounterfeitCount++;
    }
  }

  const verificationSuccessRatePercent = totalVerificationsProcessed > 0
    ? Math.round((authenticVerificationCount / totalVerificationsProcessed) * 1000) / 10
    : 100;

  return {
    totalCertificatesIssued,
    totalVerificationsProcessed,
    authenticVerificationCount,
    flaggedCounterfeitCount,
    verificationSuccessRatePercent,
  };
}

/**
 * Generates Convex Schema snippet for authenticity_certificates and verification_audits tables.
 */
export function generateConvexAuthenticitySchema(): string {
  return `
export const authenticity_certificates = defineTable({
  certificateId: v.string(),
  printTitle: v.string(),
  artistName: v.string(),
  editionNumber: v.number(),
  totalEditionSize: v.number(),
  digitalSignatureHash: v.string(),
  paperType: v.string(),
  status: v.string(),
  createdAt: v.number(),
}).index("by_artist", ["artistName"])
  .index("by_status", ["status"]);

export const verification_audits = defineTable({
  certificateId: v.string(),
  isAuthentic: v.boolean(),
  verificationConfidencePercent: v.number(),
  verifiedAt: v.number(),
}).index("by_certificate", ["certificateId"]);
`.trim();
}

/**
 * Clears in-memory stores for testing.
 */
export function clearAuthenticityStoreForTesting(): void {
  certificateStore.clear();
  auditLog.clear();
}
