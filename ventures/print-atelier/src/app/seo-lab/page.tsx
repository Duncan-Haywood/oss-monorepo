import SeoLandingLab from "@/components/SeoLandingLab";
import DemoNav from "@/components/shared/DemoNav";

export default function SeoLabPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <DemoNav current="/seo-lab" />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <SeoLandingLab />
      </main>
    </div>
  );
}
