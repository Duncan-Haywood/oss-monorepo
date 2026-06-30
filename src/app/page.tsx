import Link from "next/link";

const steps = [
  {
    title: "We find your business",
    description:
      "We identify local businesses from public directories and build a site tailored to your industry.",
  },
  {
    title: "Preview before you buy",
    description:
      "Receive a link to your pre-built website. Review it, request tweaks on a discovery call, or buy as-is.",
  },
  {
    title: "Go live in days",
    description:
      "Pay once, connect your domain, and launch a professional landing page or simple storefront.",
  },
];

const features = [
  "Mobile-responsive landing page",
  "Contact form and Google Maps embed",
  "SEO basics and fast hosting",
  "Optional e-commerce templates",
  "Hosted on a trustworthy subdomain until you connect your domain",
];

export default function Home() {
  return (
    <main>
      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="max-w-3xl">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-zinc-500">
            Websites for local businesses
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl sm:leading-tight">
            Your website, built before you buy
          </h1>
          <p className="mt-6 text-lg leading-8 text-zinc-600">
            Local Site Studio creates professional websites for restaurants, salons,
            trades, and other local businesses. Preview your site first — pay $500
            only when you love it.
          </p>
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
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Simple, flat pricing</h2>
            <p className="mt-4 text-zinc-600">
              One price covers design, build, hosting setup, and launch support. No
              monthly retainers unless you want ongoing updates.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-zinc-700">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <span className="mt-1 text-zinc-400">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
            <p className="text-sm font-medium text-zinc-500">Standard package</p>
            <p className="mt-2 text-5xl font-semibold tracking-tight">$500</p>
            <p className="mt-2 text-sm text-zinc-600">One-time payment via Stripe</p>
            <Link
              href="/checkout"
              className="mt-8 inline-flex h-11 w-full items-center justify-center rounded-full bg-zinc-900 font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Start checkout
            </Link>
            <p className="mt-4 text-center text-xs text-zinc-500">
              E-commerce add-ons available. Discovery call optional.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
