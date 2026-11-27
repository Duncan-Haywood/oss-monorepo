// Operational records: metered LLM calls (cost per org / purpose).
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt } from "./_columns";

export const llmCalls = sqliteTable(
  "llm_calls",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id"),
    purpose: text("purpose").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costMicros: integer("cost_micros").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    stopReason: text("stop_reason"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("llm_calls_org_idx").on(t.orgId, t.createdAt)],
);
