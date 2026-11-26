// DEPRECATED: router.tsx's r() helper now keeps literal paths, so use a typed TanStack
// <Link to="/orgs/$orgId/..." params={...}> instead. The knowledge UI no longer uses this; it is
// kept only for modules outside it that still import KbLink (components/sourcing, routes/org/sourcing).
import { appPath } from "@client/lib/base-path";
import { useRouter } from "@tanstack/react-router";
import type * as React from "react";

const enc = encodeURIComponent;
export const kbPaths = {
  documents: (orgId: string) => `/orgs/${enc(orgId)}/knowledge/documents`,
  document: (orgId: string, id: string) => `/orgs/${enc(orgId)}/knowledge/documents/${enc(id)}`,
  facts: (orgId: string) => `/orgs/${enc(orgId)}/knowledge/facts`,
  search: (orgId: string) => `/orgs/${enc(orgId)}/knowledge/search`,
  projects: (orgId: string) => `/orgs/${enc(orgId)}/projects`,
  project: (orgId: string, id: string) => `/orgs/${enc(orgId)}/projects/${enc(id)}`,
  interviews: (orgId: string) => `/orgs/${enc(orgId)}/interviews`,
  interview: (orgId: string, id: string) => `/orgs/${enc(orgId)}/interviews/${enc(id)}`,
};

export function KbLink({
  href,
  onClick,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const router = useRouter({ warn: false });
  return (
    <a
      href={appPath(href)}
      onClick={(e) => {
        onClick?.(e);
        if (
          e.defaultPrevented ||
          !router ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey ||
          props.target
        )
          return;
        e.preventDefault();
        void router.navigate({ href });
      }}
      {...props}
    />
  );
}
