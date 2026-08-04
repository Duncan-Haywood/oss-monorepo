import type { ReactNode } from "react";

export function Card({
  children,
  variant,
}: {
  children: ReactNode;
  variant?: "ok" | "warn";
}) {
  const cls = ["card", variant].filter(Boolean).join(" ");
  return <div className={cls}>{children}</div>;
}

export function Tag({ phase }: { phase: "p1" | "p2" | "p3" }) {
  return <span className={`tag ${phase}`}>{phase.toUpperCase()}</span>;
}

export function Diagram({ children }: { children: string }) {
  return <pre className="diagram">{children}</pre>;
}

export function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | ReactNode)[][];
}) {
  return (
    <table>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
