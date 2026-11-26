// Outbound delivery to Slack / Teams webhooks.
//
// sendIntegrationEvent() inserts one `integration_deliveries` row per subscribed destination (unique
// destinationId + eventKey, so a retried step or a repeated notify() creates nothing new) and queues
// `integrations.deliver` with ids only. The job claims the row (pending -> sending) before POSTing,
// so two consumers never send the same row, and it retries only when the provider definitely did
// not accept the message (429, 5xx, or the connection failed). A timeout is NOT retried: the
// provider may have posted it, and the contract is at most once per event.
import { isSafeAppLink } from "@shared/notifications";
import { and, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  type IntegrationDeliveryStatus,
  integrationDeliveries,
  integrationDestinations,
} from "../../db/schema/integrations";
import { isFake } from "../../env";
import { decryptSecret } from "./crypto";
import type { IntegrationEvent } from "./events";
import { type RenderableEvent, renderMessage } from "./format";
import { integrationId } from "./ids";
import { enqueueIntegrationJob } from "./queue";
import { validateWebhookUrl } from "./urls";

export const MAX_DELIVERY_ATTEMPTS = 5;
export const DELIVERY_TIMEOUT_MS = 10_000;

export const destinationAad = (orgId: string, destinationId: string) =>
  `integration-destination:${orgId}:${destinationId}`;

// --- transport ---------------------------------------------------------------------------------

export type PostOutcome =
  | { kind: "ok"; status: number }
  | { kind: "retry"; status: number | null; error: string }
  | { kind: "fail"; status: number | null; error: string };

export type IntegrationTransport = (url: string, body: string) => Promise<PostOutcome>;

/** What the fake transport (FAKE_EXTERNALS / tests) "sent". Bodies are the rendered messages. */
export const integrationOutbox: { url: string; body: unknown }[] = [];

const fakeTransport: IntegrationTransport = async (url, body) => {
  integrationOutbox.push({ url, body: JSON.parse(body) as unknown });
  return { kind: "ok", status: 200 };
};

export function classifyStatus(status: number): PostOutcome {
  if (status >= 200 && status < 300) return { kind: "ok", status };
  if (status === 429 || status >= 500) return { kind: "retry", status, error: `http_${status}` };
  return { kind: "fail", status, error: `http_${status}` };
}

const realTransport: IntegrationTransport = async (url, body) => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      // Never follow redirects: the validated host is the only host we talk to.
      redirect: "manual",
      signal: ac.signal,
    });
    // Drain without reading into logs: provider bodies are not stored or logged.
    await res.body?.cancel().catch(() => undefined);
    if (res.status >= 300 && res.status < 400) {
      return { kind: "fail", status: res.status, error: "redirect_refused" };
    }
    return classifyStatus(res.status);
  } catch (e) {
    if (ac.signal.aborted) return { kind: "fail", status: null, error: "timeout" };
    return { kind: "retry", status: null, error: e instanceof TypeError ? "network" : "error" };
  } finally {
    clearTimeout(timer);
  }
};

let transportOverride: IntegrationTransport | null = null;

/** Tests only: replace the transport (null restores the default). */
export function setIntegrationTransport(t: IntegrationTransport | null) {
  transportOverride = t;
}

export function integrationTransport(ctx: AppContext): IntegrationTransport {
  if (transportOverride) return transportOverride;
  return isFake(ctx.env) ? fakeTransport : realTransport;
}

/** Decrypts, re-validates the stored URL and posts the rendered event. Used by the job and "Test". */
export async function postToDestination(
  ctx: AppContext,
  dest: typeof integrationDestinations.$inferSelect,
  event: RenderableEvent,
): Promise<PostOutcome> {
  let url: URL;
  try {
    const plain = await decryptSecret(ctx.env, dest.urlCipher, destinationAad(dest.orgId, dest.id));
    url = validateWebhookUrl(dest.provider, plain);
  } catch {
    return { kind: "fail", status: null, error: "bad_destination" };
  }
  const message = renderMessage(dest.provider, event, ctx.env.APP_URL ?? "");
  return integrationTransport(ctx)(url.href, JSON.stringify(message));
}

async function recordHealth(
  ctx: AppContext,
  dest: { id: string; orgId: string },
  outcome: PostOutcome,
) {
  const disable = outcome.kind === "fail" && (outcome.status === 404 || outcome.status === 410);
  await ctx.db
    .update(integrationDestinations)
    .set({
      lastStatus: outcome.kind === "ok" ? "ok" : "error",
      lastError: outcome.kind === "ok" ? null : outcome.error,
      lastStatusAt: ctx.now(),
      ...(disable ? { enabled: false } : {}),
    })
    .where(
      and(eq(integrationDestinations.id, dest.id), eq(integrationDestinations.orgId, dest.orgId)),
    );
}

// --- fan-out -----------------------------------------------------------------------------------

/**
 * Sends `event` to every enabled destination of `orgId` subscribed to its kind. Idempotent per
 * (destination, dedupeKey). Never throws: chat delivery must never fail the caller's work.
 */
export async function sendIntegrationEvent(
  ctx: AppContext,
  orgId: string,
  event: IntegrationEvent,
): Promise<{ queued: number }> {
  try {
    const base = `/orgs/${orgId}`;
    const inOrg = event.link === base || event.link.startsWith(`${base}/`);
    if (!isSafeAppLink(event.link) || !inOrg) {
      ctx.logger.warn("integrations.unsafe_link_dropped", { orgId, kind: event.kind });
      return { queued: 0 };
    }
    const dests = await ctx.db
      .select({ id: integrationDestinations.id, events: integrationDestinations.events })
      .from(integrationDestinations)
      .where(
        and(eq(integrationDestinations.orgId, orgId), eq(integrationDestinations.enabled, true)),
      )
      .all();
    const subscribed = dests.filter((d) => d.events.includes(event.kind));
    if (subscribed.length === 0) return { queued: 0 };
    const stored = { kind: event.kind, title: event.title, link: event.link, counts: event.counts };
    let queued = 0;
    for (const d of subscribed) {
      const rows = await ctx.db
        .insert(integrationDeliveries)
        .values({
          id: integrationId("dlv"),
          orgId,
          destinationId: d.id,
          eventKey: event.dedupeKey,
          event: stored,
        })
        .onConflictDoNothing()
        .returning({ id: integrationDeliveries.id });
      const row = rows[0];
      if (!row) continue; // already delivered (or queued) for this event
      queued++;
      await enqueueIntegrationJob(ctx, { type: "integrations.deliver", orgId, deliveryId: row.id });
    }
    return { queued };
  } catch (e) {
    try {
      ctx.logger.warn("integrations.send_failed", { orgId, kind: event.kind, error: String(e) });
    } catch {
      // best effort
    }
    return { queued: 0 };
  }
}

// --- job -----------------------------------------------------------------------------------------

const backoffSeconds = (attempts: number) => Math.min(300, 15 * 2 ** attempts);

async function setDelivery(
  ctx: AppContext,
  orgId: string,
  id: string,
  patch: Partial<typeof integrationDeliveries.$inferInsert>,
) {
  await ctx.db
    .update(integrationDeliveries)
    .set({ ...patch, updatedAt: ctx.now() })
    .where(and(eq(integrationDeliveries.id, id), eq(integrationDeliveries.orgId, orgId)));
}

/** Queue handler for `integrations.deliver`. Safe to run twice: the claim makes it a no-op. */
export async function deliverIntegration(
  ctx: AppContext,
  job: { type: "integrations.deliver"; orgId: string; deliveryId: string },
): Promise<void> {
  const { orgId, deliveryId } = job;
  const claimable: IntegrationDeliveryStatus[] = ["pending"];
  const claimed = await ctx.db
    .update(integrationDeliveries)
    .set({ status: "sending", updatedAt: ctx.now() })
    .where(
      and(
        eq(integrationDeliveries.id, deliveryId),
        eq(integrationDeliveries.orgId, orgId),
        inArray(integrationDeliveries.status, claimable),
      ),
    )
    .returning();
  const delivery = claimed[0];
  if (!delivery) return; // sent, failed, or another consumer holds it

  const dest = await ctx.db
    .select()
    .from(integrationDestinations)
    .where(
      and(
        eq(integrationDestinations.id, delivery.destinationId),
        eq(integrationDestinations.orgId, orgId),
      ),
    )
    .get();
  if (!dest?.enabled || !dest.events.includes(delivery.event.kind)) {
    await setDelivery(ctx, orgId, deliveryId, { status: "skipped" });
    return;
  }

  const outcome = await postToDestination(ctx, dest, delivery.event);
  const attempts = delivery.attempts + 1;
  if (outcome.kind === "ok") {
    await setDelivery(ctx, orgId, deliveryId, {
      status: "sent",
      attempts,
      sentAt: ctx.now(),
      lastError: null,
    });
    await recordHealth(ctx, dest, outcome);
    return;
  }
  ctx.logger.warn("integrations.delivery_failed", {
    orgId,
    deliveryId,
    provider: dest.provider,
    error: outcome.error,
    attempts,
  });
  if (outcome.kind === "retry" && attempts < MAX_DELIVERY_ATTEMPTS) {
    await setDelivery(ctx, orgId, deliveryId, {
      status: "pending",
      attempts,
      lastError: outcome.error,
    });
    await enqueueIntegrationJob(ctx, job, { delaySeconds: backoffSeconds(attempts) });
    return;
  }
  await setDelivery(ctx, orgId, deliveryId, {
    status: "failed",
    attempts,
    lastError: outcome.error,
  });
  await recordHealth(ctx, dest, outcome);
}
