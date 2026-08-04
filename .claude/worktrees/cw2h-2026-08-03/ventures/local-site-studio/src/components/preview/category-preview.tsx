import Link from "next/link";
import type { Lead } from "@/lib/leads/types";
import type { CommerceSku } from "@/lib/commerce/types";
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
};

function isDemoPreview(lead: Lead): boolean {
  return lead.dataSource === "demo_catalog" || lead.dataSource === "slug_inference";
}

export function CategoryPreview({
  lead,
  commerceItems = [],
}: CategoryPreviewProps) {
  const theme = getCategoryTheme(lead.category);
  const location = `${lead.city}, ${lead.state}`;
  const showDemoBanner = isDemoPreview(lead);

  return (
    <main className={theme.shellClass}>
      {showDemoBanner ? (
        <div className="mx-auto max-w-5xl px-6 pt-6">
          <PlaceholderBanner
            title={`${theme.label} preview`}
            description={`This is a working Starter-style preview for ${lead.businessName}: contact form and map included. Claim it to connect your domain and go live.`}
            docsHref="/docs/product-bundles"
          />
        </div>
      ) : null}

      <section className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <p className={`text-sm font-medium uppercase tracking-[0.2em] ${theme.accentTextClass}`}>
          {theme.heroEyebrow} · {location}
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl sm:leading-tight">
          {lead.businessName}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-700">{lead.tagline}</p>
        <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600">{lead.description}</p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
          <Link
            href={`/checkout?slug=${encodeURIComponent(lead.slug)}&tier=${lead.recommendedTier}`}
            className={`inline-flex h-12 items-center justify-center rounded-full px-8 font-medium transition-colors ${theme.ctaClass}`}
          >
            Claim this site — from $500
          </Link>
          <a
            href="#contact"
            className="text-sm font-medium text-zinc-700 underline-offset-4 hover:underline"
          >
            Try the contact form
          </a>
          <a
            href={`tel:${lead.phone.replace(/\D/g, "")}`}
            className="text-sm font-medium text-zinc-700 underline-offset-4 hover:underline"
          >
            Call {lead.phone}
          </a>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-8 sm:grid-cols-2">
        <div className={`rounded-2xl border p-6 backdrop-blur ${theme.panelClass}`}>
          <h2 className="text-lg font-semibold text-zinc-900">Services</h2>
          <ul className="mt-4 space-y-2 text-sm text-zinc-700">
            {lead.services.map((service) => (
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
              <dd>{lead.hours.weekday}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Weekend</dt>
              <dd>{lead.hours.weekend}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Phone</dt>
              <dd>{lead.phone}</dd>
            </div>
            <div>
              <dt className="font-medium text-zinc-900">Area</dt>
              <dd>
                {lead.address ? `${lead.address} · ` : null}
                {location}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {commerceItems.length > 0 ? (
        <PreviewCommerceCatalog
          slug={lead.slug}
          items={commerceItems}
          panelClass={theme.panelClass}
          accentTextClass={theme.accentTextClass}
          ctaClass={theme.ctaClass}
        />
      ) : null}

      <section className="mx-auto grid max-w-5xl gap-6 px-6 pb-10 lg:grid-cols-2">
        <PreviewContactForm
          slug={lead.slug}
          businessName={lead.businessName}
          panelClass={theme.panelClass}
          ctaClass={theme.ctaClass}
          accentTextClass={theme.accentTextClass}
        />
        <PreviewMapsEmbed
          businessName={lead.businessName}
          city={lead.city}
          state={lead.state}
          address={lead.address}
          panelClass={theme.panelClass}
          accentTextClass={theme.accentTextClass}
        />
      </section>

      <TierUpsell lead={lead} />
    </main>
  );
}
