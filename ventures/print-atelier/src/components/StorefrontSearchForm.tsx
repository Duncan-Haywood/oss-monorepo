"use client";

import { Search } from "lucide-react";
import { trackUsageEvent } from "@/components/shared/UsageTracker";

type StorefrontSearchFormProps = {
  defaultQuery?: string;
  style?: string;
  artist?: string;
};

export default function StorefrontSearchForm({
  defaultQuery = "",
  style,
  artist,
}: StorefrontSearchFormProps) {
  return (
    <form
      action="/storefront"
      method="get"
      role="search"
      className="flex-1 max-w-md relative"
      onSubmit={() => trackUsageEvent("storefront_search", "/storefront")}
    >
      {style && style !== "All" ? <input type="hidden" name="style" value={style} /> : null}
      {artist ? <input type="hidden" name="artist" value={artist} /> : null}
      <label htmlFor="storefront-search" className="sr-only">
        Search prints by title, artist, style, or color
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
      <input
        id="storefront-search"
        type="search"
        name="q"
        defaultValue={defaultQuery}
        placeholder="Search by style, color, artist..."
        autoComplete="off"
        className="w-full rounded-full bg-stone-100 py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </form>
  );
}
