// Imports: grant page URL / RFP file -> private opportunity; org website crawl -> website_page documents.
import type { OpportunitySource } from "@shared/enums";
import { and, desc, eq, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import { consentRecords, documents, opportunities, orgSettings } from "../../db/schema";
import type { OpportunitySafetyFlags } from "../../db/schema/opportunities";
import { AppError, badRequest, notFound } from "../../lib/errors";
import { sha256Hex } from "../../lib/hash";
import { newId } from "../../lib/ids";
import {
  fromBase64,
  mimeOf,
  type PoliteFetchResult,
  WebFetchError,
} from "../../ports/polite-fetcher";
import { enqueue } from "../../queues/enqueue";
import { contentMismatchReason } from "../ingestion/files";
import { audit } from "../privacy/audit";
import { isInjectedContact, opportunitySafetyFlags } from "../safety";
import { enqueueBestEffort, storeWebsitePage } from "./deps";
import { type ExtractedOpportunity, extractOpportunity } from "./extract";
import { extractHtml, stripHiddenElements } from "./html";
import { assertSafeUrl, isSafeUrl, UnsafeUrlError } from "./url-safety";

export type OpportunityRow = typeof opportunities.$inferSelect;

export const MAX_RFP_BYTES = 20 * 1024 * 1024;
export const MAX_CRAWL_PAGES = 25;
const MIN_SOURCE_CHARS = 80;
const MIN_PAGE_CHARS = 120;

export const unprocessable = (code: string, message: string) => new AppError(422, code, message);

// ---------------------------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------------------------

/** Parses + SSRF-checks a user URL, mapping failures to 400. */
export function parsePublicUrl(raw: string): URL {
  try {
    return assertSafeUrl(raw);
  } catch (e) {
    if (e instanceof UnsafeUrlError) throw badRequest(e.message, { reason: e.reason });
    throw e;
  }
}

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref|_ga)$/i;

/** Canonical form for dedupe: no fragment, no tracking params, sorted query. */
export function normalizeUrl(input: string | URL): string {
  const u = new URL(typeof input === "string" ? input : input.href);
  u.hash = "";
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.test(k))
    .sort(([a], [b]) => a.localeCompare(b));
  u.search = "";
  for (const [k, v] of params) u.searchParams.append(k, v);
  return u.href;
}

const MULTI_PART_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "org.au",
  "co.nz",
  "org.nz",
  "co.jp",
  "com.br",
  "co.za",
  "com.mx",
  "nm.us",
  "k12.nm.us",
]);

/** Approximate registrable domain (eTLD+1) without a full public-suffix list. */
export function registrableDomain(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  for (const n of [3, 2]) {
    const suffix = labels.slice(-n).join(".");
    if (MULTI_PART_SUFFIXES.has(suffix)) return labels.slice(-(n + 1)).join(".");
  }
  return labels.slice(-2).join(".");
}

const NON_HTML_EXT =
  /\.(pdf|docx?|xlsx?|pptx?|zip|gz|tar|rar|7z|jpe?g|png|gif|webp|svg|ico|bmp|tiff?|mp[34]|m4a|mov|avi|wav|ogg|webm|css|js|json|xml|rss|atom|txt|csv|ics|exe|dmg|apk|woff2?|ttf|eot)$/i;

export function looksNonHtml(url: string): boolean {
  try {
    return NON_HTML_EXT.test(new URL(url).pathname);
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------------------------
// Source loading
// ---------------------------------------------------------------------------------------------

interface LoadedSource {
  text: string;
  title: string | null;
  finalUrl: string;
  mimeType: string;
  raw: ArrayBuffer;
  /** Raw HTML (HTML pages only), for the hidden-text injection checks. */
  html?: string;
  /** `text` without hidden elements (HTML pages only; otherwise the same as `text`). */
  visibleText?: string;
}

function webError(e: unknown): never {
  if (e instanceof WebFetchError) {
    if (e.code === "blocked_url") throw badRequest(e.message);
    if (e.code === "unsupported_content_type") {
      throw unprocessable("unsupported_content", "That URL is not a web page, text file or PDF");
    }
    if (e.code === "too_large") throw unprocessable("too_large", "That page is larger than 3 MB");
    throw unprocessable("fetch_failed", `Could not fetch the page (${e.code})`);
  }
  throw e;
}

async function loadUrl(ctx: AppContext, url: URL): Promise<LoadedSource> {
  let res: PoliteFetchResult | null;
  try {
    res = await ctx.web.fetchPage(url.href);
  } catch (e) {
    webError(e);
  }
  if (!res) {
    throw unprocessable(
      "robots_disallowed",
      "This site's robots.txt does not allow automated access to that page. Download the RFP and upload it instead.",
    );
  }
  if (res.status >= 400) {
    throw unprocessable("fetch_failed", `The page returned HTTP ${res.status}`);
  }
  const finalUrl = res.url || url.href;
  // Redirects must not land somewhere unsafe (the polite fetcher checks each hop; fakes do not).
  if (!isSafeUrl(finalUrl)) throw badRequest("The page redirected to a disallowed address");
  const mime = mimeOf(res.contentType) || "text/html";
  const raw =
    res.encoding === "base64" ? fromBase64(res.body) : new TextEncoder().encode(res.body).buffer;

  if (mime === "application/pdf") {
    const { markdown } = await ctx.converter.toMarkdown({
      name: url.pathname.split("/").pop() || "rfp.pdf",
      mimeType: mime,
      bytes: raw,
    });
    return { text: markdown.trim(), title: null, finalUrl, mimeType: mime, raw };
  }
  if (mime === "text/plain") {
    return { text: res.body.trim(), title: null, finalUrl, mimeType: mime, raw };
  }
  const page = extractHtml(res.body, finalUrl);
  const linkList = page.links.slice(0, 60).join("\n");
  const text = linkList ? `${page.text}\n\nLinks on this page:\n${linkList}` : page.text;
  const visible = extractHtml(stripHiddenElements(res.body), finalUrl);
  const visibleLinks = visible.links.slice(0, 60).join("\n");
  const visibleText = visibleLinks
    ? `${visible.text}\n\nLinks on this page:\n${visibleLinks}`
    : visible.text;
  return {
    text,
    title: page.title,
    finalUrl,
    mimeType: "text/html",
    raw,
    html: res.body,
    visibleText,
  };
}

const RFP_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
};

export function rfpMimeType(name: string, declared: string): string | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const byExt = RFP_TYPES[ext];
  if (byExt) return byExt;
  const d = mimeOf(declared);
  return Object.values(RFP_TYPES).includes(d) ? d : null;
}

// ---------------------------------------------------------------------------------------------
// Opportunity persistence
// ---------------------------------------------------------------------------------------------

function toDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Prompt-injection guard for an imported page / RFP (docs/SAFETY.md). Scans the source (with the
 * raw HTML, for hidden text) and drops a submission email / URL that is not visibly on the page or
 * appears only inside injected instructions. A flagged source is marked needsReview (no autopilot
 * drafting); kept addresses stay unverified until a person confirms them.
 */
export function guardImportedSource(
  extracted: ExtractedOpportunity,
  source: { text: string; html?: string | null; visibleText?: string },
  now: Date,
): { extracted: ExtractedOpportunity; flags: OpportunitySafetyFlags | null; dropped: string[] } {
  const flags = opportunitySafetyFlags(source.text, source.html ?? null, now, "imports");
  const visible = source.visibleText ?? source.text;
  const dropped: string[] = [];
  const keep = (v: string | null): string | null => {
    if (!v) return v;
    if (isInjectedContact(v, visible)) {
      dropped.push(v);
      return null;
    }
    return v;
  };
  const out: ExtractedOpportunity = {
    ...extracted,
    submissionEmail: keep(extracted.submissionEmail),
    submissionUrl: keep(extracted.submissionUrl),
  };
  if (flags) flags.droppedContacts = dropped;
  return { extracted: out, flags, dropped };
}

async function saveOpportunity(
  ctx: AppContext,
  input: {
    orgId: string;
    userId: string | null;
    source: Extract<OpportunitySource, "url_import" | "rfp_upload">;
    sourceId: string;
    sourceUrl: string | null;
    fallbackTitle: string;
    extracted: ExtractedOpportunity;
    sourceText: string;
    /** Prompt-injection warning on the source (null = clean). Blocks autopilot drafting. */
    safetyFlags: OpportunitySafetyFlags | null;
    raw: { bytes: ArrayBuffer; mimeType: string };
    existingId?: string;
  },
): Promise<OpportunityRow> {
  const { orgId, extracted: x } = input;
  const now = ctx.now();
  const existing = await ctx.db
    .select({
      id: opportunities.id,
      submissionEmail: opportunities.submissionEmail,
      submissionEmailVerified: opportunities.submissionEmailVerified,
    })
    .from(opportunities)
    .where(
      input.existingId
        ? and(eq(opportunities.id, input.existingId), eq(opportunities.privateToOrgId, orgId))
        : and(
            eq(opportunities.source, input.source),
            eq(opportunities.sourceId, input.sourceId),
            eq(opportunities.privateToOrgId, orgId),
          ),
    )
    .get();
  if (input.existingId && !existing) throw notFound("Opportunity");
  const id = existing?.id ?? newId("opp");

  const rawR2Key =
    input.source === "rfp_upload" ? `orgs/${orgId}/rfps/${id}` : `orgs/${orgId}/imports/${id}`;
  await ctx.env.FILES.put(rawR2Key, input.raw.bytes, {
    httpMetadata: { contentType: input.raw.mimeType },
  });

  const closeDate = toDate(x.closeDate);
  const values = {
    sourceUrl: input.sourceUrl,
    funderName: x.funderName ?? "Unknown funder",
    title: (x.title ?? input.fallbackTitle).slice(0, 300),
    opportunityNumber: x.opportunityNumber,
    summary: x.summary ?? "",
    description: x.description ?? "",
    eligibilityText: x.eligibilityText ?? "",
    applicantTypes: x.applicantTypes,
    geographicScope: x.geographicScope,
    awardFloorCents: x.awardFloorCents,
    awardCeilingCents: x.awardCeilingCents,
    totalFundingCents: x.totalFundingCents,
    openDate: toDate(x.openDate),
    closeDate,
    status:
      closeDate && closeDate.getTime() < now.getTime() ? ("closed" as const) : ("posted" as const),
    requirements: x.requirements,
    submissionMethod: x.submissionMethod ?? "unknown",
    submissionEmail: x.submissionEmail,
    // Extracted from untrusted page/RFP text: unverified until a person confirms it. A confirmation
    // survives a re-import only if the address is unchanged.
    submissionEmailVerified:
      !!existing?.submissionEmailVerified &&
      !!x.submissionEmail &&
      existing.submissionEmail?.toLowerCase() === x.submissionEmail.toLowerCase(),
    submissionUrl: x.submissionUrl,
    rawR2Key,
    // Recomputed on every (re-)import: a clean re-import clears it.
    sourceSafetyFlags: input.safetyFlags,
    contentHash: await sha256Hex(input.sourceText),
    fetchedAt: now,
  };

  if (existing) {
    await ctx.db
      .update(opportunities)
      .set(values)
      .where(and(eq(opportunities.id, id), eq(opportunities.privateToOrgId, orgId)));
  } else {
    await ctx.db.insert(opportunities).values({
      id,
      source: input.source,
      sourceId: input.sourceId,
      privateToOrgId: orgId,
      ...values,
    });
  }
  const row = await ctx.db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.id, id), eq(opportunities.privateToOrgId, orgId)))
    .get();
  if (!row) throw new Error("opportunity save failed");

  await audit(ctx, {
    orgId,
    actorType: input.userId ? "user" : "system",
    actorId: input.userId,
    action: existing ? "opportunity.reimported" : "opportunity.imported",
    targetType: "opportunity",
    targetId: id,
    metadata: {
      source: input.source,
      host: input.sourceUrl ? new URL(input.sourceUrl).host : null,
      requirementsComplete: x.requirements.complete,
      injectionSuspected: !!input.safetyFlags,
    },
  });
  if (input.safetyFlags) {
    // Score and kinds only: excerpts and dropped contacts stay on the row for the reviewer.
    ctx.logger.warn("imports.injection_suspected", {
      orgId,
      opportunityId: id,
      score: input.safetyFlags.injectionScore,
      kinds: [...new Set(input.safetyFlags.findings.map((f) => f.kind))],
      droppedContacts: input.safetyFlags.droppedContacts.length,
    });
  }
  await enqueueBestEffort(ctx, { type: "matching.score_org", orgId, opportunityIds: [id] });
  return row;
}

async function extractOrReject(
  ctx: AppContext,
  orgId: string,
  text: string,
  label: string,
): Promise<ExtractedOpportunity> {
  if (text.replace(/\s+/g, " ").trim().length < MIN_SOURCE_CHARS) {
    throw unprocessable("no_text", "Could not read enough text from that source");
  }
  const extracted = await extractOpportunity(ctx, orgId, text, label);
  if (!extracted.isGrantOpportunity) {
    throw unprocessable(
      "not_an_opportunity",
      "That doesn't look like a grant opportunity or RFP. Try the funder's page for the specific program.",
    );
  }
  return extracted;
}

/** Fetches a grant page / PDF and creates (or refreshes) an org-private opportunity. */
export async function importOpportunityFromUrl(
  ctx: AppContext,
  input: { orgId: string; url: string; userId?: string | null; opportunityId?: string },
): Promise<OpportunityRow> {
  const url = parsePublicUrl(input.url);
  const source = await loadUrl(ctx, url);
  const guarded = guardImportedSource(
    await extractOrReject(ctx, input.orgId, source.text, source.finalUrl),
    source,
    ctx.now(),
  );
  const normalized = normalizeUrl(url);
  return saveOpportunity(ctx, {
    orgId: input.orgId,
    userId: input.userId ?? null,
    source: "url_import",
    // Scoped by org: two orgs importing the same URL each get their own private copy.
    sourceId: await sha256Hex(`${input.orgId}|${normalized}`),
    sourceUrl: normalized,
    fallbackTitle: source.title ?? url.hostname,
    extracted: guarded.extracted,
    sourceText: source.text,
    safetyFlags: guarded.flags,
    raw: { bytes: source.raw, mimeType: source.mimeType },
    ...(input.opportunityId ? { existingId: input.opportunityId } : {}),
  });
}

/** Stores an uploaded RFP (PDF/DOCX/TXT) and creates an org-private opportunity from it. */
export async function importRfpFile(
  ctx: AppContext,
  input: {
    orgId: string;
    userId: string | null;
    file: { name: string; type: string; bytes: ArrayBuffer };
  },
): Promise<OpportunityRow> {
  const { file } = input;
  if (file.bytes.byteLength === 0) throw badRequest("The file is empty");
  if (file.bytes.byteLength > MAX_RFP_BYTES) {
    throw new AppError(413, "file_too_large", "RFP files must be 20 MB or smaller");
  }
  const mimeType = rfpMimeType(file.name, file.type);
  if (!mimeType) throw badRequest("Upload a PDF, DOCX or TXT file");
  const mismatch = contentMismatchReason(mimeType, file.bytes);
  if (mismatch) throw new AppError(415, "file_content_mismatch", mismatch);
  const text =
    mimeType === "text/plain" || mimeType === "text/markdown"
      ? new TextDecoder().decode(file.bytes)
      : (await ctx.converter.toMarkdown({ name: file.name, mimeType, bytes: file.bytes })).markdown;
  const guarded = guardImportedSource(
    await extractOrReject(ctx, input.orgId, text.trim(), `uploaded file "${file.name}"`),
    { text },
    ctx.now(),
  );
  return saveOpportunity(ctx, {
    orgId: input.orgId,
    userId: input.userId,
    source: "rfp_upload",
    sourceId: await sha256Hex(`${input.orgId}|${await sha256Hex(file.bytes)}`),
    sourceUrl: null,
    fallbackTitle: file.name.replace(/\.[a-z0-9]+$/i, "") || "Uploaded RFP",
    extracted: guarded.extracted,
    sourceText: text,
    safetyFlags: guarded.flags,
    raw: { bytes: file.bytes, mimeType },
  });
}

// ---------------------------------------------------------------------------------------------
// Website crawl
// ---------------------------------------------------------------------------------------------

/**
 * Throws 403 unless the org enabled crawling AND the latest website_crawl consent is granted.
 * Returns that consent record's id (linked to every crawled document for provenance).
 */
export async function assertWebsiteCrawlAllowed(ctx: AppContext, orgId: string): Promise<string> {
  const settings = await ctx.db
    .select({ allow: orgSettings.allowWebsiteCrawl })
    .from(orgSettings)
    .where(eq(orgSettings.orgId, orgId))
    .get();
  if (!settings?.allow) {
    throw new AppError(
      403,
      "crawl_not_enabled",
      'Website crawling is turned off for this organization. An admin can enable "Allow website crawl" in Settings → Privacy.',
    );
  }
  const consent = await ctx.db
    .select({ id: consentRecords.id, granted: consentRecords.granted })
    .from(consentRecords)
    .where(and(eq(consentRecords.orgId, orgId), eq(consentRecords.scope, "website_crawl")))
    .orderBy(desc(consentRecords.createdAt), desc(sql`rowid`))
    .limit(1)
    .get();
  if (!consent?.granted) {
    throw new AppError(
      403,
      "consent_required",
      'Website crawling needs the organization\'s consent. Grant the "website crawl" consent in Settings → Privacy, then try again.',
    );
  }
  return consent.id;
}

export async function requestWebsiteCrawl(
  ctx: AppContext,
  input: { orgId: string; userId: string; url: string; maxPages: number },
): Promise<void> {
  await assertWebsiteCrawlAllowed(ctx, input.orgId);
  const url = parsePublicUrl(input.url);
  const maxPages = Math.max(1, Math.min(MAX_CRAWL_PAGES, Math.floor(input.maxPages)));
  await audit(ctx, {
    orgId: input.orgId,
    actorType: "user",
    actorId: input.userId,
    action: "website.crawl_requested",
    targetType: "website",
    metadata: { host: url.host, maxPages },
  });
  await enqueue(ctx, { type: "website.crawl", orgId: input.orgId, url: url.href, maxPages });
}

export interface CrawlResult {
  stored: number;
  fetched: number;
  skipped: { robots: number; error: number; nonHtml: number; thin: number; duplicate: number };
  documentIds: string[];
}

/** Same-site BFS from `startUrl`, storing each readable HTML page as a website_page document. */
export async function crawlOrgWebsite(
  ctx: AppContext,
  orgId: string,
  startUrl: string,
  maxPagesInput: number,
  opts: { consentRecordId?: string | null } = {},
): Promise<CrawlResult> {
  const maxPages = Math.max(1, Math.min(MAX_CRAWL_PAGES, Math.floor(maxPagesInput)));
  const start = assertSafeUrl(startUrl);
  const site = registrableDomain(start.hostname);
  const sameSite = (u: URL) => registrableDomain(u.hostname) === site;

  const result: CrawlResult = {
    stored: 0,
    fetched: 0,
    skipped: { robots: 0, error: 0, nonHtml: 0, thin: 0, duplicate: 0 },
    documentIds: [],
  };
  const queue: string[] = [normalizeUrl(start)];
  const seen = new Set<string>(queue);
  const textHashes = new Set<string>();
  const maxFetches = maxPages * 3;

  while (queue.length > 0 && result.stored < maxPages && result.fetched < maxFetches) {
    const url = queue.shift() as string;
    if (looksNonHtml(url)) {
      result.skipped.nonHtml++;
      continue;
    }
    result.fetched++;
    let res: PoliteFetchResult | null;
    try {
      res = await ctx.web.fetchPage(url);
    } catch (e) {
      result.skipped[
        e instanceof WebFetchError && e.code === "unsupported_content_type" ? "nonHtml" : "error"
      ]++;
      continue;
    }
    if (!res) {
      result.skipped.robots++;
      continue;
    }
    if (res.status >= 300) {
      result.skipped.error++;
      continue;
    }
    const mime = mimeOf(res.contentType);
    if (mime !== "text/html" && mime !== "application/xhtml+xml") {
      result.skipped.nonHtml++;
      continue;
    }
    let finalUrl: URL;
    try {
      finalUrl = new URL(res.url || url);
    } catch {
      finalUrl = new URL(url);
    }
    if (!sameSite(finalUrl) || !isSafeUrl(finalUrl)) {
      result.skipped.error++;
      continue;
    }
    const finalKey = normalizeUrl(finalUrl);
    seen.add(finalKey);

    const page = extractHtml(res.body, finalUrl.href);
    if (!page.robots.nofollow) {
      for (const link of page.links) {
        let u: URL;
        try {
          u = new URL(link);
        } catch {
          continue;
        }
        if (!sameSite(u) || !isSafeUrl(u)) continue;
        const key = normalizeUrl(u);
        if (seen.has(key)) continue;
        seen.add(key);
        if (!looksNonHtml(key)) queue.push(key);
      }
    }
    if (page.robots.noindex || page.text.length < MIN_PAGE_CHARS) {
      result.skipped.thin++;
      continue;
    }
    const hash = await sha256Hex(page.text);
    if (textHashes.has(hash)) {
      result.skipped.duplicate++;
      continue;
    }
    textHashes.add(hash);
    const already = await ctx.db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.orgId, orgId),
          eq(documents.kind, "website_page"),
          eq(documents.sourceUrl, finalKey),
        ),
      )
      .get();
    if (already) {
      result.skipped.duplicate++;
      continue;
    }
    const doc = await storeWebsitePage(ctx, orgId, {
      title: (page.title ?? finalUrl.pathname).slice(0, 200) || finalUrl.host,
      text: page.text,
      sourceUrl: finalKey,
      consentRecordId: opts.consentRecordId ?? null,
    });
    if (doc.duplicate) {
      result.skipped.duplicate++;
      continue;
    }
    result.stored++;
    result.documentIds.push(doc.id);
  }

  await audit(ctx, {
    orgId,
    actorType: "system",
    action: "website.crawled",
    targetType: "website",
    metadata: {
      host: start.host,
      stored: result.stored,
      fetched: result.fetched,
      skipped: result.skipped,
    },
  });
  return result;
}
