// Public page: /resources, the index of the resources library (content in src/client/content/resources).
// Also exports the small pieces the article page reuses: breadcrumbs, article cards and the sign-up CTA.
import { HrefLink } from "@client/components/layout/href-link";
import { MarketingFooter } from "@client/components/marketing/footer";
import { useDocumentMeta } from "@client/components/marketing/meta";
import { NewsletterSignup } from "@client/components/marketing/newsletter-signup";
import { GetStartedActions, PageHero } from "@client/components/marketing/page";
import { Container } from "@client/components/marketing/section";
import { SiteLink } from "@client/components/marketing/site-link";
import { MARKETING_PATHS } from "@client/components/marketing/site-map";
import { buttonClass } from "@client/components/ui";
import {
  RESOURCE_ARTICLES,
  RESOURCES_INDEX_META,
  RESOURCES_PATH,
  type ResourceArticle,
  resourcePath,
} from "@client/content/resources";
import { cn } from "@client/lib/cn";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight, Clock } from "lucide-react";
import type * as React from "react";

/** "2026-11-19" → "November 19, 2026" (read as a calendar date, so no time-zone shift). */
export function formatUpdated(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", { dateStyle: "long", timeZone: "UTC" });
}

export interface Crumb {
  label: string;
  /** Omit for the current page. */
  href?: string;
}

/** Breadcrumb trail; the last item is the current page. */
export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="border-b border-neutral-200 bg-white">
      <Container className="py-3">
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-neutral-600">
          {items.map((item, i) => (
            <li key={item.label} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />
              )}
              {item.href === undefined ? (
                <span aria-current="page" className="truncate font-medium text-neutral-900">
                  {item.label}
                </span>
              ) : item.href === "/" ? (
                <Link to="/" className="hover:text-brand-700 hover:underline">
                  {item.label}
                </Link>
              ) : (
                <HrefLink href={item.href} className="hover:text-brand-700 hover:underline">
                  {item.label}
                </HrefLink>
              )}
            </li>
          ))}
        </ol>
      </Container>
    </nav>
  );
}

/** "Updated November 19, 2026 · 6 min read" */
export function ArticleMeta({
  article,
  className,
}: {
  article: Pick<ResourceArticle, "updated" | "readingMinutes">;
  className?: string;
}) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 text-sm text-neutral-500", className)}>
      <span>
        Updated <time dateTime={article.updated}>{formatUpdated(article.updated)}</time>
      </span>
      <span aria-hidden>·</span>
      <span className="inline-flex items-center gap-1">
        <Clock className="h-3.5 w-3.5" aria-hidden />
        {article.readingMinutes} min read
      </span>
    </p>
  );
}

/** Card linking to one article. The heading level depends on where the list sits. */
export function ArticleCard({
  article,
  headingLevel = "h2",
}: {
  article: ResourceArticle;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  const headingId = `resource-${article.slug}`;
  return (
    <li>
      <article
        aria-labelledby={headingId}
        className="group relative flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-6 shadow-card transition-colors focus-within:border-brand-300 hover:border-brand-300"
      >
        <Heading
          id={headingId}
          className="text-balance text-lg font-semibold leading-snug text-neutral-900"
        >
          <HrefLink
            href={resourcePath(article.slug)}
            className="rounded-sm after:absolute after:inset-0 after:rounded-2xl after:content-[''] group-hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {article.title}
          </HrefLink>
        </Heading>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-600">
          {article.description}
        </p>
        <ArticleMeta article={article} className="mt-4" />
      </article>
    </li>
  );
}

/** Sign-up call to action shown on the index and at the end of each article. */
export function ResourcesCta({ headingId }: { headingId: string }) {
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-brand-100 bg-brand-50 p-6 sm:p-8"
    >
      <h2 id={headingId} className="text-xl font-semibold tracking-tight text-neutral-900">
        Turn the documents you already have into grant applications
      </h2>
      <p className="mt-2 max-w-2xl text-neutral-700">
        Grant Autopilot builds a fact base from your records, finds grants that fit and drafts
        applications where every fact cites its source. Anything it can't verify is flagged, and
        your team approves before anything is sent.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link to="/signup" className={buttonClass({ size: "lg" })}>
          Create your account
          <ArrowRight aria-hidden />
        </Link>
        <SiteLink
          to={`${MARKETING_PATHS.trust}#accuracy`}
          className={buttonClass({ size: "lg", variant: "secondary" })}
        >
          How we keep drafts accurate
        </SiteLink>
      </div>
    </section>
  );
}

export function ResourcesPage(): React.JSX.Element {
  useDocumentMeta({
    title: RESOURCES_INDEX_META.title,
    description: RESOURCES_INDEX_META.description,
    canonicalPath: RESOURCES_PATH,
  });

  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Resources" }]} />
      <PageHero
        eyebrow="Resources"
        title="Grant guides for small teams"
        actions={
          <GetStartedActions
            secondary={{ to: MARKETING_PATHS.howItWorks, label: "See how it works" }}
          />
        }
      >
        <p>
          Practical, plain-language guidance for small nonprofits, tribal and community
          organizations and workforce programs, written for teams without a full-time grant writer.
          Every guide lists the sources it relies on.
        </p>
      </PageHero>

      <section aria-labelledby="resources-list-heading" className="bg-white">
        <Container className="py-14 lg:py-20">
          <h2
            id="resources-list-heading"
            className="text-2xl font-semibold tracking-tight text-neutral-900"
          >
            All guides
          </h2>
          <p className="mt-2 max-w-2xl text-neutral-600">
            Rules and requirements change. Each guide notes when it was last reviewed; check the
            official sources before you rely on a specific detail.
          </p>
          <ul className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {RESOURCE_ARTICLES.map((article) => (
              <ArticleCard key={article.slug} article={article} headingLevel="h3" />
            ))}
          </ul>
          <NewsletterSignup
            source={RESOURCES_PATH}
            headingId="resources-newsletter-heading"
            className="mt-14"
          />
          <div className="mt-8">
            <ResourcesCta headingId="resources-cta-heading" />
          </div>
        </Container>
      </section>

      <MarketingFooter />
    </>
  );
}
