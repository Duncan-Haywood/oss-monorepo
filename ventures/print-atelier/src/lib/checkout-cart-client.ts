"use client";

import {
  addArtworkToCheckoutCart,
  loadCheckoutCartFromStorage,
  saveCheckoutCartToStorage,
  type CheckoutLineItem,
} from "./checkout";
import { catalogArtworks } from "./marketplace";

/**
 * The browser-side half of the cart, shared by the storefront's add buttons and
 * its basket badge.
 *
 * These live in separate client components with no common React ancestor — the
 * storefront page between them is a server component — so a change made by one
 * has to reach the other through the store rather than through props. The
 * `storage` event does not fire in the tab that wrote the value, so writes
 * announce themselves explicitly.
 */
const CART_CHANGED_EVENT = "print-atelier:checkout-cart-changed";

export function readCheckoutCart(): CheckoutLineItem[] {
  return loadCheckoutCartFromStorage();
}

/**
 * Add a catalog artwork to the stored cart.
 *
 * The slug is resolved against the catalog here rather than accepting a price
 * from the caller, so a component cannot name its own amount. An unknown slug
 * is refused instead of being invented — the same rule the checkout session
 * builder applies at the money boundary.
 */
export function addSlugToCheckoutCart(
  slug: string,
  quantity = 1,
): { ok: boolean; blockers: string[]; lineItems: CheckoutLineItem[] } {
  const artwork = catalogArtworks.find((item) => item.slug === slug);
  if (!artwork) {
    return {
      ok: false,
      blockers: [`Unknown artwork slug: ${slug}`],
      lineItems: readCheckoutCart(),
    };
  }

  const result = addArtworkToCheckoutCart(readCheckoutCart(), artwork, quantity);
  if (!result.ok) {
    return result;
  }

  saveCheckoutCartToStorage(result.lineItems);
  announceCheckoutCartChange();
  return result;
}

export function announceCheckoutCartChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT));
}

/** Calls `onChange` whenever this tab, or another one, changes the cart. */
export function subscribeToCheckoutCart(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CART_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CART_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
