import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeCustomerRetentionAndCohorts,
  generateConvexCustomerCohortSchema,
  sampleCustomerOrders,
  type CustomerOrder,
} from "../src/lib/customer-cohort-analytics";

describe("customer cohort analytics & retention analyzer", () => {
  it("calculates correct overall retention and LTV metrics for sample orders", () => {
    const report = analyzeCustomerRetentionAndCohorts(
      sampleCustomerOrders,
      "2026-08-01T00:00:00.000Z",
    );

    assert.equal(report.totalUniqueCustomers, 6);
    assert.equal(report.totalOrdersAnalyzed, 10);
    assert.equal(report.totalRevenueCents, 114500); // 12000+8500+15000+9500+12000+11000+14000+9000+13000+10500
    assert.equal(report.repeatCustomerCount, 3); // Alice (3), Bob (2), Carol (2)
    assert.equal(report.repeatCustomerPercent, 50); // 3 / 6 = 50%
    assert.equal(report.overallAverageLtvCents, Math.round(114500 / 6));
    assert.equal(report.cohortSummaries.length, 4); // 2026-04, 2026-05, 2026-06, 2026-07
  });

  it("handles empty order lists gracefully", () => {
    const report = analyzeCustomerRetentionAndCohorts([], "2026-08-01T00:00:00.000Z");

    assert.equal(report.totalUniqueCustomers, 0);
    assert.equal(report.totalOrdersAnalyzed, 0);
    assert.equal(report.totalRevenueCents, 0);
    assert.equal(report.repeatCustomerPercent, 0);
    assert.equal(report.overallAverageLtvCents, 0);
    assert.equal(report.cohortSummaries.length, 0);
    assert.equal(report.reengagementCandidates.length, 0);
  });

  it("correctly calculates monthly cohort retention and LTV progression", () => {
    const customOrders: CustomerOrder[] = [
      { orderId: "o1", customerEmail: "user1@test.com", orderDate: "2026-01-10T00:00:00Z", totalPaidCents: 10000 },
      { orderId: "o2", customerEmail: "user2@test.com", orderDate: "2026-01-15T00:00:00Z", totalPaidCents: 10000 },
      { orderId: "o3", customerEmail: "user1@test.com", orderDate: "2026-02-10T00:00:00Z", totalPaidCents: 15000 },
    ];

    const report = analyzeCustomerRetentionAndCohorts(customOrders, "2026-03-01T00:00:00.000Z");

    assert.equal(report.cohortSummaries.length, 1);
    const janCohort = report.cohortSummaries[0];
    assert.equal(janCohort.cohortMonth, "2026-01");
    assert.equal(janCohort.initialCustomerCount, 2);
    assert.equal(janCohort.initialRevenueCents, 20000);
    assert.equal(janCohort.averageInitialOrderCents, 10000);
    assert.equal(janCohort.totalCumulativeRevenueCents, 35000);
    assert.equal(janCohort.averageLtvCents, 17500);

    // Period M0: 2 active (100%), Period M1: 1 active (50%)
    assert.equal(janCohort.periods[0].activeCustomers, 2);
    assert.equal(janCohort.periods[0].retentionRatePercent, 100);
    assert.equal(janCohort.periods[1].activeCustomers, 1);
    assert.equal(janCohort.periods[1].retentionRatePercent, 50);
  });

  it("identifies re-engagement candidates based on days since last order", () => {
    const report = analyzeCustomerRetentionAndCohorts(
      sampleCustomerOrders,
      "2026-08-01T00:00:00.000Z",
    );

    assert.equal(report.reengagementCandidates.length > 0, true);
    // Highest spenders should be ranked first
    for (let i = 0; i < report.reengagementCandidates.length - 1; i++) {
      assert.equal(
        report.reengagementCandidates[i].totalSpendCents >=
          report.reengagementCandidates[i + 1].totalSpendCents,
        true,
      );
    }
  });

  it("generates valid Convex schema definition for customer_cohort_snapshots", () => {
    const schemaDef = generateConvexCustomerCohortSchema();
    assert.equal(schemaDef.tableName, "customer_cohort_snapshots");
    assert.equal(schemaDef.indexes.includes("by_snapshotId"), true);
    assert.equal(schemaDef.indexes.includes("by_timestamp"), true);
    assert.equal(schemaDef.schemaCode.includes("defineTable"), true);
  });
});
