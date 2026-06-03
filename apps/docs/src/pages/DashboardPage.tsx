import { Link } from "react-router-dom";
import { Card } from "../components/DocPrimitives";
import { DocLayout } from "../components/DocLayout";

export function DashboardPage() {
  return (
    <DocLayout
      title="Store dashboard"
      subtitle="Operator UI lives in the sales portal — with business value and guided demo tour"
    >
      <Card variant="ok">
        <p>
          <strong>Sales demo portal</strong> — passcode-gated mock operator UI with
          illustrative metrics for the Milano leather boutique pilot. Includes a{" "}
          <strong>Business value</strong> page and a floating <strong>Demo script</strong>{" "}
          walkthrough for sales presentations.
        </p>
        <pre>{`pnpm portal:dev
# default passcode: atelier-demo
# http://localhost:5174`}</pre>
      </Card>

      <Card>
        <p>
          For the full sales narrative — ROI framing, objection handling, and scripted
          walkthrough — start at the{" "}
          <Link to="/demo">Sales & marketing demo</Link> page.
        </p>
      </Card>

      <p className="stub">
        Production wiring (M3) will connect KPIs from SQLite via a small TypeScript API
        on the store LAN. This build uses static illustrative data for stakeholder demos.
      </p>

      <footer>
        <Link to="/demo">Sales demo script →</Link>
        {" · "}
        <Link to="/">← Home</Link>
      </footer>
    </DocLayout>
  );
}
