"use client";

import { PERSPECTIVE_META, type PerspectiveValue } from "@/lib/perspective";

type Props = {
  isOpen: boolean;
  targetPerspective: PerspectiveValue;
  currentPerspective?: PerspectiveValue;
  isAutoSuggested?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ModeTransitionModal({
  isOpen,
  targetPerspective,
  isAutoSuggested = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!isOpen) return null;

  const targetMeta = PERSPECTIVE_META[targetPerspective];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mode-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100 text-3xl shadow-inner dark:bg-neutral-800">
            {targetMeta.glyph}
          </div>

          <span className="mb-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {isAutoSuggested ? "Part complete · changing focus" : "Mode transition"}
          </span>

          <h2 id="mode-modal-title" className="mt-2 text-xl font-bold text-neutral-900 dark:text-neutral-50">
            {targetMeta.modalHeadline}
          </h2>

          <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
            {targetMeta.modalInstruction}
          </p>

          <div className="mt-4 w-full rounded-2xl border border-neutral-100 bg-neutral-50 p-4 text-left dark:border-neutral-800 dark:bg-neutral-950">
            <div className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">Current Rating Focus</div>
            <div className="mt-1 flex items-center gap-2 font-medium text-neutral-800 dark:text-neutral-200 text-sm">
              <span>{targetMeta.glyph}</span>
              <span>{targetMeta.blurb}</span>
            </div>
          </div>

          <div className="mt-6 flex w-full flex-col gap-2.5">
            <button
              onClick={onConfirm}
              className="w-full rounded-2xl bg-amber-500 py-3.5 px-4 text-sm font-bold text-neutral-950 shadow-md transition hover:bg-amber-400 active:scale-[0.98]"
            >
              {isAutoSuggested ? `Continue with ${targetMeta.short}` : `Start ${targetMeta.short}`}
            </button>
            {!isAutoSuggested && (
              <button
                onClick={onCancel}
                className="w-full rounded-2xl border border-neutral-300 bg-transparent py-3 px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 active:scale-[0.98] dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Stay in current focus
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
