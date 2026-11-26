// Destination management (admins): add / list / update / remove / test. Every query is scoped by
// the tenant's orgId. The webhook URL is validated, encrypted, and never returned or logged.
import {
  type DestinationTestResultDto,
  INTEGRATION_EVENTS,
  INTEGRATION_PROVIDERS,
  type IntegrationDestinationDto,
  MAX_DESTINATION_LABEL,
  MAX_DESTINATIONS_PER_ORG,
} from "@shared/integrations";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../context";
import { integrationDestinations } from "../../db/schema/integrations";
import { AppError, badRequest, notFound } from "../../lib/errors";
import { audit } from "../privacy/audit";
import { encryptSecret } from "./crypto";
import { destinationAad, postToDestination } from "./deliver";
import { integrationId } from "./ids";
import { redactWebhookUrl, validateWebhookUrl, WebhookUrlError } from "./urls";

type DestinationRow = typeof integrationDestinations.$inferSelect;

const events = z
  .array(z.enum(INTEGRATION_EVENTS))
  .max(INTEGRATION_EVENTS.length)
  .transform((e) => [...new Set(e)]);

export const createDestinationSchema = z.object({
  provider: z.enum(INTEGRATION_PROVIDERS),
  label: z.string().trim().min(1).max(MAX_DESTINATION_LABEL),
  url: z.string().min(1).max(2048),
  events,
});

export const updateDestinationSchema = z
  .object({
    label: z.string().trim().min(1).max(MAX_DESTINATION_LABEL).optional(),
    events: events.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export function toDestinationDto(r: DestinationRow): IntegrationDestinationDto {
  return {
    id: r.id,
    provider: r.provider,
    label: r.label,
    urlHint: r.urlHint,
    events: r.events,
    enabled: r.enabled,
    lastStatus: r.lastStatus ?? null,
    lastError: r.lastError ?? null,
    lastStatusAt: r.lastStatusAt ? r.lastStatusAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

export interface Actor {
  orgId: string;
  userId: string;
  requestId?: string;
}

const byId = (orgId: string, id: string) =>
  and(eq(integrationDestinations.id, id), eq(integrationDestinations.orgId, orgId));

export async function listDestinations(ctx: AppContext, orgId: string) {
  const rows = await ctx.db
    .select()
    .from(integrationDestinations)
    .where(eq(integrationDestinations.orgId, orgId))
    .orderBy(integrationDestinations.createdAt)
    .all();
  return rows.map(toDestinationDto);
}

async function mustGet(ctx: AppContext, orgId: string, id: string): Promise<DestinationRow> {
  const row = await ctx.db.select().from(integrationDestinations).where(byId(orgId, id)).get();
  if (!row) throw notFound("Destination");
  return row;
}

export async function createDestination(
  ctx: AppContext,
  actor: Actor,
  input: z.infer<typeof createDestinationSchema>,
): Promise<IntegrationDestinationDto> {
  let url: URL;
  try {
    url = validateWebhookUrl(input.provider, input.url);
  } catch (e) {
    if (e instanceof WebhookUrlError) {
      throw new AppError(400, "invalid_webhook_url", e.message, { reason: e.reason });
    }
    throw e;
  }
  const existing = await ctx.db
    .select({ n: count() })
    .from(integrationDestinations)
    .where(eq(integrationDestinations.orgId, actor.orgId))
    .get();
  if (Number(existing?.n ?? 0) >= MAX_DESTINATIONS_PER_ORG) {
    throw badRequest(`You can add up to ${MAX_DESTINATIONS_PER_ORG} destinations`);
  }
  const id = integrationId("itg");
  const now = ctx.now();
  await ctx.db.insert(integrationDestinations).values({
    id,
    orgId: actor.orgId,
    provider: input.provider,
    label: input.label,
    urlCipher: await encryptSecret(ctx.env, url.href, destinationAad(actor.orgId, id)),
    urlHint: redactWebhookUrl(url),
    events: input.events,
    enabled: true,
    createdBy: actor.userId,
    createdAt: now,
    updatedAt: now,
  });
  await audit(ctx, {
    orgId: actor.orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "integration.destination_added",
    targetType: "integration_destination",
    targetId: id,
    metadata: { provider: input.provider, events: input.events },
    requestId: actor.requestId,
  });
  return toDestinationDto(await mustGet(ctx, actor.orgId, id));
}

export async function updateDestination(
  ctx: AppContext,
  actor: Actor,
  id: string,
  patch: z.infer<typeof updateDestinationSchema>,
): Promise<IntegrationDestinationDto> {
  await mustGet(ctx, actor.orgId, id);
  await ctx.db
    .update(integrationDestinations)
    .set({ ...patch, updatedAt: ctx.now() })
    .where(byId(actor.orgId, id));
  await audit(ctx, {
    orgId: actor.orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "integration.destination_updated",
    targetType: "integration_destination",
    targetId: id,
    metadata: { fields: Object.keys(patch), events: patch.events, enabled: patch.enabled },
    requestId: actor.requestId,
  });
  return toDestinationDto(await mustGet(ctx, actor.orgId, id));
}

export async function deleteDestination(ctx: AppContext, actor: Actor, id: string) {
  const row = await mustGet(ctx, actor.orgId, id);
  // Deliveries cascade with the destination.
  await ctx.db.delete(integrationDestinations).where(byId(actor.orgId, id));
  await audit(ctx, {
    orgId: actor.orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "integration.destination_removed",
    targetType: "integration_destination",
    targetId: id,
    metadata: { provider: row.provider },
    requestId: actor.requestId,
  });
}

/** Sends a fixed test message right away (not queued) and reports the provider's status code. */
export async function testDestination(
  ctx: AppContext,
  actor: Actor,
  id: string,
): Promise<DestinationTestResultDto> {
  const row = await mustGet(ctx, actor.orgId, id);
  const outcome = await postToDestination(ctx, row, {
    kind: "test",
    title: "Test message",
    link: `/orgs/${actor.orgId}/settings/integrations`,
  });
  const ok = outcome.kind === "ok";
  await ctx.db
    .update(integrationDestinations)
    .set({
      lastStatus: ok ? "ok" : "error",
      lastError: ok ? null : outcome.error,
      lastStatusAt: ctx.now(),
    })
    .where(byId(actor.orgId, id));
  return { ok, status: outcome.status, error: ok ? null : outcome.error };
}
