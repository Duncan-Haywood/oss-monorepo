import DemoNav from "@/components/shared/DemoNav";
import VisualDocsHub from "@/components/VisualDocsHub";

export const metadata = {
  title: "Visual Docs Hub — Print Atelier",
  description:
    "Interactive GTM documentation: investor dashboard, battlecards, SEO lab, catalog AI, payout simulator, and live sitemap.",
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DemoNav current="/docs" />
      <main className="max-w-6xl mx-auto px-4 py-8 md:py-12">
        <VisualDocsHub />
      </main>
    </div>
  );
}
