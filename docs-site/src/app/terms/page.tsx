import { DocShell } from "@/components/DocShell";
import { Prose } from "@/components/Prose";

export const metadata = { title: "Terms (draft)" };

export default function TermsPage() {
  return (
    <DocShell
      title="Terms and conditions (draft)"
      description="Early-access legal draft — not final counsel-reviewed language."
    >
      <Prose>
        <p>
          This page summarizes the draft terms stored at <code>docs/TERMS_AND_CONDITIONS_DRAFT.md</code>.
          It is provided for internal review on the private docs site only.
        </p>
        <h2>Pilot access</h2>
        <ul>
          <li>Software is pre-release; features may change or fail without liability for lost time.</li>
          <li>Users retain ownership of uploaded and ingested media; ShootFlow processes files locally unless otherwise agreed.</li>
          <li>No warranty of fitness for client deliverables until a production SLA is published.</li>
        </ul>
        <h2>Data handling</h2>
        <ul>
          <li>Manifests and checksums are written to user-controlled storage paths.</li>
          <li>Telemetry, if enabled later, must be opt-in and documented separately.</li>
        </ul>
        <p>Consult legal counsel before external distribution of this draft.</p>
      </Prose>
    </DocShell>
  );
}
