"use client";

import { Search } from "lucide-react";
import { trackUsageEvent } from "@/components/shared/UsageTracker";

type B2BSearchFormProps = {
  defaultQuery?: string;
};

export default function B2BSearchForm({ defaultQuery = "" }: B2BSearchFormProps) {
  return (
    <form
      action="/b2b-portal"
      method="get"
      role="search"
      className="relative"
      onSubmit={() => trackUsageEvent("b2b_search", "/b2b-portal")}
    >
      <label htmlFor="b2b-catalog-search" className="sr-only">
        Search the trade catalog by title, artist, style, or color
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        id="b2b-catalog-search"
        type="search"
        name="q"
        defaultValue={defaultQuery}
        placeholder="Search by style, color, artist..."
        autoComplete="off"
        className="pl-9 pr-4 py-2 text-sm border border-slate-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-slate-900 dark:text-white"
      />
    </form>
  );
}
