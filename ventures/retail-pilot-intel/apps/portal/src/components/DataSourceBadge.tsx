import type { DataSourceKind } from "../lib/pilot-kpis";

const LABELS: Record<DataSourceKind, string> = {
  live: "Live",
  illustrative: "Illustrative",
  unreachable: "API offline",
};

const PILLS: Record<DataSourceKind, string> = {
  live: "pill pill-ok",
  illustrative: "pill pill-demo",
  unreachable: "pill pill-warn",
};

export function DataSourceBadge({
  source,
  message,
}: {
  source: DataSourceKind;
  message: string;
}) {
  return (
    <aside className="data-source-banner" aria-label="Data source">
      <span className={PILLS[source]}>{LABELS[source]}</span>
      <p>{message}</p>
    </aside>
  );
}
