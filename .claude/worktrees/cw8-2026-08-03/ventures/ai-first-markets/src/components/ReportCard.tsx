import Link from "next/link";
import type { ReportMeta } from "@/lib/types";

interface ReportCardProps {
  report: ReportMeta;
}

const typeLabels: Record<ReportMeta["type"], string> = {
  overview: "Overview",
  comparison: "Comparison",
  "deep-dive": "Deep Dive",
  playbook: "Playbook",
};

const typeColors: Record<ReportMeta["type"], string> = {
  overview: "bg-emerald-500/20 text-emerald-400",
  comparison: "bg-sky-500/20 text-sky-400",
  "deep-dive": "bg-violet-500/20 text-violet-400",
  playbook: "bg-amber-500/20 text-amber-400",
};

export function ReportCard({ report }: ReportCardProps) {
  return (
    <Link
      href={`/reports/${report.slug}`}
      className="group block rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 transition hover:border-zinc-700 hover:bg-zinc-900"
    >
      <span
        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${typeColors[report.type]}`}
      >
        {typeLabels[report.type]}
      </span>
      <h3 className="mt-3 text-lg font-semibold text-zinc-50 group-hover:text-emerald-400">
        {report.title}
      </h3>
      <p className="mt-2 text-sm text-zinc-400">{report.description}</p>
      {report.arrFocus && (
        <p className="mt-3 text-xs text-zinc-500">
          Focus: {report.arrFocus === "100k" ? "$100k ARR" : "$1M ARR"}
        </p>
      )}
    </Link>
  );
}
