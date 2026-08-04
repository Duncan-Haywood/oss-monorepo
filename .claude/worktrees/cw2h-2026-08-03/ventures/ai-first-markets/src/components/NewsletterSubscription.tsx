"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { SubscriptionTier } from "@/lib/subscription";

interface NewsletterSubscriptionProps {
  initialTier?: SubscriptionTier;
  className?: string;
}

export function NewsletterSubscription({
  initialTier = "weekly_free",
  className = "",
}: NewsletterSubscriptionProps) {
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<SubscriptionTier>(initialTier);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setStatus("error");
      setMessage("Please enter a valid email address.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, tier }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStatus("success");
        setMessage(data.message);
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.message || "Failed to submit subscription. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("An unexpected error occurred. Please try again later.");
    }
  };

  return (
    <div
      className={`rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 p-6 sm:p-8 shadow-xl backdrop-blur-md ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="inline-block rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Market Intelligence Research
          </span>
          <h3 className="mt-2 text-2xl font-bold tracking-tight text-zinc-50">
            Subscribe to AI-First Market Intelligence
          </h3>
          <p className="mt-1 text-sm text-zinc-400">
            Get weekly market opportunity maps, quantitative efficiency scores, and solo founder wedges.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setTier("weekly_free")}
            className={`flex flex-col rounded-xl border p-4 text-left transition ${
              tier === "weekly_free"
                ? "border-emerald-500 bg-emerald-950/40 text-zinc-50 ring-1 ring-emerald-500"
                : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
            }`}
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Free Weekly
            </span>
            <span className="mt-1 text-lg font-bold text-zinc-100">$0 / month</span>
            <span className="mt-1 text-xs text-zinc-400">
              Weekly overview of top AI leverage categories & market signals.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTier("premium_29")}
            className={`flex flex-col rounded-xl border p-4 text-left transition ${
              tier === "premium_29"
                ? "border-emerald-500 bg-emerald-950/40 text-zinc-50 ring-1 ring-emerald-500"
                : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                Premium Pro Research
              </span>
              {/*
                This tier has never been sold and there is no payment path in
                this venture, so it carries no popularity or uptake claim — it
                is labelled for what joining it actually does.
              */}
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 uppercase">
                Waitlist
              </span>
            </div>
            <span className="mt-1 text-lg font-bold text-zinc-100">$29 / month</span>
            <span className="mt-1 text-xs text-zinc-400">
              Planned: full data models, financial playbooks, & early sector alert reports. Not on
              sale yet — join the waitlist and you&rsquo;ll be emailed when it opens. No payment now.
            </span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="founder@company.com"
            className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {status === "loading"
              ? "Submitting..."
              : tier === "premium_29"
                ? "Join the waitlist"
                : "Subscribe Free"}
          </button>
        </div>

        {status === "error" && (
          <p role="alert" className="text-sm font-medium text-rose-400">
            {message}
          </p>
        )}
        {status === "success" && (
          // The server decides what was actually recorded and says so; this box
          // adds no heading of its own, because "Subscription Received!" above a
          // waitlist message is the claim the server carefully avoided making.
          <div
            role="status"
            className="rounded-xl border border-emerald-500/40 bg-emerald-950/60 p-4 text-sm text-emerald-200"
          >
            <p>{message}</p>
          </div>
        )}
      </form>
    </div>
  );
}
