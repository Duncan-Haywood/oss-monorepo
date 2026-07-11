import { Suspense } from "react";
import { CheckoutForm } from "./checkout-form";

export default function CheckoutPage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <Suspense>
        <CheckoutForm />
      </Suspense>
    </main>
  );
}
