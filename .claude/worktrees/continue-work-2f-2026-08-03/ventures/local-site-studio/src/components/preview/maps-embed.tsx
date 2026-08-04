type PreviewMapsEmbedProps = {
  businessName: string;
  city: string;
  state: string;
  /** Optional street address for a tighter map pin. */
  address?: string;
  panelClass: string;
  accentTextClass: string;
};

/**
 * Embed a Google Maps search for the lead's location without an API key.
 * Uses the public maps embed URL (q= + output=embed) — fine for MVP previews.
 */
export function PreviewMapsEmbed({
  businessName,
  city,
  state,
  address,
  panelClass,
  accentTextClass,
}: PreviewMapsEmbedProps) {
  const query = address?.trim()
    ? `${businessName}, ${address}, ${city}, ${state}`
    : `${businessName}, ${city}, ${state}`;
  const embedSrc = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=14&output=embed`;
  const openHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

  return (
    <section className={`rounded-2xl border p-6 backdrop-blur ${panelClass}`}>
      <p className={`text-sm font-medium uppercase tracking-[0.18em] ${accentTextClass}`}>
        Find us
      </p>
      <h2 className="mt-2 text-xl font-semibold text-zinc-900">Location</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        {address ? `${address} · ` : null}
        {city}, {state}
      </p>
      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-100">
        <iframe
          title={`Map of ${businessName}`}
          src={embedSrc}
          className="h-56 w-full border-0 sm:h-64"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </div>
      <p className="mt-3 text-sm">
        <a
          href={openHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`font-medium underline-offset-4 hover:underline ${accentTextClass}`}
        >
          Open in Google Maps
        </a>
      </p>
    </section>
  );
}
