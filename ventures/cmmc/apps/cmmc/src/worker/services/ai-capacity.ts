// The service-wide AI spending cap: a daily ceiling on drafts across every organization, the kill
// switch the launch review asked for (docs/LAUNCH-REVIEW.md, section 1). Each plan's monthly draft
// allowance (services/billing.ts) bounds one organization; this bounds the sum, so a wave of free
// sign-ups or a bug cannot run up the model bill.
//
// The cap is in dollars and turned into a number of drafts with the configured model's list price at
// the worst case one draft can reach: 20k tokens in, the 4k-token output cap out (services/drafting
// passes maxTokens 4000 on both purposes). The input bound comes from the field limits in
// routes/org: four 8,000-character profile fields, 8,000-character notes and statement, the
// requirement text, evidence titles and the ~3.5k-character prompt, about 55k characters or 14k
// tokens, rounded up. So the bound holds whichever model LLM_MODEL names.
// Drafts are counted from the same audit rows the monthly allowance counts.
//
// Config (a Worker var, or `wrangler secret put` for an instant change):
//   GLOBAL_DAILY_LLM_CAP_USD  default 1.5  "0" stops every draft (kill switch); "off" disables
import { and, count, gte, inArray } from "drizzle-orm";
import type { AppContext } from "../context";
import { auditLog } from "../db/schema";
import { AppError } from "../lib/errors";
import { costMicros } from "../ports/llm-pricing";

// $1.50 a day keeps a month under the venture's $50 budget cap (ventures/cmmc/VENTURE.yaml): 375
// worst-case drafts a day on Haiku, where a paid shop at its whole allowance uses about 5 (Level 2)
// or 13 (Level 2 + Quality). Raise it, with the budget, as paying shops arrive.
export const DEFAULT_GLOBAL_DAILY_LLM_CAP_USD = 1.5;

/** The audit actions that each mark one AI draft (services/drafting). */
export const DRAFT_ACTIONS = ["control.draft", "policy.procedure_draft"] as const;

/** One draft at its worst (header): also the cost src/shared/plans.test.ts prices drafts at. */
export const WORST_DRAFT_TOKENS = { inputTokens: 20_000, outputTokens: 4_000 } as const;

export const worstDraftCostMicros = (model: string) =>
  costMicros(model, {
    ...WORST_DRAFT_TOKENS,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });

/** The cap in micro-USD; null = no cap. Unparseable values fall back to the default. */
export function dailyCapMicros(raw: unknown): number | null {
  const fallback = DEFAULT_GLOBAL_DAILY_LLM_CAP_USD * 1_000_000;
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "off" || v === "none" || v === "unlimited") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1_000_000) : fallback;
}

/** Drafts the whole service may make in one UTC day; null = unlimited. */
export function dailyDraftLimit(rawCap: unknown, model: string): number | null {
  const cap = dailyCapMicros(rawCap);
  if (cap === null) return null;
  return Math.floor(cap / Math.max(1, worstDraftCostMicros(model)));
}

export const startOfUtcDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export const capacityExhausted = () =>
  new AppError(
    429,
    "llm_capacity_exhausted",
    "AI drafting is paused for the rest of today (UTC) across the service. You can still write the statement yourself; drafting comes back tomorrow.",
  );

/** Before an AI draft: throws 429 once today's drafts across every organization reach the cap. */
export async function assertServiceDraftCapacity(ctx: AppContext): Promise<void> {
  const vars = ctx.env as unknown as Record<string, unknown>;
  const limit = dailyDraftLimit(vars.GLOBAL_DAILY_LLM_CAP_USD, ctx.env.LLM_MODEL);
  if (limit === null) return;
  if (limit === 0) throw capacityExhausted();
  const row = await ctx.db
    .select({ n: count() })
    .from(auditLog)
    .where(
      and(
        inArray(auditLog.action, [...DRAFT_ACTIONS]),
        gte(auditLog.createdAt, startOfUtcDay(ctx.now())),
      ),
    )
    .get();
  const used = row?.n ?? 0;
  if (used >= limit) {
    ctx.logger.error("llm_capacity.daily_cap_reached", { used, limit });
    throw capacityExhausted();
  }
}
