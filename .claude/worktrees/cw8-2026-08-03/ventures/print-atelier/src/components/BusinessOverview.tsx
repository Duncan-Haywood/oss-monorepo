"use client";

import { buildInvestorSnapshot } from "@/lib/investor";
import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowRight,
  Camera,
  DollarSign,
  Layers,
  Megaphone,
  Package,
  Palette,
  ShoppingBag,
  Users,
} from "lucide-react";

const productFlow = [
  { icon: Camera, label: "Capture", desc: "Phone → AI upscale & proof", href: "/capture-demo", color: "from-violet-500 to-purple-600" },
  { icon: Layers, label: "Catalog", desc: "Tags, SEO, mockups, payout math", href: "/artist-portal", color: "from-blue-500 to-cyan-600" },
  { icon: ShoppingBag, label: "Storefront", desc: "Room preview + live listings", href: "/storefront", color: "from-emerald-500 to-teal-600" },
  { icon: Package, label: "Fulfillment", desc: "POD partners + margin guardrails", href: "/ops", color: "from-orange-500 to-amber-600" },
  { icon: Megaphone, label: "Growth", desc: "Outreach, ads, channel budgets", href: "/marketing-portal", color: "from-rose-500 to-pink-600" },
];

const portalLinks = [
  { label: "Visual docs hub", href: "/docs", badge: "New" },
  { label: "Investor dashboard", href: "/investor", badge: "New" },
  { label: "Artist onboarding", href: "/artist-onboard" },
  { label: "Sales outreach CRM", href: "/sales-portal" },
  { label: "Marketing hub", href: "/marketing-portal" },
  { label: "Admin / legal ops", href: "/admin-portal" },
  { label: "Buyer storefront", href: "/storefront" },
];

export default function BusinessOverview() {
  const snapshot = useMemo(() => buildInvestorSnapshot(), []);

  return (
    <div className="space-y-10">
      <header>
        <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
          AI-first · Software-first · Digital-first
        </p>
        <h1 className="text-4xl font-bold mt-2 leading-tight">
          Print Atelier
          <span className="block text-2xl font-normal text-gray-500 dark:text-gray-400 mt-1">
            Dual-sided art print marketplace
          </span>
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mt-4 max-w-3xl">
          Digitize physical art via phone capture. Sell prints via print-on-demand. Pay artists{" "}
          <strong>30% of net profit</strong>. The moat is software — capture, catalog, mockups, outreach, and ads —
          not curation.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-2xl p-5 shadow-lg">
          <p className="text-xs uppercase tracking-wider opacity-80">Launch readiness</p>
          <p className="text-4xl font-bold mt-1">{snapshot.marketLaunch.overall}</p>
          <p className="text-sm opacity-90 mt-1">{snapshot.marketLaunch.label}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-emerald-600">
            <Palette className="w-4 h-4" />
            <p className="text-xs font-semibold uppercase tracking-wider">Supply</p>
          </div>
          <p className="text-3xl font-bold mt-2">{snapshot.catalog.liveArtworks}</p>
          <p className="text-sm text-gray-500">live SKUs · {snapshot.outreach.readyForOnboarding} onboarding-ready</p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-blue-600">
            <Users className="w-4 h-4" />
            <p className="text-xs font-semibold uppercase tracking-wider">Demand</p>
          </div>
          <p className="text-3xl font-bold mt-2">{snapshot.advertising.creativesReady}</p>
          <p className="text-sm text-gray-500">ad-ready creatives · {snapshot.advertising.score}% ad score</p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-amber-600">
            <DollarSign className="w-4 h-4" />
            <p className="text-xs font-semibold uppercase tracking-wider">Unit economics</p>
          </div>
          <p className="text-3xl font-bold mt-2">${snapshot.unitEconomics.artistShare.toFixed(0)}</p>
          <p className="text-sm text-gray-500">artist payout / print at $85 retail</p>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Product map</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {productFlow.map((step, index) => (
            <Link
              key={step.label}
              href={step.href}
              className="group relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600 transition-all"
            >
              {index < productFlow.length - 1 && (
                <ArrowRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300 z-10" />
              )}
              <div
                className={`w-10 h-10 rounded-lg bg-gradient-to-br ${step.color} flex items-center justify-center mb-3`}
              >
                <step.icon className="w-5 h-5 text-white" />
              </div>
              <p className="font-semibold group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {step.label}
              </p>
              <p className="text-sm text-gray-500 mt-1">{step.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-3">Dual-sided marketplace</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
              <p className="text-xs font-bold text-violet-600 uppercase">Supply — Artists</p>
              <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                <li>AI outreach + reply triage</li>
                <li>Phone capture → proof queue</li>
                <li>30% net-profit payout proof</li>
                <li>Consent + release guardrails</li>
              </ul>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
              <p className="text-xs font-bold text-emerald-600 uppercase">Demand — Buyers</p>
              <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                <li>Room-preview conversion lab</li>
                <li>Programmatic SEO + paid social</li>
                <li>Guarded channel budgets</li>
                <li>POD fulfillment routing</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold mb-3">Live portals & demos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {portalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between px-3 py-2.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 text-sm hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors group"
              >
                <span className="group-hover:text-indigo-600 dark:group-hover:text-indigo-400">{link.label}</span>
                {link.badge ? (
                  <span className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200 px-2 py-0.5 rounded-full">
                    {link.badge}
                  </span>
                ) : (
                  <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-500" />
                )}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
        <Link
          href="/docs"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
        >
          Open visual docs hub
          <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          href="/investor"
          className="inline-flex items-center gap-2 px-5 py-2.5 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-lg font-medium hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
        >
          Investor dashboard
          <ArrowRight className="w-4 h-4" />
        </Link>
        <p className="text-sm text-gray-500">
          {snapshot.fulfillmentPartnerCount} fulfillment partners configured · {snapshot.consent.clearedCount} consent-cleared
          listings · ${snapshot.channelBudget.allocatedBudget}/wk guarded ad spend
        </p>
      </section>
    </div>
  );
}
