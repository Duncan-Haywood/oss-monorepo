import type { BusinessCategory } from "@/lib/leads/types";

export interface CategoryTheme {
  category: BusinessCategory;
  label: string;
  /** Tailwind-friendly class sets for the preview shell. */
  shellClass: string;
  accentTextClass: string;
  ctaClass: string;
  panelClass: string;
  heroEyebrow: string;
}

export const CATEGORY_THEMES: Record<BusinessCategory, CategoryTheme> = {
  restaurant: {
    category: "restaurant",
    label: "Restaurant & food",
    shellClass: "min-h-screen bg-[radial-gradient(ellipse_at_top,_#fff7ed_0%,_#ffffff_55%,_#fef3c7_100%)]",
    accentTextClass: "text-orange-800",
    ctaClass: "bg-orange-950 text-orange-50 hover:bg-orange-900",
    panelClass: "border-orange-200/80 bg-white/70",
    heroEyebrow: "Dining preview",
  },
  salon: {
    category: "salon",
    label: "Salon & beauty",
    shellClass: "min-h-screen bg-[radial-gradient(ellipse_at_top,_#fdf2f8_0%,_#ffffff_55%,_#f5f3ff_100%)]",
    accentTextClass: "text-rose-800",
    ctaClass: "bg-rose-950 text-rose-50 hover:bg-rose-900",
    panelClass: "border-rose-200/80 bg-white/70",
    heroEyebrow: "Salon preview",
  },
  trades: {
    category: "trades",
    label: "Trades & home services",
    shellClass: "min-h-screen bg-[radial-gradient(ellipse_at_top,_#ecfdf5_0%,_#ffffff_55%,_#e0f2fe_100%)]",
    accentTextClass: "text-teal-900",
    ctaClass: "bg-teal-950 text-teal-50 hover:bg-teal-900",
    panelClass: "border-teal-200/80 bg-white/70",
    heroEyebrow: "Home services preview",
  },
  generic: {
    category: "generic",
    label: "Local business",
    shellClass: "min-h-screen bg-[radial-gradient(ellipse_at_top,_#f8fafc_0%,_#ffffff_60%,_#e2e8f0_100%)]",
    accentTextClass: "text-slate-700",
    ctaClass: "bg-zinc-900 text-white hover:bg-zinc-800",
    panelClass: "border-zinc-200 bg-white/80",
    heroEyebrow: "Business preview",
  },
};

export function getCategoryTheme(category: BusinessCategory): CategoryTheme {
  return CATEGORY_THEMES[category];
}
