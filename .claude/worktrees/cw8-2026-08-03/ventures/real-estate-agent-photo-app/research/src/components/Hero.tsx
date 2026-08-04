import { ArrowRight, CheckCircle2, Target } from "lucide-react";

import {
  EXECUTIVE_SUMMARY,
  INDUSTRY_STATS,
  KEY_INSIGHT,
  MARKET_OPPORTUNITY,
  RECOMMENDATION,
  REPORT_META,
  WORKFLOW_STEPS,
} from "@/lib/data";

import { Section, StatCard } from "./ui";

export function Hero() {
  return (
    <header className="relative overflow-hidden border-b border-white/10 bg-slate-950">
      <div className="absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="absolute right-0 top-32 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-20 sm:pb-24 sm:pt-28">
        <div className="max-w-4xl">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-brand-300/30 bg-brand-400/10 px-4 py-2 text-sm font-semibold text-brand-100">
            <Target className="h-4 w-4" aria-hidden="true" />
            Verdict: {REPORT_META.verdict} · confidence {REPORT_META.confidence}
          </div>
          <h1 className="font-display text-5xl font-semibold tracking-tight text-white sm:text-7xl">
            {REPORT_META.productName}
          </h1>
          <p className="mt-5 max-w-3xl text-2xl font-medium text-brand-100">
            {REPORT_META.tagline}
          </p>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">
            {REPORT_META.subtitle}
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {INDUSTRY_STATS.map((stat) => (
            <StatCard
              key={stat.label}
              value={stat.value}
              label={stat.label}
              source={stat.source}
            />
          ))}
        </div>
      </div>
    </header>
  );
}

export function ExecutiveSummary() {
  return (
    <Section
      eyebrow="Executive summary"
      title="Pursue the agent-first wedge"
      intro="The market is real, but the beachhead must be disciplined: mid-market agents and brokerage operators who already DIY and need a faster path to MLS-ready quality."
    >
      <div className="grid gap-5 md:grid-cols-2">
        {EXECUTIVE_SUMMARY.map((summary, index) => (
          <div
            key={summary}
            className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"
          >
            <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-slate-950">
              {index + 1}
            </div>
            <p className="text-lg leading-8 text-slate-200">{summary}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function ConceptDiagram() {
  return (
    <Section
      title="Concept diagram"
      intro="Listing Lens should feel like a guided capture system, not a filter drawer. The app's advantage is stitching the full workflow together."
    >
      <div className="grid gap-4 lg:grid-cols-5">
        {WORKFLOW_STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <div
              key={step.name}
              className="relative rounded-3xl border border-white/10 bg-slate-900/80 p-6"
            >
              <div className="mb-5 flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-200 ring-1 ring-brand-300/30">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </div>
                <span className="font-display text-3xl text-white/20">
                  0{index + 1}
                </span>
              </div>
              <h3 className="text-xl font-semibold text-white">{step.name}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {step.detail}
              </p>
              {index < WORKFLOW_STEPS.length - 1 ? (
                <ArrowRight
                  className="absolute -right-3 top-1/2 hidden h-6 w-6 -translate-y-1/2 text-brand-300 lg:block"
                  aria-hidden="true"
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export function KeyInsight() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="rounded-[2rem] border border-brand-300/20 bg-brand-500/10 p-8 shadow-glow">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-brand-200">
          Key insight
        </p>
        <p className="font-display text-2xl leading-10 text-white sm:text-3xl">
          {KEY_INSIGHT}
        </p>
      </div>
    </div>
  );
}

export function RecommendationBanner() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-300">
              GTM recommendation
            </p>
            <p className="mt-3 max-w-3xl text-xl leading-8 text-slate-100">
              {RECOMMENDATION}
            </p>
          </div>
          <div className="inline-flex shrink-0 items-center gap-2 rounded-full bg-brand-500 px-5 py-3 text-sm font-bold text-slate-950">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Agent-first CTA
          </div>
        </div>
      </div>
    </div>
  );
}

export function MarketOpportunity() {
  return (
    <Section
      title="Market opportunity"
      intro="The opportunity sits between low-quality DIY and expensive outsourced shoots."
    >
      <div className="grid gap-5 md:grid-cols-3">
        {MARKET_OPPORTUNITY.map((item) => (
          <div
            key={item.title}
            className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"
          >
            <h3 className="text-xl font-semibold text-white">{item.title}</h3>
            <p className="mt-4 leading-7 text-slate-300">{item.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
