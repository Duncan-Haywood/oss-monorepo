import CheckoutLab from "@/components/CheckoutLab";
import DemoNav from "@/components/shared/DemoNav";
import { isAutomaticTaxEnabled } from "@/lib/checkout";

// A server component, and the only place in this route that can read
// `STRIPE_AUTOMATIC_TAX`. The order summary has to disclose whether Stripe will
// add tax on top of the total it prints, and the component that prints it is a
// client component with no access to server environment. Resolving the flag
// here and passing it down is what keeps the quoted total and the charged total
// describing the same amount.
export default function CheckoutPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <DemoNav current="/checkout" />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <CheckoutLab automaticTaxEnabled={isAutomaticTaxEnabled(process.env)} />
      </main>
    </div>
  );
}
