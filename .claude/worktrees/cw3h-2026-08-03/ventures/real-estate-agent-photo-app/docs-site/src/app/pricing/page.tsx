import Link from "next/link";

import { DocsShell } from "@/components/DocsShell";
import { getDocPages } from "@/lib/docs";
import { PricingOnePager } from "../../../../process/pricing-one-pager";
import { outreachTemplates, bookingIntakeFields, renderTemplateBody } from "../../../../process/outreach-templates";
import { BOOKING_LINK } from "../../../../process/booking-link";

export const metadata = {
  title: "Concierge pricing — Listing Lens Docs",
  description: "The $19/listing concierge MVP one-pager (Phase 2).",
  robots: { index: false, follow: false },
};

export default function PricingPage() {
  const pages = getDocPages();

  return (
    <DocsShell pages={pages} activeSlug="pricing">
      <div className="space-y-6">
        <Link href="/" className="text-sm text-slate-500 transition-colors hover:text-slate-300">
          ← Back to docs home
        </Link>
        <div>
          <h1 className="font-display text-4xl font-semibold text-white">Concierge pricing</h1>
          <p className="mt-3 max-w-2xl text-slate-400">
            The shareable one-pager for the Phase 2 concierge MVP offer. Screenshot, print, or copy this
            to pitch the first paying customers. Backed by{" "}
            <code className="rounded bg-slate-900 px-1.5 py-0.5 text-sm text-slate-300">
              process/pricing-one-pager.tsx
            </code>
            .
          </p>
        </div>
        <PricingOnePager />

        <div>
          <h2 className="font-display text-2xl font-semibold text-white">Outreach templates (internal)</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Copy for reaching prospective concierge customers. Send manually, one at a time — not for
            bulk/automated sending. Backed by{" "}
            <code className="rounded bg-slate-900 px-1.5 py-0.5 text-sm text-slate-300">
              process/outreach-templates.ts
            </code>
            .
          </p>
          <div className="mt-4 space-y-4">
            {outreachTemplates.map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium text-white">{t.subject ?? t.id}</h3>
                  <span className="text-xs uppercase tracking-wide text-slate-500">
                    {t.channel} · {t.audience}
                  </span>
                </div>
                <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-800/80 bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-300">
                  {renderTemplateBody(t, BOOKING_LINK)}
                </pre>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-display text-2xl font-semibold text-white">Booking intake</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Minimum info to collect before confirming a shoot slot. The templates above already have the
            real booking link substituted in; paste{" "}
            <code className="rounded bg-slate-900 px-1.5 py-0.5 text-xs text-slate-300">{BOOKING_LINK}</code>{" "}
            into DM/in-person follow-ups too — see{" "}
            <code className="rounded bg-slate-900 px-1.5 py-0.5 text-sm text-slate-300">
              process/booking-link.ts
            </code>
            .
          </p>
          <ul className="mt-4 space-y-2">
            {bookingIntakeFields.map((f) => (
              <li key={f.field} className="rounded-lg border border-slate-800/80 bg-slate-950/40 p-3">
                <p className="text-sm text-slate-200">{f.field}</p>
                <p className="mt-1 text-xs text-slate-500">{f.purpose}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </DocsShell>
  );
}
