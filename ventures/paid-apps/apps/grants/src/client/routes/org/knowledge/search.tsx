// OWNER: knowledge UI agent — semantic search over the org's documents (POST /search).
import { ApiErrorAlert } from "@client/components/grants/api-error-alert";
import { Highlight } from "@client/components/knowledge/highlight";
import { type SearchHit, useOrgId } from "@client/components/knowledge/queries";
import { Button, EmptyState, Input, PageHeader, Spinner } from "@client/components/ui";
import { api, orgApi } from "@client/lib/api";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileText, Search } from "lucide-react";
import { useState } from "react";

export function SearchPage() {
  const orgId = useOrgId();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const search = useMutation({
    mutationFn: (q: string) =>
      api<{ items: SearchHit[] }>(orgApi(orgId, "/search"), {
        method: "POST",
        body: { query: q, topK: 10 },
      }),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSubmitted(q);
    search.mutate(q);
  };

  const items = search.data?.items ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search your knowledge base"
        description="Find passages across everything you've uploaded — the same retrieval Autopilot uses when drafting."
      />
      <form onSubmit={onSubmit} aria-label="Search documents" className="flex gap-2">
        <label htmlFor="kb-search" className="sr-only">
          Search query
        </label>
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
            aria-hidden
          />
          <Input
            id="kb-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. How many people completed the construction trades program?"
            className="pl-9"
          />
        </div>
        <Button type="submit" loading={search.isPending} disabled={!query.trim()}>
          Search
        </Button>
      </form>

      <div aria-live="polite">
        {search.isPending ? (
          <Spinner label="Searching" />
        ) : search.isError ? (
          <ApiErrorAlert error={search.error} title="Search failed" />
        ) : !search.isSuccess ? (
          <EmptyState
            title="Ask anything about your organization"
            description="Try “youth served”, “2025 budget”, or “carpentry certification”."
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="No matching passages"
            description="Try different words, or upload more documents."
          />
        ) : (
          <ol className="space-y-3" aria-label={`Results for ${submitted}`}>
            {items.map((hit) => (
              <li
                key={hit.chunkId}
                className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Link
                    to="/orgs/$orgId/knowledge/documents/$documentId"
                    params={{ orgId, documentId: hit.documentId }}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
                  >
                    <FileText className="h-4 w-4" aria-hidden />
                    {hit.documentTitle}
                  </Link>
                  <span className="text-xs tabular-nums text-neutral-500" title="Relevance score">
                    {Math.round(hit.score * 100)}% match
                  </span>
                </div>
                {hit.heading && (
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
                    {hit.heading}
                  </p>
                )}
                <p className="line-clamp-6 whitespace-pre-wrap text-sm text-neutral-700">
                  <Highlight text={hit.text} query={submitted} />
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
