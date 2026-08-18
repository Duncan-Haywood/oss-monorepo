import type { BusinessIdea, LiabilityTier, ScoreDimension } from "./types";

export function averageScore(dimensions: ScoreDimension[]): number {
  if (dimensions.length === 0) return 0;
  const total = dimensions.reduce((sum, d) => sum + d.score, 0);
  const max = dimensions.reduce((sum, d) => sum + d.maxScore, 0);
  return Math.round((total / max) * 100);
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

export function liabilityLabel(tier: LiabilityTier): string {
  switch (tier) {
    case "contained":
      return "Contained liability";
    case "moderate":
      return "Moderate liability";
    case "elevated":
      return "Elevated liability";
    default: {
      const _exhaustive: never = tier;
      return _exhaustive;
    }
  }
}

export function liabilityColor(tier: LiabilityTier): string {
  switch (tier) {
    case "contained":
      return "text-emerald-400";
    case "moderate":
      return "text-amber-400";
    case "elevated":
      return "text-rose-400";
    default: {
      const _exhaustive: never = tier;
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
