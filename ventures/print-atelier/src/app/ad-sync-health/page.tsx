import React from "react";
import AdSyncHealthMonitor from "@/components/AdSyncHealthMonitor";
import DemoNav from "@/components/shared/DemoNav";

export default function AdSyncHealthPage() {
  return (
    <>
      <DemoNav current="/ad-sync-health" />
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-6xl mx-auto">
          <AdSyncHealthMonitor />
        </div>
      </main>
    </>
  );
}
