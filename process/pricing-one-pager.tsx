/**
 * pricing-one-pager.tsx — the $19/listing concierge MVP offer (Phase 2, roadmap task p2-pricing-page).
 *
 * This is the customer-facing pitch for the concierge MVP described in
 * STRATEGY.md's Week 3-4 plan: manual guided-shoot + AI pipeline, no app,
 * used to test real willingness to pay before building anything else.
 *
 * Data lives in `conciergeOffer` so it can be reused (docs-site page,
 * printed PDF, copy-pasted into outreach) without re-writing prose per
 * surface. `PricingOnePager` is one rendering of it, styled to be
 * screenshot/print-shareable on its own (not the internal agent-dashboard
 * look used by prompt_process.tsx).
 */

export type PricingLineItem = {
  label: string;
  detail: string;
};

export type ConciergeOffer = {
  headline: string;
  tagline: string;
  price: string;
  priceUnit: string;
  turnaround: string;
  whatsIncluded: PricingLineItem[];
  howItWorks: PricingLineItem[];
  faq: PricingLineItem[];
  guarantee: string;
  callToAction: string;
};

export const conciergeOffer: ConciergeOffer = {
  headline: "Listing Lens Concierge",
  tagline: "MLS-ready listing photos, guided and delivered in one visit — no photographer scheduling.",
  price: "$19",
  priceUnit: "per listing",
  turnaround: "Delivered within 1 business day of the shoot",
  whatsIncluded: [
    {
      label: "Guided capture, ~30 minutes on-site",
      detail:
        "A room-by-room shot list (exterior, living space, kitchen, primary bed/bath, secondary rooms) run from your own iPhone, so nothing important gets missed and nothing gets over-shot.",
    },
    {
      label: "15-25 enhanced, MLS-ready photos",
      detail:
        "Exposure, sky replacement where needed, and perspective/vertical correction applied to every kept shot.",
    },
    {
      label: "Straight export, no software to learn",
      detail: "Delivered as a ready-to-upload folder — drop it straight into your MLS or listing site.",
    },
  ],
  howItWorks: [
    { label: "1. Book a slot", detail: "Pick a time; share the property address and access details." },
    {
      label: "2. We guide the shoot",
      detail: "Follow the room-by-room checklist on-site (about 30 minutes for an average home).",
    },
    {
      label: "3. We process the photos",
      detail: "AI enhancement pass + a manual quality check before delivery.",
    },
    { label: "4. You get the folder", detail: "MLS-ready photos delivered within 1 business day." },
  ],
  faq: [
    {
      label: "Do I need any special equipment?",
      detail: "No — an iPhone (12 or newer recommended) is enough. We provide the shot list and guidance.",
    },
    {
      label: "What if a room needs a re-shoot?",
      detail:
        "We review shots on-site before wrapping up specifically to avoid this, but if something's missed we'll coordinate a quick follow-up at no extra charge for the first delivery.",
    },
    {
      label: "Is this a subscription?",
      detail:
        "No — this concierge offer is pay-per-listing while we validate the workflow. A monthly plan (Agent Pro, unlimited listings) comes later once this is proven out.",
    },
  ],
  guarantee: "If you're not happy with the delivered photos, we'll redo the edit pass at no charge.",
  callToAction: "Book your first listing for $19 — reply to this message or scan the QR code to grab a slot.",
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

/**
 * Standalone, print/screenshot-friendly one-pager. Deliberately avoids the
 * dashboard chrome used elsewhere in process/ so it can be handed to a
 * prospective concierge customer as-is.
 */
export function PricingOnePager() {
  const offer = conciergeOffer;
  return (
    <div className="mx-auto max-w-2xl space-y-8 rounded-2xl border border-slate-800 bg-slate-950 p-8 text-slate-100">
      <header className="space-y-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-400">Concierge offer</p>
        <h1 className="font-display text-3xl font-semibold text-white">{offer.headline}</h1>
        <p className="text-slate-400">{offer.tagline}</p>
        <div className="mt-4 flex items-baseline justify-center gap-2">
          <span className="font-display text-5xl font-bold text-white">{offer.price}</span>
          <span className="text-slate-400">/ {offer.priceUnit}</span>
        </div>
        <p className="text-sm text-brand-300">{offer.turnaround}</p>
      </header>

      <Card title="What's included">
        {offer.whatsIncluded.map((item) => (
          <div key={item.label}>
            <p className="text-sm font-medium text-slate-200">{item.label}</p>
            <p className="mt-0.5 text-xs text-slate-400">{item.detail}</p>
          </div>
        ))}
      </Card>

      <Card title="How it works">
        {offer.howItWorks.map((item) => (
          <div key={item.label}>
            <p className="text-sm font-medium text-slate-200">{item.label}</p>
            <p className="mt-0.5 text-xs text-slate-400">{item.detail}</p>
          </div>
        ))}
      </Card>

      <Card title="FAQ">
        {offer.faq.map((item) => (
          <div key={item.label}>
            <p className="text-sm font-medium text-slate-200">{item.label}</p>
            <p className="mt-0.5 text-xs text-slate-400">{item.detail}</p>
          </div>
        ))}
      </Card>

      <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-5 text-center">
        <p className="text-sm text-brand-200">{offer.guarantee}</p>
        <p className="mt-3 font-medium text-white">{offer.callToAction}</p>
      </div>
    </div>
  );
}
