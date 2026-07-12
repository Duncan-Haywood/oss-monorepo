"use client";

import type { CommerceSku } from "@/lib/commerce/types";
import {
  commerceOrderRequestMessage,
  formatPriceUsd,
} from "@/lib/commerce/catalog";

const ORDER_STORAGE_PREFIX = "lss-commerce-order:";

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
          Request an item below — we&apos;ll confirm availability and payment by
          email or phone.
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
                      // Private mode / blocked storage — contact form stays blank.
                    }
                  }}
                >
                  Request order
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
