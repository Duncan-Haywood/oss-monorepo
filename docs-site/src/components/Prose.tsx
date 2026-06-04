import type { ReactNode } from "react";

const proseClass =
  "max-w-none space-y-4 text-slate-300 [&_h2]:mt-10 [&_h2]:border-b [&_h2]:border-slate-800 [&_h2]:pb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-50 [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-slate-100 [&_li]:ml-5 [&_li]:list-disc [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:leading-relaxed [&_strong]:text-slate-100 [&_ul]:list-disc [&_ul]:pl-5 [&_code]:rounded [&_code]:bg-slate-900 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_code]:text-sky-200";

export function Prose({ children }: { children: ReactNode }) {
  return <article className={proseClass}>{children}</article>;
}

export function Callout({
  title,
  children,
  tone = "info",
}: {
  title: string;
  children: ReactNode;
  tone?: "info" | "warn";
}) {
  const border =
    tone === "warn" ? "border-amber-500/60" : "border-sky-500/60";
  return (
    <div className={`my-6 rounded-lg border-l-4 ${border} bg-slate-900/80 p-4`}>
      <p className="mb-2 text-sm font-semibold text-slate-100">{title}</p>
      <div className="text-sm text-slate-300">{children}</div>
    </div>
  );
}
