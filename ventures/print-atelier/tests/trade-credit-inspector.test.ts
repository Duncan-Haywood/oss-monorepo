import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateTradeCreditLimit,
  authorizeTradeInvoicePurchase,
  summarizeTradeCreditPortfolio,
  generateConvexTradeCreditSchema,
  tradeCreditStore,
  TradeAccountInput,
} from "../src/lib/trade-credit-inspector";

describe("trade-credit-inspector", () => {
  beforeEach(() => {
    tradeCreditStore.clear();
  });

  const healthyBoutique: TradeAccountInput = {
    accountId: "acct_studio_1",
    companyName: "Luxe Interiors Studio",
    tier: "boutique_studio",
    creditScore: 740,
    annualVolumeCommitmentUsdCents: 2000000, // $20k/yr
    promptPaymentScore: 95,
    currentOutstandingBalanceCents: 100000, // $1k used
    currentOverdueBalanceCents: 0,
  };

  const riskyFirm: TradeAccountInput = {
    accountId: "acct_firm_2",
    companyName: "Overdue Design Co",
    tier: "regional_design_firm",
    creditScore: 580,
    annualVolumeCommitmentUsdCents: 5000000,
    promptPaymentScore: 60,
    currentOutstandingBalanceCents: 2500000,
    currentOverdueBalanceCents: 500000, // $5k overdue
  };

  const enterpriseHotel: TradeAccountInput = {
    accountId: "acct_hotel_3",
    companyName: "Grand Resort Group",
    tier: "enterprise_hospitality",
    creditScore: 810,
    annualVolumeCommitmentUsdCents: 50000000, // $500k/yr
    promptPaymentScore: 98,
    currentOutstandingBalanceCents: 5000000, // $50k used
    currentOverdueBalanceCents: 0,
  };

  describe("evaluateTradeCreditLimit", () => {
    it("calculates credit limit and approved payment terms for healthy account", () => {
      const evalResult = evaluateTradeCreditLimit(healthyBoutique);

      assert.equal(evalResult.accountId, "acct_studio_1");
      assert.ok(evalResult.recommendedCreditLimitCents > 500000);
      assert.equal(evalResult.creditHoldActive, false);
      assert.equal(evalResult.creditRiskLevel, "low");
      assert.equal(evalResult.maxApprovedPaymentTerm, "net_30");
    });

    it("activates credit hold for overdue balance and critical risk score", () => {
      const evalResult = evaluateTradeCreditLimit(riskyFirm);

      assert.equal(evalResult.creditHoldActive, true);
      assert.equal(evalResult.creditRiskLevel, "high"); // credit score 580 triggers high risk
      assert.ok(evalResult.holdReasons.some((r) => r.includes("Outstanding overdue balance")));
    });

    it("approves Net-90 terms for low-risk enterprise hospitality accounts", () => {
      const evalResult = evaluateTradeCreditLimit(enterpriseHotel);

      assert.equal(evalResult.maxApprovedPaymentTerm, "net_90");
      assert.equal(evalResult.creditRiskLevel, "low");
    });
  });

  describe("authorizeTradeInvoicePurchase", () => {
    it("authorizes valid order within credit limit and approved payment terms", () => {
      const result = authorizeTradeInvoicePurchase(healthyBoutique, {
        accountId: "acct_studio_1",
        orderAmountCents: 300000, // $3k order
        requestedTerm: "net_30",
      });

      assert.equal(result.authorized, true);
      assert.equal(result.approvedTerm, "net_30");
      assert.equal(result.creditHoldEnforced, false);
      assert.equal(result.rejectionReasons.length, 0);
    });

    it("rejects purchase when credit hold is active due to overdue balance", () => {
      const result = authorizeTradeInvoicePurchase(riskyFirm, {
        accountId: "acct_firm_2",
        orderAmountCents: 100000,
        requestedTerm: "net_15",
      });

      assert.equal(result.authorized, false);
      assert.equal(result.creditHoldEnforced, true);
      assert.ok(result.rejectionReasons.length > 0);
    });

    it("rejects purchase when requested payment term exceeds max approved term", () => {
      const result = authorizeTradeInvoicePurchase(healthyBoutique, {
        accountId: "acct_studio_1",
        orderAmountCents: 100000,
        requestedTerm: "net_90", // Boutique max is net_30
      });

      assert.equal(result.authorized, false);
      assert.ok(result.rejectionReasons.some((r) => r.includes("exceeds max approved term")));
    });
  });

  describe("summarizeTradeCreditPortfolio", () => {
    it("aggregates exposure, overdue ratio, and portfolio risk level", () => {
      const summary = summarizeTradeCreditPortfolio([healthyBoutique, riskyFirm, enterpriseHotel]);

      assert.equal(summary.totalAccounts, 3);
      assert.ok(summary.totalCreditLineExposureCents > 0);
      assert.ok(summary.totalOutstandingBalanceCents > 0);
      assert.equal(summary.creditHoldAccountCount, 1);
      assert.ok(summary.overdueRatioPercent > 0);
    });

    it("handles empty accounts list gracefully", () => {
      const summary = summarizeTradeCreditPortfolio([]);
      assert.equal(summary.totalAccounts, 0);
      assert.equal(summary.portfolioRiskLevel, "healthy");
    });
  });

  describe("tradeCreditStore & Convex schema", () => {
    it("upserts and retrieves trade account from store", () => {
      tradeCreditStore.upsertAccount(healthyBoutique);
      const retrieved = tradeCreditStore.getAccount("acct_studio_1");

      assert.ok(retrieved);
      assert.equal(retrieved?.companyName, "Luxe Interiors Studio");
    });

    it("generates valid Convex schema string for trade_credit_accounts", () => {
      const schema = generateConvexTradeCreditSchema();
      assert.ok(schema.includes("export const trade_credit_accounts = defineTable({"));
      assert.ok(schema.includes(".index(\"by_tier\", [\"tier\"])"));
    });
  });
});
