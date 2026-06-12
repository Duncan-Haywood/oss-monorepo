"use client";

import { buildCatalogMetadataDashboard } from "@/lib/catalog-intelligence";
import { buildInvestorSnapshot } from "@/lib/investor";
import { getPublishableSeoSlugs } from "@/lib/seo";
import Link from "next/link";
import { useMemo } from "react";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  FileSearch,
  Globe,
  Layers,
  Swords,
  Wallet,
} from "lucide-react";

const toolCards = [
  {
    href: "/investor",
    title: "Investor dashboard",
    description: "Launch score, catalog health, unit economics, partner readiness, and guarded ad spend.",
    icon: BarChart3,
    gradient: "from-indigo-600 to-violet-700",
    metricKey: "launchScore" as const,
  },
  {
    href: "/battlecards",
    title: "Competitive battlecards",
    description: "Payout math and software moat vs Society6, Redbubble, Saatchi, and Artfinder.",
    icon: Swords,
    gradient: "from-rose-500 to-orange-600",
    metricKey: "battlecards" as const,
  },
  {
    href: "/seo-lab",
    title: "Programmatic SEO lab",
    description: "Generate long-tail print landing pages with consent and proof publish gates.",
    icon: Globe,
    gradient: "from-emerald-500 to-teal-600",
    metricKey: "seoPublishable" as const,
  },
  {
    href: "/catalog-intelligence",
    title: "Catalog AI metadata",
    description: "Tags, SEO copy, mockups, and proof confidence before digital stock goes live.",
    icon: Layers,
    gradient: "from-blue-500 to-cyan-600",
    metricKey: "metadataScore" as const,
  },
  {
    href: "/payout-simulator",
    title: "Stripe Connect simulator",
    description: "Per-order waterfall, artist transfer timing, and negative-economics guardrails.",
    icon: Wallet,
    gradient: "from-amber-500 to-yellow-600",
    metricKey: "artistPayout" as const,
  },
  {
    href: "/sitemap.xml",
    title: "Live sitemap",
    description: "Consent-gated index of market routes and publishable `/prints/[slug]` pages.",
    icon: FileSearch,
    gradient: "from-gray-600 to-gray-800",
    metricKey: "sitemapUrls" as const,
  },
];

export default function VisualDocsHub() {
  const stats = useMemo(() => {
    const snapshot = buildInvestorSnapshot();
    const metadata = buildCatalogMetadataDashboard();
    const publishable = getPublishableSeoSlugs();

    return {
      launchScore: snapshot.marketLaunch.overall,
      launchLabel: snapshot.marketLaunch.label,
      battlecards: 4,
      seoPublishable: publishable.length,
      metadataScore: metadata.averageConfidence,
      metadataGaps: metadata.needsAttentionCount,
      artistPayout: snapshot.unitEconomics.artistShare,
      sitemapUrls: publishable.length + 6,
      liveSkus: snapshot.catalog.liveArtworks,
      consentCleared: snapshot.consent.clearedCount,
    };
  }, []);

  function metricFor(key: (typeof toolCards)[number]["metricKey"]): string {
    switch (key) {
      case "launchScore":
        return `${stats.launchScore} — ${stats.launchLabel}`;
      case "battlecards":
        return `${stats.battlecards} competitors`;
      case "seoPublishable":
        return `${stats.seoPublishable} indexable pages`;
      case "metadataScore":
        return `${stats.metadataScore}% avg confidence · ${stats.metadataGaps} gaps`;
      case "artistPayout":
        return `$${stats.artistPayout.toFixed(2)} / print`;
      case "sitemapUrls":
        return `${stats.sitemapUrls} URLs in sitemap`;
      default: {
        const exhaustive: never = key;
        return String(exhaustive);
      }
    }
  }

  return (
    <div className="space-y-10">
      <header>
        <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          Visual documentation hub
        </p>
        <h1 className="text-3xl font-bold mt-2">Market-ready GTM toolkit</h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mt-3 max-w-3xl">
          Interactive owner docs wired to the same shared catalog, consent gates, and finance math as every portal.
          Use this hub to prepare digital stock, validate payout proof, and launch programmatic SEO before ad spend.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-2xl p-5 shadow-lg col-span-2 md:col-span-1">
          <p className="text-xs uppercase tracking-wider opacity-80">Launch readiness</p>
          <p className="text-4xl font-bold mt-1">{stats.launchScore}</p>
          <p className="text-sm opacity-90 mt-1">{stats.launchLabel}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Digital stock</p>
          <p className="text-3xl font-bold mt-2">{stats.liveSkus}</p>
          <p className="text-sm text-gray-500">live SKUs · {stats.consentCleared} consent-cleared</p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">SEO index</p>
          <p className="text-3xl font-bold mt-2">{stats.seoPublishable}</p>
          <p className="text-sm text-gray-500">publishable print landing pages</p>
        </div>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Metadata AI</p>
          <p className="text-3xl font-bold mt-2">{stats.metadataScore}%</p>
          <p className="text-sm text-gray-500">avg confidence · {stats.metadataGaps} listings need work</p>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">Interactive tools</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {toolCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 hover:shadow-lg hover:border-indigo-300 dark:hover:border-indigo-600 transition-all"
            >
              <div
                className={`w-11 h-11 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center mb-4`}
              >
                <card.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-semibold text-lg group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {card.title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{card.description}</p>
              <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mt-3">
                {metricFor(card.metricKey)}
              </p>
              <span className="inline-flex items-center gap-1 text-sm text-gray-400 mt-3 group-hover:text-indigo-500">
                Open tool <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold mb-2">Go-to-market sequence</h2>
        <ol className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 text-xs font-bold flex items-center justify-center">
              1
            </span>
            <span>
              <strong>Catalog AI</strong> — close metadata gaps before listings enter SEO or ad feeds.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 text-xs font-bold flex items-center justify-center">
              2
            </span>
            <span>
              <strong>SEO lab + sitemap</strong> — publish consent-cleared `/prints/[slug]` pages; blocked pages stay
              `noindex`.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 text-xs font-bold flex items-center justify-center">
              3
            </span>
            <span>
              <strong>Battlecards + payout sim</strong> — lead artist outreach with defensible 30% net-profit proof.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 text-xs font-bold flex items-center justify-center">
              4
            </span>
            <span>
              <strong>Investor dashboard</strong> — single owner view before scaling programmatic ads or fulfillment
              partners.
            </span>
          </li>
        </ol>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/investor"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Open investor dashboard
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-white dark:hover:bg-gray-800 transition-colors"
          >
            Back to business plan
          </Link>
        </div>
      </section>
    </div>
  );
}
