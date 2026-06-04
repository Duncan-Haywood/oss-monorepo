import type { ReactNode } from "react";

/** Scoped wrapper for long-form TSX reports (migrated from standalone HTML). */
export function ReportShell({
  css,
  children,
}: {
  css?: string;
  children: ReactNode;
}) {
  return (
    <article className="tsx-report">
      {css ? <style>{css}</style> : null}
      <div className="tsx-report-body">{children}</div>
    </article>
  );
}
