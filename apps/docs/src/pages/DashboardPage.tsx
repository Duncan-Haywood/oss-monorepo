import { Link } from "react-router-dom";
import { DocLayout } from "../components/DocLayout";

export function DashboardPage() {
  return (
    <DocLayout
      title="Store dashboard"
      subtitle="Operator UI lives in the sales portal app"
    >
      <div className="card ok">
        <p>
          <strong>Sales demo portal</strong> — passcode-gated mock operator UI with
          illustrative metrics for the Milano leather boutique pilot. Includes a{" "}
          <strong>Business value</strong> view (ROI matrix, pilot wins, quarterly
          focus) for owner-facing sales conversations. Run locally:
        </p>
        <pre>{`pnpm portal:dev
# default passcode: atelier-demo
# sign in as Owner for ROI banner; tour: /value → / → /products`}</pre>
        <p>
          Built static bundle: <code>apps/portal/dist/index.html</code>
        </p>
      </div>

      <p className="stub">
        This docs route remains a lightweight placeholder. Production wiring (M3) will
        connect KPIs from SQLite via a small TypeScript API on the store LAN.
      </p>

      <footer>
        <Link to="/">← Home</Link>
      </footer>
    </DocLayout>
  );
}
