import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApiSecret } from "./lib/apiSecret";

const cronRunReturn = v.object({
  job: v.string(),
  lastRunAt: v.string(),
  lastRunSuccess: v.boolean(),
  lastSuccessAt: v.optional(v.string()),
  lastFailureAt: v.optional(v.string()),
  lastError: v.optional(v.string()),
});

/**
 * Upsert-by-job run-health marker — called once per cron route invocation,
 * both on success and on failure (see src/lib/db.ts's recordCronRunOutcome,
 * the only caller). Success and failure share one mutation (rather than
 * separate recordSuccess/recordFailure mutations) since every call site
 * already knows its own outcome up front and a single atomic patch avoids a
 * read-modify-write race between two mutations for the same job.
 */
export const recordRun = mutation({
  args: {
    job: v.string(),
    success: v.boolean(),
    atIso: v.string(),
    error: v.optional(v.string()),
    apiSecret: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const existing = await ctx.db
      .query("cronRuns")
      .withIndex("by_job", (q) => q.eq("job", args.job))
      .unique();
    const patch = args.success
      ? { lastRunAt: args.atIso, lastRunSuccess: true, lastSuccessAt: args.atIso }
      : {
          lastRunAt: args.atIso,
          lastRunSuccess: false,
          lastFailureAt: args.atIso,
          lastError: args.error,
        };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("cronRuns", { job: args.job, ...patch });
    }
    return null;
  },
});

export const list = query({
  args: { apiSecret: v.string() },
  returns: v.array(cronRunReturn),
  handler: async (ctx, args) => {
    requireApiSecret(args.apiSecret);
    const rows = await ctx.db.query("cronRuns").collect();
    return rows.map((row) => ({
      job: row.job,
      lastRunAt: row.lastRunAt,
      lastRunSuccess: row.lastRunSuccess,
      lastSuccessAt: row.lastSuccessAt,
      lastFailureAt: row.lastFailureAt,
      lastError: row.lastError,
    }));
  },
});
