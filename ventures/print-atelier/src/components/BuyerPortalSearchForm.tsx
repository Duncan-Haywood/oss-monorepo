"use client";

import { Search } from "lucide-react";
import { trackUsageEvent } from "@/components/shared/UsageTracker";

type BuyerPortalSearchFormProps = {
  defaultQuery?: string;
  styles?: string[];
  sizes?: string[];
  artists?: string[];
  checkoutReadyOnly?: boolean;
  sort?: string;
};

export default function BuyerPortalSearchForm({
  defaultQuery = "",
  styles = [],
  sizes = [],
  artists = [],
  checkoutReadyOnly = false,
  sort = "recommended",
}: BuyerPortalSearchFormProps) {
  return (
    <form
      action="/buyer-portal"
      method="get"
      role="search"
      className="relative"
      onSubmit={() => trackUsageEvent("buyer_portal_search", "/buyer-portal")}
    >
      {styles.map((style) => (
        <input key={`style-${style}`} type="hidden" name="style" value={style} />
      ))}
      {sizes.map((size) => (
        <input key={`size-${size}`} type="hidden" name="size" value={size} />
      ))}
      {artists.map((artist) => (
        <input key={`artist-${artist}`} type="hidden" name="artist" value={artist} />
      ))}
      {checkoutReadyOnly ? <input type="hidden" name="ready" value="1" /> : null}
      {sort && sort !== "recommended" ? <input type="hidden" name="sort" value={sort} /> : null}
      <label htmlFor="buyer-portal-search" className="sr-only">
        Search prints by title, artist, style, or color
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
      <input
        id="buyer-portal-search"
        type="search"
        name="q"
        defaultValue={defaultQuery}
        placeholder="Search title, artist, color, or style"
        autoComplete="off"
        className="w-full rounded-full border border-stone-200 bg-stone-100 py-2 pl-10 pr-4 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      />
    </form>
  );
}
