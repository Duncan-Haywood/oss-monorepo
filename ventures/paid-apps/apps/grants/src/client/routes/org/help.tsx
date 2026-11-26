// Help center (/orgs/$orgId/help): searchable short articles and term definitions from
// content/help.ts, the getting-started steps, and links to the public /resources library.

import { ChecklistCard } from "@client/components/guide/getting-started";
import { useGuide } from "@client/components/guide/queries";
import { HrefLink } from "@client/components/layout/href-link";
import {
  Badge,
  buttonClass,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
} from "@client/components/ui";
import { HELP, HELP_ARTICLES, HELP_TERMS, matchesHelpQuery } from "@client/content/help";
import { RESOURCE_ARTICLES, resourcePath } from "@client/content/resources";
import { appPath } from "@client/lib/base-path";
import { useParams } from "@tanstack/react-router";
import { BookOpen, Search } from "lucide-react";
import * as React from "react";

export function HelpCenterPage() {
  const { orgId } = useParams({ strict: false }) as { orgId: string };
  const [query, setQuery] = React.useState("");
  const guide = useGuide(orgId);
  const base = `/orgs/${encodeURIComponent(orgId)}`;
  const q = query.trim();

  const articles = HELP_ARTICLES.filter((a) => matchesHelpQuery(a, q));
  const terms = HELP_TERMS.map((t) => HELP[t]).filter((e) => matchesHelpQuery(e, q));
  const resources = RESOURCE_ARTICLES.filter((r) =>
    matchesHelpQuery(
      { id: r.slug, title: r.title, summary: r.description, paragraphs: [], keywords: [] },
      q,
    ),
  );
  const nothing = articles.length + terms.length + resources.length === 0;

  // Deep links from help tips (#help-fit_score): open and scroll to that definition.
  const [hash, setHash] = React.useState(() =>
    typeof window === "undefined" ? "" : window.location.hash.slice(1),
  );
  React.useEffect(() => {
    const onHash = () => setHash(window.location.hash.slice(1));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  React.useEffect(() => {
    if (!hash) return;
    document.getElementById(hash)?.scrollIntoView?.({ block: "start" });
  }, [hash]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Help center"
        description="Short answers in plain language. Search for a word you saw in the app."
      />

      <div className="max-w-xl">
        <Label htmlFor="help-search">Search help</Label>
        <div className="relative mt-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <Input
            id="help-search"
            type="search"
            className="pl-9"
            placeholder="e.g. fit score, citations, invite"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {q ? `${articles.length + terms.length + resources.length} results` : ""}
        </p>
      </div>

      {!q && guide.data && !guide.data.complete && (
        <ChecklistCard orgId={orgId} guide={guide.data} />
      )}

      {nothing ? (
        <EmptyState
          icon={<Search />}
          title={`Nothing found for "${q}"`}
          description="Try a shorter word, like “facts”, “draft” or “review”."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-6">
            {articles.length > 0 && (
              <section aria-labelledby="help-guides" className="space-y-3">
                <h2 id="help-guides" className="text-lg font-semibold text-strong">
                  How-to guides
                </h2>
                {articles.map((a) => (
                  <Card key={a.id} id={`help-${a.id}`}>
                    <CardHeader>
                      <CardTitle>{a.title}</CardTitle>
                      <CardDescription>{a.summary}</CardDescription>
                    </CardHeader>
                    <CardBody className="space-y-2 text-sm leading-relaxed">
                      {a.paragraphs.map((p) => (
                        <p key={p.slice(0, 32)}>{p}</p>
                      ))}
                      {a.path !== undefined && (
                        <HrefLink
                          href={`${base}${a.path}`}
                          className={buttonClass({ variant: "link", size: "sm" })}
                        >
                          Go there
                        </HrefLink>
                      )}
                    </CardBody>
                  </Card>
                ))}
              </section>
            )}
            {terms.length > 0 && (
              <section aria-labelledby="help-terms" className="space-y-3">
                <h2 id="help-terms" className="text-lg font-semibold text-strong">
                  What things mean
                </h2>
                <Card>
                  <CardBody className="p-0">
                    <dl>
                      {terms.map((t) => (
                        <div
                          key={t.id}
                          id={`help-${t.id}`}
                          className={
                            hash === `help-${t.id}`
                              ? "scroll-mt-20 bg-brand-50 px-5 py-4"
                              : "scroll-mt-20 px-5 py-4"
                          }
                        >
                          <dt className="font-medium text-strong">{t.term}</dt>
                          <dd className="mt-1 space-y-1 text-sm leading-relaxed">
                            <p>{t.short}</p>
                            <CardDescription>{t.body}</CardDescription>
                            {t.path !== undefined && (
                              <HrefLink
                                href={`${base}${t.path}`}
                                className={buttonClass({ variant: "link", size: "sm" })}
                              >
                                See it in the app
                              </HrefLink>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </CardBody>
                </Card>
              </section>
            )}
          </div>
          {resources.length > 0 && (
            <aside aria-labelledby="help-resources" className="space-y-3">
              <h2 id="help-resources" className="text-lg font-semibold text-strong">
                Grant-writing resources
              </h2>
              <Card>
                <CardBody className="space-y-3">
                  {resources.map((r) => (
                    <div key={r.slug}>
                      <a
                        href={appPath(resourcePath(r.slug))}
                        className={buttonClass({
                          variant: "link",
                          size: "sm",
                          className: "whitespace-normal text-left",
                        })}
                      >
                        <BookOpen aria-hidden />
                        {r.title}
                      </a>
                      <CardDescription className="mt-0.5">{r.description}</CardDescription>
                      <Badge tone="neutral" className="mt-1">
                        {r.readingMinutes} min read
                      </Badge>
                    </div>
                  ))}
                  <a
                    href={appPath("/resources")}
                    className={buttonClass({ variant: "secondary", size: "sm" })}
                  >
                    All resources
                  </a>
                </CardBody>
              </Card>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
