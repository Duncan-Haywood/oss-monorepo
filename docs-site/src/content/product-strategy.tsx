import { Callout } from "@/components/Prose";

export function ProductStrategyContent() {
  return (
    <>
      <Callout title="Product promise">
        Dump a card or folder into the app. ShootFlow safely organizes media,
        produces graded intermediates, and proposes high-quality reels, carousels,
        and photo sets with enough control for professionals to trust the output.
      </Callout>

      <section>
        <h2>Audience</h2>
        <p>
          ShootFlow targets photographers, videographers, creators, and small studios
          who need a faster path from shoot day to polished Instagram output. Buyers
          typically feel pain around culling, copying cards, matching color, exporting
          social formats, or leaving valuable archives unused because post-production
          is too operationally heavy.
        </p>
      </section>

      <section>
        <h2>Wedge</h2>
        <p>
          The first wedge is not &quot;replace the editor.&quot; It is removing boring
          media operations while improving social output throughput:
        </p>
        <ul>
          <li>Safe source/destination detection for SD cards, folders, and SSDs.</li>
          <li>Reviewed ingest with no source deletion.</li>
          <li>Repeatable shoot organization and manifests.</li>
          <li>Bulk grading and select generation.</li>
          <li>IG-ready reels, carousels, and photo sets from graded intermediates.</li>
          <li>Optional review and handoff to an editor.</li>
        </ul>
      </section>

      <section>
        <h2>Differentiation</h2>
        <ul>
          <li>
            <strong>Media safety first:</strong> never delete card/source media, never
            overwrite different bytes, always emit manifests.
          </li>
          <li>
            <strong>Parallel by design:</strong> per-asset jobs scale across local compute,
            cloud workers, or future device clusters.
          </li>
          <li>
            <strong>Quality before speed theater:</strong> VLM analysis and scene grouping
            precede grading so output reads as one coherent shoot.
          </li>
          <li>
            <strong>Professional control:</strong> humans review drive detection, selects,
            grading references, and deliverables before export.
          </li>
          <li>
            <strong>Archive aware:</strong> old shoots and new cards share the same pipeline.
          </li>
        </ul>
      </section>

      <section>
        <h2>Workflow value (current core)</h2>
        <ol>
          <li>Discover and rank storage candidates; recommend review-required routes.</li>
          <li>Ingest safely with checksum manifests.</li>
          <li>Emit read-only production-plan reports before AI/color jobs write artifacts.</li>
          <li>Run adapter-capable production waves with observe-only scheduler reports.</li>
          <li>Materialize storyline and package outputs under strict checksum contracts.</li>
          <li>Bridge render tasks, render status, and pilot dashboards for Mac shells.</li>
        </ol>
        <p>
          Native UI and cloud adapters remain the commercialization path; the Python core
          proves safety contracts and handoff shapes first.
        </p>
      </section>
    </>
  );
}
