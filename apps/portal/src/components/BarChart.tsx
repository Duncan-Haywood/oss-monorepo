export function BarChart({
  items,
  valueKey,
  labelKey,
  secondaryKey,
  formatValue,
}: {
  items: Record<string, string | number>[];
  valueKey: string;
  labelKey: string;
  secondaryKey?: string;
  formatValue?: (n: number) => string;
}) {
  const values = items.map((i) => Number(i[valueKey]));
  const max = Math.max(...values, 1);

  return (
    <div className="bar-chart" role="img" aria-label="Bar chart">
      {items.map((item) => {
        const v = Number(item[valueKey]);
        const pct = Math.round((v / max) * 100);
        const label = String(item[labelKey]);
        const secondary = secondaryKey ? Number(item[secondaryKey]) : undefined;
        return (
          <div key={label} className="bar-row">
            <span className="bar-label">{label}</span>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ width: `${pct}%` }}
                title={formatValue ? formatValue(v) : String(v)}
              />
              {secondary !== undefined ? (
                <div
                  className="bar-fill secondary"
                  style={{
                    width: `${Math.round((secondary / max) * 100)}%`,
                  }}
                />
              ) : null}
            </div>
            <span className="bar-value">
              {formatValue ? formatValue(v) : v}
              {secondary !== undefined ? ` / ${secondary}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
