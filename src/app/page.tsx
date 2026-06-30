import Link from "next/link";
import { brand } from "@/lib/brand";

const steps = [
  {
    title: "We find your business",
    description:
      "We identify local businesses from public directories and build a site tailored to your industry.",
  },
  {
    title: "Preview before you buy",
    description:
      "Receive a link to your pre-built website. Talk to our AI assistant for tweaks, or buy as-is — no sales calls.",
  },
  {
    title: "Go live in days",
    description:
      "Pick your bundle, pay via secure checkout, connect your domain, and launch — website, marketing, even an AI phone agent.",
  },
];

const bundles = [
  {
    name: "Starter",
    tagline: "Website only",
    oneTime: "$500",
    recurring: null,
    highlight: false,
    features: [
      "Mobile-responsive landing page",
      "Contact form and Google Maps embed",
      "Basic SEO and fast hosting",
      "Preview before you buy",
      "Optional AI assistant for tweaks",
    ],
  },
  {
    name: "Growth",
    tagline: "Website + AI marketing",
    oneTime: "$500",
    recurring: "$99/mo",
    highlight: false,
    features: [
      "Everything in Starter",
      "8 social & Google posts per month",
      "2 automated emails per month",
      "Brand voice from your business data",
      "Review-request campaigns",
    ],
  },
  {
    name: "Complete",
    tagline: "Website + marketing + AI phone",
    oneTime: "$500",
    recurring: "$199/mo",
    highlight: true,
    features: [
      "Everything in Growth",
      "AI answers your business phone",
      "Appointment booking & lead capture",
      "Missed-call text-back",
      "After-hours FAQ for customers",
    ],
  },
];

const commerceAddOn = {
  oneTime: "+$299",
  recurring: "+$49/mo",
  features: [
    "Stripe checkout & simple catalog",
    "Online ordering or booking deposits",
    "Order confirmation emails",
    "Best for retail, restaurants, salons",
  ],
};

export default function Home() {
  return (
    <main>
      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="max-w-3xl">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-zinc-500">
            Digital presence for local businesses
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl sm:leading-tight">
            Your website, marketing, and phone — built before you buy
          </h1>
          <p className="mt-6 text-lg leading-8 text-zinc-600">
            {brand.name} creates professional websites for restaurants, salons, trades,
            and other local businesses. Preview your site first, pick a bundle, and pay
            only when you&apos;re ready. From $500 — no sales calls.
          </p>
          {!brand.isConfigured && (
            <p className="mt-4 text-sm text-amber-700">
              Operator note: set <code className="text-xs">NEXT_PUBLIC_BRAND_NAME</code>{" "}
              in .env.local to replace the &ldquo;{brand.name}&rdquo; placeholder.
            </p>
          )}
          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link
              href="/checkout"
              className="inline-flex h-12 items-center justify-center rounded-full bg-zinc-900 px-8 font-medium text-white transition-colors hover:bg-zinc-700"
            >
              View pricing
            </Link>
            <Link
              href="/preview/example-bakery"
              className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-300 px-8 font-medium text-zinc-900 transition-colors hover:border-zinc-400"
            >
              See example preview
            </Link>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="border-y border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="rounded-2xl bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-zinc-400">Step {index + 1}</p>
                <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight">Bundle pricing</h2>
          <p className="mt-4 text-zinc-600">
            One-time site fee plus optional monthly automation. All plans include preview
            before purchase and self-serve Stripe checkout.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {bundles.map((bundle) => (
            <div
              key={bundle.name}
              className={`relative rounded-2xl border p-6 shadow-sm ${
                bundle.highlight
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white"
              }`}
            >
              {bundle.highlight && (
                <p className="absolute -top-3 left-6 rounded-full bg-white px-3 py-0.5 text-xs font-medium text-zinc-900">
                  Most popular
                </p>
              )}
              <p
                className={`text-sm font-medium ${
                  bundle.highlight ? "text-zinc-400" : "text-zinc-500"
                }`}
              >
                {bundle.name}
              </p>
              <p className="mt-1 text-lg font-semibold">{bundle.tagline}</p>
              <div className="mt-4">
                <span className="text-3xl font-semibold tracking-tight">
                  {bundle.oneTime}
                </span>
                {bundle.recurring && (
                  <span
                    className={`ml-1 text-lg ${
                      bundle.highlight ? "text-zinc-300" : "text-zinc-500"
                    }`}
                  >
                    + {bundle.recurring}
                  </span>
                )}
              </div>
              <p
                className={`mt-1 text-xs ${
                  bundle.highlight ? "text-zinc-400" : "text-zinc-500"
                }`}
              >
                {bundle.recurring ? "Site fee + monthly" : "One-time · no subscription"}
              </p>
              <ul className="mt-6 space-y-2.5 text-sm">
                {bundle.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span className={bundle.highlight ? "text-zinc-400" : "text-zinc-400"}>
                      ✓
                    </span>
                    <span className={bundle.highlight ? "text-zinc-200" : "text-zinc-700"}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href="/checkout"
                className={`mt-8 inline-flex h-11 w-full items-center justify-center rounded-full font-medium transition-colors ${
                  bundle.highlight
                    ? "bg-white text-zinc-900 hover:bg-zinc-100"
                    : "bg-zinc-900 text-white hover:bg-zinc-700"
                }`}
              >
                Get started
              </Link>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 lg:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-500">Optional add-on</p>
              <h3 className="mt-1 text-lg font-semibold">Commerce</h3>
              <p className="mt-2 max-w-xl text-sm text-zinc-600">
                Online ordering, product catalog, or booking deposits — for retail,
                restaurants, and salons that sell before the visit.
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xl font-semibold">
                {commerceAddOn.oneTime}{" "}
                <span className="text-base font-normal text-zinc-500">
                  {commerceAddOn.recurring}
                </span>
              </p>
              <p className="mt-1 text-xs text-zinc-500">Add to any bundle</p>
            </div>
          </div>
          <ul className="mt-6 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
            {commerceAddOn.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <span className="text-zinc-400">✓</span>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-500">
          Sold by {brand.legalEntity}. Payments via Stripe. AI assistant optional — no
          human sales calls.
        </p>
      </section>

      <section id="marketing" className="border-t border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
                Why Complete?
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Never miss a customer call again
              </h2>
              <p className="mt-4 text-zinc-600">
                Most local businesses lose jobs to missed calls. The Complete bundle adds
                an AI assistant that answers your business line — booking appointments,
                answering FAQs, and capturing leads while you&apos;re on the job.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-zinc-700">
                <li className="flex items-start gap-2">
                  <span className="mt-1 text-zinc-400">✓</span>
                  Answers during and after business hours
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 text-zinc-400">✓</span>
                  Texts back missed callers with your booking link
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 text-zinc-400">✓</span>
                  Includes automated Google posts and social marketing
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 text-zinc-400">✓</span>
                  Replaces $200–400/mo answering services
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
              <p className="text-sm font-medium text-zinc-500">Complete bundle</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight">
                $500{" "}
                <span className="text-xl font-normal text-zinc-500">+ $199/mo</span>
              </p>
              <p className="mt-2 text-sm text-zinc-600">
                Website, marketing automation, and AI phone agent — offered on your
                preview site or when you talk to our assistant.
              </p>
              <Link
                href="/checkout"
                className="mt-8 inline-flex h-11 w-full items-center justify-center rounded-full bg-zinc-900 font-medium text-white transition-colors hover:bg-zinc-700"
              >
                View all pricing
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
