// Inbound Slack slash command: `/grants update <text>`, plus `connect`, `link`, `unlink`, `help`.
//
// Updates go through the company-updates module (services/updates createQuickUpdate, the same path
// as POST /updates in the app), so a Slack update is an ordinary `update_note` document.
//
// Trust model:
//  1. The request is accepted only with a valid `X-Slack-Signature` for SLACK_SIGNING_SECRET and a
//     timestamp within 5 minutes (crypto.ts). Nothing in the body is read before that.
//  2. Slack's `team_id` then names the workspace; it must be bound to an org (`/grants connect` with
//     a one-time code an admin created in the app). Unknown workspace -> 404.
//  3. The Slack user must be linked to a member of that org (`/grants link` with a one-time code the
//     member created in the app), and that member must still hold editor access, checked each time.
//  4. An update becomes an `update_note` document; extraction only ever creates PROPOSED facts.
//     Nothing is confirmed, approved or submitted from Slack.
import { type MemberRole, ROLE_RANK } from "@shared/enums";
import type { LinkCodeDto } from "@shared/integrations";
import { and, count, eq, gt, isNull } from "drizzle-orm";
import type { AppContext } from "../../context";
import { member, organization, user } from "../../db/schema";
import {
  integrationLinkCodes,
  type LinkCodePurpose,
  slackCommandReceipts,
  slackUserLinks,
  slackWorkspaces,
} from "../../db/schema/integrations";
import { AppError } from "../../lib/errors";
import { audit } from "../privacy/audit";
import { createQuickUpdate, getQuickUpdate, type QuickUpdateResult } from "../updates";
import {
  decryptSecret,
  encryptSecret,
  hashLinkCode,
  newLinkCode,
  normalizeLinkCode,
  verifySlackSignature,
} from "./crypto";
import { integrationTransport } from "./deliver";
import { integrationEnv } from "./env";
import { escapeSlack } from "./format";
import { integrationId } from "./ids";
import { enqueueIntegrationJob } from "./queue";
import { validateSlackResponseUrl } from "./urls";

export const LINK_CODE_TTL_MS = 15 * 60_000;
export const MAX_COMMAND_BODY_BYTES = 16 * 1024;
export const MIN_UPDATE_CHARS = 10;
export const MAX_UPDATE_CHARS = 4_000;
/** Slack accepts posts to a command's response_url for 30 minutes. */
export const RESPONSE_URL_TTL_MS = 30 * 60_000;
export const FOLLOWUP_MAX_ATTEMPTS = 4;

export interface SlackReply {
  response_type: "ephemeral";
  text: string;
}

export interface SlackCommandResult {
  status: 200 | 400 | 401 | 404 | 413 | 503;
  body: SlackReply;
}

const reply = (text: string, status: SlackCommandResult["status"] = 200): SlackCommandResult => ({
  status,
  body: { response_type: "ephemeral", text },
});

const appLink = (ctx: AppContext, path: string, label: string) =>
  `<${(ctx.env.APP_URL ?? "").replace(/\/+$/, "")}${path}|${escapeSlack(label)}>`;

export const HELP_TEXT = [
  "*Grant Autopilot commands*",
  "• `/grants update <what's new>`: share a quick update. We turn it into proposed facts for your team to review in the app.",
  "• `/grants link <code>`: link your Slack account (get a code in Settings → Integrations).",
  "• `/grants connect <code>`: admins connect this Slack workspace to your organization.",
  "• `/grants unlink`: unlink your Slack account.",
  "Approvals always happen in Grant Autopilot, never in Slack.",
].join("\n");

// --- link codes ---------------------------------------------------------------------------------

export async function createLinkCode(
  ctx: AppContext,
  p: { orgId: string; userId: string; purpose: LinkCodePurpose },
): Promise<LinkCodeDto> {
  const code = newLinkCode();
  const now = ctx.now();
  const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);
  // One live code per member and purpose: creating a new one revokes the previous one.
  await ctx.db
    .delete(integrationLinkCodes)
    .where(
      and(
        eq(integrationLinkCodes.orgId, p.orgId),
        eq(integrationLinkCodes.userId, p.userId),
        eq(integrationLinkCodes.purpose, p.purpose),
      ),
    );
  await ctx.db.insert(integrationLinkCodes).values({
    codeHash: await hashLinkCode(normalizeLinkCode(code) as string),
    orgId: p.orgId,
    userId: p.userId,
    purpose: p.purpose,
    expiresAt,
    createdAt: now,
  });
  return { code, expiresAt: expiresAt.toISOString(), command: `/grants ${p.purpose} ${code}` };
}

/** Atomically marks a live code used. Null when unknown, expired, used, or for another purpose. */
async function consumeLinkCode(ctx: AppContext, raw: string, purpose: LinkCodePurpose) {
  const normalized = normalizeLinkCode(raw);
  if (!normalized) return null;
  const now = ctx.now();
  const rows = await ctx.db
    .update(integrationLinkCodes)
    .set({ usedAt: now })
    .where(
      and(
        eq(integrationLinkCodes.codeHash, await hashLinkCode(normalized)),
        eq(integrationLinkCodes.purpose, purpose),
        isNull(integrationLinkCodes.usedAt),
        gt(integrationLinkCodes.expiresAt, now),
      ),
    )
    .returning({ orgId: integrationLinkCodes.orgId, userId: integrationLinkCodes.userId });
  return rows[0] ?? null;
}

async function memberRole(ctx: AppContext, orgId: string, userId: string) {
  const row = await ctx.db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
    .get();
  return row ? ((row.role in ROLE_RANK ? row.role : "viewer") as MemberRole) : null;
}

const atLeast = (role: MemberRole | null, min: MemberRole) =>
  role !== null && ROLE_RANK[role] >= ROLE_RANK[min];

async function orgName(ctx: AppContext, orgId: string) {
  const row = await ctx.db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, orgId))
    .get();
  return row?.name ?? "your organization";
}

async function userName(ctx: AppContext, userId: string) {
  const row = await ctx.db.select({ name: user.name }).from(user).where(eq(user.id, userId)).get();
  return row?.name?.trim() || "a team member";
}

async function upsertLink(
  ctx: AppContext,
  p: { teamId: string; slackUserId: string; orgId: string; userId: string },
) {
  await ctx.db
    .insert(slackUserLinks)
    .values({ ...p, createdAt: ctx.now() })
    .onConflictDoUpdate({
      target: [slackUserLinks.teamId, slackUserLinks.slackUserId],
      set: { orgId: p.orgId, userId: p.userId, createdAt: ctx.now() },
    });
}

// --- the command ----------------------------------------------------------------------------------

export interface SlackCommandRequest {
  rawBody: string;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  requestId?: string;
}

export async function handleSlackCommand(
  ctx: AppContext,
  req: SlackCommandRequest,
): Promise<SlackCommandResult> {
  const secret = integrationEnv(ctx.env).SLACK_SIGNING_SECRET;
  if (!secret) return reply("Slack commands are not configured for this deployment.", 503);
  if (new TextEncoder().encode(req.rawBody).byteLength > MAX_COMMAND_BODY_BYTES) {
    return reply("That message is too long.", 413);
  }
  const verdict = await verifySlackSignature({
    signingSecret: secret,
    timestamp: req.timestamp,
    signature: req.signature,
    rawBody: req.rawBody,
    now: ctx.now(),
  });
  if (verdict !== "ok") {
    ctx.logger.warn("integrations.slack_signature_rejected", { reason: verdict });
    return reply("Request verification failed.", 401);
  }

  const form = new URLSearchParams(req.rawBody);
  const teamId = form.get("team_id")?.trim() ?? "";
  const slackUserId = form.get("user_id")?.trim() ?? "";
  if (!/^[A-Z0-9]{2,32}$/i.test(teamId) || !/^[A-Z0-9]{2,32}$/i.test(slackUserId)) {
    return reply("Malformed Slack request.", 400);
  }
  const text = (form.get("text") ?? "").trim();
  const [first = "", ...restWords] = text.split(/\s+/);
  const sub = first.toLowerCase();
  const rest = text.slice(first.length).trim();

  if (sub === "connect") {
    return connectWorkspace(ctx, {
      teamId,
      slackUserId,
      teamDomain: form.get("team_domain"),
      code: restWords.join(""),
      requestId: req.requestId,
    });
  }

  const workspace = await ctx.db
    .select()
    .from(slackWorkspaces)
    .where(eq(slackWorkspaces.teamId, teamId))
    .get();
  if (!workspace) {
    return reply(
      "This Slack workspace isn't connected to Grant Autopilot. An admin can connect it in Settings → Integrations.",
      404,
    );
  }
  const orgId = workspace.orgId;

  if (sub === "link") {
    return linkUser(ctx, {
      teamId,
      slackUserId,
      orgId,
      code: restWords.join(""),
      requestId: req.requestId,
    });
  }
  if (sub === "unlink") {
    await ctx.db
      .delete(slackUserLinks)
      .where(
        and(
          eq(slackUserLinks.teamId, teamId),
          eq(slackUserLinks.slackUserId, slackUserId),
          eq(slackUserLinks.orgId, orgId),
        ),
      );
    return reply("Your Slack account is no longer linked to Grant Autopilot.");
  }
  if (sub === "update") {
    return postUpdate(ctx, {
      teamId,
      slackUserId,
      orgId,
      text: rest,
      responseUrl: form.get("response_url"),
      requestId: req.requestId,
    });
  }
  return reply(HELP_TEXT);
}

async function connectWorkspace(
  ctx: AppContext,
  p: {
    teamId: string;
    slackUserId: string;
    teamDomain: string | null;
    code: string;
    requestId?: string;
  },
): Promise<SlackCommandResult> {
  const code = await consumeLinkCode(ctx, p.code, "connect");
  if (!code) {
    return reply(
      "That code is not valid or has expired. An admin can create a new one in Settings → Integrations.",
    );
  }
  if (!atLeast(await memberRole(ctx, code.orgId, code.userId), "admin")) {
    return reply("Only an admin of your organization can connect a Slack workspace.");
  }
  const existing = await ctx.db
    .select({ orgId: slackWorkspaces.orgId })
    .from(slackWorkspaces)
    .where(eq(slackWorkspaces.teamId, p.teamId))
    .get();
  if (existing && existing.orgId !== code.orgId) {
    return reply(
      "This Slack workspace is already connected to another Grant Autopilot organization. Disconnect it there first.",
    );
  }
  if (!existing) {
    await ctx.db.insert(slackWorkspaces).values({
      teamId: p.teamId,
      orgId: code.orgId,
      teamDomain: p.teamDomain?.slice(0, 100) ?? null,
      connectedBy: code.userId,
      createdAt: ctx.now(),
    });
  }
  await upsertLink(ctx, {
    teamId: p.teamId,
    slackUserId: p.slackUserId,
    orgId: code.orgId,
    userId: code.userId,
  });
  await audit(ctx, {
    orgId: code.orgId,
    actorType: "user",
    actorId: code.userId,
    action: "integration.slack_connected",
    targetType: "slack_workspace",
    targetId: p.teamId,
    requestId: p.requestId,
  });
  return reply(
    `Connected. This Slack workspace now sends updates to *${escapeSlack(await orgName(ctx, code.orgId))}*, and your Slack account is linked. Teammates can link theirs with \`/grants link <code>\`.`,
  );
}

async function linkUser(
  ctx: AppContext,
  p: { teamId: string; slackUserId: string; orgId: string; code: string; requestId?: string },
): Promise<SlackCommandResult> {
  const code = await consumeLinkCode(ctx, p.code, "link");
  if (!code || code.orgId !== p.orgId) {
    return reply(
      "That code is not valid for this workspace, or it has expired. Create a new one in Settings → Integrations.",
    );
  }
  if (!(await memberRole(ctx, p.orgId, code.userId))) {
    return reply("That code belongs to someone who is no longer a member of the organization.");
  }
  await upsertLink(ctx, {
    teamId: p.teamId,
    slackUserId: p.slackUserId,
    orgId: p.orgId,
    userId: code.userId,
  });
  await audit(ctx, {
    orgId: p.orgId,
    actorType: "user",
    actorId: code.userId,
    action: "integration.slack_user_linked",
    targetType: "slack_workspace",
    targetId: p.teamId,
    requestId: p.requestId,
  });
  return reply(
    `Linked. You can now share updates with \`/grants update <what's new>\` as ${escapeSlack(await userName(ctx, code.userId))}.`,
  );
}

const proposedCount = (u: QuickUpdateResult) =>
  u.facts.filter((f) => f.status === "proposed").length;

function resultText(
  ctx: AppContext,
  orgId: string,
  documentId: string,
  n: number,
  status: string | null,
) {
  if (status === "failed") {
    return `Your update was saved, but we could not read it. ${appLink(ctx, `/orgs/${orgId}/knowledge/documents/${documentId}`, "Open it in Grant Autopilot")}`;
  }
  if (n === 0) {
    return `Got it — your update is saved, but no new facts were found in it. ${appLink(ctx, `/orgs/${orgId}/knowledge/documents/${documentId}`, "Open it in Grant Autopilot")}`;
  }
  return `Got it — ${n} fact${n === 1 ? "" : "s"} proposed for review. ${appLink(ctx, `/orgs/${orgId}/knowledge/facts`, "Review them in Grant Autopilot")}`;
}

async function postUpdate(
  ctx: AppContext,
  p: {
    teamId: string;
    slackUserId: string;
    orgId: string;
    text: string;
    responseUrl: string | null;
    requestId?: string;
  },
): Promise<SlackCommandResult> {
  const link = await ctx.db
    .select({ userId: slackUserLinks.userId })
    .from(slackUserLinks)
    .where(
      and(
        eq(slackUserLinks.teamId, p.teamId),
        eq(slackUserLinks.slackUserId, p.slackUserId),
        eq(slackUserLinks.orgId, p.orgId),
      ),
    )
    .get();
  if (!link) {
    return reply(
      "Link your Slack account first: in Grant Autopilot open Settings → Integrations → *Link my Slack account*, then type `/grants link <code>` here.",
    );
  }
  const role = await memberRole(ctx, p.orgId, link.userId);
  if (!role) {
    await ctx.db
      .delete(slackUserLinks)
      .where(
        and(eq(slackUserLinks.teamId, p.teamId), eq(slackUserLinks.slackUserId, p.slackUserId)),
      );
    return reply("Your Grant Autopilot account is no longer a member of this organization.");
  }
  if (!atLeast(role, "editor")) {
    return reply("Sharing updates needs editor access. Ask an admin of your organization.");
  }
  const text = p.text.replace(/\r\n?/g, "\n").trim();
  if (text.length < MIN_UPDATE_CHARS) {
    return reply(
      "Add a sentence or two after `/grants update`, e.g. `/grants update We served 120 families in October.`",
    );
  }
  if (text.length > MAX_UPDATE_CHARS) {
    return reply(
      `Updates can be up to ${MAX_UPDATE_CHARS} characters. For longer documents, upload them in the app.`,
    );
  }

  let created: QuickUpdateResult;
  try {
    created = await createQuickUpdate(ctx, p.orgId, {
      text,
      inputMode: "text",
      userId: link.userId,
      requestId: p.requestId,
    });
  } catch (e) {
    if (e instanceof AppError && e.status < 500) return reply(e.message);
    throw e;
  }
  await audit(ctx, {
    orgId: p.orgId,
    actorType: "user",
    actorId: link.userId,
    action: "integration.slack_update",
    targetType: "document",
    targetId: created.documentId,
    metadata: { chars: text.length, duplicate: created.duplicate, teamId: p.teamId },
    requestId: p.requestId,
  });

  if (!created.pending) {
    return reply(
      resultText(ctx, p.orgId, created.documentId, proposedCount(created), created.status),
    );
  }

  // Extraction runs on the queue; tell Slack we have it, then report the count via response_url.
  const responseUrl = validateSlackResponseUrl(p.responseUrl);
  if (responseUrl) {
    const id = integrationId("slr");
    const now = ctx.now();
    await ctx.db.insert(slackCommandReceipts).values({
      id,
      orgId: p.orgId,
      documentId: created.documentId,
      responseUrlCipher: await encryptSecret(ctx.env, responseUrl.href, receiptAad(p.orgId, id)),
      expiresAt: new Date(now.getTime() + RESPONSE_URL_TTL_MS),
      createdAt: now,
    });
    await enqueueIntegrationJob(
      ctx,
      { type: "integrations.slack_followup", orgId: p.orgId, receiptId: id },
      { delaySeconds: 20 },
    );
  }
  return reply(
    `Got it — your update is saved. We're reading it now and will propose facts for your team to review. ${appLink(ctx, `/orgs/${p.orgId}/knowledge/facts`, "Open Grant Autopilot")}`,
  );
}

export const receiptAad = (orgId: string, receiptId: string) =>
  `slack-response-url:${orgId}:${receiptId}`;

/** Queue handler: once extraction finished (or we gave up waiting), post the count to Slack. */
export async function slackUpdateFollowup(
  ctx: AppContext,
  job: { type: "integrations.slack_followup"; orgId: string; receiptId: string },
): Promise<void> {
  const where = and(
    eq(slackCommandReceipts.id, job.receiptId),
    eq(slackCommandReceipts.orgId, job.orgId),
  );
  const r = await ctx.db.select().from(slackCommandReceipts).where(where).get();
  if (r?.status !== "waiting") return;
  if (r.expiresAt.getTime() <= ctx.now().getTime()) {
    await ctx.db.update(slackCommandReceipts).set({ status: "expired" }).where(where);
    return;
  }
  let update: QuickUpdateResult | null = null;
  try {
    update = await getQuickUpdate(ctx, job.orgId, r.documentId);
  } catch {
    update = null; // deleted meanwhile
  }
  const attempts = r.attempts + 1;
  if (update?.pending && attempts < FOLLOWUP_MAX_ATTEMPTS) {
    await ctx.db.update(slackCommandReceipts).set({ attempts }).where(where);
    await enqueueIntegrationJob(ctx, job, { delaySeconds: 30 * attempts });
    return;
  }
  // Claim before posting so a duplicate job never replies twice.
  const claimed = await ctx.db
    .update(slackCommandReceipts)
    .set({ status: "replied", attempts })
    .where(and(where, eq(slackCommandReceipts.status, "waiting")))
    .returning({ id: slackCommandReceipts.id });
  if (!claimed.length || !update) return;
  let url: URL | null = null;
  try {
    url = validateSlackResponseUrl(
      await decryptSecret(ctx.env, r.responseUrlCipher, receiptAad(job.orgId, r.id)),
    );
  } catch {
    url = null;
  }
  if (!url) return;
  const outcome = await integrationTransport(ctx)(
    url.href,
    JSON.stringify({
      response_type: "ephemeral",
      replace_original: false,
      text: update.pending
        ? `Your update is saved and still being read. ${appLink(ctx, `/orgs/${job.orgId}/knowledge/documents/${r.documentId}`, "Check it in Grant Autopilot")}`
        : resultText(ctx, job.orgId, r.documentId, proposedCount(update), update.status),
    }),
  );
  if (outcome.kind !== "ok") {
    ctx.logger.warn("integrations.slack_followup_failed", {
      orgId: job.orgId,
      error: outcome.error,
    });
  }
}

// --- management (app side) ----------------------------------------------------------------------

export async function listSlackWorkspaces(ctx: AppContext, orgId: string) {
  const rows = await ctx.db
    .select()
    .from(slackWorkspaces)
    .where(eq(slackWorkspaces.orgId, orgId))
    .all();
  return Promise.all(
    rows.map(async (w) => {
      const linked = await ctx.db
        .select({ n: count() })
        .from(slackUserLinks)
        .where(and(eq(slackUserLinks.teamId, w.teamId), eq(slackUserLinks.orgId, orgId)))
        .get();
      return {
        teamId: w.teamId,
        teamDomain: w.teamDomain,
        connectedAt: w.createdAt.toISOString(),
        linkedUsers: Number(linked?.n ?? 0),
      };
    }),
  );
}

export async function getMySlackLink(ctx: AppContext, orgId: string, userId: string) {
  const row = await ctx.db
    .select({ teamId: slackUserLinks.teamId, createdAt: slackUserLinks.createdAt })
    .from(slackUserLinks)
    .where(and(eq(slackUserLinks.orgId, orgId), eq(slackUserLinks.userId, userId)))
    .get();
  return row ? { teamId: row.teamId, linkedAt: row.createdAt.toISOString() } : null;
}

export async function unlinkMySlack(ctx: AppContext, orgId: string, userId: string) {
  await ctx.db
    .delete(slackUserLinks)
    .where(and(eq(slackUserLinks.orgId, orgId), eq(slackUserLinks.userId, userId)));
}

/** Removes the workspace binding and every user link in it (they cascade). 404 for other orgs. */
export async function disconnectSlackWorkspace(
  ctx: AppContext,
  p: { orgId: string; userId: string; teamId: string; requestId?: string },
) {
  const deleted = await ctx.db
    .delete(slackWorkspaces)
    .where(and(eq(slackWorkspaces.teamId, p.teamId), eq(slackWorkspaces.orgId, p.orgId)))
    .returning({ teamId: slackWorkspaces.teamId });
  if (!deleted.length) return false;
  await ctx.db
    .delete(slackUserLinks)
    .where(and(eq(slackUserLinks.teamId, p.teamId), eq(slackUserLinks.orgId, p.orgId)));
  await audit(ctx, {
    orgId: p.orgId,
    actorType: "user",
    actorId: p.userId,
    action: "integration.slack_disconnected",
    targetType: "slack_workspace",
    targetId: p.teamId,
    requestId: p.requestId,
  });
  return true;
}
