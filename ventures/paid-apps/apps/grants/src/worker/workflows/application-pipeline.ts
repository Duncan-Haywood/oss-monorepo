// OWNER: pipeline agent. Durable application lifecycle (Cloudflare Workflows):
//   prepare (requirements, facts) -> draft -> verify (grounding) -> [needs_info: wait "info_provided"]
//   -> route review tier -> [auto: submit | else: wait for "review_decision"] -> submit.
// Every step is an idempotent function from services/pipeline/steps.ts that reads its state from D1,
// so retries and replays are safe. Routes send events with instance.sendEvent({ type, payload });
// events are wake-ups: D1 (written by the route before sending) is the source of truth.
// The same steps run inline (services/pipeline/index.ts) in tests and the offline demo.
// Operations guide: docs/WORKFLOWS.md.
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
  type WorkflowStepEvent,
  type WorkflowTimeoutDuration,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { z } from "zod";
import { createAppContext } from "../context";
import type { Env } from "../env";
import { AppError } from "../lib/errors";
import {
  type ApplicationPipelineParams,
  type InfoProvidedEvent,
  InfoProvidedPayload,
  type ReviewDecisionEvent,
  ReviewDecisionPayload,
} from "../services/pipeline";
import { stepQuality } from "../services/pipeline/quality-step";
import {
  changeRequestCount,
  isFinal,
  latestReviewerNotes,
  loadApplication,
  MAX_CHANGE_REDRAFTS,
  markFailed,
  nextDraftRound,
  pipelineState,
  stepDraft,
  stepPrepare,
  stepRoute,
  stepSubmit,
  stepVerify,
} from "../services/pipeline/steps";

export type { ApplicationPipelineParams } from "../services/pipeline";

const LLM_STEP = {
  retries: { limit: 3, delay: "30 seconds", backoff: "exponential" },
  timeout: "10 minutes",
} as const;
const DB_STEP = { retries: { limit: 5, delay: "5 seconds", backoff: "exponential" } } as const;
/**
 * Funder-facing send: one step, few attempts, long backoff. Every attempt submits the same
 * (application, current version) pair, which is the submission module's idempotency key.
 */
const SUBMIT_STEP = {
  retries: { limit: 3, delay: "1 minute", backoff: "exponential" },
  timeout: "10 minutes",
} as const;
/** Advisory rubric scoring: one retry, and a failure is logged, never fatal (see qualityStep). */
const QUALITY_STEP = {
  retries: { limit: 1, delay: "30 seconds", backoff: "constant" },
  timeout: "10 minutes",
} as const;
/** Bounds the state machine (each loop is one human or automatic transition). */
const MAX_ITERATIONS = 25;
/** How long the instance waits for a human before ending cleanly (later actions run inline). */
export const INFO_TIMEOUT = "14 days";
export const REVIEW_TIMEOUT = "30 days";

const Params = z.object({
  orgId: z.string().min(1),
  applicationId: z.string().min(1),
  startedBy: z.string(),
});

/**
 * Client errors (4xx AppError, e.g. 402 plan limit, 404 deleted application) must not be retried.
 * NonRetryableError must keep its default `name`: the engine recognizes it by name (or a
 * "NonRetryableError" message prefix), so passing the AppError code as `name` made it retryable.
 */
function nonRetryable<T>(fn: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof AppError && e.status < 500) throw new NonRetryableError(e.message);
      throw e;
    }
  };
}

const errorName = (e: unknown) => String((e as { name?: unknown } | null)?.name ?? "");
const errorMessage = (e: unknown) =>
  String((e as { message?: unknown } | null)?.message ?? e ?? "");

/** waitForEvent throws on timeout; the error crosses RPC, so match on name or message. */
const isWaitTimeout = (e: unknown) =>
  errorName(e) === "WorkflowTimeoutError" || /timed out/i.test(errorMessage(e));

const isNonRetryable = (e: unknown) =>
  errorName(e) === "NonRetryableError" || errorMessage(e).startsWith("NonRetryableError");

/** Engine-initiated aborts (pause/terminate/restart) must propagate untouched. */
const isEngineAbort = (e: unknown) => errorMessage(e).startsWith("Aborting engine:");

/** Quality pass after verify. stepQuality never throws; a step timeout is logged and ignored. */
async function qualityStep(
  step: WorkflowStep,
  ctx: () => ReturnType<typeof createAppContext>,
  ids: { orgId: string; applicationId: string },
  name: string,
  versionId: string,
) {
  try {
    await step.do(name, QUALITY_STEP, async () => {
      const r = await stepQuality(ctx(), ids, versionId);
      return { stored: r.stored };
    });
  } catch (e) {
    if (isEngineAbort(e)) throw e;
    ctx().logger.warn("pipeline.workflow_quality_failed", {
      applicationId: ids.applicationId,
      error: errorMessage(e).slice(0, 200),
    });
  }
}

export class ApplicationPipeline extends WorkflowEntrypoint<Env, ApplicationPipelineParams> {
  override async run(event: WorkflowEvent<ApplicationPipelineParams>, step: WorkflowStep) {
    const params = Params.safeParse(event.payload);
    if (!params.success) throw new NonRetryableError("Invalid ApplicationPipeline params");
    const ids = { orgId: params.data.orgId, applicationId: params.data.applicationId };
    const env = this.env;
    const executionCtx = this.ctx;
    const ctx = () => createAppContext(env, { executionCtx });

    /** Waits for an event; returns null on timeout (an expected outcome, not a failure). */
    const waitFor = async <T extends Rpc.Serializable<T>>(
      name: string,
      opts: { type: string; timeout: WorkflowTimeoutDuration },
    ): Promise<WorkflowStepEvent<T> | null> => {
      try {
        return await step.waitForEvent<T>(name, opts);
      } catch (e) {
        if (isWaitTimeout(e)) return null;
        throw e;
      }
    };

    try {
      await step.do(
        "prepare",
        LLM_STEP,
        nonRetryable(async () => {
          const r = await stepPrepare(ctx(), ids);
          return { sections: r.sections, facts: r.facts };
        }),
      );
      const first = await step.do(
        "draft-0",
        LLM_STEP,
        nonRetryable(async () => {
          const r = await stepDraft(ctx(), ids, { round: 0 });
          return { versionId: r.versionId };
        }),
      );
      if (first.versionId) {
        await step.do(
          "verify-0",
          LLM_STEP,
          nonRetryable(async () => {
            const r = await stepVerify(ctx(), ids, first.versionId as string);
            return { status: r.status };
          }),
        );
        await qualityStep(step, ctx, ids, "quality-0", first.versionId);
      }

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const state = await step.do(
          `state-${i}`,
          DB_STEP,
          nonRetryable(() => pipelineState(ctx(), ids)),
        );
        if (isFinal(state.status) || state.status === "failed") {
          return { status: state.status };
        }

        if (state.status === "verifying") {
          await step.do(
            `route-${i}`,
            DB_STEP,
            nonRetryable(async () => {
              const r = await stepRoute(ctx(), ids);
              return { tier: r.tier, status: r.status };
            }),
          );
          continue;
        }

        if (state.status === "approved") {
          // Either autopilot (tier auto) or a human approved via POST /reviews/:id/decision.
          await step.do(
            `submit-${i}`,
            SUBMIT_STEP,
            nonRetryable(async () => {
              const c = ctx();
              const r = await stepSubmit(c, ids, {
                submittedByType: state.reviewTier === "auto" ? "autopilot" : "user",
              });
              // Still approved = the channel refused (e.g. the email bounced; lastError is set).
              // Throw so this step retries with backoff instead of the loop re-sending at once;
              // once retries are exhausted the catch below marks the application failed.
              if (r.status === "approved") {
                const app = await loadApplication(c, ids);
                throw new Error(app.lastError ?? "Submission did not complete");
              }
              return { status: r.status };
            }),
          );
          continue;
        }

        if (state.status === "needs_info") {
          const evt = await waitFor<InfoProvidedEvent>(`info-${i}`, {
            type: "info_provided",
            timeout: INFO_TIMEOUT,
          });
          if (!evt) return { status: "needs_info", timedOut: true };
          const payload = InfoProvidedPayload.safeParse(evt.payload);
          if (payload.success && payload.data.redraft) {
            await this.redraft(step, ctx, ids, `info-${i}`);
          } else {
            // Flags resolved by hand (or a malformed event): re-route the current version if it
            // is still waiting; stepRoute keeps needs_info while missing-info blockers remain.
            await step.do(
              `info-${i}-route`,
              DB_STEP,
              nonRetryable(async () => {
                const c = ctx();
                const s = await pipelineState(c, ids);
                if (s.status !== "needs_info") return { status: s.status };
                const r = await stepRoute(c, ids);
                return { status: r.status };
              }),
            );
          }
          continue;
        }

        if (state.status === "in_review" || state.status === "changes_requested") {
          if (state.status === "changes_requested") {
            const n = await step.do(
              `changes-count-${i}`,
              DB_STEP,
              nonRetryable(() => changeRequestCount(ctx(), ids)),
            );
            if (n <= MAX_CHANGE_REDRAFTS) {
              await this.redraft(step, ctx, ids, `changes-${i}`, true);
              continue;
            }
          }
          const evt = await waitFor<ReviewDecisionEvent>(`review-${i}`, {
            type: "review_decision",
            timeout: REVIEW_TIMEOUT,
          });
          if (!evt) return { status: state.status, timedOut: true };
          // The route already recorded the decision + status in D1 (a rejection also terminates
          // this instance); the payload is informational, so a malformed one is just a wake-up.
          if (!ReviewDecisionPayload.safeParse(evt.payload).success) {
            ctx().logger.warn("pipeline.workflow_bad_event", {
              applicationId: ids.applicationId,
              type: "review_decision",
            });
          }
          continue;
        }

        // draft_queued / drafting (e.g. a human regenerate in flight): check again shortly.
        await step.sleep(`settle-${i}`, "30 seconds");
      }
      return { status: "max_iterations" };
    } catch (e) {
      if (isEngineAbort(e)) throw e;
      // Exhausted retries and non-retryable (4xx) errors end up here.
      await step.do(
        "mark-failed",
        DB_STEP,
        nonRetryable(async () => {
          const c = ctx();
          const s = await loadApplication(c, ids).catch((err: unknown) => {
            if (err instanceof AppError && err.status === 404) return null; // app/org deleted
            throw err;
          });
          // Human checkpoints keep their state (a later human action runs inline).
          const keep = ["in_review", "needs_info", "changes_requested"];
          if (s && !isFinal(s.status) && !keep.includes(s.status)) {
            const message = errorMessage(e).replace(/^NonRetryableError:?\s*/, "");
            // 4xx messages are written for users (e.g. the 402 plan limit) and a failed
            // submission already recorded its reason in lastError: show those verbatim.
            const userFacing =
              s.status === "approved" && s.lastError ? s.lastError : isNonRetryable(e) && message;
            await markFailed(c, ids, userFacing ? new AppError(422, "failed", userFacing) : e);
          }
          return { failed: true };
        }),
      );
      throw e;
    }
  }

  private async redraft(
    step: WorkflowStep,
    ctx: () => ReturnType<typeof createAppContext>,
    ids: { orgId: string; applicationId: string },
    label: string,
    withReviewerNotes = false,
  ) {
    // The round is its own (cached) step so a retried draft step reuses the same version id.
    const round = await step.do(
      `${label}-round`,
      DB_STEP,
      nonRetryable(() => nextDraftRound(ctx(), ids)),
    );
    const draft = await step.do(
      `${label}-draft`,
      LLM_STEP,
      nonRetryable(async () => {
        const c = ctx();
        const r = await stepDraft(c, ids, {
          round,
          reviewerNotes: withReviewerNotes ? await latestReviewerNotes(c, ids) : undefined,
        });
        return { versionId: r.versionId };
      }),
    );
    if (!draft.versionId) return;
    await step.do(
      `${label}-verify`,
      LLM_STEP,
      nonRetryable(async () => {
        const r = await stepVerify(ctx(), ids, draft.versionId as string);
        return { status: r.status };
      }),
    );
    await qualityStep(step, ctx, ids, `${label}-quality`, draft.versionId);
  }
}
