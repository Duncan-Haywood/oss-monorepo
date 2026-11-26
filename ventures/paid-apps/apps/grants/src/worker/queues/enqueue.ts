import type { AppContext } from "../context";
import type { JobMessage } from "./messages";

/**
 * Enqueue a background job. In tests (APP_ENV=test) jobs run inline so flows are deterministic;
 * set INLINE_JOBS="true" to do the same in a local offline demo.
 */
export async function enqueue(
  ctx: AppContext,
  job: JobMessage,
  opts: { delaySeconds?: number } = {},
) {
  const inline =
    ctx.env.APP_ENV === "test" || (ctx.env as { INLINE_JOBS?: string }).INLINE_JOBS === "true";
  if (inline) {
    const { runJob } = await import("./consumer");
    await runJob(ctx, job);
    return;
  }
  await ctx.env.JOBS.send(job, opts.delaySeconds ? { delaySeconds: opts.delaySeconds } : undefined);
}
