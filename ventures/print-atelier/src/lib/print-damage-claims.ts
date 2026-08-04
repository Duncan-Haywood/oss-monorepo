/**
 * Print Damage Replacement Claim & Carrier Insurance Claim Generator
 * 
 * Automates damage report ingestion, photo evidence verification, carrier insurance claim filing,
 * immediate replacement print dispatch, and financial recovery analytics.
 */

export type DamageClaimReason =
  | "glass_shattered"
  | "frame_dented"
  | "canvas_torn"
  | "print_smudged"
  | "package_lost"
  | "water_damage";

export type CarrierName = "dhl" | "fedex" | "ups" | "usps";

export type ClaimStatus =
  | "submitted"
  | "under_review"
  | "carrier_approved"
  | "carrier_rejected"
  | "replacement_dispatched"
  | "settled";

export interface DamageClaimPayload {
  claimId: string;
  orderId: string;
  trackingNumber: string;
  carrier: CarrierName;
  declaredValueCents: number;
  podReplacementCostCents: number;
  damagePhotosCount: number;
  reason: DamageClaimReason;
  customerNotes?: string;
}

export interface DamageClaimResult {
  claimId: string;
  orderId: string;
  carrier: CarrierName;
  status: ClaimStatus;
  declaredValueCents: number;
  reimbursementClaimedCents: number;
  podReplacementCostCents: number;
  netPlatformLossCents: number;
  photoEvidenceValid: boolean;
  autoApprovedForReprint: boolean;
  carrierInsuranceFilingPayload: {
    carrier: CarrierName;
    trackingNumber: string;
    claimAmountCents: number;
    evidencePhotoCount: number;
    claimDescription: string;
  };
  reprintOrderPayload: {
    originalOrderId: string;
    expeditedPriority: boolean;
    replacementPodCostCents: number;
  };
  notes: string[];
}

export interface DamageClaimSummary {
  totalClaims: number;
  totalDeclaredValueCents: number;
  totalReimbursementClaimedCents: number;
  totalPodReplacementCostCents: number;
  totalNetLossCents: number;
  autoApprovalRatePercent: number;
  photoValidationPassRatePercent: number;
  carrierBreakdown: Record<CarrierName, number>;
}

const MINIMUM_EVIDENCE_PHOTOS = 2;

/**
 * Evaluates a damage claim report, builds carrier insurance claim filing, and triggers immediate replacement reprint.
 */
export function processDamageClaim(payload: DamageClaimPayload): DamageClaimResult {
  const notes: string[] = [];
  const photoEvidenceValid = payload.damagePhotosCount >= MINIMUM_EVIDENCE_PHOTOS;

  if (!photoEvidenceValid) {
    notes.push(`Insufficient photo evidence (${payload.damagePhotosCount}/${MINIMUM_EVIDENCE_PHOTOS} photos provided). Manual ops review required.`);
  } else {
    notes.push("Photo evidence verified. Clear damage documentation present.");
  }

  // Auto-approve replacement reprint if photo evidence is clear OR declared value is under $150 (15000 cents)
  const autoApprovedForReprint = photoEvidenceValid || payload.declaredValueCents <= 15000;
  if (autoApprovedForReprint) {
    notes.push("Auto-approved for immediate replacement print dispatch to protect customer experience.");
  }

  // Carrier reimbursement claim amount is capped at declared value
  const claimAmountCents = photoEvidenceValid ? payload.declaredValueCents : Math.round(payload.declaredValueCents * 0.5);

  const initialStatus: ClaimStatus = photoEvidenceValid ? "carrier_approved" : "under_review";
  const netPlatformLossCents = payload.podReplacementCostCents - (photoEvidenceValid ? claimAmountCents : 0);

  return {
    claimId: payload.claimId,
    orderId: payload.orderId,
    carrier: payload.carrier,
    status: initialStatus,
    declaredValueCents: payload.declaredValueCents,
    reimbursementClaimedCents: claimAmountCents,
    podReplacementCostCents: payload.podReplacementCostCents,
    netPlatformLossCents: Math.max(0, netPlatformLossCents),
    photoEvidenceValid,
    autoApprovedForReprint,
    carrierInsuranceFilingPayload: {
      carrier: payload.carrier,
      trackingNumber: payload.trackingNumber,
      claimAmountCents,
      evidencePhotoCount: payload.damagePhotosCount,
      claimDescription: `Insurance claim for damaged artwork shipment (${payload.reason}). Declared value: $${(payload.declaredValueCents / 100).toFixed(2)}.`,
    },
    reprintOrderPayload: {
      originalOrderId: payload.orderId,
      expeditedPriority: true,
      replacementPodCostCents: payload.podReplacementCostCents,
    },
    notes,
  };
}

/**
 * Summarizes aggregate statistics across processed damage claims.
 */
export function summarizeDamageClaims(results: DamageClaimResult[]): DamageClaimSummary {
  const totalClaims = results.length;
  if (totalClaims === 0) {
    return {
      totalClaims: 0,
      totalDeclaredValueCents: 0,
      totalReimbursementClaimedCents: 0,
      totalPodReplacementCostCents: 0,
      totalNetLossCents: 0,
      autoApprovalRatePercent: 0,
      photoValidationPassRatePercent: 0,
      carrierBreakdown: { dhl: 0, fedex: 0, ups: 0, usps: 0 },
    };
  }

  const totalDeclaredValueCents = results.reduce((sum, r) => sum + r.declaredValueCents, 0);
  const totalReimbursementClaimedCents = results.reduce((sum, r) => sum + r.reimbursementClaimedCents, 0);
  const totalPodReplacementCostCents = results.reduce((sum, r) => sum + r.podReplacementCostCents, 0);
  const totalNetLossCents = results.reduce((sum, r) => sum + r.netPlatformLossCents, 0);

  const autoApprovedCount = results.filter((r) => r.autoApprovedForReprint).length;
  const photoValidCount = results.filter((r) => r.photoEvidenceValid).length;

  const carrierBreakdown: Record<CarrierName, number> = { dhl: 0, fedex: 0, ups: 0, usps: 0 };
  for (const r of results) {
    carrierBreakdown[r.carrier] = (carrierBreakdown[r.carrier] || 0) + 1;
  }

  return {
    totalClaims,
    totalDeclaredValueCents,
    totalReimbursementClaimedCents,
    totalPodReplacementCostCents,
    totalNetLossCents,
    autoApprovalRatePercent: Math.round((autoApprovedCount / totalClaims) * 10000) / 100,
    photoValidationPassRatePercent: Math.round((photoValidCount / totalClaims) * 10000) / 100,
    carrierBreakdown,
  };
}

/**
 * Generates Convex Schema snippet for damage claims and carrier filings.
 */
export function generateConvexDamageClaimsSchema(): string {
  return `
export const damage_claims = defineTable({
  claimId: v.string(),
  orderId: v.string(),
  trackingNumber: v.string(),
  carrier: v.string(),
  declaredValueCents: v.number(),
  reimbursementClaimedCents: v.number(),
  status: v.string(),
  autoApprovedForReprint: v.boolean(),
  createdAt: v.number(),
}).index("by_order", ["orderId"])
  .index("by_status", ["status"]);
`.trim();
}

/**
 * In-memory store for damage claims
 */
class DamageClaimsStore {
  private claims: DamageClaimResult[] = [];

  public recordClaim(claim: DamageClaimResult): void {
    this.claims.push(claim);
  }

  public getClaims(): DamageClaimResult[] {
    return [...this.claims];
  }

  public getClaimById(claimId: string): DamageClaimResult | undefined {
    return this.claims.find((c) => c.claimId === claimId);
  }

  public clear(): void {
    this.claims = [];
  }
}

export const damageClaimsStore = new DamageClaimsStore();
