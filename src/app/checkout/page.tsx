import { PlaceholderBanner } from "@/components/placeholder-banner";

export default function CheckoutPage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <PlaceholderBanner
        title="Stripe checkout (not connected)"
        description="Configure STRIPE_SECRET_KEY and STRIPE_PRICE_ID_WEBSITE in .env.local. Stripe merchant: Maris Stella Labs."
        docsHref="/docs/ARCHITECTURE.md#payments"
      />

      <h1 className="mt-10 text-3xl font-semibold tracking-tight">Checkout</h1>
      <p className="mt-3 text-zinc-600">
        One-time payment for your pre-built website package.
      </p>

      <div className="mt-10 rounded-2xl border border-zinc-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Standard website package</p>
            <p className="text-sm text-zinc-500">Landing page + hosting setup</p>
          </div>
          <p className="text-2xl font-semibold">$500</p>
        </div>

        <button
          type="button"
          disabled
          className="mt-6 h-12 w-full cursor-not-allowed rounded-full bg-zinc-300 font-medium text-zinc-600"
        >
          Pay with Stripe (coming soon)
        </button>

        <p className="mt-4 text-center text-xs text-zinc-500">
          Secure payment powered by Stripe. See docs/ROADMAP.md for integration steps.
        </p>
      </div>
    </main>
  );
}
