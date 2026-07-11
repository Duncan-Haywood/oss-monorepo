import Link from "next/link";
import Stripe from "stripe";

type CheckoutSuccessPageProps = {
  searchParams: Promise<{ session_id?: string }>;
};

async function isCheckoutComplete(sessionId?: string): Promise<boolean> {
  if (!sessionId || !process.env.STRIPE_SECRET_KEY) return false;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return session.status === "complete";
  } catch {
    return false;
  }
}

export default async function CheckoutSuccessPage({ searchParams }: CheckoutSuccessPageProps) {
  const { session_id } = await searchParams;
  const confirmed = await isCheckoutComplete(session_id);

  if (!confirmed) {
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
      <Link
        href="/"
        className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-zinc-900 px-8 font-medium text-white"
      >
        Back to home
      </Link>
    </main>
  );
}
