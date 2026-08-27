export default function Disclaimers({ compact = false }: { compact?: boolean }) {
  const items = [
    "This is an evidence feed, not legal, compliance, or contract-review advice.",
    "Vendor Watch does not decide whether a change is “compliant,” “safe,” or “material” — you decide what a change means.",
    "Only monitor pages you are authorized to monitor; only public pages are supported.",
    "No warranty. This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or compliance advice. You are responsible for reviewing and verifying its output before relying on it.",
    "Best-effort hosting, no SLA. These tools may be slow, broken, moved, or taken offline without notice. Do not use this as a system of record.",
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
