/**
 * Carrier SLA Aging & Customs Clearance Bottleneck Predictor
 *
 * Predicts customs bottlenecks and tracks carrier transit SLA compliance
 * for international print-on-demand artwork fulfillment orders.
 */

export interface InternationalShipment {
  shipmentId: string;
  orderId: string;
  originCountry: string; // e.g. "US", "DE", "UK"
  destinationCountry: string; // e.g. "GB", "FR", "JP", "US"
  carrier: "dhl_express" | "fedex_priority" | "ups_worldwide" | "dpd_international";
  shippedAtIso: string;
  expectedDeliverySlaDays: number;
  declaredValueUsd: number;
  hsTariffCode?: string;
  commercialInvoiceAttached: boolean;
  recipientEoriOrVatProvided?: boolean;
  currentStatus: "in_transit" | "customs_hold" | "out_for_delivery" | "delivered" | "exception";
  lastScanTimestampIso: string;
  daysInCustoms: number;
}

export type CustomsRiskLevel = "low" | "medium" | "high" | "critical";

export type AgingStatus = "on_track" | "at_risk_delayed" | "customs_hold_action_required" | "sla_breached";

export interface CustomsAgingPrediction {
  shipmentId: string;
  orderId: string;
  destinationCountry: string;
  daysInTransit: number;
  expectedSlaDays: number;
  slaRemainingDays: number;
  agingStatus: AgingStatus;
  bottleneckRiskScorePct: number; // 0 - 100%
  customsRiskLevel: CustomsRiskLevel;
  riskFactors: string[];
  recommendedActions: string[];
  requiresUrgentCustomerContact: boolean;
}

export interface CustomsAgingBatchSummary {
  totalShipmentsMonitored: number;
  onTrackCount: number;
  atRiskCount: number;
  customsHoldCount: number;
  slaBreachedCount: number;
  averageTransitDays: number;
  highRiskShipmentIds: string[];
  calculatedAtIso: string;
}

// In-memory store for Convex persistence simulation
export interface CustomsAgingRecord {
  recordId: string;
  shipmentId: string;
  orderId: string;
  destinationCountry: string;
  agingStatus: AgingStatus;
  bottleneckRiskScorePct: number;
  customsRiskLevel: CustomsRiskLevel;
  createdAtIso: string;
}

const customsAgingStore: CustomsAgingRecord[] = [];

/**
 * Predicts customs bottleneck risk and evaluates SLA aging for a given shipment.
 */
export function predictCustomsClearanceAging(
  shipment: InternationalShipment,
  nowIso: string = new Date().toISOString()
): CustomsAgingPrediction {
  const shippedDate = new Date(shipment.shippedAtIso).getTime();
  const currentDate = new Date(nowIso).getTime();
  const diffMs = Math.max(0, currentDate - shippedDate);
  const daysInTransit = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const expectedSlaDays = shipment.expectedDeliverySlaDays;
  const slaRemainingDays = expectedSlaDays - daysInTransit;

  const riskFactors: string[] = [];
  const recommendedActions: string[] = [];
  let riskScore = 0;

  // 1. Missing Harmonized System Tariff Code
  if (!shipment.hsTariffCode || shipment.hsTariffCode.trim() === "") {
    riskScore += 25;
    riskFactors.push("Missing HS Tariff Code on shipping manifest");
    recommendedActions.push("Update shipment manifest with 6-digit HS commodity code (e.g. 4911.91 for art prints)");
  }

  // 2. Missing Commercial Invoice
  if (!shipment.commercialInvoiceAttached) {
    riskScore += 30;
    riskFactors.push("Commercial invoice missing or unattached");
    recommendedActions.push("Upload digital commercial invoice to carrier EDI portal immediately");
  }

  // 3. EORI/VAT tax ID requirements for UK/EU imports over de minimis
  const isEuOrUk = ["GB", "FR", "DE", "IT", "ES", "NL", "BE", "AT", "IE"].includes(shipment.destinationCountry.toUpperCase());
  if (isEuOrUk && shipment.declaredValueUsd > 15 && !shipment.recipientEoriOrVatProvided) {
    riskScore += 20;
    riskFactors.push("Recipient EORI or VAT ID missing for UK/EU import customs validation");
    recommendedActions.push("Contact buyer to request EORI/VAT registration number for customs clearance");
  }

  // 4. High-value formal clearance threshold (> $2,500 USD)
  if (shipment.declaredValueUsd >= 2500) {
    riskScore += 15;
    riskFactors.push("High-value shipment requires formal customs entry & duty assessment");
    recommendedActions.push("Confirm formal customs broker designation with carrier");
  }

  // 5. Days spent in customs hold
  if (shipment.daysInCustoms > 0) {
    riskScore += Math.min(30, shipment.daysInCustoms * 10);
    riskFactors.push(`Shipment currently held in customs inspection for ${shipment.daysInCustoms} day(s)`);
  }

  // 6. Current carrier status
  if (shipment.currentStatus === "customs_hold") {
    riskScore += 25;
    riskFactors.push("Carrier reported status: Customs Hold");
  } else if (shipment.currentStatus === "exception") {
    riskScore += 30;
    riskFactors.push("Carrier reported status: Transit Exception");
  }

  // Cap risk score at 100%
  const bottleneckRiskScorePct = Math.min(100, riskScore);

  // Categorize Risk Level
  let customsRiskLevel: CustomsRiskLevel = "low";
  if (bottleneckRiskScorePct >= 75) {
    customsRiskLevel = "critical";
  } else if (bottleneckRiskScorePct >= 50) {
    customsRiskLevel = "high";
  } else if (bottleneckRiskScorePct >= 25) {
    customsRiskLevel = "medium";
  }

  // Determine Aging Status
  let agingStatus: AgingStatus = "on_track";
  if (shipment.currentStatus === "customs_hold" || (shipment.daysInCustoms > 1 && !shipment.commercialInvoiceAttached)) {
    agingStatus = "customs_hold_action_required";
  } else if (slaRemainingDays < 0) {
    agingStatus = "sla_breached";
    recommendedActions.push("Notify customer of carrier delivery delay & issue proactive shipping refund voucher");
  } else if (slaRemainingDays <= 1 || bottleneckRiskScorePct >= 50) {
    agingStatus = "at_risk_delayed";
    recommendedActions.push("Monitor daily carrier tracking updates and prepare customs inquiry");
  }

  const requiresUrgentCustomerContact = customsRiskLevel === "critical" || agingStatus === "customs_hold_action_required";

  return {
    shipmentId: shipment.shipmentId,
    orderId: shipment.orderId,
    destinationCountry: shipment.destinationCountry,
    daysInTransit,
    expectedSlaDays,
    slaRemainingDays,
    agingStatus,
    bottleneckRiskScorePct,
    customsRiskLevel,
    riskFactors,
    recommendedActions,
    requiresUrgentCustomerContact,
  };
}

/**
 * Summarizes batch customs clearance aging metrics across multiple active shipments.
 */
export function summarizeCustomsAgingBatch(
  shipments: InternationalShipment[],
  nowIso: string = new Date().toISOString()
): CustomsAgingBatchSummary {
  let onTrackCount = 0;
  let atRiskCount = 0;
  let customsHoldCount = 0;
  let slaBreachedCount = 0;
  let totalTransitDays = 0;
  const highRiskShipmentIds: string[] = [];

  for (const shipment of shipments) {
    const pred = predictCustomsClearanceAging(shipment, nowIso);
    totalTransitDays += pred.daysInTransit;

    switch (pred.agingStatus) {
      case "on_track":
        onTrackCount++;
        break;
      case "at_risk_delayed":
        atRiskCount++;
        break;
      case "customs_hold_action_required":
        customsHoldCount++;
        break;
      case "sla_breached":
        slaBreachedCount++;
        break;
    }

    if (pred.customsRiskLevel === "critical" || pred.customsRiskLevel === "high") {
      highRiskShipmentIds.push(shipment.shipmentId);
    }
  }

  const averageTransitDays = shipments.length > 0 ? Math.round((totalTransitDays / shipments.length) * 10) / 10 : 0;

  return {
    totalShipmentsMonitored: shipments.length,
    onTrackCount,
    atRiskCount,
    customsHoldCount,
    slaBreachedCount,
    averageTransitDays,
    highRiskShipmentIds,
    calculatedAtIso: nowIso,
  };
}

/**
 * Generates Convex table definition schema code for storing customs clearance aging predictions.
 */
export function generateConvexCustomsAgingSchema() {
  return {
    tableName: "customs_clearance_aging",
    schemaCode: `
import { defineTable } from "convex/server";
import { v } from "convex/values";

export const customsClearanceAgingSchema = defineTable({
  recordId: v.string(),
  shipmentId: v.string(),
  orderId: v.string(),
  destinationCountry: v.string(),
  agingStatus: v.union(
    v.literal("on_track"),
    v.literal("at_risk_delayed"),
    v.literal("customs_hold_action_required"),
    v.literal("sla_breached")
  ),
  bottleneckRiskScorePct: v.number(),
  customsRiskLevel: v.union(
    v.literal("low"),
    v.literal("medium"),
    v.literal("high"),
    v.literal("critical")
  ),
  createdAtIso: v.string(),
})
  .index("by_recordId", ["recordId"])
  .index("by_shipmentId", ["shipmentId"])
  .index("by_agingStatus", ["agingStatus"]);
`,
    indexes: ["by_recordId", "by_shipmentId", "by_agingStatus"],
  };
}

/**
 * Persists prediction result into in-memory store (simulating Convex).
 */
export function persistCustomsAgingRecord(prediction: CustomsAgingPrediction): CustomsAgingRecord {
  const record: CustomsAgingRecord = {
    recordId: `customs_aging_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    shipmentId: prediction.shipmentId,
    orderId: prediction.orderId,
    destinationCountry: prediction.destinationCountry,
    agingStatus: prediction.agingStatus,
    bottleneckRiskScorePct: prediction.bottleneckRiskScorePct,
    customsRiskLevel: prediction.customsRiskLevel,
    createdAtIso: new Date().toISOString(),
  };

  customsAgingStore.push(record);
  return record;
}

/**
 * Retrieves stored records.
 */
export function getCustomsAgingRecords(): CustomsAgingRecord[] {
  return [...customsAgingStore];
}

/**
 * Clears stored records for test isolation.
 */
export function clearCustomsAgingStoreForTesting(): void {
  customsAgingStore.length = 0;
}
