import type { BusinessIdea, RiskLevel, ScoreDimension } from "./types";

/**
 * Composite score, 0–100, weighted by each dimension's declared weight. The
 * methodology report publishes these weights; computing the mean instead would
 * quietly contradict it.
 */
export function averageScore(dimensions: ScoreDimension[]): number {
  if (dimensions.length === 0) return 0;
  const weighted = dimensions.reduce(
    (sum, d) => sum + (d.score / d.maxScore) * d.weight,
    0,
  );
  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  if (totalWeight === 0) return 0;
  return Math.round((weighted / totalWeight) * 100);
}

export function riskLabel(level: RiskLevel): string {
  switch (level) {
    case "low":
      return "Low residual risk";
    case "medium":
      return "Medium residual risk";
    case "high":
      return "High residual risk";
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}

export function riskColor(level: RiskLevel): string {
  switch (level) {
    case "low":
      return "text-emerald-400";
    case "medium":
      return "text-amber-400";
    case "high":
      return "text-rose-400";
    default: {
      const _exhaustive: never = level;
      return _exhaustive;
    }
  }
}

export function verdictLabel(
  verdict: "strong" | "viable" | "stretch" | "unlikely",
): string {
  switch (verdict) {
    case "strong":
      return "Strong fit";
    case "viable":
      return "Viable";
    case "stretch":
      return "Stretch goal";
    case "unlikely":
      return "Unlikely";
    default: {
      const _exhaustive: never = verdict;
      return _exhaustive;
    }
  }
}

export function verdictColor(
  verdict: "strong" | "viable" | "stretch" | "unlikely",
): string {
  switch (verdict) {
    case "strong":
      return "text-emerald-400";
    case "viable":
      return "text-sky-400";
    case "stretch":
      return "text-amber-400";
    case "unlikely":
      return "text-rose-400";
    default: {
      const _exhaustive: never = verdict;
      return _exhaustive;
    }
  }
}

export function categoryLabel(category: BusinessIdea["category"]): string {
  switch (category) {
    case "ai-agent":
      return "AI Agent";
    case "devtools":
      return "Developer Tools";
    case "vertical-saas":
      return "Vertical SaaS";
    case "api-infrastructure":
      return "API Infrastructure";
    case "content-automation":
      return "Content Automation";
    case "data-product":
      return "Data Product";
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatArr(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M ARR`;
  }
  if (amount >= 1_000) {
    return `$${Math.round(amount / 1_000)}k ARR`;
  }
  return formatCurrency(amount);
}

export function monthsLabel(months: number): string {
  if (months < 12) return `${months} months`;
  const years = months / 12;
  return years === 1 ? "1 year" : `${years.toFixed(1)} years`;
}
