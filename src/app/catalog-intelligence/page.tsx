import CatalogMetadataDashboard from "@/components/CatalogMetadataDashboard";
import DemoNav from "@/components/shared/DemoNav";

export const metadata = {
  title: "Metadata Confidence Dashboard — Print Atelier",
  description: "AI tags, SEO copy, room mockups, and proof confidence scores across the shared catalog.",
};

export default function CatalogIntelligencePage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <DemoNav current="/catalog-intelligence" />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <CatalogMetadataDashboard />
      </main>
    </div>
  );
}
