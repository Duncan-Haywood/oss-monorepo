import Link from "next/link";

export default function CheckoutSuccessPage() {
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
