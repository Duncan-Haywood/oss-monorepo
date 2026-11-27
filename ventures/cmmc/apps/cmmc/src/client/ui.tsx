// Small UI primitives shared by the views.

import { SCOPE_DISCLAIMER } from "@shared/enums";
import type { ReactNode } from "react";

export const STATUS_LABEL = {
  not_assessed: "Not assessed",
  not_implemented: "Not implemented",
  partially_implemented: "Partially implemented",
  implemented: "Implemented",
  not_applicable: "Not applicable",
} as const;

export const STATUS_TONE: Record<keyof typeof STATUS_LABEL, string> = {
  not_assessed: "bg-stone-100 text-stone-700",
  not_implemented: "bg-red-50 text-red-800",
  partially_implemented: "bg-amber-50 text-amber-800",
  implemented: "bg-emerald-50 text-emerald-800",
  not_applicable: "bg-sky-50 text-sky-800",
};

export function Badge({ status }: { status: keyof typeof STATUS_LABEL }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_TONE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Card({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-stone-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export const inputCls =
  "w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100";
export const btnCls =
  "rounded bg-brand-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50";
export const btnGhostCls =
  "rounded border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the input is passed in as children
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-stone-800">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="text-sm text-red-700">{error instanceof Error ? error.message : String(error)}</p>
  );
}

export function Disclaimer() {
  return <p className="text-xs leading-relaxed text-stone-500">{SCOPE_DISCLAIMER}</p>;
}
