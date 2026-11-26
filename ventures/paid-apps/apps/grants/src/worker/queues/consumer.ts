import type { AppContext } from "../context";
import { createAppContext } from "../context";
import type { Env } from "../env";
import { isNonRetryableError } from "../services/guards/llm-budget";
import { jobHandlers } from "./handlers";
import type { JobMessage } from "./messages";

export async function handleQueueBatch(
  batch: MessageBatch<JobMessage>,
  env: Env,
  execCtx: ExecutionContext,
) {
  const ctx = createAppContext(env, { executionCtx: execCtx });
  for (const msg of batch.messages) {
    await runJob(ctx, msg.body).then(
      () => msg.ack(),
      (err) => {
        ctx.logger.error("job.failed", {
          type: msg.body.type,
          attempts: msg.attempts,
          error: String(err),
        });
        if (isNonRetryableError(err)) msg.ack();
        else msg.retry({ delaySeconds: Math.min(300, 10 * 2 ** msg.attempts) });
      },
    );
  }
}

export async function runJob(ctx: AppContext, job: JobMessage) {
  const handler = jobHandlers[job.type] as
    | ((ctx: AppContext, job: JobMessage) => Promise<void>)
    | undefined;
  if (!handler) throw new Error(`No handler for job type ${job.type}`);
  await handler(ctx, job);
}
