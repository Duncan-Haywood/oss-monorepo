// Rendering facts for LLM prompts (drafting, grounding, matching). Pure.
import type { FactSourceType, FactStatus } from "@shared/enums";

export interface PromptFact {
  id: string;
  statement: string;
  status: FactStatus;
  asOf?: string | null;
  sourceQuote?: string | null;
  sourceType?: FactSourceType;
}

const MAX_QUOTE = 400;

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * One line per fact:
 *   [fct_abc] (confirmed, as of 2025) statement — source: "quote"
 * User-entered facts (no quote) render `— source: entered by org staff`.
 */
export function formatFactsForPrompt(facts: readonly PromptFact[]): string {
  return facts
    .map((f) => {
      const meta = [f.status, f.asOf ? `as of ${oneLine(f.asOf)}` : null]
        .filter(Boolean)
        .join(", ");
      const quote = oneLine(f.sourceQuote ?? "");
      const src = quote
        ? `"${quote.length > MAX_QUOTE ? `${quote.slice(0, MAX_QUOTE - 1)}…` : quote}"`
        : f.sourceType === "user_entered" || !f.sourceType
          ? "entered by org staff"
          : "no quote";
      return `[${f.id}] (${meta}) ${oneLine(f.statement)} — source: ${src}`;
    })
    .join("\n");
}
