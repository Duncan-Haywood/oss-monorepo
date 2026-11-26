// Operational telemetry: LLM call accounting (cost / latency / debugging).
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt } from "./_columns";
import { organization } from "./auth";

export const llmCalls = sqliteTable(
  "llm_calls",
  {
    id: text("id").primaryKey(), // llm_...
    orgId: text("org_id").references(() => organization.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(), // e.g. "drafting.section", "grounding.verify"
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    /** Computed from the model price table at call time, in micro-USD (1e-6 USD). */
    costMicros: integer("cost_micros").notNull().default(0),
    /** Attribution for per-application cost measurement (null for org-level work). */
    applicationId: text("application_id"),
    latencyMs: integer("latency_ms").notNull().default(0),
    stopReason: text("stop_reason"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [
    index("llm_calls_org_idx").on(t.orgId, t.createdAt),
    index("llm_calls_app_idx").on(t.applicationId),
    // Global daily budget sum (guards/llm-budget.ts): covering range read of recent rows only.
    index("llm_calls_created_idx").on(t.createdAt, t.costMicros),
    // Org monthly budget sum: covering; makes llm_calls_org_idx redundant (drop it later).
    index("llm_calls_org_cost_idx").on(t.orgId, t.createdAt, t.costMicros),
  ],
);
