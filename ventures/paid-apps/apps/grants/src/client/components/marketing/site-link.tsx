// Links between the marketing pages. Uses HrefLink (client-side navigation on a plain click) with a
// path checked against MARKETING_PATHS, so a typo in a marketing link fails the typecheck.
import { HrefLink } from "@client/components/layout/href-link";
import type { LegalDocKey } from "@shared/legal";
import { Link } from "@tanstack/react-router";
import type * as React from "react";
import type { MarketingPath } from "./site-map";

export type SiteHref = MarketingPath | `${MarketingPath}#${string}`;

export function SiteLink({
  to,
  ...props
}: Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { to: SiteHref }) {
  return <HrefLink href={to} {...props} />;
}

/** Underlined text link for running copy. */
export const inlineLinkClass =
  "font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800";

/** Link to one of the /legal/* documents. */
export function PolicyLink({
  doc,
  children,
  className = inlineLinkClass,
}: {
  doc: LegalDocKey;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link to="/legal/$doc" params={{ doc }} className={className}>
      {children}
    </Link>
  );
}
