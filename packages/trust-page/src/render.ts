// Renders a TrustProfile as an HTML fragment (for a site's own page shell) or a standalone document.
// No scripts, no external resources: it fits the sites' strict CSP (script-src 'none').

import { SECTION_IDS, validateProfile } from "./guard.ts";
import type { Claim, ClaimStatus, SectionId, Subprocessor, TrustProfile } from "./types.ts";

export const SECTION_TITLES: Readonly<Record<SectionId, string>> = {
  data_location: "Where your data is stored",
  encryption: "Encryption",
  access: "Access to your data",
  backups: "Backups and recovery",
  deletion: "Export, retention and deletion",
  incident: "Incidents and how to reach us",
  development: "How the software is built and changed",
};

export const STATUS_LABELS: Readonly<Record<ClaimStatus, string>> = {
  in_place: "In place",
  partial: "Partly in place",
  not_in_place: "Not in place",
  owner_to_confirm: "Being confirmed",
};

/** Fixed, reviewed wording; profile text cannot change it. */
export const NO_CERTIFICATION_NOTE =
  "We do not hold any security certification or third-party audit report. This page describes what " +
  "the product does today, including what is missing. Some of our infrastructure providers publish " +
  "their own security reports; those cover the provider, not this product.";

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface RenderOptions {
  /**
   * Base URL for repository sources (e.g. a link to the source tree). When unset, sources are not
   * rendered: the repository is private, so a path would mean nothing to a customer.
   */
  sourceBaseUrl?: string;
  /** Heading level for the page title (default 1). Section headings are one level below. */
  headingLevel?: 1 | 2 | 3;
}

function sourceLink(src: string, base: string | undefined): string | null {
  if (src.startsWith("https://")) {
    return `<a href="${escapeHtml(src)}" rel="noopener noreferrer">${escapeHtml(new URL(src).host)}</a>`;
  }
  if (!base) return null;
  const href = `${base.replace(/\/+$/, "")}/${src}`;
  return `<a href="${escapeHtml(href)}" rel="noopener noreferrer">${escapeHtml(src)}</a>`;
}

function renderClaim(c: Claim, base: string | undefined): string {
  const links = c.sources.map((s) => sourceLink(s, base)).filter((l): l is string => l !== null);
  const src = links.length ? ` <span class="trust-src">Source: ${links.join(", ")}</span>` : "";
  return (
    `<li class="trust-claim trust-${c.status.replaceAll("_", "-")}">` +
    `<span class="trust-status">${STATUS_LABELS[c.status]}</span> ${escapeHtml(c.text)}${src}</li>`
  );
}

function renderSubprocessor(p: Subprocessor): string {
  const reports =
    p.trustUrl && p.trustUrlCheckedOn
      ? `<a href="${escapeHtml(p.trustUrl)}" rel="noopener noreferrer">Provider's own security page</a> (checked ${escapeHtml(p.trustUrlCheckedOn)})`
      : "Not linked yet";
  const cond = p.condition ? `<br><small>Only when: ${escapeHtml(p.condition)}</small>` : "";
  return (
    `<tr><th scope="row">${escapeHtml(p.name)}${cond}</th><td>${escapeHtml(p.purpose)}</td>` +
    `<td>${escapeHtml(p.data)}</td><td>${escapeHtml(p.location)}</td><td>${reports}</td></tr>`
  );
}

/** HTML fragment: a <section> with the whole trust page. Validates the profile first. */
export function renderTrustSection(profile: TrustProfile, opts: RenderOptions = {}): string {
  validateProfile(profile);
  const h = opts.headingLevel ?? 1;
  const hs = Math.min(h + 1, 6);
  const base = opts.sourceBaseUrl;
  const parts: string[] = [];
  parts.push(`<section class="trust-page" aria-labelledby="trust-title">`);
  parts.push(`<h${h} id="trust-title">Security at ${escapeHtml(profile.product)}</h${h}>`);
  parts.push(
    `<p class="trust-meta">Operated by ${escapeHtml(profile.operator)}. ` +
      (profile.lifecycle === "live"
        ? "The product is live."
        : "The product is not yet serving customers; this page describes the software as built.") +
      ` Last reviewed against the code on <time datetime="${profile.reviewedOn}">${profile.reviewedOn}</time>.</p>`,
  );
  parts.push(`<p class="trust-note">${escapeHtml(NO_CERTIFICATION_NOTE)}</p>`);
  parts.push(
    `<p class="trust-legend">Each item is marked ${Object.values(STATUS_LABELS)
      .map((l) => `<strong>${l}</strong>`)
      .join(", ")}. "Being confirmed" items depend on account settings we have not yet verified; ` +
      "do not rely on them.</p>",
  );

  for (const id of SECTION_IDS) {
    parts.push(`<h${hs} id="trust-${id.replaceAll("_", "-")}">${SECTION_TITLES[id]}</h${hs}>`);
    if (id === "incident") {
      parts.push(
        profile.securityContact
          ? `<p>Report a security issue: <a href="${escapeHtml(profile.securityContact)}">${escapeHtml(
              profile.securityContact.replace(/^mailto:/, ""),
            )}</a>.${
              profile.disclosurePolicyUrl
                ? ` Read our <a href="${escapeHtml(profile.disclosurePolicyUrl)}">vulnerability disclosure policy</a>.`
                : ""
            }</p>`
          : "<p>A security contact address is being set up and will be published here.</p>",
      );
    }
    parts.push(
      `<ul class="trust-claims">${profile.sections[id].map((c) => renderClaim(c, base)).join("")}</ul>`,
    );
  }

  parts.push(`<h${hs} id="trust-subprocessors">Subprocessors</h${hs}>`);
  if (profile.subprocessors.length === 0) {
    parts.push("<p>None: no outside service processes customer data for this product.</p>");
  } else {
    parts.push(
      `<table class="trust-subprocessors"><thead><tr><th scope="col">Provider</th><th scope="col">Purpose</th>` +
        `<th scope="col">Data it receives</th><th scope="col">Location</th><th scope="col">Provider's reports</th></tr></thead>` +
        `<tbody>${profile.subprocessors.map(renderSubprocessor).join("")}</tbody></table>`,
    );
  }
  parts.push("</section>");
  return parts.join("\n");
}

const BASE_CSS = `
.trust-page{max-width:46rem;margin:0 auto;padding:1rem;font:16px/1.55 system-ui,sans-serif;color:#1b1b1b}
.trust-note{border-left:4px solid #8a6d00;padding:.5rem .75rem;background:#fff8e1}
.trust-claims{padding-left:1.1rem}.trust-claim{margin:.4rem 0}
.trust-status{display:block;font-weight:600;font-size:.85rem}
.trust-in-place .trust-status{color:#1b5e20}.trust-partial .trust-status{color:#8a6d00}
.trust-not-in-place .trust-status{color:#b71c1c}.trust-owner-to-confirm .trust-status{color:#555}
.trust-src{display:block;font-size:.8rem;color:#555}
.trust-subprocessors{border-collapse:collapse;width:100%;font-size:.9rem;display:block;overflow-x:auto}
.trust-subprocessors th,.trust-subprocessors td{border:1px solid #ccc;padding:.35rem;text-align:left;vertical-align:top}
@media (prefers-color-scheme:dark){.trust-page{color:#e8e8e8;background:#121212}.trust-note{background:#2a2410}
.trust-in-place .trust-status{color:#81c784}.trust-partial .trust-status{color:#ffd54f}
.trust-not-in-place .trust-status{color:#ef9a9a}.trust-owner-to-confirm .trust-status,.trust-src{color:#aaa}}`;

/** A complete HTML document (no scripts). `canonicalUrl` is the page's own absolute URL. */
export function renderTrustDocument(
  profile: TrustProfile,
  opts: RenderOptions & { canonicalUrl?: string } = {},
): string {
  const title = `Security · ${profile.product}`;
  const canonical = opts.canonicalUrl
    ? `<link rel="canonical" href="${escapeHtml(opts.canonicalUrl)}">`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(
    `How ${profile.product} stores, protects and deletes your data, and what is not in place yet.`,
  )}">${canonical}<style>${BASE_CSS}</style></head>
<body>${renderTrustSection(profile, opts)}</body></html>
`;
}
