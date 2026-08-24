"use client";

import DemoNav from "@/components/shared/DemoNav";
import { trackUsageEvent } from "@/components/shared/UsageTracker";
import { ARTIST_TERMS_DISCLAIMER, ARTIST_TERMS_SECTIONS } from "@/lib/artist-terms";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function ArtistTermsPage() {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-900">
      <DemoNav current="/artist-terms" />

      <main className="max-w-3xl mx-auto px-6 py-10">
        <p className="text-sm font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">
          For artists
        </p>
        <h1 className="text-3xl font-bold mt-1 text-stone-900 dark:text-white">
          What you&apos;re agreeing to, in plain language
        </h1>
        <p className="text-stone-600 dark:text-gray-300 mt-3 max-w-2xl">
          The onboarding form asks you to check four boxes about rights and payout. Each one is expanded
          here — what it covers, what it does not cover, and how to revoke it.
        </p>

        <div className="mt-6 flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
          <ShieldCheck className="w-5 h-5 shrink-0 text-amber-700 dark:text-amber-300 mt-0.5" />
          <p className="text-sm text-amber-900 dark:text-amber-100">{ARTIST_TERMS_DISCLAIMER}</p>
        </div>

        <div className="mt-8 space-y-5">
          {ARTIST_TERMS_SECTIONS.map((section) => (
            <section
              key={section.id}
              className="bg-white dark:bg-gray-800 rounded-2xl border border-stone-200 dark:border-gray-700 p-6"
            >
              <h2 className="font-bold text-lg text-stone-900 dark:text-white">{section.title}</h2>
              <p className="text-stone-600 dark:text-gray-300 mt-1">{section.summary}</p>
              <ul className="mt-4 space-y-2 list-disc pl-5">
                {section.details.map((detail) => (
                  <li key={detail} className="text-sm text-stone-600 dark:text-gray-300">
                    {detail}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-gray-800 rounded-2xl border border-stone-200 dark:border-gray-700 p-6">
          <div>
            {acknowledged ? (
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Thanks — this does not submit anything. Check the boxes on the onboarding form when you&apos;re ready.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAcknowledged(true);
                  trackUsageEvent("artist_terms_ack", "/artist-terms");
                }}
                className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700 dark:bg-white dark:text-stone-900"
              >
                I&apos;ve read this
              </button>
            )}
          </div>
          <Link
            href="/artist-onboard"
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            Back to onboarding →
          </Link>
        </div>
      </main>
    </div>
  );
}
