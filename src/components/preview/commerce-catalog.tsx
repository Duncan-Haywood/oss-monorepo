"use client";

import { useState } from "react";
import type { CommerceSku } from "@/lib/commerce/types";
import {
  commerceCatalogIntroCopy,
  commerceOrderRequestMessage,
  formatPriceUsd,
} from "@/lib/commerce/catalog";

const ORDER_STORAGE_PREFIX = "lss-commerce-order:";

export const COMMERCE_ORDER_EVENT = "lss:commerce-order-request";

export type CommerceOrderEventDetail = {
  slug: string;
  message: string;
};

export function commerceOrderStorageKey(slug: string): string {
  return `${ORDER_STORAGE_PREFIX}${slug}`;
}

type PreviewCommerceCatalogProps = {
  slug: string;
  items: CommerceSku[];
  panelClass: string;
  accentTextClass: string;
  ctaClass: string;
};

/** Direct Stripe Checkout for a synced SKU — server resolves the real price by id. */
function BuyNowButton({ slug, sku, ctaClass }: { slug: string; sku: CommerceSku; ctaClass: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBuy = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/commerce/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, skuId: sku.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) {
        setError(data.message ?? data.error ?? "Checkout failed");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error — please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        disabled={loading}
        onClick={handleBuy}
        className={`inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-medium transition-colors disabled:opacity-60 ${ctaClass}`}
      >
        {loading ? "Redirecting…" : "Buy now"}
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

/**
 * Commerce add-on catalog on /preview/[slug].
 * "Request order" stores a prefilled message and jumps to #contact so the
 * existing inquiry path notifies the operator (order-notification stub).
 */
export function PreviewCommerceCatalog({
  slug,
  items,
  panelClass,
  accentTextClass,
  ctaClass,
}: PreviewCommerceCatalogProps) {
  if (items.length === 0) return null;

  return (
    <section
      id="catalog"
      className="mx-auto max-w-5xl px-6 pb-10"
      aria-labelledby="commerce-catalog-heading"
    >
      <div className={`rounded-2xl border p-6 backdrop-blur ${panelClass}`}>
        <p className={`text-sm font-medium uppercase tracking-[0.18em] ${accentTextClass}`}>
          Shop
        </p>
        <h2
          id="commerce-catalog-heading"
          className="mt-2 text-xl font-semibold text-zinc-900"
        >
          Menu &amp; products
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          {commerceCatalogIntroCopy(items)}
        </p>
        <ul className="mt-6 divide-y divide-zinc-200/80">
          {items.map((sku) => {
            const requestMessage = commerceOrderRequestMessage(sku);
            return (
              <li
                key={sku.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-zinc-900">{sku.name}</p>
                  {sku.description ? (
                    <p className="mt-1 text-sm text-zinc-600">{sku.description}</p>
                  ) : null}
                  <p className="mt-1 text-sm font-medium text-zinc-800">
                    {formatPriceUsd(sku.priceCents)}
                  </p>
                </div>
                {sku.stripePriceId ? (
                  <BuyNowButton slug={slug} sku={sku} ctaClass={ctaClass} />
                ) : (
                  <a
                    href="#contact"
                    className={`inline-flex h-10 shrink-0 items-center justify-center rounded-full px-5 text-sm font-medium transition-colors ${ctaClass}`}
                    onClick={() => {
                      try {
                        sessionStorage.setItem(
                          commerceOrderStorageKey(slug),
                          requestMessage,
                        );
                      } catch {
                        // Private mode / blocked storage — event still prefills.
                      }
                      window.dispatchEvent(
                        new CustomEvent<CommerceOrderEventDetail>(COMMERCE_ORDER_EVENT, {
                          detail: { slug, message: requestMessage },
                        }),
                      );
                    }}
                  >
                    Request order
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
