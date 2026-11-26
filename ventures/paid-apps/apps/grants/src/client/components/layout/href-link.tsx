// <a> for in-app URLs that carry a query string (e.g. "/login?next=/orgs/x"). Client-side navigates on
// plain left-click; modifier clicks open a new tab as usual.
import { appPath } from "@client/lib/base-path";
import { useNavigate } from "@tanstack/react-router";
import type * as React from "react";

export function HrefLink({
  href,
  onClick,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const navigate = useNavigate();
  return (
    <a
      href={appPath(href)}
      onClick={(e) => {
        onClick?.(e);
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        )
          return;
        e.preventDefault();
        void navigate({ href });
      }}
      {...props}
    />
  );
}

/** Build "/login?next=<path>" safely. */
export const loginHref = (next?: string, base: "/login" | "/signup" = "/login") =>
  next ? `${base}?next=${encodeURIComponent(next)}` : base;
