"use client";

import { trackUsageEvent } from "@/components/shared/UsageTracker";
import Link from "next/link";

type StorefrontCheckoutCTAProps = {
  artworkSlug: string;
  eligible: boolean;
  blockers: string[];
};

export default function StorefrontCheckoutCTA({
  artworkSlug,
  eligible,
  blockers,
}: StorefrontCheckoutCTAProps) {
  if (!eligible) {
    return (
      <p className="mt-2 text-xs leading-4 text-amber-700" title={blockers.join(" ")}>
        Preview only · {blockers[0] ?? "Checkout readiness pending"}
      </p>
    );
  }

  const checkoutHref = `/checkout?add=${encodeURIComponent(artworkSlug)}`;

  return (
    <Link
      href={checkoutHref}
      onClick={() => trackUsageEvent("checkout_add", checkoutHref)}
      className="mt-3 block rounded-lg bg-indigo-600 px-3 py-2 text-center text-sm font-medium text-white transition hover:bg-indigo-700"
    >
      Add to checkout
    </Link>
  );
}
