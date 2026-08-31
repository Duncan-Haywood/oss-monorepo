"use client";

import { useEffect, useState } from "react";
import { EAA_PREAUDIT_CHECKS, checklistExport, checklistPercent } from "@/lib/pricing/eaa-checklist";
import { readChecklistDraft, writeChecklistDraft } from "@/lib/pricing/eaa-draft";

const USAGE_KEY = "local-site-studio:eaa-preaudit-events";
const OPT_OUT_KEY = "local-site-studio:eaa-preaudit-usage-opt-out";
const DRAFT_KEY = "local-site-studio:eaa-preaudit-draft";

function recordUsage(event: string) {
  try {
    if (localStorage.getItem(OPT_OUT_KEY) === "true") return;
    const current = JSON.parse(localStorage.getItem(USAGE_KEY) || "{}") as Record<string, number>;
    current[event] = (current[event] || 0) + 1;
    localStorage.setItem(USAGE_KEY, JSON.stringify(current));
  } catch {
    // Private browsing and disabled storage must not break the checklist.
  }
}

export function EaaPreauditChecklist() {
  const [checked, setChecked] = useState<string[]>([]);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [optedOut, setOptedOut] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const percent = checklistPercent(checked);

  useEffect(() => {
    let active = true;
    try {
      const savedChecked = readChecklistDraft(localStorage.getItem(DRAFT_KEY));
      const savedOptedOut = localStorage.getItem(OPT_OUT_KEY) === "true";
      queueMicrotask(() => {
        if (!active) return;
        setChecked(savedChecked);
        setOptedOut(savedOptedOut);
        setSavedAt(savedChecked.length > 0 ? "saved on this device" : null);
        recordUsage("preaudit_opened");
        setHydrated(true);
      });
    } catch {
      // The control remains useful without browser storage.
      queueMicrotask(() => {
        if (active) setHydrated(true);
      });
    }
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(DRAFT_KEY, writeChecklistDraft(checked));
    } catch {
      // Draft recovery is best effort; the checklist remains usable without storage.
    }
  }, [checked, hydrated]);

  function toggle(id: string) {
    setChecked((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      recordUsage("preaudit_check_toggled");
      setSavedAt("saved just now");
      return next;
    });
  }

  function resetDraft() {
    setChecked([]);
    setSavedAt(null);
    recordUsage("preaudit_draft_reset");
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Reset still clears the on-screen checks when storage is blocked.
    }
  }

  function downloadNotes() {
    recordUsage("preaudit_notes_exported");
    const blob = new Blob([checklistExport(checked)], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "accessibility-evidence-preaudit.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function copyNotes() {
    try {
      await navigator.clipboard.writeText(checklistExport(checked));
      recordUsage("preaudit_notes_copied");
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2500);
    } catch {
      setCopyState("failed");
    }
  }

  function setUsagePreference(value: boolean) {
    setOptedOut(value);
    try {
      localStorage.setItem(OPT_OUT_KEY, String(value));
    } catch {
      // Preference is best effort; no event is required for the feature to work.
    }
  }

  return (
    <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-500">Free preparation tool</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Build an evidence-ready checklist</h2>
        </div>
        <p className="text-2xl font-semibold text-zinc-900" aria-live="polite">{percent}% ready</p>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
        Mark what you have checked, then download or copy a plain-text handoff for your team or auditor.
        Your checklist stays in this browser so you can return to it. This does not test your shop
        and an unchecked item is not proof of a failure.
      </p>
      <div className="mt-6 space-y-3">
        {EAA_PREAUDIT_CHECKS.map((item) => (
          <label key={item.id} className="flex cursor-pointer gap-3 rounded-xl border border-zinc-200 p-3 hover:bg-zinc-50">
            <input type="checkbox" checked={checked.includes(item.id)} onChange={() => toggle(item.id)} className="mt-1 h-4 w-4 accent-zinc-900" />
            <span>
              <span className="block text-sm font-medium text-zinc-900">{item.label}</span>
              <span className="block text-sm leading-5 text-zinc-600">{item.prompt}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={downloadNotes} className="rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-700">
          Download handoff notes
        </button>
        <button type="button" onClick={copyNotes} className="rounded-full border border-zinc-300 px-5 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50">
          {copyState === "copied" ? "Copied" : "Copy handoff notes"}
        </button>
      </div>
      {copyState === "failed" && (
        <p className="mt-2 text-sm text-amber-700" role="status">
          Clipboard access was unavailable. Use the download button instead.
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
        <span aria-live="polite">{savedAt ? `Draft ${savedAt}.` : "No saved checks yet."}</span>
        <button type="button" onClick={resetDraft} className="underline underline-offset-2 hover:text-zinc-900">
          Reset saved draft
        </button>
      </div>
      <label className="mt-5 flex items-center gap-2 text-xs text-zinc-500">
        <input type="checkbox" checked={optedOut} onChange={(event) => setUsagePreference(event.target.checked)} />
        Don&apos;t count anonymous feature-use events on this device
      </label>
      <p className="mt-5 border-t border-zinc-200 pt-4 text-xs leading-5 text-zinc-500">
        No warranty. This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal or compliance advice, and it does not replace a qualified professional. You are responsible for reviewing and verifying its output before relying on it. The authors accept no liability for loss or damage arising from its use.
      </p>
    </div>
  );
}
