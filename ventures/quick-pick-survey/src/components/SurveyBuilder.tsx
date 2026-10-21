"use client";

import { useState } from "react";
import type { Coverage, RankedItem } from "@/lib/groupRanking";

type Ranking = { title: string; participants: number; ranking: RankedItem[]; coverage?: Coverage };

const INPUT =
  "rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 dark:border-neutral-700 dark:bg-neutral-900";

/**
 * Create a ranking survey from your own options and read the pooled result.
 * Both halves call the admin endpoints; this screen adds no rules of its own,
 * so a rejected survey shows the server's messages as they are.
 */
export function SurveyBuilder() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState("");
  const [pairSelector, setPairSelector] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [created, setCreated] = useState<{ slug: string; url: string; items: number } | null>(null);
  const [result, setResult] = useState<Ranking | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    setCreated(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, items, pairSelector }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 201) {
        setCreated(d);
        setTitle("");
        setDescription("");
        setItems("");
      } else if (Array.isArray(d?.errors)) setErrors(d.errors);
      else setErrors([d?.error ?? "Couldn't create the survey."]);
    } catch {
      setErrors(["Couldn't reach the server."]);
    }
    setBusy(false);
  }

  async function showRanking(slug: string) {
    setResultError(null);
    try {
      const res = await fetch(`/api/admin/surveys/${slug}/ranking`);
      if (!res.ok) {
        setResult(null);
        setResultError("Couldn't load the ranking.");
        return;
      }
      setResult(await res.json());
    } catch {
      setResult(null);
      setResultError("Couldn't reach the server.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={create} className="flex flex-col gap-2">
        <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Survey title" aria-label="Survey title" maxLength={100} />
        <input className={INPUT} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" aria-label="Description" maxLength={500} />
        <textarea
          className={`${INPUT} min-h-32 font-mono`}
          value={items}
          onChange={(e) => setItems(e.target.value)}
          placeholder={"One option per line, at least 3.\nAdd a group as Category | Option"}
          aria-label="Options"
        />
        <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
          Question order
          <select className={INPUT} value={pairSelector} onChange={(e) => setPairSelector(e.target.value)} aria-label="Question order">
            <option value="">Server default</option>
            <option value="standard">Standard</option>
            <option value="staged">Sharper after 120 answers (large option lists)</option>
          </select>
        </label>
        <button type="submit" disabled={busy || !title.trim() || !items.trim()} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50">
          {busy ? "…" : "Create survey"}
        </button>
      </form>
      {errors.length > 0 && (
        <ul role="alert" className="list-disc pl-5 text-sm font-medium text-red-600 dark:text-red-400">
          {errors.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}
      {created && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-neutral-100 px-3 py-2 text-sm dark:bg-neutral-800">
          <span>Created with {created.items} options.</span>
          <code className="font-mono text-xs">{created.url}</code>
          <button type="button" onClick={() => showRanking(created.slug)} className="font-semibold underline underline-offset-2">Show ranking</button>
          <a href={`/api/admin/surveys/${created.slug}/ranking?format=csv`} className="font-semibold underline underline-offset-2">↓ CSV</a>
        </div>
      )}
      {resultError && <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">{resultError}</p>}
      {result && <RankingTable r={result} />}
    </div>
  );
}

function RankingTable({ r }: { r: Ranking }) {
  const none = r.ranking.every((x) => x.respondents === 0);
  return (
    <div>
      <h3 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
        {r.title} · {r.participants} {r.participants === 1 ? "respondent" : "respondents"}
      </h3>
      {r.coverage?.advice && (
        <p role="note" className="mt-1 rounded bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {r.coverage.advice}
        </p>
      )}
      {none ? (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">No answers yet, so there is nothing to rank.</p>
      ) : (
        <table className="mt-2 w-full text-left text-xs">
          <thead>
            <tr className="text-neutral-500 dark:text-neutral-400">
              <th className="pb-1 pr-3 font-semibold">#</th>
              <th className="pb-1 pr-3 font-semibold">Option</th>
              <th className="pb-1 pr-3 font-semibold">Rating (95%)</th>
              <th className="pb-1 pr-3 font-semibold">Raters</th>
              <th className="pb-1 font-semibold">Rank range</th>
            </tr>
          </thead>
          <tbody>
            {r.ranking.map((x) => (
              <tr key={x.itemId}>
                <td className="py-1 pr-3 tabular-nums">{x.rank}</td>
                <td className="py-1 pr-3">{x.label}</td>
                <td className="py-1 pr-3 tabular-nums">{Math.round(x.rating)} ({Math.round(x.low)}–{Math.round(x.high)})</td>
                <td className="py-1 pr-3 tabular-nums">{x.respondents}</td>
                <td className="py-1 tabular-nums">{x.tied ? `${x.bestRank}–${x.worstRank}` : x.bestRank}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
