"use client";

import { trackUsageEvent } from "@/components/shared/UsageTracker";
import { addArtworkToCheckoutCart, buildCheckoutAddHref } from "@/lib/checkout";
import Link from "next/link";

type StorefrontCheckoutCTAProps = {
  artworkSlug: string;
  eligible: boolean;
  blockers: string[];
  label?: string;
  variant?: "card" | "hero";
};

export default function StorefrontCheckoutCTA({
  artworkSlug,
  eligible,
  blockers,
  label = "Add to checkout",
  variant = "card",
}: StorefrontCheckoutCTAProps) {
  if (!eligible) {
    const message = blockers[0] ?? "Checkout readiness pending";
    if (variant === "hero") {
      return (
        <button
          type="button"
          disabled
          title={blockers.join(" · ")}
          className="px-5 py-3 rounded-lg font-medium bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 cursor-not-allowed"
        >
          {label}
        </button>
      );
    }
    return (
      <p className="mt-2 text-xs leading-4 text-amber-700" title={blockers.join(" ")}>
        Preview only · {message}
      </p>
    );
  }

  const checkoutHref = buildCheckoutAddHref(artworkSlug);
  const className =
    variant === "hero"
      ? "px-5 py-3 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition"
      : "mt-3 block rounded-lg bg-indigo-600 px-3 py-2 text-center text-sm font-medium text-white transition hover:bg-indigo-700";

  return (
    <Link
      href={checkoutHref}
      onClick={() => {
        addArtworkToCheckoutCart(artworkSlug);
        trackUsageEvent("checkout_add", checkoutHref);
      }}
      className={className}
    >
      {label}
    </Link>
  );
}
