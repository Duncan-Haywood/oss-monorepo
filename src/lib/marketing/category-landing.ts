/**
 * Single source of truth for the /websites-for-* category landing pages —
 * shared by each page's own module (title/copy) and the marketing sitemap
 * (src/app/sitemap.ts), so a new landing page can't ship indexable-but-
 * unlisted the same way 9 of 12 /docs pages once did (sitemap-docs-route-sync).
 *
 * These pages exist to earn organic search traffic for long-tail queries
 * ("website for a restaurant", "salon website builder", "website for a
 * plumber") that convert straight to /checkout — an acquisition channel an
 * agent can build entirely with content and routing, unlike lead-ingestion
 * (Places API), which stays legal-gated. See category-landing-pages in
 * BUSINESS_DECISIONS (prompt_process.tsx) for the full rationale.
 */
import { getBundle, minBundleSetupPriceUsd, type BundleTier } from "@/lib/pricing/bundles";
import type { BusinessCategory } from "@/lib/leads/types";
import { monthlyMarketingEmailCount, monthlyMarketingSocialPostCount } from "./monthly-pack";

// Same drift-risk class as startingSetupPriceUsd above, but for the
// marketing-pack cadence (see monthly-marketing-pack-cadence-single-source-of-truth
// in prompt_process.tsx) — never hand-type "8 social/GBP posts + 2 emails" again.
const monthlyMarketingCadence = `${monthlyMarketingSocialPostCount()} social/GBP posts + ${monthlyMarketingEmailCount()} emails`;

// "$500" quoted below always derives from src/lib/pricing/bundles.ts (the
// same source Stripe checkout charges from), never a hardcoded literal — a
// future bundle price change (BUSINESS_DECISIONS) must not leave these SEO
// meta descriptions / FAQ answers advertising a stale figure to organic
// search traffic while checkout charges the new one.
const startingSetupPriceUsd = minBundleSetupPriceUsd();

export interface CategoryLandingFaqEntry {
  question: string;
  answer: string;
}

export interface CategoryLandingPage {
  category: BusinessCategory;
  href: string;
  navLabel: string;
  seoTitle: string;
  metaDescription: string;
  heroHeadline: string;
  heroSubhead: string;
  painPoints: string[];
  features: string[];
  recommendedTier: BundleTier;
  /** A curated DEMO_LEADS slug (always publicly indexable) to show as a live example. */
  exampleLeadSlug: string;
  faq: CategoryLandingFaqEntry[];
}

export const CATEGORY_LANDING_PAGES: readonly CategoryLandingPage[] = [
  {
    category: "restaurant",
    href: "/websites-for-restaurants",
    navLabel: "Restaurants",
    seoTitle: "Website for Restaurants — menu, hours, and online ordering",
    metaDescription:
      `A restaurant website with your menu, hours, location, and online ordering — built and previewed before you pay. From $${startingSetupPriceUsd}, live in days.`,
    heroHeadline: "A website for your restaurant, ready before you decide",
    heroSubhead:
      "Menu, hours, location, and a contact form — built from your public business details and previewed for free. Add online ordering when you're ready.",
    painPoints: [
      "Your hours and menu are scattered across a review site, a social profile, and word of mouth",
      "Customers can't find you on Google or don't trust a listing with no real website",
      "A custom build from a local agency costs thousands and takes months",
    ],
    features: [
      "Menu, hours, and location on one fast page",
      "Contact form and Google Maps embed",
      "Basic SEO so nearby diners can find you",
      "Optional online ordering and pickup checkout (Commerce add-on)",
    ],
    recommendedTier: "growth",
    exampleLeadSlug: "example-bakery",
    faq: [
      {
        question: "Can customers order food directly from the site?",
        answer:
          "Yes — the Commerce add-on stacks on any bundle and adds Stripe checkout for pickup ordering, with order notifications sent straight to you.",
      },
      {
        question: "Do I need to give you my menu before I see anything?",
        answer:
          "No. You can preview a working example first (see the Restaurant preview below), then buy and we tailor it to your business.",
      },
      {
        question: "How is this different from a delivery-app page?",
        answer:
          "This is your own website on your own domain — not a listing you're renting inside someone else's app, with their branding and their fees on every order.",
      },
    ],
  },
  {
    category: "salon",
    href: "/websites-for-salons",
    navLabel: "Salons",
    seoTitle: "Salon Website Builder — booking, services, and reviews",
    metaDescription:
      `A salon or spa website with your services, hours, and booking info — built and previewed before you pay. From $${startingSetupPriceUsd}, with optional monthly marketing.`,
    heroHeadline: "A website that makes your salon look as good as your work",
    heroSubhead:
      "Services, hours, and a booking-ready contact form — previewed for free before you buy. Add monthly social posts once you're live.",
    painPoints: [
      "New clients judge your work by your online presence before they ever sit in the chair",
      "A booking app alone doesn't explain your services, pricing tiers, or specialties",
      "Keeping social posts consistent every week is its own part-time job",
    ],
    features: [
      "Services and pricing tiers laid out clearly",
      "Contact form and map for walk-in-friendly locations",
      "Basic SEO so \"salon near me\" searches find you",
      `${monthlyMarketingCadence} a month (Growth/Complete)`,
    ],
    recommendedTier: "complete",
    exampleLeadSlug: "serene-salon",
    faq: [
      {
        question: "Can I keep using my existing booking app?",
        answer:
          "Yes — the site links out to whatever booking tool you already use; we don't force a migration.",
      },
      {
        question: "Do you write the social posts every month?",
        answer:
          `Growth and Complete include ${monthlyMarketingCadence} a month, generated from your site's own brand voice and ready to copy-post — no separate marketing hire.`,
      },
      {
        question: "Is there a phone agent for booking calls?",
        answer:
          "Complete adds an AI phone agent for your business line so a missed call during a service doesn't become a lost client.",
      },
    ],
  },
  {
    category: "trades",
    href: "/websites-for-trades",
    navLabel: "Trades & home services",
    seoTitle: "Website for Trades & Home Services — plumbers, electricians, contractors",
    metaDescription:
      `A website for plumbers, electricians, and contractors with your services, service area, and a quote-request form — built and previewed before you pay, from $${startingSetupPriceUsd}.`,
    heroHeadline: "A website that turns emergency calls into booked jobs",
    heroSubhead:
      "Services, service area, and a quote-request form — previewed for free before you pay. Simple and fast, built for calls, not browsing.",
    painPoints: [
      "Homeowners searching \"emergency plumber near me\" bounce off a slow or missing website",
      "Your only online presence is a directory listing you don't control",
      "You need estimates and calls, not a shopping cart",
    ],
    features: [
      "Services and service area up front",
      "Quote-request contact form and map",
      "Basic SEO for local emergency + scheduled-service searches",
      "Click-to-call phone number on every page",
    ],
    recommendedTier: "starter",
    exampleLeadSlug: "mountain-plumbing",
    faq: [
      {
        question: "I just need something simple and fast — is that an option?",
        answer:
          `Yes — Starter ($${getBundle("starter")!.setupPriceUsd}, one-time) covers exactly this: a professional page, contact form, map, and basic SEO, no recurring fee required.`,
      },
      {
        question: "Can I add online payment for deposits later?",
        answer:
          "Yes — the Commerce add-on can be added at checkout or later for booking deposits and gift cards.",
      },
      {
        question: "Do you build a shopping cart for my services?",
        answer:
          "Trades businesses are usually quote-based, so Starter or Complete (with the AI phone agent for after-hours calls) fits better than the Commerce add-on.",
      },
    ],
  },
] as const;

export function categoryLandingPageByHref(href: string): CategoryLandingPage | undefined {
  return CATEGORY_LANDING_PAGES.find((page) => page.href === href);
}
