import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { docsCanonicalUrl } from "../lib/siteMeta";

const SITE_NAME = "Retail Pilot Intel";

export function DocHead({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const { pathname } = useLocation();
  const fullTitle = title === SITE_NAME ? title : `${title} — ${SITE_NAME}`;

  useEffect(() => {
    document.title = fullTitle;

    const desc =
      description ??
      "Private pilot documentation: ROI priorities, business plan, architecture, and synced HTML reports.";

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute("content", desc);

    const canonical = docsCanonicalUrl(pathname);
    let linkCanonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      if (!linkCanonical) {
        linkCanonical = document.createElement("link");
        linkCanonical.setAttribute("rel", "canonical");
        document.head.appendChild(linkCanonical);
      }
      linkCanonical.setAttribute("href", canonical);
    } else if (linkCanonical) {
      linkCanonical.remove();
    }
  }, [fullTitle, description, pathname]);

  return null;
}
