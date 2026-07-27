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
  retail: {
    category: "retail",
    label: "Retail & shops",
    shellClass: "min-h-screen bg-[radial-gradient(ellipse_at_top,_#f5f3ff_0%,_#ffffff_55%,_#ede9fe_100%)]",
    accentTextClass: "text-violet-800",
    ctaClass: "bg-violet-950 text-violet-50 hover:bg-violet-900",
    panelClass: "border-violet-200/80 bg-white/70",
    heroEyebrow: "Retail preview",
  },
  health: {
    category: "health",
    label: "Health & wellness",
    shellClass: "min-h-screen bg-[radial-gradient(ellipse_at_top,_#f0f9ff_0%,_#ffffff_55%,_#e0f2fe_100%)]",
    accentTextClass: "text-sky-800",
    ctaClass: "bg-sky-950 text-sky-50 hover:bg-sky-900",
    panelClass: "border-sky-200/80 bg-white/70",
    heroEyebrow: "Wellness preview",
  },
  automotive: {
    category: "automotive",
    label: "Automotive & auto repair",
    shellClass: "min-h-screen bg-[radial-gradient(ellipse_at_top,_#fef2f2_0%,_#ffffff_55%,_#fef3c7_100%)]",
    accentTextClass: "text-red-800",
    ctaClass: "bg-red-950 text-red-50 hover:bg-red-900",
    panelClass: "border-red-200/80 bg-white/70",
    heroEyebrow: "Auto shop preview",
  },
  cleaning: {
    category: "cleaning",
    label: "Cleaning services",
    shellClass: "min-h-screen bg-[radial-gradient(ellipse_at_top,_#ecfeff_0%,_#ffffff_55%,_#ecfdf5_100%)]",
    accentTextClass: "text-emerald-800",
    ctaClass: "bg-emerald-950 text-emerald-50 hover:bg-emerald-900",
    panelClass: "border-emerald-200/80 bg-white/70",
    heroEyebrow: "Cleaning service preview",
  },
  fitness: {
    category: "fitness",
    label: "Fitness & gyms",
    shellClass: "min-h-screen bg-[radial-gradient(ellipse_at_top,_#eef2ff_0%,_#ffffff_55%,_#e0e7ff_100%)]",
    accentTextClass: "text-indigo-800",
    ctaClass: "bg-indigo-950 text-indigo-50 hover:bg-indigo-900",
    panelClass: "border-indigo-200/80 bg-white/70",
    heroEyebrow: "Gym & studio preview",
  },
  legal: {
    category: "legal",
    label: "Legal & attorneys",
    shellClass: "min-h-screen bg-[radial-gradient(ellipse_at_top,_#eff6ff_0%,_#ffffff_55%,_#dbeafe_100%)]",
    accentTextClass: "text-blue-900",
    ctaClass: "bg-blue-950 text-blue-50 hover:bg-blue-900",
    panelClass: "border-blue-200/80 bg-white/70",
    heroEyebrow: "Law firm preview",
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
