import { DocShell } from "@/components/DocShell";
import { Prose } from "@/components/Prose";

export const metadata = { title: "Product strategy" };

export default function StrategyPage() {
  return (
    <DocShell
      title="Product strategy"
      description="Audience, wedge, differentiation, and the path from safe ingest to Instagram deliverables."
    >
      <Prose>
        <h2>Audience</h2>
        <p>
          ShootFlow serves photographers, videographers, creators, and small studios who need a
          faster path from shoot day to polished Instagram output without sacrificing safety or
          professional control.
        </p>
        <h2>Product promise</h2>
        <p>
          Dump a card or folder into the app. ShootFlow safely organizes media, produces graded
          intermediates, and proposes high-quality reels, carousels, and photo sets with enough
          control for professionals to trust the output.
        </p>
        <h2>Wedge</h2>
        <ul>
          <li>Safe source/destination detection for SD cards, folders, and SSDs.</li>
          <li>Reviewed ingest with no source deletion and checksum manifests.</li>
          <li>Repeatable shoot organization and production planning.</li>
          <li>Bulk grading and select generation with human review gates.</li>
          <li>Instagram-ready reels, carousels, and photo sets from graded intermediates.</li>
        </ul>
        <h2>Differentiation</h2>
        <ul>
          <li>
            <strong>Media safety first:</strong> never delete card/source media, never overwrite
            different bytes, always emit manifests.
          </li>
          <li>
            <strong>Parallel by design:</strong> per-asset jobs scale across local compute and
            future workers without rewriting orchestration.
          </li>
          <li>
            <strong>Quality before speed theater:</strong> VLM analysis and scene grouping precede
            grading so output reads as one coherent shoot.
          </li>
          <li>
            <strong>Professional control:</strong> humans review drive detection, selects, grading
            references, and deliverables before export.
          </li>
        </ul>
        <h2>Current engineering focus</h2>
        <p>
          The repository ships a stdlib-only Python core with observe-only workflow authority,
          production/render schedulers, and pilot analytics. The Mac shell and real media adapters
          are the next product layers; this docs site tracks the written strategy alongside those
          contracts.
        </p>
        <p>
          Full source: <code>docs/PRODUCT_STRATEGY.md</code> in the monorepo.
        </p>
      </Prose>
    </DocShell>
  );
}
