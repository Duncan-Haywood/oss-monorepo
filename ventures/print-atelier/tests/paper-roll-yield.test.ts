import { test, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePaperRollYield,
  getBatchYieldResult,
  getPaperRollYieldSummary,
  resetPaperRollYieldStore,
  generateConvexPaperRollYieldSchema,
  PaperRollSpec,
  PrintJobItem,
} from '../src/lib/paper-roll-yield';

describe('Paper Roll Yield & Waste Optimization Calculator', () => {
  beforeEach(() => {
    resetPaperRollYieldStore();
  });

  const defaultRollSpec: PaperRollSpec = {
    rollId: 'roll-hahn-44-100',
    substrateType: 'hahnemuhle_photo_rag',
    rollWidthInches: 44,
    rollLengthFeet: 100,
    costPerRollUSD: 320.0,
    trimMarginInches: 0.5,
  };

  const sampleJobs: PrintJobItem[] = [
    {
      jobId: 'job-101',
      title: 'Monochrome Mountain 24x36',
      widthInches: 24,
      heightInches: 36,
      quantity: 2,
      artistId: 'artist-001',
      retailPriceUSD: 250.0,
    },
    {
      jobId: 'job-102',
      title: 'Ocean Sunset 12x18',
      widthInches: 12,
      heightInches: 18,
      quantity: 4,
      artistId: 'artist-002',
      retailPriceUSD: 95.0,
    },
  ];

  test('should accurately calculate paper roll yield and nesting layout for valid batch', () => {
    const result = calculatePaperRollYield({
      batchId: 'batch-2026-001',
      rollSpec: defaultRollSpec,
      jobs: sampleJobs,
      allowRotation: true,
    });

    assert.equal(result.batchId, 'batch-2026-001');
    assert.equal(result.substrateType, 'hahnemuhle_photo_rag');
    assert.equal(result.totalPrintUnits, 6); // 2 + 4
    assert.ok(result.totalLinearFeetUsed > 0);
    assert.ok(result.totalSquareInchesPrintArea > 0);
    assert.ok(result.areaUtilizationPercent > 0 && result.areaUtilizationPercent <= 100);
    assert.ok(result.rollCostAllocatedUSD > 0);
    assert.equal(result.jobCostBreakdown.length, 2);
    assert.ok(result.calculatedAt > 0);
  });

  test('should store and retrieve calculated batch results', () => {
    calculatePaperRollYield({
      batchId: 'batch-2026-002',
      rollSpec: defaultRollSpec,
      jobs: sampleJobs,
    });

    const retrieved = getBatchYieldResult('batch-2026-002');
    assert.ok(retrieved);
    assert.equal(retrieved.batchId, 'batch-2026-002');

    const nonExistent = getBatchYieldResult('non-existent');
    assert.equal(nonExistent, undefined);
  });

  test('should generate accurate summary metrics across multiple batches', () => {
    calculatePaperRollYield({
      batchId: 'batch-001',
      rollSpec: defaultRollSpec,
      jobs: sampleJobs,
    });

    calculatePaperRollYield({
      batchId: 'batch-002',
      rollSpec: {
        ...defaultRollSpec,
        substrateType: 'canson_infinity_baryta',
      },
      jobs: [
        {
          jobId: 'job-103',
          title: 'Abstract Expression 16x20',
          widthInches: 16,
          heightInches: 20,
          quantity: 3,
          artistId: 'artist-003',
          retailPriceUSD: 140.0,
        },
      ],
    });

    const summary = getPaperRollYieldSummary();
    assert.equal(summary.totalBatchesCalculated, 2);
    assert.ok(summary.averageUtilizationPercent > 0);
    assert.ok(summary.totalLinearFeetSaved > 0);
    assert.ok(summary.substrateEfficiency.hahnemuhle_photo_rag > 0);
    assert.ok(summary.substrateEfficiency.canson_infinity_baryta > 0);
  });

  test('should throw error when paper roll spec parameters are invalid', () => {
    assert.throws(
      () =>
        calculatePaperRollYield({
          batchId: 'invalid-roll',
          rollSpec: {
            ...defaultRollSpec,
            rollWidthInches: -10,
          },
          jobs: sampleJobs,
        }),
      /Invalid PaperRollSpec/
    );
  });

  test('should throw error when jobs array is empty', () => {
    assert.throws(
      () =>
        calculatePaperRollYield({
          batchId: 'empty-jobs',
          rollSpec: defaultRollSpec,
          jobs: [],
        }),
      /Print jobs list cannot be empty/
    );
  });

  test('should throw error when a job has invalid dimensions or quantity', () => {
    assert.throws(
      () =>
        calculatePaperRollYield({
          batchId: 'invalid-dimensions',
          rollSpec: defaultRollSpec,
          jobs: [
            {
              jobId: 'bad-job',
              title: 'Zero height print',
              widthInches: 10,
              heightInches: 0,
              quantity: 1,
              artistId: 'artist-999',
              retailPriceUSD: 50,
            },
          ],
        }),
      /Invalid dimensions or quantity for job bad-job/
    );
  });

  test('should generate Convex schema definition string', () => {
    const schema = generateConvexPaperRollYieldSchema();
    assert.ok(schema.includes('export const paperRollYieldBatches = defineTable'));
    assert.ok(schema.includes('areaUtilizationPercent: v.number()'));
    assert.ok(schema.includes('.index("by_batchId", ["batchId"])'));
  });

  test('should reset store properly', () => {
    calculatePaperRollYield({
      batchId: 'batch-to-clear',
      rollSpec: defaultRollSpec,
      jobs: sampleJobs,
    });

    assert.ok(getBatchYieldResult('batch-to-clear'));
    resetPaperRollYieldStore();
    assert.equal(getBatchYieldResult('batch-to-clear'), undefined);
    assert.equal(getPaperRollYieldSummary().totalBatchesCalculated, 0);
  });
});
