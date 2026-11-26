// Building blocks for the marketing sub-pages (/how-it-works, /pricing, /trust, ...): a page hero with
// the page's only <h1>, headed sections, an "on this page" jump list and small list/callout helpers.
import { buttonClass } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Check } from "lucide-react";
import type * as React from "react";
import { Container, IconTile, SectionHeading } from "./section";
import type { SiteHref } from "./site-link";
import { SiteLink } from "./site-link";

export const PAGE_HEADING_ID = "page-heading";

export function PageHero({
  eyebrow,
  title,
  children,
  actions,
  aside,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  /** Optional illustration beside the heading on wide screens. */
  aside?: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={PAGE_HEADING_ID}
      className="relative overflow-hidden border-b border-neutral-200 bg-gradient-to-b from-brand-50 via-white to-white"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-200 to-transparent"
      />
      <Container
        className={cn(
          "pb-14 pt-12 sm:pb-16 sm:pt-16 lg:pb-20",
          aside && "grid items-center gap-12 lg:grid-cols-[1.15fr_1fr]",
        )}
      >
        <div className="max-w-3xl">
          {eyebrow && (
            <p className="text-sm font-semibold uppercase tracking-wider text-brand-700">
              {eyebrow}
            </p>
          )}
          <h1
            id={PAGE_HEADING_ID}
            className="mt-3 text-balance text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl sm:leading-[1.1]"
          >
            {title}
          </h1>
          {children && (
            <div className="mt-6 space-y-4 text-pretty text-lg leading-relaxed text-neutral-600">
              {children}
            </div>
          )}
          {actions && (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">{actions}</div>
          )}
        </div>
        {aside}
      </Container>
    </section>
  );
}

/** A full-width page section with an eyebrow + h2. `id` is the jump-link target. */
export function PageSection({
  id,
  eyebrow,
  title,
  intro,
  children,
  tone = "white",
  className,
}: {
  id: string;
  eyebrow?: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  children?: React.ReactNode;
  tone?: "white" | "muted";
  className?: string;
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        "scroll-mt-20",
        tone === "muted" ? "border-y border-neutral-200 bg-neutral-50" : "bg-white",
      )}
    >
      <Container className={cn("py-14 lg:py-20", className)}>
        <SectionHeading id={headingId} eyebrow={eyebrow} title={title}>
          {intro}
        </SectionHeading>
        {children && <div className="mt-10">{children}</div>}
      </Container>
    </section>
  );
}

/** Jump links to the sections of a long page. */
export function OnThisPage({ items }: { items: readonly { href: `#${string}`; label: string }[] }) {
  return (
    <nav aria-label="On this page" className="border-b border-neutral-200 bg-white">
      <Container className="py-4">
        <ul className="flex flex-wrap gap-2 text-sm">
          {items.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="inline-flex rounded-full bg-neutral-100 px-3 py-1.5 font-medium text-neutral-700 hover:bg-brand-50 hover:text-brand-800"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </Container>
    </nav>
  );
}

export function CheckList({
  items,
  className,
}: {
  items: readonly React.ReactNode[];
  className?: string;
}) {
  return (
    <ul className={cn("space-y-2.5 text-neutral-700", className)}>
      {items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static copy, never reordered
        <li key={i} className="flex gap-2.5">
          <Check className="mt-1 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Icon + h3 + body card used in feature grids. */
export function FeatureCard({
  icon: Icon,
  title,
  children,
  as: Tag = "h3",
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  as?: "h3" | "h4";
}) {
  return (
    <li className="flex gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-card">
      <IconTile>
        <Icon />
      </IconTile>
      <div className="min-w-0">
        <Tag className="font-semibold text-neutral-900">{title}</Tag>
        <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-neutral-600">{children}</div>
      </div>
    </li>
  );
}

/** Primary sign-up button plus an optional secondary link to another marketing page. */
export function GetStartedActions({ secondary }: { secondary?: { to: SiteHref; label: string } }) {
  return (
    <>
      <Link to="/signup" className={buttonClass({ size: "lg" })}>
        Get started
        <ArrowRight aria-hidden />
      </Link>
      {secondary && (
        <SiteLink to={secondary.to} className={buttonClass({ size: "lg", variant: "secondary" })}>
          {secondary.label}
        </SiteLink>
      )}
    </>
  );
}

/** "Read more" style link with an arrow, for the end of a section. */
export function MoreLink({ to, children }: { to: SiteHref; children: React.ReactNode }) {
  return (
    <SiteLink
      to={to}
      className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden />
    </SiteLink>
  );
}
