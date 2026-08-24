"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { trackUsageEvent } from "@/components/shared/UsageTracker";
import {
  CHECKOUT_CART_CHANGED_EVENT,
  countCheckoutUnits,
  describeCheckoutBag,
  formatCheckoutBagCount,
  loadCheckoutCartFromStorage,
} from "@/lib/checkout";

type StorefrontCartBadgeProps = {
  className?: string;
  iconClassName?: string;
};

export default function StorefrontCartBadge({
  className = "relative inline-flex",
  iconClassName = "w-5 h-5 text-stone-700",
}: StorefrontCartBadgeProps) {
  const [unitCount, setUnitCount] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setUnitCount(countCheckoutUnits(loadCheckoutCartFromStorage()));
    };

    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(CHECKOUT_CART_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(CHECKOUT_CART_CHANGED_EVENT, refresh);
    };
  }, []);

  const label = describeCheckoutBag(unitCount);
  const badge = formatCheckoutBagCount(unitCount);

  return (
    <Link
      href="/checkout"
      className={className}
      aria-label={label}
      data-testid="storefront-cart-badge"
      data-cart-count={unitCount}
      onClick={() => trackUsageEvent("cart_badge_open", "/checkout")}
    >
      <ShoppingBag className={iconClassName} aria-hidden="true" />
      {badge ? (
        <span
          data-testid="storefront-cart-count"
          className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-0.5 bg-indigo-600 text-white text-[10px] rounded-full flex items-center justify-center"
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
