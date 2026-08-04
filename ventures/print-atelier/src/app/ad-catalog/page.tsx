import React from "react";
import AdCatalogFeedLab from "@/components/AdCatalogFeedLab";
import DemoNav from "@/components/shared/DemoNav";

export default function AdCatalogPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <DemoNav current="/ad-catalog" />
      <main className="max-w-6xl mx-auto p-8">
        <AdCatalogFeedLab />
      </main>
    </div>
  );
}
