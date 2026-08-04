export type CreditRiskTier = "Standard" | "Silver" | "Gold" | "Platinum";
export type NetPaymentTerms = "Prepaid" | "Net 15" | "Net 30" | "Net 60";

export type B2bTradeCreditApplication = {
  companyName: string;
  businessType: "interior_designer" | "corporate_office" | "hospitality_hotel" | "real_estate_staging" | "retail_reseller";
  yearsInBusiness: number;
  estimatedAnnualPrintBudgetUsd: number;
  taxIdVerified: boolean;
  creditScoreProxy: number; // 300 - 850 range
  pastOrderCount?: number;
  pastOnTimePaymentRatePct?: number; // 0 - 100
};

export type B2bTradeCreditDecision = {
  companyName: string;
  businessType: string;
  creditTier: CreditRiskTier;
  approvedCreditLimitUsd: number;
  approvedTerms: NetPaymentTerms;
  discountPct: number;
  requiredDepositPct: number;
  artistPayoutGuaranteePct: number; // Always 30% split protected
  isApproved: boolean;
  rationale: string;
  riskScore: number; // 0 - 100
  timestamp: string;
};

export function calculateB2bCreditRiskScore(app: B2bTradeCreditApplication): number {
  let score = 50;

  // Credit score proxy weight (max +30 points)
  if (app.creditScoreProxy >= 750) score += 30;
  else if (app.creditScoreProxy >= 700) score += 20;
  else if (app.creditScoreProxy >= 650) score += 10;
  else if (app.creditScoreProxy < 600) score -= 20;

  // Years in business (max +15 points)
  if (app.yearsInBusiness >= 5) score += 15;
  else if (app.yearsInBusiness >= 2) score += 8;
  else if (app.yearsInBusiness < 1) score -= 10;

  // Tax ID verification (+10 points)
  if (app.taxIdVerified) score += 10;
  else score -= 15;

  // Budget size (+10 points)
  if (app.estimatedAnnualPrintBudgetUsd >= 50000) score += 15;
  else if (app.estimatedAnnualPrintBudgetUsd >= 10000) score += 10;

  // Payment history if present
  if (app.pastOnTimePaymentRatePct !== undefined) {
    if (app.pastOnTimePaymentRatePct >= 95) score += 15;
    else if (app.pastOnTimePaymentRatePct < 80) score -= 25;
  }

  return Math.min(100, Math.max(0, score));
}

export function evaluateB2bTradeCreditTerms(app: B2bTradeCreditApplication): B2bTradeCreditDecision {
  const riskScore = calculateB2bCreditRiskScore(app);

  if (riskScore < 40 || !app.taxIdVerified) {
    return {
      companyName: app.companyName,
      businessType: app.businessType,
      creditTier: "Standard",
      approvedCreditLimitUsd: 0,
      approvedTerms: "Prepaid",
      discountPct: 10,
      requiredDepositPct: 100,
      artistPayoutGuaranteePct: 30,
      isApproved: false,
      rationale: `Application declined for credit terms due to low credit score proxy (${app.creditScoreProxy}) or missing tax ID verification. Standard prepaid order pricing with 10% trade discount applies.`,
      riskScore,
      timestamp: new Date().toISOString(),
    };
  }

  let creditTier: CreditRiskTier = "Standard";
  let creditLimit = 2500;
  let terms: NetPaymentTerms = "Net 15";
  let discountPct = 15;
  let depositPct = 50;

  if (riskScore >= 85 && app.estimatedAnnualPrintBudgetUsd >= 25000) {
    creditTier = "Platinum";
    creditLimit = 25000;
    terms = "Net 60";
    discountPct = 30;
    depositPct = 0;
  } else if (riskScore >= 70) {
    creditTier = "Gold";
    creditLimit = 10000;
    terms = "Net 30";
    discountPct = 25;
    depositPct = 15;
  } else if (riskScore >= 55) {
    creditTier = "Silver";
    creditLimit = 5000;
    terms = "Net 15";
    discountPct = 20;
    depositPct = 25;
  }

  const rationale = `Approved for ${creditTier} tier with $${creditLimit.toLocaleString()} limit on ${terms} terms (${discountPct}% trade discount, ${depositPct}% deposit required). 30% artist net profit payout is fully guaranteed by Print Atelier reserve buffer.`;

  return {
    companyName: app.companyName,
    businessType: app.businessType,
    creditTier,
    approvedCreditLimitUsd: creditLimit,
    approvedTerms: terms,
    discountPct,
    requiredDepositPct: depositPct,
    artistPayoutGuaranteePct: 30,
    isApproved: true,
    rationale,
    riskScore,
    timestamp: new Date().toISOString(),
  };
}
