import { createApp } from "./app";
import type { Env } from "./env";
import { createFetchHandler } from "./http";
import { handleQueueBatch } from "./queues/consumer";
import type { JobMessage } from "./queues/messages";
import { handleScheduled } from "./scheduled";

export { ApplicationPipeline } from "./workflows/application-pipeline";

const fetchHandler = createFetchHandler(createApp());

export default {
  fetch: fetchHandler,
  queue: (batch, env, ctx) => handleQueueBatch(batch, env, ctx),
  scheduled: (controller, env, ctx) => handleScheduled(controller, env, ctx),
} satisfies ExportedHandler<Env, JobMessage>;
