/**
 * Automated Print Studio Humidity & Pigment Curing Time Monitor
 *
 * Tracks giclée pigment ink drying, ambient relative humidity, outgassing elapsed hours,
 * and guards against glass-hazing and ink smudging before framing or packaging.
 */

export type SubstrateInkAbsorptivity = 'high_rag_cotton' | 'medium_baryta_coated' | 'low_gloss_metallic' | 'canvas_gesso';
export type CuringStatus = 'curing_complete' | 'in_progress_safe' | 'drying_retarded_high_rh' | 'accelerated_overheat_risk';

export interface PigmentCuringMonitorRequest {
  batchId: string;
  printId: string;
  substrateType: SubstrateInkAbsorptivity;
  printedAt: number; // Unix timestamp
  currentTimestamp: number;
  ambientHumidityPercent: number; // 0 - 100
  ambientTemperatureC: number;
  hasAirCirculationFan: boolean;
}

export interface PigmentCuringMonitorResult {
  batchId: string;
  printId: string;
  status: CuringStatus;
  elapsedDryingHours: number;
  requiredDryingHours: number;
  dryingProgressPercent: number;
  safeForFramingUnderGlass: boolean;
  safeForVarnishing: boolean;
  warnings: string[];
  estimatedCompletionAt: number;
}

export interface CuringRoomSummary {
  totalBatchesMonitored: number;
  curingCompleteCount: number;
  inProgressCount: number;
  retardedDryingCount: number;
  averageProgressPercent: number;
}

const curingStore = new Map<string, PigmentCuringMonitorResult>();

export function evaluatePigmentCuringStatus(request: PigmentCuringMonitorRequest): PigmentCuringMonitorResult {
  const {
    batchId,
    printId,
    substrateType,
    printedAt,
    currentTimestamp,
    ambientHumidityPercent,
    ambientTemperatureC,
    hasAirCirculationFan,
  } = request;

  const elapsedDryingHours = parseFloat(((currentTimestamp - printedAt) / (1000 * 60 * 60)).toFixed(2));
  const warnings: string[] = [];

  // Base drying hours required by substrate
  const baseDryingHoursMap: Record<SubstrateInkAbsorptivity, number> = {
    high_rag_cotton: 24,
    medium_baryta_coated: 36,
    low_gloss_metallic: 48,
    canvas_gesso: 24,
  };

  let requiredDryingHours = baseDryingHoursMap[substrateType];

  // Humidity adjustment (High RH slows outgassing)
  if (ambientHumidityPercent > 65) {
    requiredDryingHours *= 1.5;
    warnings.push(`High relative humidity (${ambientHumidityPercent}%): Drying time extended by 50%.`);
  } else if (ambientHumidityPercent > 55) {
    requiredDryingHours *= 1.2;
    warnings.push(`Elevated humidity (${ambientHumidityPercent}%): Drying time extended by 20%.`);
  }

  // Air circulation fan benefit
  if (hasAirCirculationFan && ambientHumidityPercent <= 60) {
    requiredDryingHours *= 0.85; // 15% faster outgassing
  }

  // Temperature checks
  if (ambientTemperatureC > 30) {
    warnings.push(`Excessive heat (${ambientTemperatureC}°C): Risk of pigment micro-cracking.`);
  } else if (ambientTemperatureC < 18) {
    requiredDryingHours *= 1.15;
    warnings.push(`Cold ambient temperature (${ambientTemperatureC}°C): Drying slowed.`);
  }

  requiredDryingHours = parseFloat(requiredDryingHours.toFixed(1));

  // Determine Curing Status
  let status: CuringStatus = 'in_progress_safe';
  if (ambientHumidityPercent > 70) {
    status = 'drying_retarded_high_rh';
  } else if (ambientTemperatureC > 32) {
    status = 'accelerated_overheat_risk';
  } else if (elapsedDryingHours >= requiredDryingHours) {
    status = 'curing_complete';
  }

  const dryingProgressPercent = Math.min(
    100,
    parseFloat(((elapsedDryingHours / requiredDryingHours) * 100).toFixed(1))
  );

  const safeForFramingUnderGlass = elapsedDryingHours >= requiredDryingHours && ambientHumidityPercent <= 60;
  const safeForVarnishing = elapsedDryingHours >= requiredDryingHours * 0.9;

  const estimatedCompletionAt = printedAt + Math.ceil(requiredDryingHours * 3600 * 1000);

  const result: PigmentCuringMonitorResult = {
    batchId,
    printId,
    status,
    elapsedDryingHours,
    requiredDryingHours,
    dryingProgressPercent,
    safeForFramingUnderGlass,
    safeForVarnishing,
    warnings,
    estimatedCompletionAt,
  };

  curingStore.set(printId, result);
  return result;
}

export function summarizeCuringRoomStatus(monitors: PigmentCuringMonitorRequest[]): CuringRoomSummary {
  const totalBatchesMonitored = monitors.length;
  if (totalBatchesMonitored === 0) {
    return {
      totalBatchesMonitored: 0,
      curingCompleteCount: 0,
      inProgressCount: 0,
      retardedDryingCount: 0,
      averageProgressPercent: 0,
    };
  }

  let curingCompleteCount = 0;
  let inProgressCount = 0;
  let retardedDryingCount = 0;
  let totalProgress = 0;

  for (const monitor of monitors) {
    const result = evaluatePigmentCuringStatus(monitor);
    totalProgress += result.dryingProgressPercent;

    if (result.status === 'curing_complete') {
      curingCompleteCount += 1;
    } else if (result.status === 'drying_retarded_high_rh') {
      retardedDryingCount += 1;
    } else {
      inProgressCount += 1;
    }
  }

  return {
    totalBatchesMonitored,
    curingCompleteCount,
    inProgressCount,
    retardedDryingCount,
    averageProgressPercent: parseFloat((totalProgress / totalBatchesMonitored).toFixed(1)),
  };
}

export function clearPigmentCuringStoreForTesting(): void {
  curingStore.clear();
}

export class PigmentCuringMonitorStore {
  generateConvexSchema(): string {
    return `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  pigment_curing_monitors: defineTable({
    batchId: v.string(),
    printId: v.string(),
    substrateType: v.string(),
    status: v.string(),
    elapsedDryingHours: v.number(),
    requiredDryingHours: v.number(),
    safeForFramingUnderGlass: v.boolean(),
    estimatedCompletionAt: v.number(),
  }).index("by_batch", ["batchId"])
    .index("by_status", ["status"]),
});`;
  }
}

export const pigmentCuringMonitorStore = new PigmentCuringMonitorStore();
