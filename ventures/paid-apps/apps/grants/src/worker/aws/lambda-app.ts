// Grant Autopilot on AWS Lambda through the SaaS starter's app module (docs/AWS.md).
//
// The starter bundles a Workers-style module per product (runtime/build.mjs product grants <this
// file> migrations-pg) and calls `fetch(request, env, ctx)` for API Gateway requests and
// `scheduled({ cron }, env, ctx)` for EventBridge Scheduler. This file adapts its `env` to grants'
// (./env.ts) and runs the SAME Hono app and cron dispatcher as the Worker (src/worker/index.ts),
// plus the two jobs the Worker gets from Cloudflare for free: draining the JOBS queue and
// applying Paddle entitlements. The Worker path is untouched: both run until cutover.
import { readFile } from "node:fs/promises";
import { normalizeBasePath, stripBase } from "@shared/base-path";
import { createApp } from "../app";
import { type AppContext, createAppContext } from "../context";
import type { Env } from "../env";
import { createFetchHandler } from "../http";
import { handleQueueBatch } from "../queues/consumer";
import type { JobMessage } from "../queues/messages";
import { handleScheduled } from "../scheduled";
import { syncPlatformEntitlements } from "../services/billing/entitlement-sync";
import { runPipelineInline } from "../services/pipeline";
import { loadKeyOf, runLoadScript } from "./cutover-load";
import { buildGrantsEnv, type StarterEnv } from "./env";
import { drainJobs, type MessageBatchLike } from "./pg-queue";
import { isPipelineJob } from "./queued-pipeline";
import { reembedMissingVectors } from "./reembed";
import { AWS_SCHEDULES, workersCronFor } from "./schedules";
import {
  type AssetConfig,
  FALLBACK_CONFIG,
  parseHeadersFile,
  parseRedirectsFile,
  serveAsset,
} from "./static-assets";

const fetchHandler = createFetchHandler(createApp());

type Ctx = Pick<ExecutionContext, "waitUntil"> & Partial<ExecutionContext>;

function execCtx(ctx: Ctx): ExecutionContext {
  return { passThroughOnException() {}, props: {}, ...ctx } as ExecutionContext;
}

/**
 * The client IP as API Gateway saw it. Clients can send any `cf-connecting-ip` or
 * X-Forwarded-For; API Gateway appends the real peer address last, so only that entry is
 * trusted. Rate limits, consent records and auth use cf-connecting-ip (as on Cloudflare).
 */
export function withTrustedClientIp(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.delete("cf-connecting-ip");
  const xff = headers.get("x-forwarded-for");
  const last = xff
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
  if (last) headers.set("cf-connecting-ip", last);
  return new Request(request, { headers });
}

const processEnv = (): Record<string, string | undefined> =>
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

/** Built SPA files sit beside the bundle in ./assets (scripts/aws/build-lambda.sh). */
const ASSETS_DIR = new URL("./assets/", import.meta.url);
const readAsset = async (path: string): Promise<Uint8Array | null> => {
  try {
    return await readFile(new URL(path, ASSETS_DIR));
  } catch {
    return null;
  }
};

let assetConfig: Promise<AssetConfig> | undefined;
const loadAssetConfig = () => {
  assetConfig ??= Promise.all([readAsset("_headers"), readAsset("_redirects")]).then(([h, r]) => ({
    headers: h ? parseHeadersFile(new TextDecoder().decode(h)) : FALLBACK_CONFIG.headers,
    redirects: r ? parseRedirectsFile(new TextDecoder().decode(r)) : [],
  }));
  return assetConfig;
};

/**
 * Queue consumer on AWS: pipeline jobs (queued-pipeline.ts) run here, never retried; everything
 * else goes to the Worker's own consumer (queues/consumer.ts) unchanged.
 */
export async function consumeJobs(
  batch: MessageBatchLike<unknown>,
  env: Env,
  appCtx: AppContext,
  exec: ExecutionContext,
): Promise<void> {
  const rest = batch.messages.filter((m) => !isPipelineJob(m.body));
  for (const m of batch.messages) {
    if (!isPipelineJob(m.body)) continue;
    try {
      await runPipelineInline(appCtx, m.body.params);
    } catch (e) {
      appCtx.logger.error("pipeline.aws_job_failed", {
        applicationId: m.body.params.applicationId,
        error: String(e),
      });
    }
    m.ack();
  }
  if (rest.length) {
    await handleQueueBatch(
      { ...batch, messages: rest } as unknown as MessageBatch<JobMessage>,
      env,
      exec,
    );
  }
}

export default {
  async fetch(request: Request, starter: StarterEnv, ctx: Ctx): Promise<Response> {
    const env = await buildGrantsEnv(starter, processEnv());
    const req = withTrustedClientIp(request);
    const url = new URL(req.url);
    const base = normalizeBasePath(env.BASE_PATH);
    const inApp = stripBase(base, url.pathname);
    if (
      inApp !== null &&
      !inApp.startsWith("/api/") &&
      (req.method === "GET" || req.method === "HEAD")
    ) {
      const asset = await serveAsset(inApp, base, readAsset, await loadAssetConfig());
      if (asset) return asset;
    }
    return fetchHandler(req, env, execCtx(ctx));
  },

  async scheduled(
    controller: { cron: string; scheduledTime?: number },
    starter: StarterEnv,
    ctx: Ctx,
  ) {
    const env = await buildGrantsEnv(starter, processEnv());
    const scheduledTime = controller.scheduledTime ?? Date.now();
    if (controller.cron === AWS_SCHEDULES.jobs) {
      const appCtx = createAppContext(env, { executionCtx: ctx });
      const drained = await drainJobs<unknown>(starter.pg, (batch) =>
        consumeJobs(batch, env, appCtx, execCtx(ctx)),
      );
      const billing = await syncPlatformEntitlements(appCtx).catch((e: unknown) => {
        appCtx.logger.error("billing.entitlement_sync_failed", { error: String(e) });
        return null;
      });
      const reembedded = await reembedMissingVectors(
        starter.pg,
        appCtx.embedder,
        appCtx.vectors,
      ).catch((e: unknown) => {
        appCtx.logger.warn("vectors.reembed_failed", { error: String(e) });
        return 0;
      });
      appCtx.logger.info("aws.jobs_tick", {
        ...drained,
        reembedded,
        billing: billing?.outcomes ?? null,
      });
      return;
    }
    const loadKey = loadKeyOf(controller.cron);
    if (loadKey) {
      const obj = await env.FILES.get(loadKey);
      if (!obj) throw new Error(`no load script at ${loadKey}`);
      await runLoadScript(starter.pg, await obj.text());
      await env.FILES.delete(loadKey);
      console.log(JSON.stringify({ msg: "aws.d1_load_done", key: loadKey }));
      return;
    }
    const cron = workersCronFor(controller.cron);
    if (!cron) throw new Error(`unknown schedule ${controller.cron}`);
    await handleScheduled(
      { cron, scheduledTime, noRetry() {} } as ScheduledController,
      env,
      execCtx(ctx),
    );
  },
};
