import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FULL_NAV } from "@/lib/navigation";

export default function ProductStrategyPage() {
  return (
    <DocsLayout
      title="Product strategy"
      subtitle="Curated overview — see archive for the full PRODUCT_STRATEGY.md ingest."
      nav={FULL_NAV}
    >
      <section className="doc-section">
        <h2>Audience</h2>
        <p>
          Photographers, videographers, creators, and small studios who need a
          faster path from shoot day to polished Instagram output without losing
          evenings to culling, copying cards, matching color, and exporting
          social formats.
        </p>

        <h2>Product promise</h2>
        <p>
          Dump a card or folder into the app. ShootFlow safely organizes media,
          produces graded intermediates, and proposes high-quality reels,
          carousels, and photo sets with enough control for professionals to
          trust the output.
        </p>

        <h2>Wedge</h2>
        <ol>
          <li>Safe source/destination detection for cards, folders, and SSDs.</li>
          <li>Reviewed ingest with no source deletion.</li>
          <li>Repeatable shoot organization and manifests.</li>
          <li>Bulk grading and select generation.</li>
          <li>IG-ready deliverables from graded intermediates.</li>
          <li>Optional review and editor handoff.</li>
        </ol>

        <h2>Differentiation</h2>
        <ul>
          <li>
            <strong>Media safety first</strong> — never delete source media;
            never overwrite different bytes; always emit manifests.
          </li>
          <li>
            <strong>Parallel by design</strong> — per-asset jobs scale across
            local compute and future workers.
          </li>
          <li>
            <strong>Quality before speed theater</strong> — VLM analysis and
            scene grouping before grading for coherent shoot look.
          </li>
          <li>
            <strong>Professional control</strong> — humans review detection,
            selects, grading references, and exports.
          </li>
        </ul>

        <h2>Pilot and analytics</h2>
        <p>
          <code>pilot-dashboard</code>, <code>pilot-cohort-report</code>, and{" "}
          <code>pilot-cohort-brief</code> expose activation and intervention
          metrics as observe-only JSON — no workflow authority for file
          mutation.
        </p>

        <p>
          <Link href="/archive/product-strategy">
            Read full product strategy archive →
          </Link>
        </p>
      </section>
    </DocsLayout>
  );
}
