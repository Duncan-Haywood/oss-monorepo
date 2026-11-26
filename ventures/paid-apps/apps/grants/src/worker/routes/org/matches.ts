// OWNER: matching agent — /api/orgs/:orgId/matches (ranked matches, triage inbox, rescore,
// shortlist/dismiss one or in bulk)

import { MATCH_STATUSES, type MatchStatus } from "@shared/enums";
import {
  BULK_MATCH_STATUSES,
  DISMISS_REASONS,
  type DismissReason,
  MAX_BULK_MATCH_IDS,
  MAX_DISMISS_NOTE_CHARS,
} from "@shared/match-triage";
import { Hono } from "hono";
import { z } from "zod";
import { badRequest } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  bulkUpdateMatchStatus,
  INBOX_DEFAULT_LIMIT,
  INBOX_MAX_LIMIT,
  listInbox,
  listMatches,
  requestScoreOrg,
  USER_MATCH_STATUSES,
  updateMatchStatus,
} from "../../services/matching";
import type { AppEnv } from "../../types";

const routes = new Hono<AppEnv>();

const listQuery = z.object({
  /** One status, a comma-separated list, or "all". Default: everything except dismissed. */
  status: z.string().optional(),
  minFit: z.coerce.number().int().min(0).max(100).optional(),
});

function parseStatuses(raw: string | undefined): MatchStatus[] | undefined {
  if (!raw) return undefined;
  if (raw === "all") return [...MATCH_STATUSES];
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const bad = parts.filter((p) => !(MATCH_STATUSES as readonly string[]).includes(p));
  if (bad.length) throw badRequest(`Unknown match status: ${bad.join(", ")}`);
  return parts as MatchStatus[];
}

routes.get("/", validate("query", listQuery), async (c) => {
  const q = c.req.valid("query");
  const items = await listMatches(c.var.ctx, c.var.tenant.orgId, {
    statuses: parseStatuses(q.status),
    minFit: q.minFit,
  });
  return c.json({ items });
});

const inboxQuery = z.object({
  /** 0 returns only `total` (the sidebar badge). */
  limit: z.coerce.number().int().min(0).max(INBOX_MAX_LIMIT).default(INBOX_DEFAULT_LIMIT),
});

/** Status "new", highest expected value first, with the stored eligibility check when available. */
routes.get("/inbox", validate("query", inboxQuery), async (c) => {
  const { limit } = c.req.valid("query");
  return c.json(await listInbox(c.var.ctx, c.var.tenant.orgId, { limit }));
});

const rescoreBody = z
  .object({ opportunityIds: z.array(z.string().min(1).max(64)).max(50).optional() })
  .optional();

routes.post("/rescore", requireRole("editor"), async (c) => {
  const raw = await c.req.json().catch(() => undefined);
  const body = rescoreBody.parse(raw ?? undefined);
  await requestScoreOrg(c.var.ctx, c.var.tenant.orgId, body?.opportunityIds);
  return c.json({ queued: true }, 202);
});

const dismissal = {
  dismissReason: z.enum(DISMISS_REASONS).optional(),
  dismissNote: z.string().max(MAX_DISMISS_NOTE_CHARS).optional(),
};
/** undefined = "keep the stored reason" (e.g. re-dismissing without picking one). */
const dismissalOf = (reason?: DismissReason, note?: string) =>
  reason === undefined && note === undefined ? undefined : { reason, note };
const onlyWhenDismissed = (b: { status: string; dismissReason?: string; dismissNote?: string }) =>
  b.status === "dismissed" || (b.dismissReason === undefined && b.dismissNote === undefined);
const onlyWhenDismissedError = {
  message: 'dismissReason and dismissNote are only allowed with status "dismissed"',
  path: ["dismissReason"],
};

const patchBody = z
  .object({ status: z.enum(USER_MATCH_STATUSES), ...dismissal })
  .refine(onlyWhenDismissed, onlyWhenDismissedError);

routes.patch("/:id", requireRole("editor"), validate("json", patchBody), async (c) => {
  const { status, dismissReason, dismissNote } = c.req.valid("json");
  const tenant = c.var.tenant;
  const match = await updateMatchStatus(
    c.var.ctx,
    tenant.orgId,
    c.req.param("id"),
    status,
    { userId: tenant.userId, requestId: c.var.requestId },
    dismissalOf(dismissReason, dismissNote),
  );
  return c.json(match);
});

const bulkBody = z
  .object({
    ids: z.array(z.string().min(1).max(64)).min(1).max(MAX_BULK_MATCH_IDS),
    status: z.enum(BULK_MATCH_STATUSES),
    ...dismissal,
  })
  .refine(onlyWhenDismissed, onlyWhenDismissedError);

/** Shortlist or dismiss many matches; drafting/applied ones are skipped, other orgs' ids not found. */
routes.post("/bulk", requireRole("editor"), validate("json", bulkBody), async (c) => {
  const { ids, status, dismissReason, dismissNote } = c.req.valid("json");
  const tenant = c.var.tenant;
  const result = await bulkUpdateMatchStatus(
    c.var.ctx,
    tenant.orgId,
    ids,
    status,
    { userId: tenant.userId, requestId: c.var.requestId },
    dismissalOf(dismissReason, dismissNote),
  );
  return c.json(result);
});

export default routes;
