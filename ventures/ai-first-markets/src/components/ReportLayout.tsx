import type { ReactNode } from "react";

interface ReportLayoutProps {
  title: string;
  description: string;
  badge?: string;
  children: ReactNode;
}

export function ReportLayout({
  title,
  description,
  badge,
  children,
}: ReportLayoutProps) {
  return (
    <article>
      <header className="mb-10 border-b border-zinc-800 pb-8">
        {badge && (
          <span className="inline-block rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400">
            {badge}
          </span>
        )}
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-3xl text-lg text-zinc-400">{description}</p>
      </header>
      <div className="prose-report space-y-8">{children}</div>
    </article>
  );
}

interface SectionProps {
  title: string;
  children: ReactNode;
}

export function Section({ title, children }: SectionProps) {
  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}

interface DataTableProps {
  headers: string[];
  rows: string[][];
}

export function DataTable({ headers, rows }: DataTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/80">
            {headers.map((header) => (
              <th
                key={header}
                className="px-4 py-3 font-medium text-zinc-400"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-900/50"
            >
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-zinc-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface CalloutProps {
  variant?: "info" | "success" | "warning";
  children: ReactNode;
}

const calloutStyles = {
  info: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-200",
};

export function Callout({ variant = "info", children }: CalloutProps) {
  return (
    <div
      className={`rounded-xl border px-5 py-4 text-sm ${calloutStyles[variant]}`}
    >
      {children}
    </div>
  );
}
