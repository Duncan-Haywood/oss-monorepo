/**
 * Shared types for the cross-agent process log (src/lib/process/prompt_process.tsx
 * and its archive/*.ts files, plus business-decisions.ts). Kept in their own
 * leaf module — with no dependency on prompt_process.tsx or
 * business-decisions.ts — so that archive/iterations-archive-*.ts can import
 * BUSINESS_DECISIONS from business-decisions.ts (a real value, needed for
 * `.filter((d) => d.id === "...")` decision cross-references) without
 * creating an import cycle back through prompt_process.tsx. See
 * process-log-archive-scalability-split in BUSINESS_DECISIONS for the full
 * rationale.
 */

export type NextStepStatus = "todo" | "in_progress" | "done";

export interface NextStep {
  id: string;
  summary: string;
  status: NextStepStatus;
  /** Roadmap phase this maps to, if any — see /docs/roadmap. */
  phase?: string;
  /** Branch or agent that claimed this, once status moves off "todo". */
  owner?: string;
}

export interface BusinessDecision {
  date: string; // ISO date
  decision: string;
  rationale: string;
  /**
   * Stable slug, required on every new entry (match the NEXT_STEPS id when
   * there's a 1:1 mapping) — lets ITERATIONS[].decisions reference this entry
   * by BUSINESS_DECISIONS.filter(d => d.id === "...") instead of a hand-tracked
   * absolute slice(index, index+1). Optional only so pre-id historical entries
   * (before this field existed) still type-check; do not backfill them.
   */
  id?: string;
}

export interface ProcessIteration {
  date: string; // ISO date
  branch: string;
  summary: string;
  shipped: string[];
  decisions: BusinessDecision[];
}

/**
 * How concurrent agents cooperate. Keep this short; evolve it when collisions
 * or thrash show up in practice.
 */
