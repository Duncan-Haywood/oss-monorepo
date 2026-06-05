import { DocsLayout } from "@/components/DocsLayout";
import { FULL_NAV } from "@/lib/navigation";

const COMMANDS = [
  {
    group: "Health & inspection",
    items: [
      "workspace-health --workspace <dir>",
      "inspect-render-workspace --workspace <dir>",
      "index-workspace --workspace <dir> --generated-at <ts> [--write]",
    ],
  },
  {
    group: "Import & card dump",
    items: [
      "plan-import-route --volume-root <dir> ...",
      "preview-ingest --source ... --destination ...",
      "execute-ingest ... --confirm",
      "card-dump-workflow --volume-root <dir> ... [--confirm-ingest]",
    ],
  },
  {
    group: "Production",
    items: [
      "init-production-status --ingest-manifest <path>",
      "plan-production --ingest-manifest <path>",
      "next-production-wave --ingest-manifest <path> --use-production-status",
      "dry-run-production-scheduler --ingest-manifest <path> --worker <adapter> ...",
    ],
  },
  {
    group: "Render",
    items: [
      "write-render-tasks --ingest-manifest <path>",
      "init-render-status --workspace <dir>",
      "dry-run-render-scheduler --workspace <dir> --renderer dry-run-local ...",
    ],
  },
  {
    group: "Pilot & demos",
    items: [
      "pilot-dashboard --workspace <dir> --generated-at <ts>",
      "pilot-cohort-report --dashboard-json <path> ... --generated-at <ts>",
      "pilot-cohort-brief --cohort-report <path> [--format text]",
      "create-demo-workspace --workspace <dir>",
      "create-pilot-cohort-demo --workspace <dir> --workspace-count <n> ...",
    ],
  },
];

export default function CliReferencePage() {
  return (
    <DocsLayout
      title="CLI reference"
      subtitle="Background-agent and Mac-shell commands. Write-capable actions require explicit runtime confirmation."
      nav={FULL_NAV}
    >
      <section className="doc-section">
        <p>Run commands from the repository root with Python on the path:</p>
        <pre>
          <code>PYTHONPATH=src python3 -m shootflow.cli --help</code>
        </pre>

        {COMMANDS.map((section) => (
          <div key={section.group}>
            <h2>{section.group}</h2>
            <ul>
              {section.items.map((cmd) => (
                <li key={cmd}>
                  <code>{cmd}</code>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <h2>Tests</h2>
        <pre>
          <code>PYTHONPATH=src python3 -m unittest discover -s tests</code>
        </pre>
      </section>
    </DocsLayout>
  );
}
