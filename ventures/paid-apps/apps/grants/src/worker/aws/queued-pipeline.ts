// APPLICATION_PIPELINE on AWS: a Workflow-shaped binding that queues the pipeline as a JOBS row
// instead of running it inside the HTTP request (docs/AWS.md). Without a binding grants runs the
// pipeline inline, and drafting + verification can outlast API Gateway's 30 s request limit.
//
// create() enqueues { type: "aws.pipeline.run" }; the per-minute drain (lambda-app.ts) runs it
// with runPipelineInline, the same code path the Worker uses in tests and the offline demo.
// get() reports every instance as "complete", which services/pipeline already treats as
// "no live workflow": review decisions and info-provided events then run inline, as designed.
// A failed pipeline job is not retried (a retry could add a second draft version); the
// application keeps its status and can be regenerated from the UI, and the failure is logged.
import type { ApplicationPipelineParams } from "../services/pipeline";
import type { PgQueue } from "./pg-queue";

export const PIPELINE_JOB_TYPE = "aws.pipeline.run";

export interface PipelineJob {
  type: typeof PIPELINE_JOB_TYPE;
  params: ApplicationPipelineParams;
}

export function isPipelineJob(body: unknown): body is PipelineJob {
  return (
    !!body &&
    typeof body === "object" &&
    (body as { type?: unknown }).type === PIPELINE_JOB_TYPE &&
    typeof (body as { params?: { applicationId?: unknown } }).params?.applicationId === "string"
  );
}

export class QueuedPipeline {
  constructor(private readonly queue: Pick<PgQueue<PipelineJob>, "send">) {}

  async create(opts: { id?: string; params: ApplicationPipelineParams }) {
    await this.queue.send({ type: PIPELINE_JOB_TYPE, params: opts.params });
    return this.get(opts.id ?? opts.params.applicationId);
  }

  async get(id: string) {
    return {
      id,
      status: async () => ({ status: "complete" as const }),
      sendEvent: async () => {
        throw new Error("no live workflow on AWS: the caller runs the step inline");
      },
      terminate: async () => undefined,
      pause: async () => undefined,
      resume: async () => undefined,
      restart: async () => undefined,
    };
  }
}
