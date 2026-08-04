/**
 * Wholesale Bulk Order Deposit & Escrow Milestone Tracker
 * 
 * Manages tiered deposit collection (e.g., 50/50 split), milestone fund releases
 * upon proof approval and delivery confirmation, and buyer/artist dispute protection.
 */

export type EscrowMilestoneStatus =
  | "pending_deposit"
  | "deposit_paid"
  | "proof_approved"
  | "in_production"
  | "shipped"
  | "delivered"
  | "released"
  | "disputed";

export interface WholesaleEscrowPayload {
  escrowId: string;
  orderId: string;
  buyerId: string;
  artistId: string;
  totalOrderAmountCents: number;
  depositPercent?: number; // Defaults to 50%
  status: EscrowMilestoneStatus;
  depositPaidAt?: number;
  proofApprovedAt?: number;
  deliveredAt?: number;
  disputeNotes?: string;
}

export interface WholesaleEscrowResult {
  escrowId: string;
  orderId: string;
  buyerId: string;
  artistId: string;
  totalOrderAmountCents: number;
  depositAmountCents: number;
  balanceAmountCents: number;
  status: EscrowMilestoneStatus;
  releasedToArtistCents: number;
  heldInEscrowCents: number;
  milestoneEligibleForRelease: boolean;
  nextMilestoneAction: string;
  notes: string[];
}

export interface WholesaleEscrowSummary {
  totalEscrows: number;
  totalVolumeCents: number;
  totalReleasedCents: number;
  totalHeldCents: number;
  disputeCount: number;
  milestoneCompletionRatePercent: number;
}

/**
 * Calculates deposit splits, milestone release eligibility, and escrow balances for wholesale orders.
 */
export function processWholesaleEscrow(payload: WholesaleEscrowPayload): WholesaleEscrowResult {
  const notes: string[] = [];
  const depositPct = payload.depositPercent ?? 50;
  const depositAmountCents = Math.round((payload.totalOrderAmountCents * depositPct) / 100);
  const balanceAmountCents = payload.totalOrderAmountCents - depositAmountCents;

  let releasedToArtistCents = 0;
  let heldInEscrowCents = payload.totalOrderAmountCents;
  let milestoneEligibleForRelease = false;
  let nextMilestoneAction = "";

  switch (payload.status) {
    case "pending_deposit":
      nextMilestoneAction = "Collect initial deposit payment from wholesale buyer.";
      notes.push("Waiting for initial deposit clearance.");
      break;

    case "deposit_paid":
      releasedToArtistCents = 0;
      heldInEscrowCents = payload.totalOrderAmountCents;
      nextMilestoneAction = "Submit physical/digital proof for buyer approval.";
      notes.push("Deposit received in escrow. Awaiting artwork proof approval.");
      break;

    case "proof_approved":
    case "in_production":
      // Release 50% deposit portion to artist to fund production costs
      releasedToArtistCents = depositAmountCents;
      heldInEscrowCents = balanceAmountCents;
      milestoneEligibleForRelease = true;
      nextMilestoneAction = "Complete production and dispatch order.";
      notes.push("Proof approved! Initial deposit released to artist for production.");
      break;

    case "shipped":
      releasedToArtistCents = depositAmountCents;
      heldInEscrowCents = balanceAmountCents;
      nextMilestoneAction = "Confirm carrier delivery.";
      notes.push("Order in transit. Balance held in escrow until delivery.");
      break;

    case "delivered":
    case "released":
      // Full release of remaining balance
      releasedToArtistCents = payload.totalOrderAmountCents;
      heldInEscrowCents = 0;
      milestoneEligibleForRelease = true;
      nextMilestoneAction = "Escrow fully settled.";
      notes.push("Order delivered and verified. Remaining balance released to artist.");
      break;

    case "disputed":
      releasedToArtistCents = 0;
      heldInEscrowCents = payload.totalOrderAmountCents;
      milestoneEligibleForRelease = false;
      nextMilestoneAction = "Operations mediation required for dispute resolution.";
      notes.push(`Escrow frozen due to dispute: ${payload.disputeNotes || "Unspecified buyer complaint"}`);
      break;
  }

  return {
    escrowId: payload.escrowId,
    orderId: payload.orderId,
    buyerId: payload.buyerId,
    artistId: payload.artistId,
    totalOrderAmountCents: payload.totalOrderAmountCents,
    depositAmountCents,
    balanceAmountCents,
    status: payload.status,
    releasedToArtistCents,
    heldInEscrowCents,
    milestoneEligibleForRelease,
    nextMilestoneAction,
    notes,
  };
}

/**
 * Summarizes escrow metrics across all active and settled wholesale orders.
 */
export function summarizeWholesaleEscrows(results: WholesaleEscrowResult[]): WholesaleEscrowSummary {
  const totalEscrows = results.length;
  if (totalEscrows === 0) {
    return {
      totalEscrows: 0,
      totalVolumeCents: 0,
      totalReleasedCents: 0,
      totalHeldCents: 0,
      disputeCount: 0,
      milestoneCompletionRatePercent: 0,
    };
  }

  const totalVolumeCents = results.reduce((sum, r) => sum + r.totalOrderAmountCents, 0);
  const totalReleasedCents = results.reduce((sum, r) => sum + r.releasedToArtistCents, 0);
  const totalHeldCents = results.reduce((sum, r) => sum + r.heldInEscrowCents, 0);
  const disputeCount = results.filter((r) => r.status === "disputed").length;
  const completedCount = results.filter((r) => r.status === "released" || r.status === "delivered").length;

  return {
    totalEscrows,
    totalVolumeCents,
    totalReleasedCents,
    totalHeldCents,
    disputeCount,
    milestoneCompletionRatePercent: Math.round((completedCount / totalEscrows) * 10000) / 100,
  };
}

/**
 * Generates Convex Schema snippet for wholesale escrow tracking.
 */
export function generateConvexWholesaleEscrowSchema(): string {
  return `
export const wholesale_escrows = defineTable({
  escrowId: v.string(),
  orderId: v.string(),
  buyerId: v.string(),
  artistId: v.string(),
  totalOrderAmountCents: v.number(),
  depositAmountCents: v.number(),
  status: v.string(),
  releasedToArtistCents: v.number(),
  heldInEscrowCents: v.number(),
  createdAt: v.number(),
}).index("by_order", ["orderId"])
  .index("by_artist", ["artistId"])
  .index("by_status", ["status"]);
`.trim();
}

/**
 * In-memory store for wholesale escrows
 */
class WholesaleEscrowStore {
  private escrows: WholesaleEscrowResult[] = [];

  public recordEscrow(escrow: WholesaleEscrowResult): void {
    this.escrows.push(escrow);
  }

  public getEscrows(): WholesaleEscrowResult[] {
    return [...this.escrows];
  }

  public getEscrowById(escrowId: string): WholesaleEscrowResult | undefined {
    return this.escrows.find((e) => e.escrowId === escrowId);
  }

  public clear(): void {
    this.escrows = [];
  }
}

export const wholesaleEscrowStore = new WholesaleEscrowStore();

export function clearWholesaleEscrowsForTesting(): void {
  wholesaleEscrowStore.clear();
}

