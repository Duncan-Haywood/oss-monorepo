type Metric = {
  before: number;
  after: number;
  label: string;
};

function formatValue(key: string, value: number): string {
  if (key.includes("Eur") || key.includes("Revenue")) {
    return `€${value.toLocaleString("it-IT")}`;
  }
  if (key.includes("Pct") || key.includes("Rate")) {
    return `${value}%`;
  }
  return value.toLocaleString("it-IT");
}

function deltaPct(before: number, after: number): string {
  if (before === 0) return "—";
  const pct = ((after - before) / before) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export function BeforeAfterGrid({
  metrics,
}: {
  metrics: Record<string, Metric>;
}) {
  return (
    <div className="before-after-grid">
      {Object.entries(metrics).map(([key, m]) => {
        const improved = m.after >= m.before;
        const inverted = key.includes("Days") || key.includes("slow");
        const positive = inverted ? m.after < m.before : improved;

        return (
          <article key={key} className="before-after-card">
            <p className="ba-label">{m.label}</p>
            <div className="ba-values">
              <div className="ba-col">
                <span className="ba-phase">Pre-pilot</span>
                <span className="ba-num muted">{formatValue(key, m.before)}</span>
              </div>
              <span className="ba-arrow" aria-hidden="true">
                →
              </span>
              <div className="ba-col">
                <span className="ba-phase">Week 6</span>
                <span className="ba-num">{formatValue(key, m.after)}</span>
              </div>
            </div>
            <p className={`ba-delta ${positive ? "delta-up" : ""}`}>
              {deltaPct(m.before, m.after)} vs baseline
            </p>
          </article>
        );
      })}
    </div>
  );
}
