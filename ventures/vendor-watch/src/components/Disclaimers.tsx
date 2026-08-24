export default function Disclaimers({ compact = false }: { compact?: boolean }) {
  const items = [
    "This is an evidence feed, not legal, compliance, or contract-review advice.",
    "Vendor Watch does not decide whether a change is “compliant,” “safe,” or “material” — you decide what a change means.",
    "Only monitor pages you're authorized to monitor; only public pages are supported.",
    "No warranty on fetch availability, completeness, or timing.",
  ];

  return (
    <div
      className={
        compact
          ? "text-xs text-slate-500"
          : "rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600"
      }
    >
      {!compact && <p className="mb-2 font-medium text-slate-700">Before you rely on this</p>}
      <ul className={compact ? "space-y-1" : "list-disc space-y-1 pl-5"}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
