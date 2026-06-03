import { DocLayout } from "../components/DocLayout";

export function DashboardPage() {
  return (
    <DocLayout
      title="Store dashboard"
      subtitle="LAN prototype — API wiring planned for M3"
    >
      <div className="kpi-grid">
        <div className="kpi">
          <div className="value">—</div>
          <div className="label">Entries today</div>
        </div>
        <div className="kpi">
          <div className="value">—</div>
          <div className="label">Bounces</div>
        </div>
        <div className="kpi">
          <div className="value">—</div>
          <div className="label">Purchases</div>
        </div>
        <div className="kpi">
          <div className="value">—</div>
          <div className="label">Conversion</div>
        </div>
      </div>

      <div className="card">
        <p className="stub">Populate data from repo root:</p>
        <pre>{`pnpm install
pnpm bootstrap`}</pre>
        <p className="stub">
          M3 will fetch KPIs from SQLite via a small TypeScript API.
        </p>
      </div>
    </DocLayout>
  );
}
