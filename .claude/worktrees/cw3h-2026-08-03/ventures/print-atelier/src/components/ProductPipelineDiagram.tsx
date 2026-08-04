"use client";

import { buildProductPipeline, type PipelineStageStatus } from "@/lib/product-pipeline";
import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

const statusStyles: Record<PipelineStageStatus, string> = {
  ready: "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-600",
  partial: "border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-600",
  blocked: "border-rose-400 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-600",
};

const statusDot: Record<PipelineStageStatus, string> = {
  ready: "bg-emerald-500",
  partial: "bg-amber-500",
  blocked: "bg-rose-500",
};

export default function ProductPipelineDiagram() {
  const pipeline = useMemo(() => buildProductPipeline(), []);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Product pipeline</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
            Capture → catalog → storefront → fulfillment, with growth engines feeding supply and demand.
            Metrics update from the same shared libs as investor and portal dashboards.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-gray-500">Overall readiness</p>
          <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
            {pipeline.overallReadiness}%
          </p>
          <p className="text-xs text-gray-500 mt-1">{pipeline.summaryLabel}</p>
        </div>
      </div>

      <div className="relative overflow-x-auto pb-2">
        <div className="flex items-stretch gap-2 min-w-[720px]">
          {pipeline.stages.map((stage, index) => (
            <div key={stage.id} className="flex items-center flex-1 min-w-0">
              <Link
                href={stage.href}
                className={`group flex-1 min-w-0 rounded-2xl border-2 p-4 transition-all hover:shadow-md hover:scale-[1.02] ${statusStyles[stage.status]}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${statusDot[stage.status]}`} />
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                    {stage.label}
                  </span>
                </div>
                <p className="text-sm font-semibold truncate">{stage.headline}</p>
                <p className="text-lg font-bold mt-2">{stage.metricValue}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{stage.metricLabel}</p>
                <div className="mt-3 h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                    style={{ width: `${stage.progressPercent}%` }}
                  />
                </div>
                {stage.blockers.length > 0 && (
                  <p className="text-xs text-rose-600 dark:text-rose-400 mt-2 line-clamp-2">
                    {stage.blockers[0]}
                  </p>
                )}
                <span className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  Open <ChevronRight className="w-3 h-3" />
                </span>
              </Link>
              {index < pipeline.stages.length - 1 && (
                <ArrowRight className="w-5 h-5 text-gray-300 dark:text-gray-600 flex-shrink-0 mx-1" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {pipeline.growthEngines.map((engine) => (
          <Link
            key={engine.id}
            href={engine.href}
            className={`rounded-xl border px-4 py-3 flex items-center justify-between hover:shadow-sm transition-shadow ${statusStyles[engine.status]}`}
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Growth engine
              </p>
              <p className="font-medium">{engine.label}</p>
              <p className="text-sm text-gray-600 dark:text-gray-300">{engine.metric}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </Link>
        ))}
      </div>
    </section>
  );
}
