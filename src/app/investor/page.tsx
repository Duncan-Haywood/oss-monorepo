import DemoNav from "@/components/shared/DemoNav";
import InvestorDashboard from "@/components/InvestorDashboard";

export const metadata = {
  title: "Investor Dashboard — Print Atelier",
  description: "Condensed business snapshot: catalog, unit economics, partner readiness, and launch score.",
};

export default function InvestorPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DemoNav current="/investor" />
      <main className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        <InvestorDashboard />
      </main>
    </div>
  );
}
