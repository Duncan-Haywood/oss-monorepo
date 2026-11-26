// Per-page <title>, description, canonical URL and social tags for the public marketing pages. The SPA
// ships one index.html, so each page sets its own tags on mount and puts the previous values back on
// unmount (the next page then sets its own).
import * as React from "react";

export const SITE_NAME = "Grant Autopilot";

/**
 * Public URL of the product (origin + base path, no trailing slash). Canonical and og:url links are
 * built from it; scripts/prerender.mjs writes the same URLs from SITE_URL (DEFAULT_SITE_URL in
 * src/client/marketing-routes.ts). The old host grants.marisstella.app 301s here.
 */
export const SITE_URL = "https://marisstella.app/grants";

export interface DocumentMeta {
  /** Page name without the site name, e.g. "Pricing". */
  title: string;
  /** One or two plain sentences for search results and link previews. */
  description: string;
  /** Path of the canonical URL, e.g. "/pricing". */
  canonicalPath: string;
}

/** "Pricing" → "Pricing · Grant Autopilot" (titles that already name the site are left alone). */
export const pageTitle = (title: string) =>
  title.includes(SITE_NAME) ? title : `${title} · ${SITE_NAME}`;

/** canonicalUrl("/pricing") -> "https://marisstella.app/grants/pricing"; "/" -> ".../grants/". */
export const canonicalUrl = (path: string) =>
  `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

type Restore = () => void;

function setMeta(attr: "name" | "property", key: string, content: string): Restore {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  const created = !el;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  const meta = el;
  const previous = meta.getAttribute("content");
  meta.setAttribute("content", content);
  return () => {
    if (created) meta.remove();
    else if (previous === null) meta.removeAttribute("content");
    else meta.setAttribute("content", previous);
  };
}

function setCanonical(href: string): Restore {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const created = !el;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  const link = el;
  const previous = link.getAttribute("href");
  link.setAttribute("href", href);
  return () => {
    if (created) link.remove();
    else if (previous === null) link.removeAttribute("href");
    else link.setAttribute("href", previous);
  };
}

/** Sets the page's title, description, canonical link and Open Graph / Twitter tags while mounted. */
export function useDocumentMeta({ title, description, canonicalPath }: DocumentMeta) {
  React.useEffect(() => {
    const fullTitle = pageTitle(title);
    const url = canonicalUrl(canonicalPath);
    const previousTitle = document.title;
    document.title = fullTitle;
    const restores: Restore[] = [
      setMeta("name", "description", description),
      setMeta("property", "og:title", fullTitle),
      setMeta("property", "og:description", description),
      setMeta("property", "og:url", url),
      setMeta("name", "twitter:title", fullTitle),
      setMeta("name", "twitter:description", description),
      setCanonical(url),
    ];
    return () => {
      for (const restore of restores.reverse()) restore();
      document.title = previousTitle;
    };
  }, [title, description, canonicalPath]);
}
