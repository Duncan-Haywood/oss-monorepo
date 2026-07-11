import Link from "next/link";
import type { Lead } from "@/lib/leads/types";
import { getCategoryTheme } from "@/lib/previews/themes";
import { PlaceholderBanner } from "@/components/placeholder-banner";
import { TierUpsell } from "./tier-upsell";

type CategoryPreviewProps = {
  lead: Lead;
};

export function CategoryPreview({ lead }: CategoryPreviewProps) {
  const theme = getCategoryTheme(lead.category);
  const location = `${lead.city}, ${lead.state}`;

  return (
    <main className={theme.shellClass}>
      <div className="mx-auto max-w-5xl px-6 pt-6">
        <PlaceholderBanner
          title={`${theme.label} template`}
          description={`Demo preview for ${lead.slug}. Production previews will deploy to ${lead.slug}.preview.localsitestudio.com with real photos and booking links.`}
          docsHref="/docs/architecture#preview-hosting"
        />
      </div>

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
              <dd>{location}</dd>
            </div>
          </dl>
        </div>
      </section>

      <TierUpsell lead={lead} />
    </main>
  );
}
