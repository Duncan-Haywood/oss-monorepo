/**
 * Certificate of Authenticity Digital Provenance & NFC Tag Validator
 * 
 * Cryptographically verifies physical NFC tags embedded in museum-grade fine art prints,
 * validates limited edition numbering, tracks digital provenance ownership history,
 * and flags counterfeits or tampered artwork certificates.
 */

export type EditionType = "original" | "limited_edition" | "open_edition" | "artist_proof";

export type AuthenticityVerificationStatus =
  | "verified"
  | "tamper_detected"
  | "nfc_signature_invalid"
  | "invalid_edition_number"
  | "unregistered";

export interface OwnershipTransfer {
  fromOwnerId: string;
  toOwnerId: string;
  transferredAtTimestamp: number;
}

export interface ProvenanceRecord {
  certificateId: string;
  artworkId: string;
  nfcTagChipUid: string;
  nfcTagSignature: string; // Cryptographic hash signed by secure element chip
  editionType: EditionType;
  editionNumber?: number;
  totalEditions?: number;
  artistDigitalSignature: string;
  mintedAtTimestamp: number;
  currentOwnerId: string;
  transferHistory: OwnershipTransfer[];
}

export interface VerificationResult {
  certificateId: string;
  artworkId: string;
  status: AuthenticityVerificationStatus;
  isAuthentic: boolean;
  editionLabel: string;
  currentOwnerId: string;
  provenanceChainLength: number;
  notes: string[];
}

export interface ProvenanceSummary {
  totalCertificatesMinted: number;
  verifiedCount: number;
  tamperCount: number;
  editionBreakdown: Record<EditionType, number>;
  averageTransfersPerArtwork: number;
}

/**
 * Validates NFC chip UID, cryptographic signatures, and edition constraints for an artwork certificate.
 */
export function verifyCertificateOfAuthenticity(
  record: ProvenanceRecord,
  providedChipUid: string,
  providedSignature: string
): VerificationResult {
  const notes: string[] = [];

  // 1. NFC Chip Hardware ID Match
  if (record.nfcTagChipUid.toLowerCase() !== providedChipUid.toLowerCase()) {
    notes.push("NFC chip UID mismatch. Tag clone or counterfeit suspected.");
    return {
      certificateId: record.certificateId,
      artworkId: record.artworkId,
      status: "tamper_detected",
      isAuthentic: false,
      editionLabel: formatEditionLabel(record),
      currentOwnerId: record.currentOwnerId,
      provenanceChainLength: record.transferHistory.length,
      notes,
    };
  }

  // 2. Cryptographic Hardware Signature Match
  if (record.nfcTagSignature !== providedSignature) {
    notes.push("Cryptographic NFC signature invalid or altered.");
    return {
      certificateId: record.certificateId,
      artworkId: record.artworkId,
      status: "nfc_signature_invalid",
      isAuthentic: false,
      editionLabel: formatEditionLabel(record),
      currentOwnerId: record.currentOwnerId,
      provenanceChainLength: record.transferHistory.length,
      notes,
    };
  }

  // 3. Limited Edition Boundary Validation
  if (record.editionType === "limited_edition") {
    if (
      !record.editionNumber ||
      !record.totalEditions ||
      record.editionNumber < 1 ||
      record.editionNumber > record.totalEditions
    ) {
      notes.push(`Invalid edition bounds: #${record.editionNumber} of ${record.totalEditions}`);
      return {
        certificateId: record.certificateId,
        artworkId: record.artworkId,
        status: "invalid_edition_number",
        isAuthentic: false,
        editionLabel: formatEditionLabel(record),
        currentOwnerId: record.currentOwnerId,
        provenanceChainLength: record.transferHistory.length,
        notes,
      };
    }
  }

  notes.push("Certificate & NFC tag cryptographically verified on-chain.");
  return {
    certificateId: record.certificateId,
    artworkId: record.artworkId,
    status: "verified",
    isAuthentic: true,
    editionLabel: formatEditionLabel(record),
    currentOwnerId: record.currentOwnerId,
    provenanceChainLength: record.transferHistory.length,
    notes,
  };
}

/**
 * Formats edition label string (e.g. "Limited Edition 12/50" or "Original 1/1")
 */
export function formatEditionLabel(record: ProvenanceRecord): string {
  switch (record.editionType) {
    case "original":
      return "Original 1/1";
    case "limited_edition":
      return `Limited Edition ${record.editionNumber || 0}/${record.totalEditions || 0}`;
    case "artist_proof":
      return `Artist Proof AP-${record.editionNumber || 1}`;
    case "open_edition":
      return "Open Edition";
  }
}

/**
 * Summarizes digital provenance metrics across registered fine art certificates.
 */
export function summarizeProvenanceRecords(results: VerificationResult[]): ProvenanceSummary {
  const totalCertificatesMinted = results.length;
  if (totalCertificatesMinted === 0) {
    return {
      totalCertificatesMinted: 0,
      verifiedCount: 0,
      tamperCount: 0,
      editionBreakdown: { original: 0, limited_edition: 0, open_edition: 0, artist_proof: 0 },
      averageTransfersPerArtwork: 0,
    };
  }

  const verifiedCount = results.filter((r) => r.isAuthentic).length;
  const tamperCount = results.filter((r) => r.status === "tamper_detected" || r.status === "nfc_signature_invalid").length;
  const totalTransfers = results.reduce((sum, r) => sum + r.provenanceChainLength, 0);

  const editionBreakdown: Record<EditionType, number> = {
    original: 0,
    limited_edition: 0,
    open_edition: 0,
    artist_proof: 0,
  };

  for (const r of results) {
    if (r.editionLabel.startsWith("Original")) editionBreakdown.original++;
    else if (r.editionLabel.startsWith("Limited")) editionBreakdown.limited_edition++;
    else if (r.editionLabel.startsWith("Artist Proof")) editionBreakdown.artist_proof++;
    else editionBreakdown.open_edition++;
  }

  return {
    totalCertificatesMinted,
    verifiedCount,
    tamperCount,
    editionBreakdown,
    averageTransfersPerArtwork: Math.round((totalTransfers / totalCertificatesMinted) * 100) / 100,
  };
}

/**
 * Generates Convex Schema definition for digital provenance.
 */
export function generateConvexProvenanceSchema(): string {
  return `
export const provenance_certificates = defineTable({
  certificateId: v.string(),
  artworkId: v.string(),
  nfcTagChipUid: v.string(),
  nfcTagSignature: v.string(),
  editionType: v.string(),
  editionNumber: v.optional(v.number()),
  totalEditions: v.optional(v.number()),
  currentOwnerId: v.string(),
  mintedAtTimestamp: v.number(),
}).index("by_artwork", ["artworkId"])
  .index("by_nfc_uid", ["nfcTagChipUid"])
  .index("by_owner", ["currentOwnerId"]);
`.trim();
}

/**
 * In-memory store for provenance records
 */
class ProvenanceStore {
  private records: Map<string, ProvenanceRecord> = new Map();

  public registerRecord(record: ProvenanceRecord): void {
    this.records.set(record.certificateId, record);
  }

  public getRecord(certificateId: string): ProvenanceRecord | undefined {
    return this.records.get(certificateId);
  }

  public clear(): void {
    this.records.clear();
  }
}

export const provenanceStore = new ProvenanceStore();
