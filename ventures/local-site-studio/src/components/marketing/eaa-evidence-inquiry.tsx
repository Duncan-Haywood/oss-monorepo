"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { brand } from "@/lib/brand";
import {
  buildEaaInquiryMailto,
  qualifyEaaBuyer,
  type BuyerObligation,
} from "@/lib/pricing/eaa-evidence";

const USAGE_KEY = "local-site-studio:eaa-evidence-events";
const OPT_OUT_KEY = "local-site-studio:eaa-evidence-usage-opt-out";

function recordUsage(event: string) {
  try {
    if (localStorage.getItem(OPT_OUT_KEY) === "true") return;
    const current = JSON.parse(localStorage.getItem(USAGE_KEY) || "{}") as Record<string, number>;
    current[event] = (current[event] || 0) + 1;
    localStorage.setItem(USAGE_KEY, JSON.stringify(current));
  } catch {
    // Private browsing and disabled storage must not break the inquiry form.
  }
}

type TurnoverBand = "" | "under-2m" | "over-2m";

/** Whole numbers only — the input has step=1, so a fractional entry is rejected rather than silently floored. */
function parseEmployees(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

function turnoverEur(band: TurnoverBand): number | null {
  if (band === "under-2m") return 1_500_000;
  if (band === "over-2m") return 2_000_001;
  return null;
}

export function EaaEvidenceInquiry() {
  const [shopUrl, setShopUrl] = useState("");
  const [employeesRaw, setEmployeesRaw] = useState("");
  const [turnoverBand, setTurnoverBand] = useState<TurnoverBand>("");
  const [contactEmail, setContactEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [optedOut, setOptedOut] = useState(false);

  useEffect(() => {
    let active = true;
    try {
      const savedOptedOut = localStorage.getItem(OPT_OUT_KEY) === "true";
      queueMicrotask(() => {
        if (active) setOptedOut(savedOptedOut);
      });
    } catch {
      // Preference is best effort; the inquiry remains functional.
    }
    return () => {
      active = false;
    };
  }, []);

  const employees = parseEmployees(employeesRaw);
  const turnover = turnoverEur(turnoverBand);
  const obligation: BuyerObligation = qualifyEaaBuyer({
    employees,
    turnoverEur: turnover,
  });

  const mailto = useMemo(
    () =>
      buildEaaInquiryMailto(brand.supportEmail, {
        shopUrl,
        employees,
        turnoverEur: turnover,
        contactEmail,
        notes,
      }),
    [shopUrl, employees, turnover, contactEmail, notes],
  );

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (mailto.ok) {
          recordUsage("qualified_inquiry_started");
          window.location.href = mailto.href;
        }
      }}
    >
      <div>
        <label htmlFor="eaa-shop-url" className="block text-sm font-medium text-zinc-900">
          Shop URL
        </label>
        <input
          id="eaa-shop-url"
          name="shopUrl"
          type="url"
          required
          autoComplete="url"
          value={shopUrl}
          onChange={(event) => setShopUrl(event.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          placeholder="https://your-shop.example"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="eaa-employees" className="block text-sm font-medium text-zinc-900">
            Employees
          </label>
          <input
            id="eaa-employees"
            name="employees"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={employeesRaw}
            onChange={(event) => setEmployeesRaw(event.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
            placeholder="e.g. 14"
          />
        </div>
        <div>
          <label htmlFor="eaa-turnover" className="block text-sm font-medium text-zinc-900">
            Annual turnover
          </label>
          <select
            id="eaa-turnover"
            name="turnover"
            value={turnoverBand}
            onChange={(event) => setTurnoverBand(event.target.value as TurnoverBand)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          >
            <option value="">I don&apos;t know yet</option>
            <option value="under-2m">€2 million or less</option>
            <option value="over-2m">More than €2 million</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="eaa-contact-email" className="block text-sm font-medium text-zinc-900">
          Contact email
        </label>
        <input
          id="eaa-contact-email"
          name="contactEmail"
          type="email"
          required
          autoComplete="email"
          value={contactEmail}
          onChange={(event) => setContactEmail(event.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </div>

      <div>
        <label htmlFor="eaa-notes" className="block text-sm font-medium text-zinc-900">
          What prompted this (optional)
        </label>
        <textarea
          id="eaa-notes"
          name="notes"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
          placeholder="A warning letter, a deadline, a failed scan — whatever you have."
        />
      </div>

      {obligation === "exempt-microenterprise" ? (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">This job is not for a microenterprise.</p>
          <p className="mt-2 leading-6">
            Shops with fewer than 10 employees <em>and</em> turnover of €2 million or less are
            generally outside the European Accessibility Act&apos;s service obligation. We will
            not sell deadline-urgency into that exemption. If you want a website, the{" "}
            <Link href="/#pricing" className="underline underline-offset-2">
              existing site bundles
            </Link>{" "}
            are the right product.
          </p>
        </div>
      ) : null}

      {obligation === "unknown" ? (
        <div role="status" className="rounded-xl border border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-700">
          Tell us employees <em>or</em> turnover above the threshold before we take an
          evidence-job inquiry. We do not assume you are obligated.
        </div>
      ) : null}

      {obligation === "obligated" && mailto.ok ? (
        <p className="text-sm text-zinc-600">
          Checkout is not live yet. This opens a pre-filled email to{" "}
          {brand.supportEmail} — no payment, no compliance claim.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!mailto.ok}
        className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
      >
        Email an inquiry
      </button>
      <label className="flex items-center gap-2 text-xs text-zinc-500">
        <input
          type="checkbox"
          checked={optedOut}
          onChange={(event) => {
            setOptedOut(event.target.checked);
            try {
              localStorage.setItem(OPT_OUT_KEY, String(event.target.checked));
            } catch {
              // Preference is best effort; the inquiry remains functional.
            }
          }}
        />
        Don&apos;t count anonymous inquiry events on this device
      </label>
    </form>
  );
}
