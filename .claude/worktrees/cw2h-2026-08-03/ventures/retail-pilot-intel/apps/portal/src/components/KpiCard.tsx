export function KpiCard({
  label,
  value,
  suffix,
  delta,
  hint,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  delta?: string;
  hint?: string;
}) {
  const deltaClass =
    delta?.startsWith("+") ? "delta-up" : delta?.startsWith("-") ? "delta-down" : "";

  return (
    <article className="kpi-card">
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">
        {value}
        {suffix ? <span className="kpi-suffix">{suffix}</span> : null}
      </p>
      {delta ? <p className={`kpi-delta ${deltaClass}`}>{delta}</p> : null}
      {hint ? <p className="kpi-hint">{hint}</p> : null}
    </article>
  );
}
