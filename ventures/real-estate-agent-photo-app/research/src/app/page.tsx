import Link from "next/link";

import { AudienceComparison } from "@/components/AudienceComparison";
import {
  PricingSection,
  RiskSection,
  ValidationPlan,
} from "@/components/BusinessPlan";
import {
  ConceptDiagram,
  ExecutiveSummary,
  Hero,
  KeyInsight,
  MarketOpportunity,
  RecommendationBanner,
} from "@/components/Hero";
import {
  CompetitiveLandscape,
  MarketSegments,
} from "@/components/MarketAnalysis";
import { REPORT_META } from "@/lib/data";

const navItems = [
  { href: "#audiences", label: "Audiences" },
  { href: "#segments", label: "Segments" },
  { href: "#competition", label: "Competition" },
  { href: "#pricing", label: "Pricing" },
  { href: "#risks", label: "Risks" },
  { href: "#validation", label: "Validation" },
] as const;

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <a
            href="#top"
            className="font-display text-xl font-semibold tracking-tight text-white"
          >
            {REPORT_META.productName}
          </a>
          <div className="hidden items-center gap-5 text-sm font-medium text-slate-300 md:flex">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="transition hover:text-brand-200"
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </nav>

      <div id="top" />
      <Hero />
      <ExecutiveSummary />
      <ConceptDiagram />
      <KeyInsight />
      <RecommendationBanner />
      <MarketOpportunity />
      <AudienceComparison />
      <MarketSegments />
      <CompetitiveLandscape />
      <PricingSection />
      <RiskSection />
      <ValidationPlan />

      <footer className="border-t border-white/10 px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm text-slate-400">
            Confidential market-research scaffold for Listing Lens. Private /
            proprietary. Verdict preserved: {REPORT_META.verdictRaw} (confidence:{" "}
            {REPORT_META.confidence}).
          </p>
          <p className="mt-3 text-sm text-slate-400">
            Free tool:{" "}
            <Link href="/photo-check" className="font-medium text-brand-300 hover:text-brand-200">
              MLS listing photo preflight check
            </Link>{" "}
            — findings plus a copyable reshoot list. No account, no upload.
          </p>
        </div>
      </footer>
    </main>
  );
}
