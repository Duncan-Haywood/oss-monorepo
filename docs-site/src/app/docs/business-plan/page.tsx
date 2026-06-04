import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FULL_NAV } from "@/lib/navigation";

export default function BusinessPlanPage() {
  return (
    <DocsLayout
      title="Business plan"
      subtitle="Go-to-market framing for the ShootFlow wedge."
      nav={FULL_NAV}
    >
      <section className="doc-section">
        <h2>Problem</h2>
        <p>
          High-volume creators lose productive hours to operational media work:
          ingest safety, organization, grading consistency, and social-format
          exports. Existing tools optimize editing, not shoot-to-post throughput.
        </p>

        <h2>Solution</h2>
        <p>
          ShootFlow automates the boring, safety-critical path from card ingest
          through graded intermediates to first-draft Instagram packages, with
          human review gates and observe-only analytics for pilot programs.
        </p>

        <h2>Business model (draft)</h2>
        <ul>
          <li>Pro subscription for solo creators and small studios.</li>
          <li>Pilot programs with cohort dashboards and acceptance thresholds.</li>
          <li>Future editor handoff and archive monetization layers.</li>
        </ul>

        <h2>Evidence in repo</h2>
        <p>
          Commercial viability HTML reports (ingested at build) document
          profitability, scalability, and pursuit-worthiness assessments from
          recent automation runs.
        </p>

        <p>
          <Link href="/archive/business-plan">Read full business plan archive →</Link>
        </p>
      </section>
    </DocsLayout>
  );
}
