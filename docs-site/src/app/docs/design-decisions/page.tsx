import Link from "next/link";
import { DocsLayout } from "@/components/DocsLayout";
import { FULL_NAV } from "@/lib/navigation";

export default function DesignDecisionsPage() {
  return (
    <DocsLayout
      title="Design decisions"
      subtitle="How the Python core enforces safety, parallelism, and observe-only handoffs."
      nav={FULL_NAV}
    >
      <section className="doc-section">
        <h2>Stdlib-only core</h2>
        <p>
          The production pipeline ships as pure Python with zero third-party
          runtime dependencies so automation, tests, and Mac shells share one
          trusted boundary.
        </p>

        <h2>Declared outputs only</h2>
        <p>
          Production and render adapters may write only paths declared in trusted
          plans. Unexpected bytes, directory entries, or checksum drift produce
          retryable review states — never silent cleanup or overwrite.
        </p>

        <h2>Status-bound orchestration</h2>
        <ul>
          <li>
            Compare/write status updates with advisory locks and lease tokens.
          </li>
          <li>
            Scheduler reports bind to final status fingerprints (schema v3).
          </li>
          <li>
            Stale running leases expire to retryable states when configured.
          </li>
        </ul>

        <h2>Local adapter ladder</h2>
        <p>
          Trusted local adapters (<code>metadata-production-local</code>,{" "}
          <code>proxy-production-local</code>, <code>analysis-production-local</code>,
          through <code>package-production-local</code>) prove contracts before
          real ffmpeg, VLM, color science, or export workers are enabled.
        </p>

        <h2>Presentation vs authority</h2>
        <p>
          CLI summaries, workspace health, indexes, and pilot dashboards emit{" "}
          <code>workflow_authority</code> at the root. Consumers must treat
          <code>next_actions</code> as descriptive, command-free hints.
        </p>

        <p>
          <Link href="/archive/design-decisions">
            Read full design decisions archive →
          </Link>
        </p>
      </section>
    </DocsLayout>
  );
}
