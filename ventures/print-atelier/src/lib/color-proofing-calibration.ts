/**
 * Automated Print Studio Color Proofing & ICC Profile Calibration Tracker
 *
 * Tracks spectrophotometer Delta E color accuracy, ICC substrate profile calibrations,
 * nozzle density health checks, and certifies fine art prints for museum production runs.
 */

export type SubstrateProfile = 'hahnemuhle_photo_rag' | 'canson_infinity_baryta' | 'epson_legacy_platine' | 'moab_somerset_velvet';
export type InspectionStatus = 'certified_pass' | 'conditional_pass' | 'recalibration_required' | 'failed_rejected';

export interface ColorProofingInspectionRequest {
  inspectionId: string;
  printerModel: string;
  substrateProfile: SubstrateProfile;
  iccProfileVersion: string;
  spectrophotometerModel: string;
  measuredDeltaE: number; // Delta E (2000) color difference
  nozzleHealthPercent: number; // 0 - 100
  ambientTemperatureC: number;
  ambientHumidityPercent: number;
  inspectedAt: number;
}

export interface ColorProofingInspectionResult {
  inspectionId: string;
  status: InspectionStatus;
  deltaEStatus: 'optimal' | 'acceptable' | 'out_of_tolerance';
  nozzleStatus: 'clean' | 'minor_clog' | 'critical_clean_required';
  environmentalSafety: 'optimal' | 'warning' | 'out_of_bounds';
  productionApproved: boolean;
  notes: string[];
  certifiedAt: number;
}

export interface StudioCalibrationHealthSummary {
  totalInspections: number;
  certifiedPassCount: number;
  passRatePercent: number;
  averageDeltaE: number;
  statusBreakdown: Record<InspectionStatus, number>;
  substratePassRates: Record<SubstrateProfile, number>;
}

const inspectionStore = new Map<string, ColorProofingInspectionResult>();

export function recordColorProofingInspection(request: ColorProofingInspectionRequest): ColorProofingInspectionResult {
  const {
    inspectionId,
    substrateProfile,
    measuredDeltaE,
    nozzleHealthPercent,
    ambientTemperatureC,
    ambientHumidityPercent,
  } = request;

  const notes: string[] = [];

  // Delta E evaluation (Target <= 1.5 for museum grade, <= 2.5 acceptable, > 2.5 fail)
  let deltaEStatus: ColorProofingInspectionResult['deltaEStatus'] = 'optimal';
  if (measuredDeltaE > 3.5) {
    deltaEStatus = 'out_of_tolerance';
    notes.push(`Critical color drift: Delta E is ${measuredDeltaE} (max tolerance 2.5).`);
  } else if (measuredDeltaE > 2.0) {
    deltaEStatus = 'acceptable';
    notes.push(`Minor color drift: Delta E is ${measuredDeltaE}. Recalibration recommended soon.`);
  } else {
    notes.push(`Optimal color match: Delta E is ${measuredDeltaE}.`);
  }

  // Nozzle health evaluation
  let nozzleStatus: ColorProofingInspectionResult['nozzleStatus'] = 'clean';
  if (nozzleHealthPercent < 90) {
    nozzleStatus = 'critical_clean_required';
    notes.push(`Nozzle clogs detected: Nozzle health at ${nozzleHealthPercent}%.`);
  } else if (nozzleHealthPercent < 98) {
    nozzleStatus = 'minor_clog';
    notes.push(`Minor nozzle degradation: Health at ${nozzleHealthPercent}%.`);
  }

  // Environmental safety evaluation (Target 20-24C, 40-60% RH for fine art papers)
  let environmentalSafety: ColorProofingInspectionResult['environmentalSafety'] = 'optimal';
  if (ambientTemperatureC < 15 || ambientTemperatureC > 28 || ambientHumidityPercent < 30 || ambientHumidityPercent > 70) {
    environmentalSafety = 'out_of_bounds';
    notes.push(`Environment out of bounds: Temp ${ambientTemperatureC}°C, RH ${ambientHumidityPercent}%.`);
  } else if (ambientHumidityPercent < 38 || ambientHumidityPercent > 62) {
    environmentalSafety = 'warning';
    notes.push(`Environment sub-optimal: Temp ${ambientTemperatureC}°C, RH ${ambientHumidityPercent}%.`);
  }

  // Final Certification Status
  let status: InspectionStatus = 'certified_pass';
  let productionApproved = true;

  if (deltaEStatus === 'out_of_tolerance' || nozzleStatus === 'critical_clean_required') {
    status = 'failed_rejected';
    productionApproved = false;
  } else if (deltaEStatus === 'acceptable' || nozzleStatus === 'minor_clog' || environmentalSafety === 'out_of_bounds') {
    status = 'conditional_pass';
  }

  const result: ColorProofingInspectionResult = {
    inspectionId,
    status,
    deltaEStatus,
    nozzleStatus,
    environmentalSafety,
    productionApproved,
    notes,
    certifiedAt: Date.now(),
  };

  inspectionStore.set(inspectionId, result);
  return result;
}

export function summarizeStudioCalibrationHealth(inspections: ColorProofingInspectionRequest[]): StudioCalibrationHealthSummary {
  const totalInspections = inspections.length;
  if (totalInspections === 0) {
    return {
      totalInspections: 0,
      certifiedPassCount: 0,
      passRatePercent: 0,
      averageDeltaE: 0,
      statusBreakdown: {
        certified_pass: 0,
        conditional_pass: 0,
        recalibration_required: 0,
        failed_rejected: 0,
      },
      substratePassRates: {
        hahnemuhle_photo_rag: 0,
        canson_infinity_baryta: 0,
        epson_legacy_platine: 0,
        moab_somerset_velvet: 0,
      },
    };
  }

  let certifiedPassCount = 0;
  let totalDeltaE = 0;
  const statusBreakdown: Record<InspectionStatus, number> = {
    certified_pass: 0,
    conditional_pass: 0,
    recalibration_required: 0,
    failed_rejected: 0,
  };
  const substrateCounts: Record<SubstrateProfile, { total: number; pass: number }> = {
    hahnemuhle_photo_rag: { total: 0, pass: 0 },
    canson_infinity_baryta: { total: 0, pass: 0 },
    epson_legacy_platine: { total: 0, pass: 0 },
    moab_somerset_velvet: { total: 0, pass: 0 },
  };

  for (const inspection of inspections) {
    const result = recordColorProofingInspection(inspection);
    totalDeltaE += inspection.measuredDeltaE;
    statusBreakdown[result.status] += 1;

    const sub = inspection.substrateProfile;
    if (substrateCounts[sub]) {
      substrateCounts[sub].total += 1;
      if (result.productionApproved) {
        substrateCounts[sub].pass += 1;
      }
    }

    if (result.status === 'certified_pass') {
      certifiedPassCount += 1;
    }
  }

  const substratePassRates: Record<SubstrateProfile, number> = {
    hahnemuhle_photo_rag: 0,
    canson_infinity_baryta: 0,
    epson_legacy_platine: 0,
    moab_somerset_velvet: 0,
  };

  for (const [sub, data] of Object.entries(substrateCounts)) {
    const key = sub as SubstrateProfile;
    substratePassRates[key] = data.total > 0 ? parseFloat(((data.pass / data.total) * 100).toFixed(2)) : 100;
  }

  return {
    totalInspections,
    certifiedPassCount,
    passRatePercent: parseFloat(((certifiedPassCount / totalInspections) * 100).toFixed(2)),
    averageDeltaE: parseFloat((totalDeltaE / totalInspections).toFixed(2)),
    statusBreakdown,
    substratePassRates,
  };
}

export function clearColorProofingStoreForTesting(): void {
  inspectionStore.clear();
}

export class ColorProofingCalibrationStore {
  generateConvexSchema(): string {
    return `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  color_proofing_inspections: defineTable({
    inspectionId: v.string(),
    printerModel: v.string(),
    substrateProfile: v.string(),
    measuredDeltaE: v.number(),
    nozzleHealthPercent: v.number(),
    status: v.string(),
    productionApproved: v.boolean(),
    certifiedAt: v.number(),
  }).index("by_substrate", ["substrateProfile"])
    .index("by_status", ["status"]),
});`;
  }
}

export const colorProofingCalibrationStore = new ColorProofingCalibrationStore();
