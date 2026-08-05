import { resolveSiteUrl } from "./site-url";

export interface ProvenanceCertificate {
  certificateId: string;
  editionNumber: number;
  editionTotal: number;
  artworkTitle: string;
  artistName: string;
  originalSalePriceUsd: number;
  originalSaleDate: string; // ISO date YYYY-MM-DD
  currentOwnerName: string;
  currentOwnerWalletOrEmail: string;
  signatureHash: string; // Cryptographic artwork hash
}

export interface SecondaryResaleTransaction {
  transactionId: string;
  certificateId: string;
  resalePriceUsd: number;
  resaleDate: string; // ISO date YYYY-MM-DD
  sellerIdentifier: string;
  buyerIdentifier: string;
  marketplaceName: string;
  contractRoyaltyPercentage: number; // Standard 5% to 15%
}

export interface RoyaltyPayoutSummary {
  artistName: string;
  totalSecondaryVolumeUsd: number;
  totalRoyaltiesEarnedUsd: number;
  pendingPayoutUsd: number;
  settledPayoutUsd: number;
  resaleCount: number;
  averageAppreciationPercentage: number;
}

export interface VerificationResult {
  isValid: boolean;
  certificateId: string;
  artworkTitle: string;
  artistName: string;
  editionLabel: string;
  verificationTimestamp: string;
  qrVerificationUrl: string;
  status: "AUTHENTIC_RECORDED" | "SIGNATURE_MISMATCH" | "RECORD_NOT_FOUND";
}

/**
 * Generates a verification QR URL for art collectors and galleries.
 *
 * Returns `""` for a null origin. That is not a new convention invented here:
 * `verifyArtworkProvenance` already returns `qrVerificationUrl: ""` on its
 * RECORD_NOT_FOUND branch, so "no URL" is a state this module's readers already
 * handle. What it must never return is a URL on a domain we do not serve — a
 * certificate-of-authenticity link is a provenance claim, and pointing it at a
 * parked page makes that claim about someone else's site.
 */
export function generateProvenanceQrUrl(
  baseUrl: string | null,
  certificateId: string,
  signatureHash: string,
): string {
  if (baseUrl === null) {
    return "";
  }
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const shortHash = signatureHash.slice(0, 12);
  return `${cleanBase}/verify/${certificateId}?hash=${shortHash}`;
}

/**
 * Verifies authenticity of an artwork provenance certificate.
 */
export function verifyArtworkProvenance(
  certificate: ProvenanceCertificate | null,
  providedHash: string,
  // Was the literal `"https://printatelier.com"`. A collector or gallery scans
  // the resulting QR to check an artwork is what it claims to be, so an origin
  // this venture does not serve turns an authenticity check into a link to a
  // stranger. Unconfigured yields `""` — the same "no URL" the RECORD_NOT_FOUND
  // branch below already returns — while `isValid` and `status`, which are what
  // the caller actually decides on, are unaffected.
  baseUrl: string | null = resolveSiteUrl()
): VerificationResult {
  const timestamp = new Date().toISOString();

  if (!certificate) {
    return {
      isValid: false,
      certificateId: "UNKNOWN",
      artworkTitle: "Unknown",
      artistName: "Unknown",
      editionLabel: "N/A",
      verificationTimestamp: timestamp,
      qrVerificationUrl: "",
      status: "RECORD_NOT_FOUND",
    };
  }

  const isHashMatching = certificate.signatureHash.toLowerCase() === providedHash.toLowerCase();

  if (!isHashMatching) {
    return {
      isValid: false,
      certificateId: certificate.certificateId,
      artworkTitle: certificate.artworkTitle,
      artistName: certificate.artistName,
      editionLabel: `${certificate.editionNumber} of ${certificate.editionTotal}`,
      verificationTimestamp: timestamp,
      qrVerificationUrl: generateProvenanceQrUrl(baseUrl, certificate.certificateId, certificate.signatureHash),
      status: "SIGNATURE_MISMATCH",
    };
  }

  return {
    isValid: true,
    certificateId: certificate.certificateId,
    artworkTitle: certificate.artworkTitle,
    artistName: certificate.artistName,
    editionLabel: `${certificate.editionNumber} of ${certificate.editionTotal}`,
    verificationTimestamp: timestamp,
    qrVerificationUrl: generateProvenanceQrUrl(baseUrl, certificate.certificateId, certificate.signatureHash),
    status: "AUTHENTIC_RECORDED",
  };
}

/**
 * Calculates artist secondary market royalty payouts and artwork appreciation metrics.
 */
export function calculateSecondaryResaleRoyalties(
  certificates: ProvenanceCertificate[],
  transactions: SecondaryResaleTransaction[]
): RoyaltyPayoutSummary[] {
  const certMap = new Map<string, ProvenanceCertificate>();
  for (const cert of certificates) {
    certMap.set(cert.certificateId, cert);
  }

  const artistSummaryMap = new Map<
    string,
    {
      artistName: string;
      totalSecondaryVolumeUsd: number;
      totalRoyaltiesEarnedUsd: number;
      pendingPayoutUsd: number;
      settledPayoutUsd: number;
      resaleCount: number;
      appreciationPercentages: number[];
    }
  >();

  for (const tx of transactions) {
    const cert = certMap.get(tx.certificateId);
    const artistName = cert ? cert.artistName : "Unknown Artist";

    if (!artistSummaryMap.has(artistName)) {
      artistSummaryMap.set(artistName, {
        artistName,
        totalSecondaryVolumeUsd: 0,
        totalRoyaltiesEarnedUsd: 0,
        pendingPayoutUsd: 0,
        settledPayoutUsd: 0,
        resaleCount: 0,
        appreciationPercentages: [],
      });
    }

    const summary = artistSummaryMap.get(artistName)!;
    summary.totalSecondaryVolumeUsd += tx.resalePriceUsd;

    const royaltyEarned = Math.round(tx.resalePriceUsd * (tx.contractRoyaltyPercentage / 100) * 100) / 100;
    summary.totalRoyaltiesEarnedUsd += royaltyEarned;
    summary.pendingPayoutUsd += royaltyEarned; // Assume pending until settled
    summary.resaleCount += 1;

    if (cert && cert.originalSalePriceUsd > 0) {
      const appreciation = ((tx.resalePriceUsd - cert.originalSalePriceUsd) / cert.originalSalePriceUsd) * 100;
      summary.appreciationPercentages.push(appreciation);
    }
  }

  return Array.from(artistSummaryMap.values()).map((s) => {
    const avgAppreciation =
      s.appreciationPercentages.length > 0
        ? Math.round(
            (s.appreciationPercentages.reduce((a, b) => a + b, 0) / s.appreciationPercentages.length) * 100
          ) / 100
        : 0;

    return {
      artistName: s.artistName,
      totalSecondaryVolumeUsd: Math.round(s.totalSecondaryVolumeUsd * 100) / 100,
      totalRoyaltiesEarnedUsd: Math.round(s.totalRoyaltiesEarnedUsd * 100) / 100,
      pendingPayoutUsd: Math.round(s.pendingPayoutUsd * 100) / 100,
      settledPayoutUsd: Math.round(s.settledPayoutUsd * 100) / 100,
      resaleCount: s.resaleCount,
      averageAppreciationPercentage: avgAppreciation,
    };
  });
}
