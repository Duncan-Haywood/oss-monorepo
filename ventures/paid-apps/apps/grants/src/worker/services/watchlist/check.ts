// Checking watched pages: polite conditional fetch → normalized text → hash compare → diff against the
// previous R2 snapshot → candidate detection (RSS items directly, otherwise the LLM) → deterministic
// verification → opportunity upserts → re-matching for the affected org(s).
import { and, asc, eq, gt, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { opportunities, orgProfiles } from "../../db/schema";
import type { OpportunitySafetyFlags } from "../../db/schema/opportunities";
import {
  type WatchEventKind,
  type WatchSourceStatus,
  watchEvents,
  watchSources,
} from "../../db/schema/watchlist";
import { notFound } from "../../lib/errors";
import { sha256Hex } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { fromBase64, mimeOf, WebFetchError } from "../../ports/polite-fetcher";
import { extractHtml } from "../imports/html";
import { isSafeUrl } from "../imports/url-safety";
import { requestScoreOrg } from "../matching";
import { notify } from "../notifications";
import { opportunitySafetyFlags, redactContacts } from "../safety";
import {
  type DetectedCandidate,
  detectOpportunities,
  sameSiteLink,
  type VerifiedCandidate,
  verifyCandidate,
} from "./detect";
import { fetchPageConditional } from "./fetch";
import {
  type FeedItem,
  feedItemLine,
  feedToText,
  isFundingItem,
  looksLikeFeed,
  parseFeed,
} from "./rss";
import { diffLines, normalizePageText } from "./text";

export type WatchSourceRow = typeof watchSources.$inferSelect;

export const WATCH_LIMITS = {
  minIntervalHours: 12,
  defaultIntervalHours: 24,
  maxIntervalHours: 24 * 30,
  maxConsecutiveErrors: 5,
  maxBackoffHours: 24 * 7,
  hostSpacingMs: 60_000,
  dueLimit: 25,
  manualCooldownMs: 10 * 60_000,
  /** Added text shorter than this (letters/digits only) is not worth an LLM call. */
  minChangedChars: 12,
} as const;

const HOUR = 3_600_000;

/** Hours until the next attempt after `consecutiveErrors` (≥1) failures: doubles, capped at 7 days. */
export function backoffHours(intervalHours: number, consecutiveErrors: number): number {
  return Math.min(
    intervalHours * 2 ** Math.max(1, consecutiveErrors),
    WATCH_LIMITS.maxBackoffHours,
  );
}

/** R2 key of the last normalized text. Org sources live under the org prefix (tenant rule). */
export function snapshotKey(s: Pick<WatchSourceRow, "id" | "orgId">): string {
  return s.orgId ? `orgs/${s.orgId}/watchlist/${s.id}/latest.txt` : `watchlist/${s.id}/latest.txt`;
}

function pageCopyKey(s: Pick<WatchSourceRow, "id" | "orgId">, hash: string): string {
  return s.orgId
    ? `orgs/${s.orgId}/watchlist/${s.id}/pages/${hash}.txt`
    : `watchlist/${s.id}/pages/${hash}.txt`;
}

export type CheckOutcome =
  | "not_modified"
  | "unchanged"
  | "changed"
  | "blocked_by_robots"
  | "error"
  | "host_busy"
  | "skipped";

export interface CheckResult {
  sourceId: string;
  outcome: CheckOutcome;
  candidates: number;
  dropped: number;
  created: string[];
  updated: string[];
  error?: string;
  retryAfterSeconds?: number;
}

const result = (sourceId: string, outcome: CheckOutcome, extra: Partial<CheckResult> = {}) => ({
  sourceId,
  outcome,
  candidates: 0,
  dropped: 0,
  created: [],
  updated: [],
  ...extra,
});

async function addEvent(
  ctx: AppContext,
  s: WatchSourceRow,
  kind: WatchEventKind,
  summary: string,
  opportunityId: string | null = null,
) {
  await ctx.db.insert(watchEvents).values({
    id: newId("job").replace("job_", "wev_"),
    sourceId: s.id,
    orgId: s.orgId,
    kind,
    opportunityId,
    summary: summary.slice(0, 500),
    createdAt: ctx.now(),
  });
}

interface PageContent {
  text: string; // normalized
  links: string[];
  feedItems: FeedItem[] | null;
  /** Raw HTML (HTML pages only), for the hidden-text injection checks. */
  html?: string;
}

async function toContent(
  ctx: AppContext,
  s: WatchSourceRow,
  res: { url: string; contentType: string; body: string; encoding: "utf8" | "base64" },
): Promise<PageContent> {
  const mime = mimeOf(res.contentType);
  if (s.kind === "rss" || looksLikeFeed(res.body.slice(0, 2000), res.contentType)) {
    const items = parseFeed(res.body, res.url);
    return { text: normalizePageText(feedToText(items)), links: [], feedItems: items };
  }
  if (mime === "application/pdf") {
    const { markdown } = await ctx.converter.toMarkdown({
      name: new URL(res.url).pathname.split("/").pop() || "rfp.pdf",
      mimeType: mime,
      bytes:
        res.encoding === "base64"
          ? fromBase64(res.body)
          : new TextEncoder().encode(res.body).buffer,
    });
    return { text: normalizePageText(markdown), links: [], feedItems: null };
  }
  if (mime === "text/plain")
    return { text: normalizePageText(res.body), links: [], feedItems: null };
  const page = extractHtml(res.body, res.url);
  const links = page.robots.nofollow ? [] : page.links.slice(0, 80);
  const text = links.length
    ? `${page.text}\n\nLinks on this page:\n${links.join("\n")}`
    : page.text;
  return { text: normalizePageText(text), links, feedItems: null, html: res.body };
}

/** Candidates from new feed items: direct when title+link+date are present, else via the LLM. */
async function feedCandidates(
  ctx: AppContext,
  s: WatchSourceRow,
  content: PageContent,
  prev: string | null,
  page: { url: string; text: string; links: string[] },
): Promise<{ direct: VerifiedCandidate[]; viaLlm: DetectedCandidate[] }> {
  const prevLines = new Set(prev ? prev.split("\n") : []);
  const fresh = (content.feedItems ?? []).filter(
    (i) => !prevLines.has(normalizePageText(feedItemLine(i))) && isFundingItem(i),
  );
  const direct: VerifiedCandidate[] = [];
  const rest: FeedItem[] = [];
  for (const item of fresh) {
    if (item.link && item.date) {
      direct.push({
        title: item.title.slice(0, 300),
        deadline: null,
        amountCents: null,
        eligibility: null,
        sourceUrl: sameSiteLink(item.link, page) ?? s.url,
        evidenceQuote: normalizePageText(feedItemLine(item)),
        summary: item.description.slice(0, 1000) || item.title,
      });
    } else {
      rest.push(item);
    }
  }
  const viaLlm = rest.length
    ? await detectOpportunities(ctx, s.orgId, {
        pageUrl: s.url,
        funderName: s.funderName,
        kind: "listing_page",
        changedText: normalizePageText(feedToText(rest)),
        firstCheck: prev === null,
      })
    : [];
  return { direct, viaLlm };
}

/**
 * A candidate from a page flagged as a likely prompt injection: emails and links are removed from
 * the text we store (an injected recipient must not ride along); the page itself stays the source.
 */
function redactCandidate(c: VerifiedCandidate): VerifiedCandidate {
  return {
    ...c,
    title: redactContacts(c.title),
    eligibility: c.eligibility ? redactContacts(c.eligibility) : null,
    evidenceQuote: redactContacts(c.evidenceQuote),
    ...(c.summary !== undefined ? { summary: redactContacts(c.summary) } : {}),
  };
}

async function upsertOpportunity(
  ctx: AppContext,
  s: WatchSourceRow,
  c: VerifiedCandidate,
  rawR2Key: string,
  safetyFlags: OpportunitySafetyFlags | null = null,
): Promise<{ id: string; outcome: "created" | "updated" | "unchanged" }> {
  const sourceId = await sha256Hex(`${s.id}|${c.title}|${c.deadline ?? ""}`);
  const visibility = s.orgId
    ? eq(opportunities.privateToOrgId, s.orgId)
    : isNull(opportunities.privateToOrgId);
  const existing = await ctx.db
    .select({ id: opportunities.id, contentHash: opportunities.contentHash })
    .from(opportunities)
    .where(
      and(eq(opportunities.source, "manual"), eq(opportunities.sourceId, sourceId), visibility),
    )
    .get();
  const now = ctx.now();
  const closeDate = c.deadline ? new Date(c.deadline) : null;
  const fields = {
    sourceUrl: c.sourceUrl,
    funderName: (s.funderName ?? s.label ?? s.host).slice(0, 200),
    title: c.title,
    summary: (c.summary ?? c.evidenceQuote).slice(0, 1000),
    description: `${c.evidenceQuote}\n\n(Found on ${s.url})`,
    eligibilityText: c.eligibility ?? "",
    awardCeilingCents: c.amountCents,
    closeDate,
    status:
      closeDate && closeDate.getTime() < now.getTime() ? ("closed" as const) : ("posted" as const),
  };
  // The flag is part of the hash only when set, so clean pages keep their existing hashes and a
  // page that becomes (or stops being) flagged updates the row.
  const contentHash = await sha256Hex(
    JSON.stringify(safetyFlags ? { ...fields, injectionSuspected: true } : fields),
  );
  if (existing?.contentHash === contentHash) return { id: existing.id, outcome: "unchanged" };
  const values = {
    ...fields,
    contentHash,
    rawR2Key,
    fetchedAt: now,
    keywords: ["watchlist"],
    // needsReview: autopilot never drafts it (matching/autodraft.ts).
    sourceSafetyFlags: safetyFlags,
  };
  if (existing) {
    await ctx.db
      .update(opportunities)
      .set({ ...values, requirements: null })
      .where(and(eq(opportunities.id, existing.id), visibility));
    return { id: existing.id, outcome: "updated" };
  }
  const id = newId("opp");
  await ctx.db.insert(opportunities).values({
    id,
    source: "manual",
    sourceId,
    privateToOrgId: s.orgId,
    submissionMethod: "unknown",
    ...values,
  });
  return { id, outcome: "created" };
}

async function rescore(ctx: AppContext, s: WatchSourceRow, ids: string[]) {
  if (ids.length === 0) return;
  const orgIds = s.orgId
    ? [s.orgId]
    : (await ctx.db.select({ orgId: orgProfiles.orgId }).from(orgProfiles).all()).map(
        (r) => r.orgId,
      );
  for (const orgId of orgIds) {
    try {
      await requestScoreOrg(ctx, orgId, ids);
    } catch (e) {
      ctx.logger.warn("watchlist.rescore_failed", { orgId, error: String(e) });
    }
  }
}

async function recordError(ctx: AppContext, s: WatchSourceRow, message: string) {
  const errors = s.consecutiveErrors + 1;
  const status: WatchSourceStatus =
    errors >= WATCH_LIMITS.maxConsecutiveErrors ? "error" : s.status;
  const now = ctx.now();
  await ctx.db
    .update(watchSources)
    .set({
      status,
      consecutiveErrors: errors,
      lastError: message.slice(0, 300),
      nextCheckAt:
        status === "error"
          ? null
          : new Date(now.getTime() + backoffHours(s.checkIntervalHours, errors) * HOUR),
      updatedAt: now,
    })
    .where(eq(watchSources.id, s.id));
  await addEvent(
    ctx,
    s,
    "error",
    status === "error"
      ? `Checking stopped after ${errors} consecutive errors: ${message}`
      : `Check failed (${errors}/${WATCH_LIMITS.maxConsecutiveErrors}): ${message}`,
  );
}

async function recordSuccess(
  ctx: AppContext,
  s: WatchSourceRow,
  patch: Partial<Pick<WatchSourceRow, "etag" | "lastModified" | "contentHash" | "lastChangedAt">>,
) {
  const now = ctx.now();
  await ctx.db
    .update(watchSources)
    .set({
      ...patch,
      status: "active",
      consecutiveErrors: 0,
      lastError: null,
      nextCheckAt: new Date(now.getTime() + s.checkIntervalHours * HOUR),
      updatedAt: now,
    })
    .where(eq(watchSources.id, s.id));
}

function errorMessage(e: unknown): string {
  if (e instanceof WebFetchError) return `fetch failed (${e.code})`;
  if (e instanceof Error && e.name === "LlmOutputError") return "opportunity detection failed";
  if (e instanceof Error && /budget|cap/i.test(e.message)) return "LLM budget reached";
  return "unexpected error";
}

/**
 * Checks one source now. `manual` = user-requested (allowed for error / blocked sources too, so a
 * fixed site can be re-verified). Never throws for site problems: they are recorded on the source.
 */
export async function checkSource(
  ctx: AppContext,
  sourceId: string,
  opts: { manual?: boolean } = {},
): Promise<CheckResult> {
  const s = await ctx.db.select().from(watchSources).where(eq(watchSources.id, sourceId)).get();
  if (!s) throw notFound("Watch source");
  if (s.status === "paused" || (!opts.manual && s.status !== "active")) {
    return result(s.id, "skipped");
  }
  const now = ctx.now();

  // Per-host politeness: at most one check per host per minute (across all sources and orgs).
  const recent = await ctx.db
    .select({ lastCheckedAt: watchSources.lastCheckedAt })
    .from(watchSources)
    .where(
      and(
        eq(watchSources.host, s.host),
        ne(watchSources.id, s.id),
        gt(watchSources.lastCheckedAt, new Date(now.getTime() - WATCH_LIMITS.hostSpacingMs)),
      ),
    )
    .orderBy(sql`${watchSources.lastCheckedAt} desc`)
    .get();
  if (recent?.lastCheckedAt) {
    const wait = recent.lastCheckedAt.getTime() + WATCH_LIMITS.hostSpacingMs - now.getTime();
    return result(s.id, "host_busy", { retryAfterSeconds: Math.max(1, Math.ceil(wait / 1000)) });
  }

  // Claim the check (optimistic: a concurrent run that already claimed it wins).
  const claim = await ctx.db
    .update(watchSources)
    .set({ lastCheckedAt: now, ...(opts.manual ? { lastManualCheckAt: now } : {}) })
    .where(
      and(
        eq(watchSources.id, s.id),
        s.lastCheckedAt
          ? eq(watchSources.lastCheckedAt, s.lastCheckedAt)
          : isNull(watchSources.lastCheckedAt),
      ),
    )
    .run();
  if (!claim.meta.changes) return result(s.id, "skipped");

  try {
    const res = await fetchPageConditional(ctx, s.url, {
      etag: s.etag,
      lastModified: s.lastModified,
    });
    if (res.kind === "robots_disallowed") {
      await ctx.db
        .update(watchSources)
        .set({
          status: "blocked_by_robots",
          lastError: "robots.txt does not allow automated access to this page",
          nextCheckAt: null,
          updatedAt: ctx.now(),
        })
        .where(eq(watchSources.id, s.id));
      await addEvent(ctx, s, "error", "Stopped: the site's robots.txt disallows this page");
      return result(s.id, "blocked_by_robots");
    }
    if (res.kind === "not_modified") {
      await recordSuccess(ctx, s, {});
      return result(s.id, "not_modified");
    }
    if (res.kind === "http_error") {
      const message = `HTTP ${res.status}`;
      await recordError(ctx, s, message);
      return result(s.id, "error", { error: message });
    }
    if (!isSafeUrl(res.url)) {
      await recordError(ctx, s, "redirected to a disallowed address");
      return result(s.id, "error", { error: "blocked_url" });
    }

    const content = await toContent(ctx, s, res);
    const validators = { etag: res.etag, lastModified: res.lastModified };
    const hash = await sha256Hex(content.text);
    if (hash === s.contentHash) {
      await recordSuccess(ctx, s, validators);
      return result(s.id, "unchanged");
    }

    const key = snapshotKey(s);
    const prevObj = await ctx.env.FILES.get(key);
    const prev = prevObj ? await prevObj.text() : null;
    const diff = diffLines(prev, content.text);
    const page = { url: res.url, text: content.text, links: content.links };

    let raw: DetectedCandidate[] = [];
    let verified: VerifiedCandidate[] = [];
    let directCount = 0;
    if (content.feedItems) {
      const fc = await feedCandidates(ctx, s, content, prev, page);
      verified = fc.direct;
      directCount = fc.direct.length;
      raw = fc.viaLlm;
    } else if (
      diff.added.join("").replace(/[^\p{L}\p{N}]+/gu, "").length >= WATCH_LIMITS.minChangedChars
    ) {
      raw = await detectOpportunities(ctx, s.orgId, {
        pageUrl: res.url,
        funderName: s.funderName,
        kind: s.kind,
        changedText: diff.changedText,
        firstCheck: prev === null,
      });
    }
    let dropped = 0;
    for (const c of raw) {
      const v = verifyCandidate(c, page);
      if (v.ok) verified.push(v.candidate);
      else dropped++;
    }

    // Prompt-injection scan of the whole page (docs/SAFETY.md). A flagged page still yields its
    // opportunities, marked needsReview (no autopilot drafting) and with contacts removed.
    const safetyFlags = opportunitySafetyFlags(
      content.text,
      content.html ?? null,
      ctx.now(),
      "watchlist",
    );
    if (safetyFlags) {
      verified = verified.map(redactCandidate);
      ctx.logger.warn("watchlist.injection_suspected", {
        sourceId: s.id,
        host: s.host,
        score: safetyFlags.injectionScore,
        kinds: [...new Set(safetyFlags.findings.map((f) => f.kind))],
      });
    }

    const created: string[] = [];
    const updated: string[] = [];
    let firstFoundTitle = "";
    if (verified.length) {
      const copyKey = pageCopyKey(s, hash);
      await ctx.env.FILES.put(copyKey, content.text, {
        httpMetadata: { contentType: "text/plain; charset=utf-8" },
      });
      const seen = new Set<string>();
      for (const c of verified) {
        const up = await upsertOpportunity(ctx, s, c, copyKey, safetyFlags);
        if (seen.has(up.id)) continue;
        seen.add(up.id);
        if (up.outcome === "created") {
          created.push(up.id);
          firstFoundTitle ||= c.title;
          await addEvent(ctx, s, "opportunity_found", c.title, up.id);
        } else if (up.outcome === "updated") {
          updated.push(up.id);
        }
      }
    }

    // Snapshot + hash only after detection succeeded, so a failed run retries the same change.
    await ctx.env.FILES.put(key, content.text, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" },
    });
    await recordSuccess(ctx, s, { ...validators, contentHash: hash, lastChangedAt: ctx.now() });
    await addEvent(
      ctx,
      s,
      "changed",
      (prev === null
        ? `First snapshot taken; ${verified.length} opportunit${verified.length === 1 ? "y" : "ies"} found`
        : `${diff.added.length} new/changed line(s), ${diff.removedCount} removed; ${created.length} new opportunit${created.length === 1 ? "y" : "ies"}`) +
        (safetyFlags
          ? ". This page contains text that looks like instructions to an AI: its opportunities need a person's review before any draft."
          : ""),
    );
    await rescore(ctx, s, [...created, ...updated]);
    if (s.orgId && created.length > 0) {
      const one = created.length === 1;
      await notify(ctx, {
        orgId: s.orgId,
        recipients: "editors",
        kind: "watchlist.opportunity_found",
        title: one
          ? `Found on your watchlist: ${firstFoundTitle}`
          : `${created.length} grants found on your watchlist`,
        body: `New on ${s.label ?? s.funderName ?? s.host}.`,
        link: one
          ? `/orgs/${s.orgId}/opportunities/${encodeURIComponent(created[0] ?? "")}`
          : `/orgs/${s.orgId}/sourcing`,
        severity: "info",
        dedupeKey: `watch:${s.id}:${hash}`,
      });
    }
    return result(s.id, "changed", {
      candidates: raw.length + directCount,
      dropped,
      created,
      updated,
    });
  } catch (e) {
    const message = errorMessage(e);
    ctx.logger.warn("watchlist.check_failed", { sourceId: s.id, host: s.host, error: String(e) });
    await recordError(ctx, s, message);
    return result(s.id, "error", { error: message });
  }
}

export interface DueRunSummary {
  picked: number;
  results: CheckResult[];
}

/** Checks up to `limit` due active sources, at most one per host per run (and per minute). */
export async function runDueChecks(
  ctx: AppContext,
  opts: { limit?: number } = {},
): Promise<DueRunSummary> {
  const limit = Math.max(1, Math.min(opts.limit ?? WATCH_LIMITS.dueLimit, WATCH_LIMITS.dueLimit));
  const now = ctx.now();
  const due = await ctx.db
    .select({ id: watchSources.id, host: watchSources.host })
    .from(watchSources)
    .where(
      and(
        eq(watchSources.status, "active"),
        or(isNull(watchSources.nextCheckAt), lte(watchSources.nextCheckAt, now)),
      ),
    )
    .orderBy(sql`${watchSources.nextCheckAt} is not null`, asc(watchSources.nextCheckAt))
    .limit(limit * 4)
    .all();
  const busy = new Set(
    (
      await ctx.db
        .selectDistinct({ host: watchSources.host })
        .from(watchSources)
        .where(gt(watchSources.lastCheckedAt, new Date(now.getTime() - WATCH_LIMITS.hostSpacingMs)))
        .all()
    ).map((r) => r.host),
  );
  const picked: string[] = [];
  for (const d of due) {
    if (picked.length >= limit) break;
    if (busy.has(d.host)) continue;
    busy.add(d.host);
    picked.push(d.id);
  }
  const results: CheckResult[] = [];
  for (const id of picked) {
    try {
      results.push(await checkSource(ctx, id));
    } catch (e) {
      ctx.logger.warn("watchlist.run_due_failed", { sourceId: id, error: String(e) });
    }
  }
  return { picked: picked.length, results };
}
