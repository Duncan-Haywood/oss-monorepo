// Highlight query terms inside a text snippet (case-insensitive, whole-term substrings).
import { Fragment } from "react";

const STOP = new Set(["the", "and", "for", "our", "with", "you", "are", "was", "how", "what"]);

export function queryTerms(query: string): string[] {
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}$%.-]+/u)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((t) => t.length >= 2 && !STOP.has(t));
  return [...new Set(terms)].sort((a, b) => b.length - a.length);
}

export function splitHighlights(text: string, terms: string[]) {
  if (terms.length === 0) return [{ text, match: false }];
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text
    .split(re)
    .filter((p) => p !== "")
    .map((p) => ({ text: p, match: terms.includes(p.toLowerCase()) }));
}

export function Highlight({ text, query }: { text: string; query: string }) {
  const parts = splitHighlights(text, queryTerms(query));
  return (
    <>
      {parts.map((p, i) =>
        p.match ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: static split of a string
          <mark key={i} className="rounded bg-warning-100 px-0.5 text-neutral-900">
            {p.text}
          </mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: static split of a string
          <Fragment key={i}>{p.text}</Fragment>
        ),
      )}
    </>
  );
}
