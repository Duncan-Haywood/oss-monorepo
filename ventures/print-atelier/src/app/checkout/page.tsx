import CheckoutLab from "@/components/CheckoutLab";
import DemoNav from "@/components/shared/DemoNav";

export default function CheckoutPage() {
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <DemoNav current="/checkout" />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <CheckoutLab />
      </main>
    </div>
  );
}
