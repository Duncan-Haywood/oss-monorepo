import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateB2bTradeCreditTerms,
  calculateB2bCreditRiskScore,
  type B2bTradeCreditApplication,
} from "../src/lib/b2b-trade-credit";

test("approves high credit score Platinum tier corporate application", () => {
  const app: B2bTradeCreditApplication = {
    companyName: "Metropolitan Design Studio",
    businessType: "interior_designer",
    yearsInBusiness: 6,
    estimatedAnnualPrintBudgetUsd: 50000,
    taxIdVerified: true,
    creditScoreProxy: 780,
    pastOrderCount: 12,
    pastOnTimePaymentRatePct: 98,
  };

  const riskScore = calculateB2bCreditRiskScore(app);
  assert.ok(riskScore >= 85);

  const decision = evaluateB2bTradeCreditTerms(app);
  assert.equal(decision.isApproved, true);
  assert.equal(decision.creditTier, "Platinum");
  assert.equal(decision.approvedCreditLimitUsd, 25000);
  assert.equal(decision.approvedTerms, "Net 60");
  assert.equal(decision.discountPct, 30);
  assert.equal(decision.artistPayoutGuaranteePct, 30);
});

test("approves Silver tier application for emerging design firm", () => {
  const app: B2bTradeCreditApplication = {
    companyName: "Modern Haven Interiors",
    businessType: "interior_designer",
    yearsInBusiness: 1,
    estimatedAnnualPrintBudgetUsd: 5000,
    taxIdVerified: true,
    creditScoreProxy: 640,
  };

  const decision = evaluateB2bTradeCreditTerms(app);
  assert.equal(decision.isApproved, true);
  assert.equal(decision.creditTier, "Silver");
  assert.equal(decision.approvedCreditLimitUsd, 5000);
  assert.equal(decision.approvedTerms, "Net 15");
  assert.equal(decision.discountPct, 20);
});

test("declines unverified tax ID or low credit score applications", () => {
  const app: B2bTradeCreditApplication = {
    companyName: "Unknown Staging LLC",
    businessType: "real_estate_staging",
    yearsInBusiness: 0.5,
    estimatedAnnualPrintBudgetUsd: 5000,
    taxIdVerified: false,
    creditScoreProxy: 550,
  };

  const decision = evaluateB2bTradeCreditTerms(app);
  assert.equal(decision.isApproved, false);
  assert.equal(decision.approvedTerms, "Prepaid");
  assert.equal(decision.requiredDepositPct, 100);
});
