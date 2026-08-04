import { ReportCard } from "@/components/ReportCard";
import { reports } from "@/data/reports";

export default function ReportsIndexPage() {
  return (
    <div>
      <header className="mb-10">
        <h1 className="text-3xl font-semibold text-zinc-50">Reports</h1>
        <p className="mt-3 max-w-2xl text-zinc-400">
          Analysis documents for evaluating software-first, AI-first business
          opportunities on the path to $100k and $1M ARR.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => (
          <ReportCard key={report.slug} report={report} />
        ))}
      </div>
    </div>
  );
}
