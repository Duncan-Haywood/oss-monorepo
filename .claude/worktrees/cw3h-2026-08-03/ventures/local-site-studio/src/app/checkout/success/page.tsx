import Link from "next/link";
import Stripe from "stripe";
import { ManageBillingButton } from "./manage-billing-button";
import { orderEligibleForBillingPortal } from "@/lib/billing/portal";

type CheckoutSuccessPageProps = {
  searchParams: Promise<{ session_id?: string }>;
};

type ConfirmedCheckout = {
  confirmed: true;
  sessionId: string;
  showBillingPortal: boolean;
};

type UnconfirmedCheckout = {
  confirmed: false;
};

async function loadCheckout(
  sessionId?: string,
): Promise<ConfirmedCheckout | UnconfirmedCheckout> {
  if (!sessionId || !process.env.STRIPE_SECRET_KEY) {
    return { confirmed: false };
  }
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status !== "complete") {
      return { confirmed: false };
    }
    const tier = session.metadata?.tier ?? "";
    const commerceAddon = session.metadata?.commerceAddon === "true";
    const showBillingPortal =
      session.mode === "subscription" ||
      orderEligibleForBillingPortal({ tier, commerceAddon });
    return { confirmed: true, sessionId, showBillingPortal };
  } catch {
    return { confirmed: false };
  }
}

export default async function CheckoutSuccessPage({ searchParams }: CheckoutSuccessPageProps) {
  const { session_id } = await searchParams;
  const checkout = await loadCheckout(session_id);

  if (!checkout.confirmed) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">We couldn&apos;t confirm this payment</h1>
        <p className="mt-3 text-zinc-600">
          If you just completed checkout, this can take a few seconds — refresh the page. If the
          problem continues, contact support and reference your email from checkout.
        </p>
        <Link
          href="/checkout"
          className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-zinc-900 px-8 font-medium text-white"
        >
          Back to checkout
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Payment received</h1>
      <p className="mt-3 text-zinc-600">
        Thanks — your order is confirmed. A receipt is on its way from Stripe, and we&apos;ll
        follow up by email with next steps to get your site live.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        {checkout.showBillingPortal ? (
          <ManageBillingButton sessionId={checkout.sessionId} />
        ) : null}
        <Link
          href="/"
          className="inline-flex h-12 items-center justify-center rounded-full border border-zinc-200 bg-white px-8 font-medium text-zinc-900 transition hover:border-zinc-300 hover:bg-zinc-50"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
