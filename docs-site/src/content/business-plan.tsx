import { Callout } from "@/components/Prose";

export function BusinessPlanContent() {
  return (
    <>
      <Callout title="Positioning">
        ShootFlow is a workflow safety and throughput layer for creator studios—not a
        generic DAM and not a full NLE replacement. Revenue follows reduced operational
        toil and faster first-draft social deliverables.
      </Callout>

      <section>
        <h2>Monetization hypotheses</h2>
        <ul>
          <li>
            <strong>Base tier ($19–39/mo):</strong> local core, safe ingest, manifests,
            observe-only health surfaces.
          </li>
          <li>
            <strong>Pro tier ($79–129/mo):</strong> cloud VLM, priority render queue,
            team workspaces with merged manifests.
          </li>
          <li>
            <strong>Enterprise:</strong> private VPC or on-prem deployment, SLA, custom look models.
          </li>
        </ul>
      </section>

      <section>
        <h2>Go-to-market motion</h2>
        <ol>
          <li>Paid pilot letters of intent from 2+ ICP studios.</li>
          <li>Clickable Mac prototype bound to existing CLI contracts.</li>
          <li>Pilot dashboard + cohort brief demos for activation metrics.</li>
          <li>Replace stand-in adapters with real ffmpeg/Metal/VLM workers behind the same checksum walls.</li>
        </ol>
      </section>

      <section>
        <h2>What not to optimize prematurely</h2>
        <p>
          Additional CLI commands and schema versions without a paying pilot or native shell
          produce an impressive safety portfolio but not revenue. HTML viability reports in{" "}
          <code>docs/</code> inform pursuit decisions; they ship on this site via the HTML ingest build step.
        </p>
      </section>
    </>
  );
}
