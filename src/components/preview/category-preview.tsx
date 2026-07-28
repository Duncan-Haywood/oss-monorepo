import Link from "next/link";
import type { Lead } from "@/lib/leads/types";
import type { CommerceSku } from "@/lib/commerce/types";
import { softCapLeadForPublicSurface, type PublicLead } from "@/lib/leads/public-fields";
import { minBundleSetupPriceUsd } from "@/lib/pricing/bundles";
import { getCategoryTheme } from "@/lib/previews/themes";
import { PlaceholderBanner } from "@/components/placeholder-banner";
import { PreviewContactForm } from "./contact-form";
import { PreviewMapsEmbed } from "./maps-embed";
import { PreviewCommerceCatalog } from "./commerce-catalog";
import { TierUpsell } from "./tier-upsell";

type CategoryPreviewProps = {
  lead: Lead;
  /** Commerce catalog items when the lead has a commerceAddon order + saved catalog. */
  commerceItems?: CommerceSku[];
  /** See loadPreviewSetupFeeWaived — threaded into TierUpsell's pricing cards. */
  setupFeeWaived?: boolean;
};

function isDemoPreview(lead: PublicLead): boolean {
  return lead.dataSource === "demo_catalog" || lead.dataSource === "slug_inference";
}

export function CategoryPreview({
  lead,
  commerceItems = [],
  setupFeeWaived = false,
}: CategoryPreviewProps) {
  // Soft-cap create-path free-text at read so pre-cap Convex/SQLite rows cannot
  // emit unbounded HTML on the public preview (preview-lead-description-read-soft-cap).
  const displayLead = softCapLeadForPublicSurface(lead);
  const theme = getCategoryTheme(displayLead.category);
  const location = `${displayLead.city}, ${displayLead.state}`;
  const showDemoBanner = isDemoPreview(displayLead);

  return (
    <main className={theme.shellClass}>
      {showDemoBanner ? (
        <div className="mx-auto max-w-5xl px-6 pt-6">
          <PlaceholderBanner
            title={`${theme.label} preview`}
            description={`This is a working Starter-style preview for ${displayLead.businessName}: contact form and map included. Claim it to connect your domain and go live.`}
            docsHref="/docs/product-bundles"
          />
        </div>
      ) : null}

      <section className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <p className={`text-sm font-medium uppercase tracking-[0.2em] ${theme.accentTextClass}`}>
          {theme.heroEyebrow} · {location}
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl sm:leading-tight">
          {displayLead.businessName}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-700">{displayLead.tagline}</p>
        <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600">{displayLead.description}</p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Link
            href={`/checkout?slug=${encodeURIComponent(displayLead.slug)}&tier=${displayLead.recommendedTier}&source=preview`}
            className={`inline-flex h-12 items-center justify-center rounded-full px-8 font-medium transition-colors ${theme.ctaClass}`}
          >
            Claim this site — from ${minBundleSetupPriceUsd()}
          </Link>
          <a
            href="#contact"
            className="text-sm font-medium text-zinc-700 underline-offset-4 hover:underline"
          >
            Try the contact form
          </a>
          <a
            href={`tel:${displayLead.phone.replace(/\D/g, "")}`}
            className="text-sm font-medium text-zinc-700 underline-offset-4 hover:underline"
          >
            Call {displayLead.phone}
          </a>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-8 sm:grid-cols-2">
        <div className={`rounded-2xl border p-6 backdrop-blur ${theme.panelClass}`}>
          <h2 className="text-lg font-semibold text-zinc-900">Services</h2>
          <ul className="mt-4 space-y-2 text-sm text-zinc-700">
            {displayLead.services.map((service) => (
              <li key={service} className="flex gap-2">
                <span aria-hidden className={theme.accentTextClass}>
                  ·
                </span>
                {service}
              </li>
            ))}
          </ul>
        </div>
        <div className={`rounded-2xl border p-6 backdrop-blur ${theme.panelClass}`}>
          <h2 className="text-lg font-semibold text-zinc-900">Hours & contact</h2>
          <dl className="mt-4 space-y-3 text-sm text-zinc-700">
            <div>
              <dt className="font-medium text-zinc-900">Weekdays</dt>
              <dd>{displayLead.hours.weekday}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Weekend</dt>
              <dd>{displayLead.hours.weekend}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Phone</dt>
              <dd>{displayLead.phone}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Area</dt>
              <dd>
                {displayLead.address ? `${displayLead.address} · ` : null}
                {location}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {commerceItems.length > 0 ? (
        <PreviewCommerceCatalog
          slug={displayLead.slug}
          items={commerceItems}
          panelClass={theme.panelClass}
          accentTextClass={theme.accentTextClass}
          ctaClass={theme.ctaClass}
        />
      ) : null}

      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-10 lg:grid-cols-2">
        <PreviewContactForm
          slug={displayLead.slug}
          businessName={displayLead.businessName}
          panelClass={theme.panelClass}
          ctaClass={theme.ctaClass}
          accentTextClass={theme.accentTextClass}
        />
        <PreviewMapsEmbed
          businessName={displayLead.businessName}
          city={displayLead.city}
          state={displayLead.state}
          address={displayLead.address}
          panelClass={theme.panelClass}
          accentTextClass={theme.accentTextClass}
        />
      </section>

      <TierUpsell lead={displayLead} setupFeeWaived={setupFeeWaived} />
    </main>
  );
}
