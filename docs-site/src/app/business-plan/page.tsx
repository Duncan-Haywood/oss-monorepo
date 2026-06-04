import { DocShell } from "@/components/DocShell";
import { Prose } from "@/components/Prose";

export const metadata = { title: "Business plan" };

export default function BusinessPlanPage() {
  return (
    <DocShell
      title="Business plan (summary)"
      description="High-level GTM, pricing hypotheses, and operating constraints for ShootFlow."
    >
      <Prose>
        <h2>Positioning</h2>
        <p>
          ShootFlow targets working photographers and small studios who already pay with time for
          culling, ingest safety, color consistency, and social cutdowns. The initial offer is
          operational relief and throughput, not full editor replacement.
        </p>
        <h2>Revenue hypotheses</h2>
        <ul>
          <li>Subscription for solo creators with shoot-volume tiers.</li>
          <li>Studio seats with shared manifests, review queues, and handoff exports.</li>
          <li>Optional compute packs when cloud grading or VLM adapters ship.</li>
        </ul>
        <h2>Go-to-market</h2>
        <ul>
          <li>Pilot cohorts using observe-only dashboards and cohort briefs for readiness tracking.</li>
          <li>Founder-led demos with deterministic demo workspaces (no real client media).</li>
          <li>Evidence-first sales: manifests, authority objects, and intervention metrics visible in UI.</li>
        </ul>
        <p>
          Full source: <code>docs/BUSINESS_PLAN.md</code>. Commercial viability deep dives are
          available under HTML reports in the sidebar.
        </p>
      </Prose>
    </DocShell>
  );
}
