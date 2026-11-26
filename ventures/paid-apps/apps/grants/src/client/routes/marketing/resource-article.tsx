// Public page: /resources/$slug, one article of the resources library (src/client/content/resources).
// Unknown slugs render a not-found view with a way back to the index.
import { HrefLink } from "@client/components/layout/href-link";
import { NotFound } from "@client/components/layout/not-found";
import { MarketingFooter } from "@client/components/marketing/footer";
import { useDocumentMeta } from "@client/components/marketing/meta";
import { NewsletterSignup } from "@client/components/marketing/newsletter-signup";
import { PAGE_HEADING_ID } from "@client/components/marketing/page";
import { Container } from "@client/components/marketing/section";
import { Markdown } from "@client/components/ui";
import {
  getResourceArticle,
  RESOURCES_PATH,
  type ResourceArticle,
  type ResourceSource,
  relatedArticles,
  resourcePath,
} from "@client/content/resources";
import { useParams } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import type * as React from "react";
import { ArticleCard, ArticleMeta, Breadcrumbs, ResourcesCta } from "./resources";

const linkClass =
  "font-medium text-brand-700 underline decoration-brand-300 underline-offset-2 hover:decoration-brand-600";

function SourceLink({ source }: { source: ResourceSource }) {
  if (/^https?:\/\//i.test(source.url)) {
    return (
      <a href={source.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {source.title}
        <ExternalLink className="ml-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return (
    <HrefLink href={source.url} className={linkClass}>
      {source.title}
    </HrefLink>
  );
}

function Sources({ sources }: { sources: readonly ResourceSource[] }) {
  return (
    <section aria-labelledby="sources-heading" className="mt-12 border-t border-neutral-200 pt-8">
      <h2 id="sources-heading" className="text-xl font-semibold tracking-tight text-neutral-900">
        Sources
      </h2>
      <p className="mt-2 text-sm text-neutral-600">
        The official and published pages this guide relies on. Rules, thresholds and steps change,
        so check the current requirements with the source before you rely on a specific detail.
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-6 text-sm text-neutral-700 marker:text-neutral-400">
        {sources.map((source) => (
          <li key={source.url} className="pl-1 leading-relaxed">
            <SourceLink source={source} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Article({ article }: { article: ResourceArticle }) {
  const related = relatedArticles(article.slug);
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Resources", href: RESOURCES_PATH },
          { label: article.title },
        ]}
      />
      <article aria-labelledby={PAGE_HEADING_ID} className="bg-white">
        <header className="border-b border-neutral-200 bg-gradient-to-b from-brand-50 via-white to-white">
          <Container className="pb-10 pt-10 sm:pt-14">
            <div className="mx-auto max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-wider text-brand-700">Guide</p>
              <h1
                id={PAGE_HEADING_ID}
                className="mt-3 text-balance text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl sm:leading-[1.15]"
              >
                {article.title}
              </h1>
              <p className="mt-4 text-pretty text-lg leading-relaxed text-neutral-600">
                {article.description}
              </p>
              <ArticleMeta article={article} className="mt-5" />
            </div>
          </Container>
        </header>

        <Container className="py-10 lg:py-14">
          <div className="mx-auto max-w-3xl">
            <Markdown
              source={article.body}
              className="text-base leading-relaxed [&_h2]:scroll-mt-20 [&_li]:leading-relaxed"
            />
            <Sources sources={article.sources} />
            <NewsletterSignup
              source={resourcePath(article.slug)}
              headingId="article-newsletter-heading"
              className="mt-12"
            />
            <div className="mt-8">
              <ResourcesCta headingId="article-cta-heading" />
            </div>
          </div>
        </Container>
      </article>

      {related.length > 0 && (
        <section
          aria-labelledby="related-heading"
          className="border-t border-neutral-200 bg-neutral-50"
        >
          <Container className="py-14">
            <h2
              id="related-heading"
              className="text-2xl font-semibold tracking-tight text-neutral-900"
            >
              Related guides
            </h2>
            <ul className="mt-8 grid gap-4 md:grid-cols-3">
              {related.map((a) => (
                <ArticleCard key={a.slug} article={a} headingLevel="h3" />
              ))}
            </ul>
            <p className="mt-8">
              <HrefLink href={RESOURCES_PATH} className={linkClass}>
                Browse all guides
              </HrefLink>
            </p>
          </Container>
        </section>
      )}
    </>
  );
}

export function ResourceArticlePage(): React.JSX.Element {
  const { slug = "" } = useParams({ strict: false }) as { slug?: string };
  const article = getResourceArticle(slug);

  useDocumentMeta(
    article
      ? {
          title: article.title,
          description: article.description,
          canonicalPath: resourcePath(article.slug),
        }
      : {
          title: "Guide not found",
          description: "We couldn't find that guide. Browse all of our grant guides instead.",
          canonicalPath: RESOURCES_PATH,
        },
  );

  if (!article) {
    return (
      <>
        <NotFound
          title="Guide not found"
          description="We couldn't find that guide. It may have moved, or the link may be mistyped."
          backTo={RESOURCES_PATH}
          backLabel="Browse all guides"
        />
        <MarketingFooter />
      </>
    );
  }

  return (
    <>
      <Article article={article} />
      <MarketingFooter />
    </>
  );
}
