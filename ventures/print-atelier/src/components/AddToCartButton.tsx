"use client";

import { addSlugToCheckoutCart } from "@/lib/checkout-cart-client";
import { Check, ShoppingBag } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export type AddToCartButtonProps = {
  slug: string;
  /** Shown on the button. The price is the catalog's, not this component's. */
  label: string;
  className?: string;
};

/**
 * The storefront's only route into the cart.
 *
 * Before this existed the basket badge was the literal `2` and nothing on the
 * storefront wrote to the cart at all, so the checkout — whose empty state has
 * always read "add a consent-cleared listing from the storefront" — seeded a
 * sample cart instead. A buyer could reach a live pay button holding prints
 * they never chose, and could not buy the print they had actually clicked.
 *
 * A refusal is shown rather than swallowed: an artwork whose artist has not
 * cleared the storefront channel must not enter a cart, and the shopper is told
 * it is unavailable instead of watching the click do nothing.
 */
export default function AddToCartButton({ slug, label, className = "" }: AddToCartButtonProps) {
  const [state, setState] = useState<"idle" | "added" | "refused">("idle");
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (state !== "added") return;
    const timer = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  const onClick = useCallback(() => {
    const result = addSlugToCheckoutCart(slug, 1);
    if (result.ok) {
      setState("added");
      setReason(null);
      return;
    }
    setState("refused");
    setReason(result.blockers[0] ?? "This print cannot be ordered right now");
  }, [slug]);

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label={`Add ${label} to cart`}
        className={
          className ||
          "bg-white text-stone-900 px-4 py-2 rounded-md text-sm font-medium transition shadow-lg inline-flex items-center gap-1.5"
        }
      >
        {state === "added" ? (
          <>
            <Check className="w-4 h-4" /> Added
          </>
        ) : (
          <>
            <ShoppingBag className="w-4 h-4" /> {label}
          </>
        )}
      </button>
      {state === "refused" && reason && (
        <p role="status" className="mt-1 text-xs text-rose-600">
          {reason}
        </p>
      )}
    </>
  );
}
