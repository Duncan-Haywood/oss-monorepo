import { DocShell } from "@/components/DocShell";
import { Prose } from "@/components/Prose";

export const metadata = { title: "CLI demo workspace spec" };

export default function CliDemoWorkspaceSpecPage() {
  return (
    <DocShell
      title="CLI demo workspace command"
      description="Design spec for create-demo-workspace and controlled fixtures."
    >
      <Prose>
        <h2>Goal</h2>
        <p>
          Provide a deterministic, no-real-media workspace fixture so Mac shells, agents, and pilot
          analytics can be exercised without touching client originals.
        </p>
        <h2>Requirements</h2>
        <ul>
          <li>Emit trusted ingest, production, and render manifests with coherent fingerprints.</li>
          <li>Refuse to overwrite unlike files when paths already exist.</li>
          <li>Remain compatible with observe-only workflow authority on all JSON handoffs.</li>
          <li>Support CLI receipt JSON for automation without granting mutation authority from receipts.</li>
        </ul>
        <p>
          Full source:{" "}
          <code>docs/superpowers/specs/2026-05-09-cli-demo-workspace-command-design.md</code>
        </p>
      </Prose>
    </DocShell>
  );
}
