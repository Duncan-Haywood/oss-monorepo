"use client";

import { countCheckoutCartItems } from "@/lib/checkout";
import { readCheckoutCart, subscribeToCheckoutCart } from "@/lib/checkout-cart-client";
import { ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * The basket count in the storefront header.
 *
 * It starts at 0 rather than reading the cart during render: `localStorage` does
 * not exist while this renders on the server, and a lazy initializer would make
 * the server and client first renders disagree. The real count arrives on mount
 * and on every subsequent cart change.
 *
 * The number it replaced was the literal `2`, which is how a storefront that
 * could not add anything to a cart still displayed a full one.
 */
export default function StorefrontCartBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const sync = () => setCount(countCheckoutCartItems(readCheckoutCart()));
    sync();
    return subscribeToCheckoutCart(sync);
  }, []);

  return (
    <a href="/checkout" className="relative" aria-label={`View checkout, ${count} in cart`}>
      <ShoppingBag className="w-5 h-5 text-stone-700" />
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-indigo-600 text-white text-[10px] rounded-full flex items-center justify-center">
          {count}
        </span>
      )}
    </a>
  );
}
