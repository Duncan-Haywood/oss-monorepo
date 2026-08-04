import StripeConnectSimulator from "@/components/StripeConnectSimulator";
import DemoNav from "@/components/shared/DemoNav";

export const metadata = {
  title: "Stripe Connect Payout Simulator — Print Atelier",
  description: "Model artist payouts, platform take rate, and Connect transfer timing before Phase 3 payments.",
};

export default function PayoutSimulatorPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <DemoNav current="/payout-simulator" />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <StripeConnectSimulator />
      </main>
    </div>
  );
}
