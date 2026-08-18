import React from "react";
import ArtistOnboardingIntakeForm from "@/components/ArtistOnboardingIntakeForm";
import DemoNav from "@/components/shared/DemoNav";
import { parseArtistOnboardingDeepLinkParams } from "@/lib/artist-onboarding";

type ArtistOnboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ArtistOnboardPage({ searchParams }: ArtistOnboardPageProps) {
  const resolvedSearchParams = await searchParams;
  const deepLink = parseArtistOnboardingDeepLinkParams(resolvedSearchParams);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-900">
      <DemoNav current="/artist-onboard" />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {deepLink.source === "outreach" && deepLink.handle && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
            Outreach link detected for <span className="font-semibold">{deepLink.handle}</span> — profile
            fields are pre-filled from the sales queue.
          </div>
        )}
        <ArtistOnboardingIntakeForm
          initialOutreachHandle={deepLink.handle}
          initialName={deepLink.name}
          initialSource={deepLink.source}
        />
      </main>
    </div>
  );
}
