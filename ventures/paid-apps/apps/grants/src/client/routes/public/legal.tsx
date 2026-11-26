// OWNER: shell agent — /legal/$doc renders GET /api/legal/:key (markdown) with a list of the other docs.
import { NotFound } from "@client/components/layout/not-found";
import { Button, ErrorMessage, Markdown, SkeletonText } from "@client/components/ui";
import { ApiError, api, formatDate } from "@client/lib/api";
import { cn } from "@client/lib/cn";
import { LEGAL_DOC_KEYS } from "@shared/legal";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { FileText, Printer } from "lucide-react";
import * as React from "react";

interface LegalDocMeta {
  key: string;
  title: string;
  version: string;
  updatedAt: string;
}
interface LegalDoc extends LegalDocMeta {
  markdown: string;
}

const FALLBACK_TITLES: Record<string, string> = {
  terms: "Terms of Service",
  privacy: "Privacy Policy",
  "data-use": "Data Use Policy",
  refunds: "Refund Policy",
  "acceptable-use": "Acceptable Use Policy",
};

/** Drop a leading "# Title" (we render the title ourselves) and pick a heading offset. */
function prepare(markdown: string): { body: string; offset: number } {
  const body = markdown.replace(/^\s*#\s+[^\n]*\n/, "");
  return { body, offset: /^#\s/m.test(body) ? 1 : 0 };
}

export function LegalPage() {
  const { doc = "" } = useParams({ strict: false }) as { doc?: string };
  const list = useQuery({
    queryKey: ["legal"],
    queryFn: () => api<{ items: LegalDocMeta[] }>("/api/legal"),
    staleTime: 5 * 60_000,
  });
  const q = useQuery({
    queryKey: ["legal", doc],
    queryFn: () => api<LegalDoc>(`/api/legal/${encodeURIComponent(doc)}`),
    enabled: doc.length > 0,
    staleTime: 5 * 60_000,
  });
  const docs: { key: string; title: string }[] =
    list.data?.items ?? LEGAL_DOC_KEYS.map((key) => ({ key, title: FALLBACK_TITLES[key] ?? key }));
  const prepared = React.useMemo(() => (q.data ? prepare(q.data.markdown) : null), [q.data]);
  const title = q.data?.title ?? FALLBACK_TITLES[doc] ?? "Legal";

  React.useEffect(() => {
    document.title = `${title} · Grant Autopilot`;
    return () => {
      document.title = "Grant Autopilot";
    };
  }, [title]);

  if (q.error instanceof ApiError && q.error.status === 404) {
    return (
      <NotFound
        title="Document not found"
        description="We couldn't find that policy. Choose one of our published documents below."
        backTo="/legal/terms"
        backLabel="View Terms of Service"
      />
    );
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[14rem_1fr] lg:py-14">
      <nav aria-label="Legal documents" className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Policies
        </p>
        <ul className="flex flex-wrap gap-1 lg:flex-col">
          {docs.map((d) => {
            const active = d.key === doc;
            return (
              <li key={d.key}>
                <Link
                  to="/legal/$doc"
                  params={{ doc: d.key }}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                    active
                      ? "bg-brand-50 text-brand-800"
                      : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
                  )}
                >
                  <FileText className="h-4 w-4 shrink-0" aria-hidden />
                  {d.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <article className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-6 shadow-card sm:p-10">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-neutral-100 pb-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">{title}</h1>
            {q.data && (
              <p className="mt-2 text-sm text-neutral-500">
                Version {q.data.version} · Last updated {formatDate(q.data.updatedAt)}
              </p>
            )}
          </div>
          {q.data && (
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer aria-hidden /> Print
            </Button>
          )}
        </header>
        {q.isPending && doc ? (
          <SkeletonText lines={10} label="Loading document" />
        ) : q.isError ? (
          <ErrorMessage error={q.error} title="We couldn't load this document" />
        ) : prepared ? (
          <Markdown source={prepared.body} headingOffset={prepared.offset} />
        ) : null}
      </article>
    </div>
  );
}
