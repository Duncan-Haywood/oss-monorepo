import type { BusinessIdea, ScoreDimension } from "./types";

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

// For a monthly dollar figure (e.g. a plan's average revenue per customer),
// never formatArr: its k/M abbreviation and "ARR" suffix are calibrated for
// annual targets, so a monthly value over $999 (contract-review-api's 1m plan
// averages $1,042/mo) silently renders as "$1k ARR" — a >99.9% rounding loss
// on top of a wrong unit label.
export function formatMonthlyRevenue(amount: number, currency = "USD"): string {
  return formatCurrency(amount, currency);
}

export function monthsLabel(months: number): string {
  if (months < 12) return `${months} months`;
  const years = months / 12;
  return years === 1 ? "1 year" : `${years.toFixed(1)} years`;
}
