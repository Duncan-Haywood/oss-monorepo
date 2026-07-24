import "server-only";
import { ConvexHttpClient } from "convex/browser";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { initializeSqliteSchema } from "./db/sqlite-schema";
import type { Lead, LeadPipelineStage, OutreachStep } from "./leads/types";
import { newLeadId } from "./leads/types";
import { buildPaymentStubLeadFields } from "./leads/payment-stub";
import type { DeployHandoff, DeployHandoffStatus } from "./deploy/types";
import type { ClientInquiry, ClientInquiryStatus, CreateClientInquiryInput } from "./inquiries/types";
import { normalizeContactFormFields } from "./inquiries/contact-fields";
import { newClientInquiryId } from "./inquiries/inquiry-id";
import type { OrderRecord } from "./orders/types";
import { newOrderId, sortOrdersNewestFirst } from "./orders/types";
import type { CheckoutSessionRecord } from "./checkout/types";
import { newCheckoutSessionId } from "./checkout/types";
import type { MarketingPack, UpsertMarketingPackInput } from "./marketing/pack";
import type { CommerceCatalog, UpsertCommerceCatalogInput } from "./commerce/types";
import {
  newCommerceOrderId,
  sortCommerceOrdersNewestFirst,
} from "./commerce/orders";
import type { CommerceOrderRecord, InsertCommerceOrderInput } from "./commerce/orders";
import type { ClientVoicePack, UpsertClientVoicePackInput } from "./voice/pack";
import {
  ConvexPrimaryWriteError,
  shouldFallbackToSqliteOnConvexFailure,
  type ConvexPrimaryWriteOptions,
} from "./payments/convex-primary";
import { resolveConvexDeploymentUrl } from "./convex/convex-url-env-readiness";
import {
  mapSqliteRowToLead,
  serializeLeadBufferProfileIds,
  serializeLeadBufferPostedVariantKeys,
  type SqliteLeadRow,
} from "./leads/sqlite-row-mapping";
import { mapSqliteOrderRow, type SqliteOrderJoinRow } from "./orders/sqlite-row-mapping";
import {
  sqliteListOrders,
  sqliteListOrdersByLeadSlug,
  sqliteUpsertLead,
  sqliteUpdateLeadStage,
  sqliteRecordLeadOutreach,
  sqliteApplyColdLeadDisposition,
  sqliteRecordClientInquiryReply,
  sqliteRecordCheckoutRecoverySent,
  sqliteMarkCommerceOrderPaidOut,
  sqliteMarkCommerceOrderClientReceiptSent,
  sqliteMarkMarketingPackSentToClient,
  sqliteMarkClientVoicePackSentToClient,
  sqliteUpdateDeployHandoffCustomDomain,
} from "./db/sqlite-queries";
import { preferAdvancedHandoffStatus } from "./deploy/handoff-preserve";
import {
  CustomDomainConflictError,
  customDomainHostAliases,
  isPlausibleCustomDomainHost,
  normalizeOperatorCustomDomainHost,
} from "./deploy/custom-domain-routing";
import { mapDeployHandoffRow, type SqliteDeployHandoffRow } from "./deploy/sqlite-row-mapping";
import { mapClientInquiryRow, type SqliteClientInquiryRow } from "./inquiries/sqlite-row-mapping";
import { mapCheckoutSessionRow, type SqliteCheckoutSessionRow } from "./checkout/sqlite-row-mapping";
import {
  mapMarketingPackRow,
  softCapMarketingPack,
  type SqliteMarketingPackRow,
} from "./marketing/sqlite-row-mapping";
import {
  mapCommerceCatalogRow,
  mapCommerceOrderRow,
  type SqliteCommerceCatalogRow,
  type SqliteCommerceOrderRow,
} from "./commerce/sqlite-row-mapping";
import {
  mapClientVoicePackRow,
  softCapClientVoicePack,
  type SqliteClientVoicePackRow,
} from "./voice/sqlite-row-mapping";

export type { ConvexPrimaryWriteOptions } from "./payments/convex-primary";

/** Trim + placeholder gate — whitespace-only must not construct ConvexHttpClient. */
const convexUrl = resolveConvexDeploymentUrl(process.env.NEXT_PUBLIC_CONVEX_URL);
const convexClient = convexUrl ? new ConvexHttpClient(convexUrl) : null;

/**
 * Shared secret sent with every Convex call to a function protected by
 * requireApiSecret (see convex/lib/apiSecret.ts) — deliberately NOT
 * NEXT_PUBLIC_-prefixed, so it never ships to the browser bundle. Must match
 * the CONVEX_API_SECRET environment variable configured on the Convex
 * deployment itself (Convex dashboard or `npx convex env set`), which is a
 * separate env store from this app's hosting env. An unset/mismatched value
 * on either side makes every protected Convex call fail closed and fall back
 * to SQLite (same degraded-but-safe path as any other Convex outage), not a
 * hard crash — see convex-public-function-api-secret in prompt_process.tsx.
 */
const convexApiSecret = process.env.CONVEX_API_SECRET ?? "";

// SQLite Database Setup (for local fallback persistence and suppression list)
const dbPath = path.join(process.cwd(), "local.db");
let sqliteDb: DatabaseSync | null = null;

function getSqliteDb(): DatabaseSync {
  if (sqliteDb) return sqliteDb;
  sqliteDb = new DatabaseSync(dbPath);
  initializeSqliteSchema(sqliteDb);
  return sqliteDb;
}


// Statically define Convex function names to prevent compilation failures
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api: any = {
  leads: {
    list: "leads:list",
    getBySlug: "leads:getBySlug",
    updateStage: "leads:updateStage",
    upsertLead: "leads:upsertLead",
    seed: "leads:seed",
    markLeadPaid: "leads:markLeadPaid",
    recordOutreach: "leads:recordOutreach",
    recordPreviewOpen: "leads:recordPreviewOpen",
    updateNotes: "leads:updateNotes",
    updateSnooze: "leads:updateSnooze",
    applyColdDisposition: "leads:applyColdDisposition",
    updateStripeConnectAccountId: "leads:updateStripeConnectAccountId",
    updateStripeConnectStatus: "leads:updateStripeConnectStatus",
    updateBufferProfileIds: "leads:updateBufferProfileIds",
    updateBufferPostedVariantKeys: "leads:updateBufferPostedVariantKeys",
  },
  inquiries: {
    create: "inquiries:create",
    list: "inquiries:list",
    listUnreplied: "inquiries:listUnreplied",
    listBySlug: "inquiries:listBySlug",
    listCommerceCheckoutBySlug: "inquiries:listCommerceCheckoutBySlug",
    getById: "inquiries:getById",
    updateStatus: "inquiries:updateStatus",
    recordReply: "inquiries:recordReply",
  },
  orders: {
    list: "orders:list",
    listByLeadSlug: "orders:listByLeadSlug",
    getByStripeSessionId: "orders:getByStripeSessionId",
    getByStripeCustomerId: "orders:getByStripeCustomerId",
    markRecurringCanceledByCustomer: "orders:markRecurringCanceledByCustomer",
    clearRecurringCanceledByCustomer: "orders:clearRecurringCanceledByCustomer",
    syncRecurringEntitlementByCustomer: "orders:syncRecurringEntitlementByCustomer",
    markRefunded: "orders:markRefunded",
    clearRefunded: "orders:clearRefunded",
    markDisputed: "orders:markDisputed",
    clearDisputed: "orders:clearDisputed",
  },
  checkoutSessions: {
    create: "checkoutSessions:create",
    markComplete: "checkoutSessions:markComplete",
    markOpen: "checkoutSessions:markOpen",
    markCompleteOpenBundleForLead: "checkoutSessions:markCompleteOpenBundleForLead",
    markCompleteOpenCommerceForLeadSkuCustomer:
      "checkoutSessions:markCompleteOpenCommerceForLeadSkuCustomer",
    recordRecoverySent: "checkoutSessions:recordRecoverySent",
    listOpen: "checkoutSessions:listOpen",
  },
  marketingPacks: {
    upsert: "marketingPacks:upsert",
    getByLeadMonth: "marketingPacks:getByLeadMonth",
    listByMonth: "marketingPacks:listByMonth",
    markSentToClient: "marketingPacks:markSentToClient",
  },
  commerceCatalogs: {
    upsert: "commerceCatalogs:upsert",
    getByLeadSlug: "commerceCatalogs:getByLeadSlug",
    list: "commerceCatalogs:list",
  },
  clientVoicePacks: {
    upsert: "clientVoicePacks:upsert",
    getByLeadSlug: "clientVoicePacks:getByLeadSlug",
    list: "clientVoicePacks:list",
    markSentToClient: "clientVoicePacks:markSentToClient",
  },
  commerceOrders: {
    insert: "commerceOrders:insert",
    list: "commerceOrders:list",
    listUnpaid: "commerceOrders:listUnpaid",
    listRefunded: "commerceOrders:listRefunded",
    listDisputed: "commerceOrders:listDisputed",
    listMissingClientReceipt: "commerceOrders:listMissingClientReceipt",
    getByStripeSessionId: "commerceOrders:getByStripeSessionId",
    markPaidOut: "commerceOrders:markPaidOut",
    markClientReceiptSent: "commerceOrders:markClientReceiptSent",
    markRefunded: "commerceOrders:markRefunded",
    clearRefunded: "commerceOrders:clearRefunded",
    markDisputed: "commerceOrders:markDisputed",
    clearDisputed: "commerceOrders:clearDisputed",
  },
  suppressions: {
    isSuppressed: "suppressions:isSuppressed",
    suppress: "suppressions:suppress",
    list: "suppressions:list",
    unsuppress: "suppressions:unsuppress",
  },
  deployHandoffs: {
    upsert: "deployHandoffs:upsert",
    getByLeadSlug: "deployHandoffs:getByLeadSlug",
    getByCustomDomain: "deployHandoffs:getByCustomDomain",
    list: "deployHandoffs:list",
    updateStatus: "deployHandoffs:updateStatus",
    updateVercelProject: "deployHandoffs:updateVercelProject",
    updateCustomDomain: "deployHandoffs:updateCustomDomain",
  },
};

export async function getLeads(): Promise<Lead[]> {
  if (convexClient) {
    try {
      return (await convexClient.query(api.leads.list, {
        apiSecret: convexApiSecret,
      })) as Lead[];
    } catch (e) {
      console.warn("Failed to fetch leads from Convex, falling back to SQLite database", e);
    }
  }

  // SQLite Fallback
  const db = getSqliteDb();
  const rows = db.prepare("SELECT * FROM leads ORDER BY createdAt DESC").all() as unknown as SqliteLeadRow[];
  return rows.map(mapSqliteRowToLead);
}

export async function getLeadBySlug(slug: string): Promise<Lead | null> {
  if (convexClient) {
    try {
      const lead = await convexClient.query(api.leads.getBySlug, {
        slug,
        apiSecret: convexApiSecret,
      });
      return (lead as Lead) || null;
    } catch (e) {
      console.warn(`Failed to fetch lead ${slug} from Convex, falling back to SQLite database`, e);
    }
  }

  // SQLite Fallback
  const db = getSqliteDb();
  const row = db.prepare("SELECT * FROM leads WHERE slug = ?").get(slug) as SqliteLeadRow | undefined;
  if (!row) return null;
  return mapSqliteRowToLead(row);
}

/**
 * Move a lead's pipeline stage.
 *
 * Pass { requireConvex: true } (LEAD_STAGE_CONVEX_PRIMARY) from
 * updateLeadStageAction so a Convex mutation failure does not silently leave
 * stage only in instance-local SQLite while Convex-first readers (getLeads /
 * pipeline-health / stage funnel) never see the move. Mark live already passes
 * DEPLOY_HANDOFF_CONVEX_PRIMARY through this helper.
 */
export async function updateLeadStage(
  slug: string,
  stage: LeadPipelineStage,
  options?: ConvexPrimaryWriteOptions,
): Promise<boolean> {
  // Pass { requireConvex: true } (LEAD_STAGE_CONVEX_PRIMARY) from
  // updateLeadStageAction so a Convex mutation failure does not silently leave
  // stage only in instance-local SQLite while Convex-first readers (getLeads /
  // pipeline-health / stage funnel) never see it. Mark live already passes
  // DEPLOY_HANDOFF_CONVEX_PRIMARY through this same helper.
  if (convexClient) {
    try {
      return (await convexClient.mutation(api.leads.updateStage, {
        slug,
        stage,
        apiSecret: convexApiSecret,
      })) as boolean;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("updateLeadStage", e);
      }
      console.warn(`Failed to update lead stage for ${slug} on Convex, falling back to SQLite database`, e);
    }
  }

  // SQLite Fallback. Existence-check-then-throw here mirrors
  // convex/leads.ts's updateStage (which throws `Lead with slug ${slug} not
  // found`) and every sibling lead-mutation helper in this file
  // (updateLeadNotes / updateLeadSnooze / applyColdLeadDisposition) — a bare
  // `UPDATE ... WHERE slug = ?` on an unknown slug matches zero rows and
  // never throws, so without this check the two backends silently diverged:
  // Convex threw on an unknown slug while SQLite no-op'd and returned
  // normally. Every current call site already pre-checks the lead exists
  // (updateLeadStageAction via getLeadBySlug, markHandoffLive via its own
  // handoff/lead chain) so this was not reachable through the UI today, but
  // the two backends must still agree on what "success" means for any future
  // caller (db-convex-sqlite-not-found-parity).
  return sqliteUpdateLeadStage(getSqliteDb(), slug, stage);
}

/**
 * Create-only despite the name (kept for parity with the Convex mutation and
 * both call sites' historical naming): returns false without writing when a
 * row with this slug already exists at write time, instead of patching it —
 * see lead-upsert-create-only-race-guard. addLeadAction and
 * importLeadsCsvAction both already treat a pre-existing slug as a conflict
 * via their own earlier existence check, never a legitimate update; this
 * atomic re-check closes the window where importLeadsCsvAction's one-time
 * bulk existingSlugs snapshot goes stale partway through its sequential
 * per-row upsert loop.
 */
export async function upsertLead(
  lead: Lead,
  options?: ConvexPrimaryWriteOptions,
): Promise<boolean> {
  if (convexClient) {
    try {
      return (await convexClient.mutation(api.leads.upsertLead, {
        ...lead,
        apiSecret: convexApiSecret,
      })) as boolean;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("upsertLead", e);
      }
      console.warn("Failed to upsert lead on Convex, falling back to SQLite database", e);
    }
  }

  // SQLite Fallback
  return sqliteUpsertLead(getSqliteDb(), lead);
}

/**
 * Persist outreach sequence progress after Email 1/2/3 sends successfully.
 */
export async function recordLeadOutreach(
  slug: string,
  outreachStep: OutreachStep,
  lastOutreachAt: string = new Date().toISOString(),
  options?: ConvexPrimaryWriteOptions,
): Promise<boolean> {
  if (outreachStep < 1 || outreachStep > 3) {
    throw new Error("outreachStep must be 1, 2, or 3");
  }

  if (convexClient) {
    try {
      return (await convexClient.mutation(api.leads.recordOutreach, {
        slug,
        outreachStep,
        lastOutreachAt,
        apiSecret: convexApiSecret,
      })) as boolean;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("recordLeadOutreach", e);
      }
      console.warn(
        `Failed to record outreach for ${slug} on Convex, falling back to SQLite database`,
        e,
      );
    }
  }

  return sqliteRecordLeadOutreach(getSqliteDb(), slug, outreachStep, lastOutreachAt);
}

/**
 * Record an attributed preview open (outreach link or in-pipeline revisit).
 * No-ops when the lead row does not exist yet (slug-inferred demos).
 * Pass { requireConvex: true } from the public beacon route so a Convex
 * failure does not silently leave lastPreviewOpenAt only in instance-local
 * SQLite while Convex-first readers (Work next / Opened badge) never see it.
 */
export async function recordLeadPreviewOpen(
  slug: string,
  openedAt: string = new Date().toISOString(),
  options?: ConvexPrimaryWriteOptions,
): Promise<{ recorded: boolean }> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.recordPreviewOpen, {
        slug,
        openedAt,
        apiSecret: convexApiSecret,
      });
      return { recorded: true };
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("recordLeadPreviewOpen", e);
      }
      console.warn(
        `Failed to record preview open for ${slug} on Convex, falling back to SQLite database`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const existing = db.prepare("SELECT slug FROM leads WHERE slug = ?").get(slug) as
    | { slug: string }
    | undefined;
  if (!existing) {
    return { recorded: false };
  }
  db.prepare(`
    UPDATE leads
    SET lastPreviewOpenAt = ?, updatedAt = datetime('now')
    WHERE slug = ?
  `).run(openedAt, slug);
  return { recorded: true };
}

/**
 * Persist free-text operator notes on a lead (call outcomes, next steps).
 * Pass undefined/empty to clear. Caller should normalize via normalizeOperatorNotes.
 * Pass { requireConvex: true } (LEAD_NOTES_CONVEX_PRIMARY) from
 * updateLeadNotesAction so a Convex mutation failure does not silently leave
 * notes only in instance-local SQLite while Convex-first readers (getLeads)
 * never see discovery-call / Email 3 outcomes.
 */
export async function updateLeadNotes(
  slug: string,
  notes: string | undefined,
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.updateNotes, {
        slug,
        notes: notes ?? "",
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("updateLeadNotes", e);
      }
      console.warn(
        `Failed to update notes for ${slug} on Convex, falling back to SQLite database`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const existing = db.prepare("SELECT slug FROM leads WHERE slug = ?").get(slug) as
    | { slug: string }
    | undefined;
  if (!existing) {
    throw new Error(`Lead with slug ${slug} not found`);
  }
  db.prepare(`
    UPDATE leads
    SET notes = ?, updatedAt = datetime('now')
    WHERE slug = ?
  `).run(notes ?? null, slug);
}

/**
 * Persist Work next snooze until (ISO) or clear with undefined.
 * Caller should normalize via normalizeSnoozedUntil / snoozedUntilFromPreset.
 * Pass { requireConvex: true } (LEAD_SNOOZE_CONVEX_PRIMARY) from
 * snoozeLeadAction so a Convex mutation failure does not silently leave
 * snoozedUntil only in instance-local SQLite while Convex-first readers
 * (isFollowUpDue, pipeline-health, the daily digest) never see it.
 */
export async function updateLeadSnooze(
  slug: string,
  snoozedUntil: string | undefined,
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.updateSnooze, {
        slug,
        snoozedUntil: snoozedUntil ?? "",
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("updateLeadSnooze", e);
      }
      console.warn(
        `Failed to update snooze for ${slug} on Convex, falling back to SQLite database`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const existing = db.prepare("SELECT slug FROM leads WHERE slug = ?").get(slug) as
    | { slug: string }
    | undefined;
  if (!existing) {
    throw new Error(`Lead with slug ${slug} not found`);
  }
  db.prepare(`
    UPDATE leads
    SET snoozedUntil = ?, updatedAt = datetime('now')
    WHERE slug = ?
  `).run(snoozedUntil ?? null, slug);
}

/**
 * Persist a lead's Stripe Connect Express account id (dormant scaffold — see
 * commerce-payouts-stripe-connect / stripe-connect-gate.ts). Pass
 * { requireConvex: true } (LEAD_STRIPE_CONNECT_CONVEX_PRIMARY) from
 * createStripeConnectAccountAction so a Convex mutation failure surfaces to
 * the operator instead of writing only to instance-local SQLite while
 * Convex-first readers (getLeads) never see the created account id.
 *
 * `accountCreatedAt` (ISO timestamp) anchors the onboarding-incomplete
 * staleness signal (oldestConnectOnboardingIncompleteAgeHours — see
 * stripe-connect-onboarding-pipeline-health-visibility) — set-once semantics:
 * a lead that already has a stored value keeps it (SQLite: COALESCE; Convex:
 * the mutation itself only patches the key when the lead doesn't already
 * have one), so a later idempotent re-call (e.g. after a prior persist
 * failure) never resets "how long has this been incomplete" back to now.
 */
export async function updateLeadStripeConnectAccountId(
  slug: string,
  stripeConnectAccountId: string | undefined,
  options?: ConvexPrimaryWriteOptions,
  accountCreatedAt?: string,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.updateStripeConnectAccountId, {
        slug,
        stripeConnectAccountId: stripeConnectAccountId ?? "",
        ...(accountCreatedAt !== undefined
          ? { stripeConnectAccountCreatedAt: accountCreatedAt }
          : {}),
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("updateLeadStripeConnectAccountId", e);
      }
      console.warn(
        `Failed to update Stripe Connect account id for ${slug} on Convex, falling back to SQLite database`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const existing = db.prepare("SELECT slug FROM leads WHERE slug = ?").get(slug) as
    | { slug: string }
    | undefined;
  if (!existing) {
    throw new Error(`Lead with slug ${slug} not found`);
  }
  db.prepare(`
    UPDATE leads
    SET stripeConnectAccountId = ?,
        stripeConnectAccountCreatedAt = COALESCE(stripeConnectAccountCreatedAt, ?),
        updatedAt = datetime('now')
    WHERE slug = ?
  `).run(stripeConnectAccountId ?? null, accountCreatedAt ?? null, slug);
}

/**
 * Persist the operator's most recent Stripe Connect Express onboarding
 * status check (checkStripeConnectAccountStatusAction) — a display cache for
 * pipeline-health/digest visibility (see
 * stripe-connect-onboarding-pipeline-health-visibility), not the source of
 * truth (Stripe's own account object is). Pass
 * LEAD_STRIPE_CONNECT_STATUS_CONVEX_PRIMARY (requireConvex: true) so a
 * Convex mutation failure throws instead of silently caching the fresh
 * status to instance-local SQLite only — getLeads/getLeadBySlug read
 * Convex-first, and connectOnboardingIncompleteCount reads this same cache
 * across every instance, so an unconditional SQLite fallback here would
 * split-brain the due-queue count until a later check happened to succeed
 * (see stripe-connect-status-cache-convex-fail-closed). This is NOT the same
 * class as updateLeadBufferPostedVariantKeys, which has no pipeline-health
 * consumer to diverge. The caller already wraps this call in a try/catch
 * that swallows any error (including the ConvexPrimaryWriteError this can
 * now throw) — an already-successful live status check must never be turned
 * into a reported error, so failing closed here means "skip persistence,"
 * not "fail the request."
 */
export async function updateLeadStripeConnectStatus(
  slug: string,
  status: { chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean },
  checkedAt: string,
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.updateStripeConnectStatus, {
        slug,
        chargesEnabled: status.chargesEnabled,
        payoutsEnabled: status.payoutsEnabled,
        detailsSubmitted: status.detailsSubmitted,
        checkedAt,
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("updateLeadStripeConnectStatus", e);
      }
      console.warn(
        `Failed to persist Stripe Connect status for ${slug} on Convex, falling back to SQLite database`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const existing = db.prepare("SELECT slug FROM leads WHERE slug = ?").get(slug) as
    | { slug: string }
    | undefined;
  if (!existing) {
    throw new Error(`Lead with slug ${slug} not found`);
  }
  db.prepare(`
    UPDATE leads
    SET stripeConnectChargesEnabled = ?,
        stripeConnectPayoutsEnabled = ?,
        stripeConnectDetailsSubmitted = ?,
        stripeConnectStatusCheckedAt = ?,
        updatedAt = datetime('now')
    WHERE slug = ?
  `).run(
    status.chargesEnabled ? 1 : 0,
    status.payoutsEnabled ? 1 : 0,
    status.detailsSubmitted ? 1 : 0,
    checkedAt,
    slug,
  );
}

/**
 * Persist a lead's chosen Buffer profile ids (dormant scaffold — see
 * marketing-content-scheduling / src/lib/marketing/buffer-gate.ts). Pass
 * { requireConvex: true } (LEAD_BUFFER_PROFILES_CONVEX_PRIMARY) from
 * saveLeadBufferProfilesAction so a Convex mutation failure surfaces to the
 * operator instead of writing only to instance-local SQLite while
 * Convex-first readers (getLeads) never see the chosen profiles.
 */
export async function updateLeadBufferProfileIds(
  slug: string,
  bufferProfileIds: string[],
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.updateBufferProfileIds, {
        slug,
        bufferProfileIds,
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("updateLeadBufferProfileIds", e);
      }
      console.warn(
        `Failed to update Buffer profile ids for ${slug} on Convex, falling back to SQLite database`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const existing = db.prepare("SELECT slug FROM leads WHERE slug = ?").get(slug) as
    | { slug: string }
    | undefined;
  if (!existing) {
    throw new Error(`Lead with slug ${slug} not found`);
  }
  db.prepare(`
    UPDATE leads
    SET bufferProfileIds = ?, updatedAt = datetime('now')
    WHERE slug = ?
  `).run(serializeLeadBufferProfileIds(bufferProfileIds), slug);
}

/**
 * Persist the set of Buffer idempotency markers (bufferPostedVariantKey, see
 * src/lib/marketing/buffer.ts) scheduleMarketingPackToBufferAction has
 * already queued for a lead, so a repeated click within the same pack never
 * re-posts the same variant to the same profile
 * (buffer-schedule-duplicate-post-guard). Full-replacement semantics, same as
 * updateLeadBufferProfileIds — the caller computes the pruned+merged set via
 * pruneBufferPostedVariantKeysForPack before calling this.
 *
 * Deliberately does not fail closed on a Convex error the way
 * updateLeadBufferProfileIds does: this is called automatically right after
 * a successful Buffer post, which cannot be undone, so a marker-write failure
 * must not turn an already-succeeded schedule into a reported error — it
 * falls back to SQLite (or, on total failure, the caller logs and moves on)
 * rather than throwing.
 */
export async function updateLeadBufferPostedVariantKeys(
  slug: string,
  bufferPostedVariantKeys: string[],
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.leads.updateBufferPostedVariantKeys, {
        slug,
        bufferPostedVariantKeys,
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      console.warn(
        `Failed to update Buffer posted-variant markers for ${slug} on Convex, falling back to SQLite database`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const existing = db.prepare("SELECT slug FROM leads WHERE slug = ?").get(slug) as
    | { slug: string }
    | undefined;
  if (!existing) {
    throw new Error(`Lead with slug ${slug} not found`);
  }
  db.prepare(`
    UPDATE leads
    SET bufferPostedVariantKeys = ?, updatedAt = datetime('now')
    WHERE slug = ?
  `).run(serializeLeadBufferPostedVariantKeys(bufferPostedVariantKeys), slug);
}

/**
 * Persist a cold-lead disposition patch (re-engage or close) in one write.
 * Caller must validate via planColdLeadDisposition first.
 * Pass { requireConvex: true } (COLD_DISPOSITION_CONVEX_PRIMARY) from
 * disposeColdLeadAction so a Convex mutation failure does not silently leave
 * stage/outreach only in instance-local SQLite while Convex-first readers
 * (getLeads, cold badges, pipeline-health) never see the Re-engage/Close.
 *
 * Returns false (no write applied) when the row's stage has already moved to
 * paid/live by the time this runs — planColdLeadDisposition's own paid/live
 * guard only saw disposeColdLeadAction's earlier snapshot read, so a
 * concurrent Stripe checkout completing in that window must not have its
 * stage silently reverted back to closed/discovered (same TOCTOU class as
 * commerce-order-paid-out-refund-race-guard; the Convex twin
 * applyColdDisposition re-checks the identical condition atomically at
 * patch time).
 */
export async function applyColdLeadDisposition(
  slug: string,
  patch: {
    stage: LeadPipelineStage;
    outreachStep: OutreachStep;
    lastOutreachAt: string | undefined;
    snoozedUntil: string | undefined;
  },
  options?: ConvexPrimaryWriteOptions,
): Promise<boolean> {
  if (convexClient) {
    try {
      return (await convexClient.mutation(api.leads.applyColdDisposition, {
        slug,
        stage: patch.stage,
        outreachStep: patch.outreachStep,
        lastOutreachAt: patch.lastOutreachAt ?? "",
        snoozedUntil: patch.snoozedUntil ?? "",
        apiSecret: convexApiSecret,
      })) as boolean;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("applyColdLeadDisposition", e);
      }
      console.warn(
        `Failed to apply cold disposition for ${slug} on Convex, falling back to SQLite database`,
        e,
      );
    }
  }

  return sqliteApplyColdLeadDisposition(getSqliteDb(), slug, patch);
}

/**
 * Records a bundle payment (Starter/Growth/Complete checkout) exactly once
 * per Stripe session. Returns alreadyRecorded=true when this stripeSessionId
 * was already recorded — Stripe redelivers checkout.session.completed on
 * retry/timeout, and the caller must not resend receipt/handoff emails or
 * count the sale twice in revenueTotalUsd for a redelivery.
 */
export async function recordLeadPayment(
  params: {
    slug: string;
    stripeSessionId: string;
    customerEmail: string;
    tier: string;
    commerceAddon: boolean;
    amountTotal: number;
    stripeCustomerId?: string;
  },
  options?: ConvexPrimaryWriteOptions,
): Promise<{ alreadyRecorded: boolean }> {
  if (convexClient) {
    try {
      return await convexClient.mutation(api.leads.markLeadPaid, {
        ...params,
        apiSecret: convexApiSecret,
      });
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("recordLeadPayment", e);
      }
      console.warn(`Failed to record lead payment for ${params.slug} on Convex, falling back to SQLite database`, e);
    }
  }

  // SQLite Fallback
  const db = getSqliteDb();
  const existingOrder = db
    .prepare("SELECT id FROM orders WHERE stripeSessionId = ?")
    .get(params.stripeSessionId) as { id: string } | undefined;
  if (existingOrder) {
    return { alreadyRecorded: true };
  }

  const lead = await getLeadBySlug(params.slug);
  if (!lead) {
    // Keep field defaults aligned with Convex markLeadPaid stub + payment-stub.ts.
    const stub = buildPaymentStubLeadFields(params.slug);
    const id = newLeadId();

    db.prepare(`
      INSERT INTO leads (id, slug, businessName, category, city, state, phone, tagline, description, recommendedTier, dataSource, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid')
    `).run(
      id,
      stub.slug,
      stub.businessName,
      stub.category,
      stub.city,
      stub.state,
      stub.phone,
      stub.tagline,
      stub.description,
      stub.recommendedTier,
      stub.dataSource,
    );
  } else {
    // Mirrors convex/leads.ts markLeadPaid's live-stage guard: never regress
    // an already-live lead back to "paid" on a second purchase (e.g. a
    // Starter upsell to Growth/Complete on a lead whose site is already
    // deployed). The order INSERT below still runs unconditionally either
    // way — only the status patch is guarded.
    const stmt = db.prepare(
      "UPDATE leads SET status = 'paid', updatedAt = datetime('now') WHERE slug = ? AND status != 'live'",
    );
    stmt.run(params.slug);
  }

  // Get lead ID
  const leadRow = db.prepare("SELECT id FROM leads WHERE slug = ?").get(params.slug) as { id: string };

  // Insert order
  const orderId = newOrderId();
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO orders (id, leadId, stripeSessionId, stripeCustomerId, tier, commerceAddon, amountPaid, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orderId,
    leadRow.id,
    params.stripeSessionId,
    params.stripeCustomerId ?? null,
    params.tier,
    params.commerceAddon ? 1 : 0,
    params.amountTotal,
    createdAt
  );
  return { alreadyRecorded: false };
}

/**
 * List paid orders for operator pipeline health (revenue totals).
 * Convex when configured; SQLite join otherwise.
 *
 * Newest-first: convex/orders.list sorts by createdAt desc at the source;
 * sortOrdersNewestFirst here stays as belt-and-suspenders so Billing Portal
 * latestEligibleOrder cannot regress if a future caller bypasses that query
 * shape or the Convex sort is accidentally removed.
 */
function mapConvexOrderRow(row: {
  _id: string;
  leadSlug: string;
  stripeSessionId: string;
  stripeCustomerId?: string;
  tier: string;
  commerceAddon: boolean;
  recurringCanceledAt?: number;
  amountTotal: number;
  createdAt: number;
  refundedAt?: string;
  disputedAt?: string;
}): OrderRecord {
  return {
    id: row._id,
    leadSlug: row.leadSlug,
    stripeSessionId: row.stripeSessionId,
    stripeCustomerId: row.stripeCustomerId,
    tier: row.tier,
    commerceAddon: row.commerceAddon,
    recurringCanceledAt:
      typeof row.recurringCanceledAt === "number" &&
      Number.isFinite(row.recurringCanceledAt) &&
      row.recurringCanceledAt > 0
        ? row.recurringCanceledAt
        : undefined,
    amountPaid: row.amountTotal,
    createdAt: new Date(row.createdAt).toISOString(),
    refundedAt: row.refundedAt || undefined,
    disputedAt: row.disputedAt || undefined,
  };
}

export async function listOrders(): Promise<OrderRecord[]> {
  if (convexClient) {
    try {
      const rows = (await convexClient.query(api.orders.list, { apiSecret: convexApiSecret })) as Array<{
        _id: string;
        leadSlug: string;
        stripeSessionId: string;
        stripeCustomerId?: string;
        tier: string;
        commerceAddon: boolean;
        recurringCanceledAt?: number;
        amountTotal: number;
        createdAt: number;
        refundedAt?: string;
        disputedAt?: string;
      }>;
      return sortOrdersNewestFirst(rows.map(mapConvexOrderRow));
    } catch (e) {
      console.warn("Failed to fetch orders from Convex, falling back to SQLite", e);
    }
  }

  return sqliteListOrders(getSqliteDb());
}

/**
 * Slug-scoped orders for preview commerce eligibility, Manage billing, and
 * per-lead dashboard sold-capability gates (upsell / packs / catalog).
 * Prefer over listOrders() whenever the caller already has a lead slug —
 * never full-ledger collect then filter. Newest-first on both backends
 * (matches listOrders). Keep listOrders() for digest + dashboard aggregates.
 */
export async function listOrdersByLeadSlug(
  leadSlug: string,
): Promise<OrderRecord[]> {
  if (convexClient) {
    try {
      const rows = (await convexClient.query(api.orders.listByLeadSlug, {
        leadSlug,
        apiSecret: convexApiSecret,
      })) as Array<{
        _id: string;
        leadSlug: string;
        stripeSessionId: string;
        stripeCustomerId?: string;
        tier: string;
        commerceAddon: boolean;
        recurringCanceledAt?: number;
        amountTotal: number;
        createdAt: number;
        refundedAt?: string;
        disputedAt?: string;
      }>;
      return sortOrdersNewestFirst(rows.map(mapConvexOrderRow));
    } catch (e) {
      console.warn(
        `Failed to fetch orders for ${leadSlug} from Convex, falling back to SQLite`,
        e,
      );
    }
  }

  return sqliteListOrdersByLeadSlug(getSqliteDb(), leadSlug);
}

/**
 * Single bundle order lookup by stripeSessionId (unique) — used by the
 * charge.refunded webhook handler to correlate a refunded charge back to a
 * bundle (Starter/Growth/Complete/Commerce-addon) order, mirroring
 * getCommerceOrderByStripeSessionId. See bundle-order-refund-tracking.
 */
export async function getOrderByStripeSessionId(
  stripeSessionId: string,
): Promise<OrderRecord | null> {
  if (convexClient) {
    try {
      const row = (await convexClient.query(api.orders.getByStripeSessionId, {
        stripeSessionId,
        apiSecret: convexApiSecret,
      })) as {
        _id: string;
        leadSlug: string;
        stripeSessionId: string;
        stripeCustomerId?: string;
        tier: string;
        commerceAddon: boolean;
        recurringCanceledAt?: number;
        amountTotal: number;
        createdAt: number;
        refundedAt?: string;
        disputedAt?: string;
      } | null;
      return row ? mapConvexOrderRow(row) : null;
    } catch (e) {
      console.warn(
        `Failed to get order ${stripeSessionId} from Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const row = db
    .prepare(
      `SELECT o.id, l.slug as leadSlug, o.stripeSessionId, o.stripeCustomerId, o.tier, o.commerceAddon,
              o.recurringCanceledAt, o.amountPaid, o.createdAt, o.refundedAt, o.disputedAt
       FROM orders o
       LEFT JOIN leads l ON l.id = o.leadId
       WHERE o.stripeSessionId = ?`,
    )
    .get(stripeSessionId) as unknown as SqliteOrderJoinRow | undefined;
  return row
    ? mapSqliteOrderRow({ ...row, leadSlug: row.leadSlug || "unknown" })
    : null;
}

/**
 * Orders for a Stripe Customer — used by the invoice.payment_failed dunning
 * notice to resolve the leadSlug + stripeSessionId to email from (the lead's
 * email lives on the leads row, not orders). Newest-first, matching
 * listOrders/listOrdersByLeadSlug. Not exhaustive across every historical
 * order shape — a Customer only ever carries orders for one lead.
 */
export async function getOrdersByStripeCustomerId(
  stripeCustomerId: string,
): Promise<OrderRecord[]> {
  const customerId = stripeCustomerId.trim();
  if (!customerId) return [];

  if (convexClient) {
    try {
      const rows = (await convexClient.query(api.orders.getByStripeCustomerId, {
        stripeCustomerId: customerId,
        apiSecret: convexApiSecret,
      })) as Array<{
        _id: string;
        leadSlug: string;
        stripeSessionId: string;
        stripeCustomerId?: string;
        tier: string;
        commerceAddon: boolean;
        recurringCanceledAt?: number;
        amountTotal: number;
        createdAt: number;
        refundedAt?: string;
        disputedAt?: string;
      }>;
      return sortOrdersNewestFirst(rows.map(mapConvexOrderRow));
    } catch (e) {
      console.warn(
        `Failed to get orders for customer ${customerId} from Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      `SELECT o.id, l.slug as leadSlug, o.stripeSessionId, o.stripeCustomerId, o.tier, o.commerceAddon,
              o.recurringCanceledAt, o.amountPaid, o.createdAt, o.refundedAt, o.disputedAt
       FROM orders o
       LEFT JOIN leads l ON l.id = o.leadId
       WHERE o.stripeCustomerId = ?
       ORDER BY o.createdAt DESC`,
    )
    .all(customerId) as unknown as SqliteOrderJoinRow[];

  return rows.map((row) =>
    mapSqliteOrderRow({
      ...row,
      leadSlug: row.leadSlug || "unknown",
    }),
  );
}

/**
 * Flags a bundle order as refunded by Stripe (charge.refunded). Keyed on
 * stripeSessionId (unique), mirrors markCommerceOrderRefunded. Idempotent on
 * Convex (see convex/orders.ts markRefunded); the SQLite fallback's WHERE
 * clause is naturally idempotent (redelivery just re-sets the same value).
 *
 * Pass { requireConvex: true } from the Stripe webhook so a Convex mutation
 * failure surfaces (5xx → Stripe retry) instead of SQLite-only success while
 * Convex-first getOrderByStripeSessionId still looks unmarked.
 */
export async function markOrderRefunded(
  stripeSessionId: string,
  refundedAt: string = new Date().toISOString(),
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.orders.markRefunded, {
        stripeSessionId,
        refundedAt,
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("markOrderRefunded", e);
      }
      console.warn(
        `Failed to mark order ${stripeSessionId} refunded on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare(
    "UPDATE orders SET refundedAt = ? WHERE stripeSessionId = ? AND (refundedAt IS NULL OR refundedAt = '')",
  ).run(refundedAt, stripeSessionId);
}

/**
 * Clears orders.refundedAt after refund.updated reports the refund that set
 * it (failed/canceled) never actually completed — funds never left the
 * platform. Keyed on stripeSessionId — mirrors clearCommerceOrderRefunded.
 * Idempotent. Pass { requireConvex: true } from the webhook.
 * See commerce-order-refund-reversal-tracking.
 */
export async function clearOrderRefunded(
  stripeSessionId: string,
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.orders.clearRefunded, {
        stripeSessionId,
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("clearOrderRefunded", e);
      }
      console.warn(
        `Failed to clear order ${stripeSessionId} refunded on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare(
    "UPDATE orders SET refundedAt = NULL WHERE stripeSessionId = ? AND refundedAt IS NOT NULL AND refundedAt != ''",
  ).run(stripeSessionId);
}

/**
 * Flags a bundle order as disputed by Stripe (charge.dispute.created, or
 * charge.dispute.closed lost when created was missed). Keyed on
 * stripeSessionId — mirrors markCommerceOrderDisputed. Idempotent.
 * Pass { requireConvex: true } from the webhook (WEBHOOK_CONVEX_PRIMARY).
 * See bundle-order-dispute-tracking.
 */
export async function markOrderDisputed(
  stripeSessionId: string,
  disputedAt: string = new Date().toISOString(),
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.orders.markDisputed, {
        stripeSessionId,
        disputedAt,
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("markOrderDisputed", e);
      }
      console.warn(
        `Failed to mark order ${stripeSessionId} disputed on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare(
    "UPDATE orders SET disputedAt = ? WHERE stripeSessionId = ? AND (disputedAt IS NULL OR disputedAt = '')",
  ).run(disputedAt, stripeSessionId);
}

/**
 * Clears orders.disputedAt after charge.dispute.closed with status won /
 * warning_closed. Keyed on stripeSessionId — mirrors clearCommerceOrderDisputed.
 * Idempotent. Pass { requireConvex: true } from the webhook.
 * See bundle-order-dispute-tracking.
 */
export async function clearOrderDisputed(
  stripeSessionId: string,
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.orders.clearDisputed, {
        stripeSessionId,
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("clearOrderDisputed", e);
      }
      console.warn(
        `Failed to clear order ${stripeSessionId} disputed on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare(
    "UPDATE orders SET disputedAt = NULL WHERE stripeSessionId = ? AND disputedAt IS NOT NULL AND disputedAt != ''",
  ).run(stripeSessionId);
}

/**
 * Mark Growth/Complete/Commerce orders for a Stripe Customer as recurring-canceled
 * after customer.subscription.deleted. Idempotent — already-canceled rows are
 * left unchanged. requireConvex on the webhook path (WEBHOOK_CONVEX_PRIMARY).
 */
export async function markOrdersRecurringCanceledByCustomer(
  stripeCustomerId: string,
  canceledAt: number,
  options?: ConvexPrimaryWriteOptions,
): Promise<number> {
  const customerId = stripeCustomerId.trim();
  if (!customerId) return 0;
  const at =
    Number.isFinite(canceledAt) && canceledAt > 0 ? canceledAt : Date.now();

  if (convexClient) {
    try {
      const result = (await convexClient.mutation(
        api.orders.markRecurringCanceledByCustomer,
        { stripeCustomerId: customerId, canceledAt: at, apiSecret: convexApiSecret },
      )) as { updatedCount: number };
      return result.updatedCount;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError(
          "markOrdersRecurringCanceledByCustomer",
          e,
        );
      }
      console.warn(
        `Failed to mark recurring canceled for customer ${customerId} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      `SELECT id, tier, commerceAddon, recurringCanceledAt
       FROM orders
       WHERE stripeCustomerId = ?`,
    )
    .all(customerId) as Array<{
    id: string;
    tier: string;
    commerceAddon: number;
    recurringCanceledAt: number | null;
  }>;

  let updatedCount = 0;
  const patch = db.prepare(
    `UPDATE orders SET recurringCanceledAt = ? WHERE id = ? AND (recurringCanceledAt IS NULL OR recurringCanceledAt = 0)`,
  );
  for (const row of rows) {
    const hadRecurring =
      row.commerceAddon === 1 || row.tier === "growth" || row.tier === "complete";
    if (!hadRecurring) continue;
    if (
      typeof row.recurringCanceledAt === "number" &&
      Number.isFinite(row.recurringCanceledAt) &&
      row.recurringCanceledAt > 0
    ) {
      continue;
    }
    const result = patch.run(at, row.id);
    if (result.changes > 0) updatedCount += 1;
  }
  return updatedCount;
}

/**
 * Clear recurringCanceledAt on Growth/Complete/Commerce orders for a Stripe
 * Customer after subscription.created|updated reaches active|trialing.
 * Idempotent — rows without a cancel timestamp are left unchanged.
 * requireConvex on the webhook path (WEBHOOK_CONVEX_PRIMARY).
 */
export async function clearOrdersRecurringCanceledByCustomer(
  stripeCustomerId: string,
  options?: ConvexPrimaryWriteOptions,
): Promise<number> {
  const customerId = stripeCustomerId.trim();
  if (!customerId) return 0;

  if (convexClient) {
    try {
      const result = (await convexClient.mutation(
        api.orders.clearRecurringCanceledByCustomer,
        { stripeCustomerId: customerId, apiSecret: convexApiSecret },
      )) as { updatedCount: number };
      return result.updatedCount;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError(
          "clearOrdersRecurringCanceledByCustomer",
          e,
        );
      }
      console.warn(
        `Failed to clear recurring canceled for customer ${customerId} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      `SELECT id, tier, commerceAddon, recurringCanceledAt
       FROM orders
       WHERE stripeCustomerId = ?`,
    )
    .all(customerId) as Array<{
    id: string;
    tier: string;
    commerceAddon: number;
    recurringCanceledAt: number | null;
  }>;

  let updatedCount = 0;
  const clear = db.prepare(
    `UPDATE orders SET recurringCanceledAt = NULL WHERE id = ? AND recurringCanceledAt IS NOT NULL AND recurringCanceledAt > 0`,
  );
  for (const row of rows) {
    const hadRecurring =
      row.commerceAddon === 1 || row.tier === "growth" || row.tier === "complete";
    if (!hadRecurring) continue;
    if (
      !(
        typeof row.recurringCanceledAt === "number" &&
        Number.isFinite(row.recurringCanceledAt) &&
        row.recurringCanceledAt > 0
      )
    ) {
      continue;
    }
    const result = clear.run(row.id);
    if (result.changes > 0) updatedCount += 1;
  }
  return updatedCount;
}

/**
 * Sync tier + commerceAddon on Growth/Complete/Commerce orders for a Stripe
 * Customer from the live Subscription catalog monthly Prices. Idempotent —
 * matching rows are skipped. requireConvex on the webhook path
 * (WEBHOOK_CONVEX_PRIMARY). Does not touch recurringCanceledAt.
 */
export async function syncOrdersRecurringEntitlementByCustomer(
  stripeCustomerId: string,
  entitlement: {
    tier: "starter" | "growth" | "complete";
    commerceAddon: boolean;
  },
  options?: ConvexPrimaryWriteOptions,
): Promise<number> {
  const customerId = stripeCustomerId.trim();
  if (!customerId) return 0;
  const hadRecurringTarget =
    entitlement.commerceAddon ||
    entitlement.tier === "growth" ||
    entitlement.tier === "complete";
  if (!hadRecurringTarget) return 0;

  if (convexClient) {
    try {
      const result = (await convexClient.mutation(
        api.orders.syncRecurringEntitlementByCustomer,
        {
          stripeCustomerId: customerId,
          tier: entitlement.tier,
          commerceAddon: entitlement.commerceAddon,
          apiSecret: convexApiSecret,
        },
      )) as { updatedCount: number };
      return result.updatedCount;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError(
          "syncOrdersRecurringEntitlementByCustomer",
          e,
        );
      }
      console.warn(
        `Failed to sync recurring entitlement for customer ${customerId} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      `SELECT id, tier, commerceAddon
       FROM orders
       WHERE stripeCustomerId = ?`,
    )
    .all(customerId) as Array<{
    id: string;
    tier: string;
    commerceAddon: number;
  }>;

  let updatedCount = 0;
  const patch = db.prepare(
    `UPDATE orders SET tier = ?, commerceAddon = ? WHERE id = ?`,
  );
  for (const row of rows) {
    const hadRecurring =
      row.commerceAddon === 1 || row.tier === "growth" || row.tier === "complete";
    if (!hadRecurring) continue;
    const nextAddon = entitlement.commerceAddon ? 1 : 0;
    if (row.tier === entitlement.tier && row.commerceAddon === nextAddon) {
      continue;
    }
    const result = patch.run(entitlement.tier, nextAddon, row.id);
    if (result.changes > 0) updatedCount += 1;
  }
  return updatedCount;
}

// --- Suppression List Functions ---

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  if (convexClient) {
    try {
      return (await convexClient.query(api.suppressions.isSuppressed, {
        email: normalized,
        apiSecret: convexApiSecret,
      })) as boolean;
    } catch (e) {
      console.warn("Failed to check suppression on Convex, falling back to SQLite database", e);
    }
  }

  // SQLite Fallback
  const db = getSqliteDb();
  const row = db.prepare("SELECT email FROM suppression_list WHERE email = ?").get(normalized) as { email: string } | undefined;
  return !!row;
}

export async function suppressEmail(
  email: string,
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  const normalized = email.toLowerCase().trim();
  if (convexClient) {
    try {
      await convexClient.mutation(api.suppressions.suppress, {
        email: normalized,
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("suppressEmail", e);
      }
      console.warn("Failed to record suppression on Convex, falling back to SQLite database", e);
    }
  }

  // SQLite Fallback
  const db = getSqliteDb();
  db.prepare("INSERT OR IGNORE INTO suppression_list (email) VALUES (?)").run(normalized);
}

export async function getSuppressedEmails(): Promise<string[]> {
  if (convexClient) {
    try {
      return (await convexClient.query(api.suppressions.list, {
        apiSecret: convexApiSecret,
      })) as string[];
    } catch (e) {
      console.warn("Failed to list suppressions from Convex, falling back to SQLite database", e);
    }
  }

  // SQLite Fallback
  const db = getSqliteDb();
  const rows = db.prepare("SELECT email FROM suppression_list").all() as { email: string }[];
  return rows.map((r) => r.email);
}

/**
 * Operator override: remove an address from the CAN-SPAM opt-out list.
 * Returns whether a row was actually removed (false = the address was not
 * suppressed to begin with). isEmailSuppressed reads Convex-first at every
 * outreach send, so this must accept ConvexPrimaryWriteOptions the same way
 * suppressEmail does — a silent SQLite-only fallback here would look like it
 * succeeded to the operator while every Convex-primary instance (including
 * this one's own next read) kept treating the address as suppressed.
 */
export async function unsuppressEmail(
  email: string,
  options?: ConvexPrimaryWriteOptions,
): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  if (convexClient) {
    try {
      return (await convexClient.mutation(api.suppressions.unsuppress, {
        email: normalized,
        apiSecret: convexApiSecret,
      })) as boolean;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("unsuppressEmail", e);
      }
      console.warn("Failed to remove suppression on Convex, falling back to SQLite database", e);
    }
  }

  // SQLite Fallback
  const db = getSqliteDb();
  const result = db
    .prepare("DELETE FROM suppression_list WHERE email = ?")
    .run(normalized);
  return result.changes > 0;
}

// --- Production deploy handoffs (Phase 5) ---

export async function insertDeployHandoff(
  handoff: DeployHandoff,
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.deployHandoffs.upsert, {
        handoffId: handoff.id,
        leadSlug: handoff.leadSlug,
        businessName: handoff.businessName,
        tier: handoff.tier,
        commerceAddon: handoff.commerceAddon,
        stripeSessionId: handoff.stripeSessionId,
        customerEmail: handoff.customerEmail,
        previewUrl: handoff.previewUrl,
        suggestedHost: handoff.suggestedHost,
        customDomain: handoff.customDomain,
        contactFormUrl: handoff.contactFormUrl,
        dnsInstructions: handoff.dnsInstructions,
        status: handoff.status,
        vercelDomainStatus: handoff.vercelDomainStatus,
        vercelProjectId: handoff.vercelProjectId,
        notes: handoff.notes,
        createdAt: handoff.createdAt,
        updatedAt: handoff.updatedAt,
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("insertDeployHandoff", e);
      }
      console.warn(
        "Failed to upsert deploy handoff on Convex, falling back to SQLite database",
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare(`
    INSERT INTO deploy_handoffs (
      id, leadSlug, businessName, tier, commerceAddon, stripeSessionId, customerEmail,
      previewUrl, suggestedHost, customDomain, contactFormUrl, dnsInstructions, status,
      vercelDomainStatus, vercelProjectId, notes, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(leadSlug) DO UPDATE SET
      businessName = excluded.businessName,
      tier = excluded.tier,
      commerceAddon = excluded.commerceAddon,
      stripeSessionId = excluded.stripeSessionId,
      customerEmail = excluded.customerEmail,
      previewUrl = excluded.previewUrl,
      suggestedHost = excluded.suggestedHost,
      customDomain = excluded.customDomain,
      contactFormUrl = excluded.contactFormUrl,
      dnsInstructions = excluded.dnsInstructions,
      status = excluded.status,
      vercelDomainStatus = excluded.vercelDomainStatus,
      vercelProjectId = excluded.vercelProjectId,
      notes = excluded.notes,
      updatedAt = excluded.updatedAt
  `).run(
    handoff.id,
    handoff.leadSlug,
    handoff.businessName,
    handoff.tier,
    handoff.commerceAddon ? 1 : 0,
    handoff.stripeSessionId,
    handoff.customerEmail,
    handoff.previewUrl,
    handoff.suggestedHost,
    handoff.customDomain ?? null,
    handoff.contactFormUrl,
    JSON.stringify(handoff.dnsInstructions),
    handoff.status,
    handoff.vercelDomainStatus ?? null,
    handoff.vercelProjectId ?? null,
    JSON.stringify(handoff.notes),
    handoff.createdAt,
    handoff.updatedAt,
  );
}

export async function getDeployHandoffBySlug(slug: string): Promise<DeployHandoff | null> {
  if (convexClient) {
    try {
      return (await convexClient.query(api.deployHandoffs.getByLeadSlug, {
        leadSlug: slug,
        apiSecret: convexApiSecret,
      })) as DeployHandoff | null;
    } catch (e) {
      console.warn(
        "Failed to get deploy handoff from Convex, falling back to SQLite database",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM deploy_handoffs WHERE leadSlug = ?")
    .get(slug) as SqliteDeployHandoffRow | undefined;
  if (!row) return null;
  return mapDeployHandoffRow(row);
}

export async function listDeployHandoffs(): Promise<DeployHandoff[]> {
  if (convexClient) {
    try {
      return (await convexClient.query(api.deployHandoffs.list, {
        apiSecret: convexApiSecret,
      })) as DeployHandoff[];
    } catch (e) {
      console.warn(
        "Failed to list deploy handoffs from Convex, falling back to SQLite database",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare("SELECT * FROM deploy_handoffs ORDER BY createdAt DESC")
    .all() as unknown as SqliteDeployHandoffRow[];
  return rows.map(mapDeployHandoffRow);
}

export async function updateDeployHandoffStatus(
  leadSlug: string,
  status: DeployHandoffStatus,
  extraNotes: string[] = [],
  options?: ConvexPrimaryWriteOptions,
): Promise<DeployHandoff | null> {
  const updatedAt = new Date().toISOString();

  if (convexClient) {
    try {
      return (await convexClient.mutation(api.deployHandoffs.updateStatus, {
        leadSlug,
        status,
        extraNotes,
        updatedAt,
        apiSecret: convexApiSecret,
      })) as DeployHandoff | null;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("updateDeployHandoffStatus", e);
      }
      console.warn(
        "Failed to update deploy handoff status on Convex, falling back to SQLite database",
        e,
      );
    }
  }

  // SQLite-only path (also used when Convex mutation failed — read SQLite
  // directly so we don't re-fetch a Convex row and write a divergent copy).
  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM deploy_handoffs WHERE leadSlug = ?")
    .get(leadSlug) as SqliteDeployHandoffRow | undefined;
  if (!row) return null;

  const existing = mapDeployHandoffRow(row);
  // Never downgrade status on note append (bundle receipt/DNS markers pass a
  // possibly-stale handoff.status from before Resend). Mirror Convex
  // deployHandoffs.updateStatus — see preferAdvancedHandoffStatus.
  const nextStatus = preferAdvancedHandoffStatus(existing.status, status);
  const notes = [...existing.notes, ...extraNotes];
  db.prepare(`
    UPDATE deploy_handoffs
    SET status = ?, notes = ?, updatedAt = ?
    WHERE leadSlug = ?
  `).run(nextStatus, JSON.stringify(notes), updatedAt, leadSlug);

  return {
    ...existing,
    status: nextStatus,
    notes,
    updatedAt,
  };
}

/** Set (or clear) the dedicated Vercel project isolating this client's deploy. */
export async function updateDeployHandoffVercelProject(
  leadSlug: string,
  vercelProjectId: string | null,
  options?: ConvexPrimaryWriteOptions,
): Promise<DeployHandoff | null> {
  const updatedAt = new Date().toISOString();

  if (convexClient) {
    try {
      return (await convexClient.mutation(api.deployHandoffs.updateVercelProject, {
        leadSlug,
        vercelProjectId: vercelProjectId ?? "",
        updatedAt,
        apiSecret: convexApiSecret,
      })) as DeployHandoff | null;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("updateDeployHandoffVercelProject", e);
      }
      console.warn(
        "Failed to update deploy handoff Vercel project on Convex, falling back to SQLite database",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM deploy_handoffs WHERE leadSlug = ?")
    .get(leadSlug) as SqliteDeployHandoffRow | undefined;
  if (!row) return null;

  const existing = mapDeployHandoffRow(row);
  db.prepare(`
    UPDATE deploy_handoffs
    SET vercelProjectId = ?, updatedAt = ?
    WHERE leadSlug = ?
  `).run(vercelProjectId, updatedAt, leadSlug);

  return {
    ...existing,
    vercelProjectId: vercelProjectId || undefined,
    updatedAt,
  };
}

/** Set (or clear) the client's own domain, used for host-based routing (proxy.ts). */
export async function updateDeployHandoffCustomDomain(
  leadSlug: string,
  customDomain: string | null,
  options?: ConvexPrimaryWriteOptions,
): Promise<DeployHandoff | null> {
  const updatedAt = new Date().toISOString();
  // Bare hostname only (strip scheme/path/port) so stored values match
  // normalizeRequestHost(Host) and Vercel Domains API — see
  // normalizeOperatorCustomDomainHost / custom-domain-host-normalize.
  const normalized = normalizeOperatorCustomDomainHost(customDomain);

  if (convexClient) {
    try {
      const result = await convexClient.mutation(api.deployHandoffs.updateCustomDomain, {
        leadSlug,
        customDomain: normalized ?? "",
        updatedAt,
        apiSecret: convexApiSecret,
      });
      // Conflict sentinel from the mutation's own atomic re-check — not a
      // Convex/network failure, so never fall back to SQLite here (that
      // would recreate the exact split-brain the re-check exists to
      // prevent). Always propagate regardless of requireConvex.
      if (result && typeof result === "object" && "conflict" in result) {
        throw new CustomDomainConflictError((result as { ownerSlug: string }).ownerSlug);
      }
      return result as DeployHandoff | null;
    } catch (e) {
      if (e instanceof CustomDomainConflictError) {
        throw e;
      }
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("updateDeployHandoffCustomDomain", e);
      }
      console.warn(
        "Failed to update deploy handoff custom domain on Convex, falling back to SQLite database",
        e,
      );
    }
  }

  const db = getSqliteDb();
  return sqliteUpdateDeployHandoffCustomDomain(db, leadSlug, normalized, updatedAt);
}

/**
 * Host-based routing lookup (proxy.ts) — given an inbound request Host
 * header, find which lead's preview to serve. Returns null for hosts with
 * no matching handoff (caller falls through to normal routing).
 *
 * Tries www↔apex aliases (exact first) so Save www.client.com still matches
 * Host client.com and uniqueness rejects the twin on another lead
 * (custom-domain-www-apex-alias).
 */
export async function getLeadSlugByCustomDomain(customDomain: string): Promise<string | null> {
  // Same bare-host normalize as write path so a mis-pasted lookup still matches.
  const normalized = normalizeOperatorCustomDomainHost(customDomain);
  if (!normalized) return null;
  // Read-path twin of Save domain: reject over-long / implausible hosts before
  // Convex/SQLite work (proxy-host-lookup-field-length-cap). Spoofed Host is
  // not DNS-bounded; write path already uses isPlausibleCustomDomainHost.
  if (!isPlausibleCustomDomainHost(normalized)) return null;

  const aliases = customDomainHostAliases(normalized);

  if (convexClient) {
    try {
      for (const alias of aliases) {
        const result = (await convexClient.query(api.deployHandoffs.getByCustomDomain, {
          customDomain: alias,
          apiSecret: convexApiSecret,
        })) as { leadSlug: string } | null;
        if (result?.leadSlug) return result.leadSlug;
      }
      return null;
    } catch (e) {
      console.warn(
        "Failed to look up deploy handoff by custom domain on Convex, falling back to SQLite database",
        e,
      );
    }
  }

  const db = getSqliteDb();
  for (const alias of aliases) {
    const row = db
      .prepare("SELECT leadSlug FROM deploy_handoffs WHERE customDomain = ? LIMIT 1")
      .get(alias) as { leadSlug: string } | undefined;
    if (row?.leadSlug) return row.leadSlug;
  }
  return null;
}

// --- Client inquiries (contact form CRM) ---

export async function insertClientInquiry(
  input: CreateClientInquiryInput,
  options?: ConvexPrimaryWriteOptions,
): Promise<ClientInquiry> {
  const now = new Date().toISOString();
  // Defense in depth: same soft-caps the contact route applies before notify
  // (contact-form-notify-field-length-caps). Webhook commerce_checkout inquiries
  // and any future writer share these bounds.
  const capped = normalizeContactFormFields({
    name: input.name,
    email: input.email,
    phone: input.phone,
    message: input.message,
    source: input.source,
  });
  const inquiry: ClientInquiry = {
    id: newClientInquiryId(input.leadSlug),
    leadSlug: input.leadSlug,
    businessName: input.businessName,
    name: capped.name || undefined,
    email: capped.email || undefined,
    phone: capped.phone || undefined,
    message: capped.message,
    status: "new",
    source: capped.source || undefined,
    createdAt: now,
    updatedAt: now,
  };

  if (convexClient) {
    try {
      await convexClient.mutation(api.inquiries.create, {
        inquiryId: inquiry.id,
        leadSlug: inquiry.leadSlug,
        businessName: inquiry.businessName,
        name: inquiry.name,
        email: inquiry.email,
        phone: inquiry.phone,
        message: inquiry.message,
        source: inquiry.source,
        apiSecret: convexApiSecret,
      });
      return inquiry;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("insertClientInquiry", e);
      }
      console.warn("Failed to insert client inquiry on Convex, falling back to SQLite", e);
    }
  }

  const db = getSqliteDb();
  db.prepare(`
    INSERT INTO client_inquiries (
      id, leadSlug, businessName, name, email, phone, message, status, source, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    inquiry.id,
    inquiry.leadSlug,
    inquiry.businessName,
    inquiry.name ?? null,
    inquiry.email ?? null,
    inquiry.phone ?? null,
    inquiry.message,
    inquiry.status,
    inquiry.source ?? null,
    inquiry.createdAt,
    inquiry.updatedAt,
  );

  return inquiry;
}

export async function listClientInquiries(limit = 100): Promise<ClientInquiry[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  if (convexClient) {
    try {
      return (await convexClient.query(api.inquiries.list, {
        limit: safeLimit,
        apiSecret: convexApiSecret,
      })) as ClientInquiry[];
    } catch (e) {
      console.warn("Failed to list client inquiries from Convex, falling back to SQLite", e);
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      "SELECT * FROM client_inquiries ORDER BY createdAt DESC LIMIT ?",
    )
    .all(safeLimit) as unknown as SqliteClientInquiryRow[];
  return rows.map(mapClientInquiryRow);
}

/**
 * Every inquiry still awaiting an operator reply (status "new" or "read"),
 * uncapped — feeds pipeline-health unrepliedInquiryCount /
 * oldestUnrepliedInquiryAgeHours and the daily digest Unreplied inquiries
 * section, both of which must never miss an inquiry older than the newest N
 * total inquiries. `listClientInquiries`'s capped page stays for inbox UI.
 */
export async function listUnrepliedInquiries(): Promise<ClientInquiry[]> {
  if (convexClient) {
    try {
      return (await convexClient.query(api.inquiries.listUnreplied, {
        apiSecret: convexApiSecret,
      })) as ClientInquiry[];
    } catch (e) {
      console.warn(
        "Failed to list unreplied client inquiries from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      "SELECT * FROM client_inquiries WHERE status IN ('new', 'read') ORDER BY createdAt DESC",
    )
    .all() as unknown as SqliteClientInquiryRow[];
  return rows.map(mapClientInquiryRow);
}

export async function listClientInquiriesBySlug(
  leadSlug: string,
  limit = 50,
): Promise<ClientInquiry[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  if (convexClient) {
    try {
      return (await convexClient.query(api.inquiries.listBySlug, {
        leadSlug,
        limit: safeLimit,
        apiSecret: convexApiSecret,
      })) as ClientInquiry[];
    } catch (e) {
      console.warn(
        `Failed to list client inquiries for ${leadSlug} from Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      "SELECT * FROM client_inquiries WHERE leadSlug = ? ORDER BY createdAt DESC LIMIT ?",
    )
    .all(leadSlug, safeLimit) as unknown as SqliteClientInquiryRow[];
  return rows.map(mapClientInquiryRow);
}

/**
 * Every commerce_checkout inquiry for a lead (uncapped) — feeds Commerce Buy
 * now webhook session dedup via planCommerceWebhookSideEffects. Prefer this
 * over listClientInquiriesBySlug's newest 50/200 page: once contact /
 * Request-order / Buy now volume exceeds that window, an older
 * commerce_checkout row embedding stripeSessionId falls off the page and
 * Stripe redelivery falsely recovers (duplicate inbox + client receipt).
 */
export async function listCommerceCheckoutInquiriesBySlug(
  leadSlug: string,
): Promise<ClientInquiry[]> {
  if (convexClient) {
    try {
      return (await convexClient.query(
        api.inquiries.listCommerceCheckoutBySlug,
        { leadSlug, apiSecret: convexApiSecret },
      )) as ClientInquiry[];
    } catch (e) {
      console.warn(
        `Failed to list commerce_checkout inquiries for ${leadSlug} from Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      `SELECT * FROM client_inquiries
       WHERE leadSlug = ? AND source = 'commerce_checkout'
       ORDER BY createdAt DESC`,
    )
    .all(leadSlug) as unknown as SqliteClientInquiryRow[];
  return rows.map(mapClientInquiryRow);
}

/**
 * Update an inquiry's status (new / read / replied / archived).
 * Pass { requireConvex: true } (INQUIRY_REPLY_CONVEX_PRIMARY) from
 * updateInquiryStatusAction so a Convex mutation failure does not silently
 * leave status only in instance-local SQLite while unrepliedInquiryCount /
 * mark-read metrics read Convex-first.
 */
export async function updateClientInquiryStatus(
  inquiryId: string,
  status: ClientInquiryStatus,
  options?: ConvexPrimaryWriteOptions,
): Promise<ClientInquiry | null> {
  if (convexClient) {
    try {
      const updated = (await convexClient.mutation(api.inquiries.updateStatus, {
        inquiryId,
        status,
        apiSecret: convexApiSecret,
      })) as ClientInquiry | null;
      if (updated) return updated;
      // Shared store is authoritative when requireConvex — do not invent from SQLite.
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        return null;
      }
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("updateClientInquiryStatus", e);
      }
      console.warn(
        `Failed to update inquiry ${inquiryId} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const existing = db
    .prepare("SELECT * FROM client_inquiries WHERE id = ?")
    .get(inquiryId) as SqliteClientInquiryRow | undefined;
  if (!existing) return null;

  const updatedAt = new Date().toISOString();
  db.prepare(
    "UPDATE client_inquiries SET status = ?, updatedAt = ? WHERE id = ?",
  ).run(status, updatedAt, inquiryId);

  return mapClientInquiryRow({ ...existing, status, updatedAt });
}

export async function getClientInquiryById(
  inquiryId: string,
): Promise<ClientInquiry | null> {
  if (convexClient) {
    try {
      const inquiry = (await convexClient.query(api.inquiries.getById, {
        inquiryId,
        apiSecret: convexApiSecret,
      })) as ClientInquiry | null;
      if (inquiry) return inquiry;
    } catch (e) {
      console.warn(
        `Failed to get inquiry ${inquiryId} from Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM client_inquiries WHERE id = ?")
    .get(inquiryId) as SqliteClientInquiryRow | undefined;
  return row ? mapClientInquiryRow(row) : null;
}

/**
 * Persist a successful operator reply: status=replied + body + repliedAt.
 * Pass { requireConvex: true } (INQUIRY_REPLY_CONVEX_PRIMARY) from
 * replyToInquiryAction so a Convex mutation failure does not silently leave
 * the replied mark only in instance-local SQLite while unrepliedInquiryCount
 * reads Convex-first (duplicate-reply risk). Callers must mark BEFORE Resend.
 *
 * Re-checks status !== "archived" atomically against the row it just read,
 * mirroring convex/inquiries.ts recordReply — replyToInquiryAction's
 * inquiryCanReceiveReply gate runs against a stale read from moments earlier
 * and a concurrent archive can land in that window (see
 * inquiry-reply-archive-race-guard). Returns null on that race the same way
 * it already does for a missing row.
 */
export async function recordClientInquiryReply(
  inquiryId: string,
  operatorReply: string,
  options?: ConvexPrimaryWriteOptions,
): Promise<ClientInquiry | null> {
  if (convexClient) {
    try {
      const updated = (await convexClient.mutation(api.inquiries.recordReply, {
        inquiryId,
        operatorReply,
        apiSecret: convexApiSecret,
      })) as ClientInquiry | null;
      if (updated) return updated;
      // Shared store is authoritative when requireConvex — do not invent from SQLite.
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        return null;
      }
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("recordClientInquiryReply", e);
      }
      console.warn(
        `Failed to record inquiry reply ${inquiryId} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  return sqliteRecordClientInquiryReply(getSqliteDb(), inquiryId, operatorReply);
}

// --- Checkout sessions (abandoned-checkout recovery, Phase 3) ---

/**
 * Records a newly-created Stripe Checkout Session for abandoned-checkout
 * tracking. Pass { requireConvex: true } from checkout API routes so a
 * Convex failure does not silently leave the open session only in
 * instance-local SQLite while Convex-first readers
 * (listAbandonedCheckoutsDue / listCommerceAbandonedCheckoutsDue) never see
 * it — the create-side twin of markCheckoutSessionComplete.
 */
export async function recordCheckoutSessionCreated(
  params: {
    leadSlug: string;
    stripeSessionId: string;
    tier: string;
    commerceAddon: boolean;
    customerEmail?: string;
    kind?: "bundle" | "commerce_sku";
    skuId?: string;
  },
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  const createdAt = new Date().toISOString();
  const kind = params.kind ?? "bundle";

  if (convexClient) {
    try {
      await convexClient.mutation(api.checkoutSessions.create, {
        ...params,
        kind,
        createdAt,
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("recordCheckoutSessionCreated", e);
      }
      console.warn(
        `Failed to record checkout session ${params.stripeSessionId} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare(`
    INSERT INTO checkout_sessions (id, leadSlug, stripeSessionId, tier, commerceAddon, customerEmail, status, createdAt, kind, skuId)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
    ON CONFLICT(stripeSessionId) DO NOTHING
  `).run(
    newCheckoutSessionId(),
    params.leadSlug,
    params.stripeSessionId,
    params.tier,
    params.commerceAddon ? 1 : 0,
    params.customerEmail ?? null,
    createdAt,
    kind,
    params.skuId ?? null,
  );
}

/**
 * Flips a checkout session to "complete" — called from the
 * checkout.session.completed webhook. Pass { requireConvex: true } (the
 * webhook does) so a Convex failure does not silently leave the session
 * "open" only in instance-local SQLite while Convex-first readers
 * (listAbandonedCheckoutsDue / listCommerceAbandonedCheckoutsDue) still see
 * it as open and email a Finish-checkout nudge to someone who already paid.
 */
export async function markCheckoutSessionComplete(
  stripeSessionId: string,
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.checkoutSessions.markComplete, {
        stripeSessionId,
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("markCheckoutSessionComplete", e);
      }
      console.warn(
        `Failed to mark checkout session ${stripeSessionId} complete on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare("UPDATE checkout_sessions SET status = 'complete' WHERE stripeSessionId = ?").run(
    stripeSessionId,
  );
}

/**
 * Re-opens a checkout session after checkout.session.async_payment_failed.
 * Unpaid completed marks the row complete (stop abandoned-recovery while ACH
 * clears); a failed async payment must reopen so Finish-checkout / Buy now
 * recovery can nudge a retry (recovery emails link to /checkout?slug= or
 * preview#catalog — not the terminal Stripe Session). Pass
 * { requireConvex: true } (the webhook does) so a Convex failure does not
 * silently leave the session "complete" only in instance-local SQLite while
 * Convex-first readers never see it as open again.
 */
export async function markCheckoutSessionOpen(
  stripeSessionId: string,
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.checkoutSessions.markOpen, {
        stripeSessionId,
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("markCheckoutSessionOpen", e);
      }
      console.warn(
        `Failed to reopen checkout session ${stripeSessionId} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare("UPDATE checkout_sessions SET status = 'open' WHERE stripeSessionId = ?").run(
    stripeSessionId,
  );
}

/**
 * After a paid bundle Checkout Session, mark other open bundle rows for the
 * same leadSlug complete so Finish-checkout / digest / pipeline-health cannot
 * nudge an already-paid customer. Never touches commerce_sku (multi-shopper).
 * Pass { requireConvex: true } (the webhook does) so a Convex failure does not
 * silently leave orphans open only in Convex while this instance's SQLite
 * looks clean.
 */
export async function markCompleteOpenBundleCheckoutSessionsForLead(
  leadSlug: string,
  exceptStripeSessionId: string,
  options?: ConvexPrimaryWriteOptions,
): Promise<number> {
  if (convexClient) {
    try {
      return (await convexClient.mutation(api.checkoutSessions.markCompleteOpenBundleForLead, {
        leadSlug,
        exceptStripeSessionId,
        apiSecret: convexApiSecret,
      })) as number;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("markCompleteOpenBundleCheckoutSessionsForLead", e);
      }
      console.warn(
        `Failed to close orphan open bundle checkout sessions for ${leadSlug} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const result = db
    .prepare(
      `UPDATE checkout_sessions
       SET status = 'complete'
       WHERE leadSlug = ?
         AND status = 'open'
         AND stripeSessionId != ?
         AND (kind IS NULL OR kind = '' OR kind = 'bundle')`,
    )
    .run(leadSlug, exceptStripeSessionId);
  return Number(result.changes ?? 0);
}

/**
 * After a paid commerce_sku Checkout Session, mark other open commerce_sku
 * rows for the same leadSlug + skuId + customerEmail complete so Buy now
 * recovery / digest / pipeline-health cannot nudge the same shopper after
 * they pay. Never closes when customerEmail is blank (multi-shopper). Email
 * match is trim + lowercase on both sides. Pass { requireConvex: true } (the
 * webhook does) so a Convex failure does not silently leave orphans open
 * only in Convex while this instance's SQLite looks clean.
 */
export async function markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer(
  leadSlug: string,
  skuId: string,
  customerEmail: string,
  exceptStripeSessionId: string,
  options?: ConvexPrimaryWriteOptions,
): Promise<number> {
  const email = customerEmail.trim().toLowerCase();
  const normalizedSkuId = skuId.trim();
  if (!email || !normalizedSkuId || !leadSlug.trim() || !exceptStripeSessionId.trim()) {
    return 0;
  }

  if (convexClient) {
    try {
      return (await convexClient.mutation(
        api.checkoutSessions.markCompleteOpenCommerceForLeadSkuCustomer,
        {
          leadSlug,
          skuId: normalizedSkuId,
          customerEmail: email,
          exceptStripeSessionId,
          apiSecret: convexApiSecret,
        },
      )) as number;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError(
          "markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer",
          e,
        );
      }
      console.warn(
        `Failed to close orphan open commerce checkout sessions for ${leadSlug}/${normalizedSkuId} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  // SQLite LOWER(TRIM(...)) mirrors Convex trim+lowercase; skip blank emails.
  const result = db
    .prepare(
      `UPDATE checkout_sessions
       SET status = 'complete'
       WHERE leadSlug = ?
         AND status = 'open'
         AND stripeSessionId != ?
         AND kind = 'commerce_sku'
         AND skuId = ?
         AND customerEmail IS NOT NULL
         AND TRIM(customerEmail) != ''
         AND LOWER(TRIM(customerEmail)) = ?`,
    )
    .run(leadSlug, exceptStripeSessionId, normalizedSkuId, email);
  return Number(result.changes ?? 0);
}

/** Records that an operator sent an abandoned-checkout recovery email for this session. */
/**
 * Returns false (no write) when the session is missing or is no longer
 * "open" at write time — never trusts the caller's earlier
 * listOpenCheckoutSessions() snapshot alone. A concurrent Stripe webhook can
 * complete the same session between that read and this call (a real payment
 * landing), and the calling action must skip sending a "finish your
 * purchase" recovery email once this returns false
 * (checkout-session-recovery-race-guard).
 */
export async function recordCheckoutRecoverySent(
  stripeSessionId: string,
  sentAt: string = new Date().toISOString(),
  options?: ConvexPrimaryWriteOptions,
): Promise<boolean> {
  if (convexClient) {
    try {
      return await convexClient.mutation(api.checkoutSessions.recordRecoverySent, {
        stripeSessionId,
        sentAt,
        apiSecret: convexApiSecret,
      });
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("recordCheckoutRecoverySent", e);
      }
      console.warn(
        `Failed to record recovery send for ${stripeSessionId} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  return sqliteRecordCheckoutRecoverySent(getSqliteDb(), stripeSessionId, sentAt);
}

/** All checkout sessions still "open" (not yet completed) — the abandoned-recovery due queue's input. */
export async function listOpenCheckoutSessions(): Promise<CheckoutSessionRecord[]> {
  if (convexClient) {
    try {
      return (await convexClient.query(api.checkoutSessions.listOpen, {
        apiSecret: convexApiSecret,
      })) as CheckoutSessionRecord[];
    } catch (e) {
      console.warn(
        "Failed to list open checkout sessions from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare("SELECT * FROM checkout_sessions WHERE status = 'open' ORDER BY createdAt ASC")
    .all() as unknown as SqliteCheckoutSessionRow[];
  return rows.map(mapCheckoutSessionRow);
}

// --- Marketing packs (Growth/Complete monthly content) ---

export async function upsertMarketingPack(
  input: UpsertMarketingPackInput,
  options?: ConvexPrimaryWriteOptions,
): Promise<MarketingPack> {
  const pack: MarketingPack = {
    id: `mp_${input.leadSlug}_${input.yearMonth}`,
    leadSlug: input.leadSlug,
    yearMonth: input.yearMonth,
    variants: input.variants,
    generatedAt: input.generatedAt,
    generator: input.generator,
    packageTier: input.packageTier,
  };

  if (convexClient) {
    try {
      await convexClient.mutation(api.marketingPacks.upsert, {
        packId: pack.id,
        leadSlug: pack.leadSlug,
        yearMonth: pack.yearMonth,
        variants: pack.variants,
        generatedAt: pack.generatedAt,
        generator: pack.generator,
        packageTier: pack.packageTier,
        apiSecret: convexApiSecret,
      });
      return pack;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("upsertMarketingPack", e);
      }
      console.warn(
        `Failed to upsert marketing pack for ${pack.leadSlug} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  // Regenerating always clears sentToClientAt on the ON CONFLICT branch — new
  // pack content has not yet been sent (marketing-voice-pack-client-send-visibility).
  db.prepare(`
    INSERT INTO marketing_packs (
      id, leadSlug, yearMonth, variantsJson, generatedAt, generator, packageTier
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(leadSlug, yearMonth) DO UPDATE SET
      id = excluded.id,
      variantsJson = excluded.variantsJson,
      generatedAt = excluded.generatedAt,
      generator = excluded.generator,
      packageTier = excluded.packageTier,
      sentToClientAt = NULL
  `).run(
    pack.id,
    pack.leadSlug,
    pack.yearMonth,
    JSON.stringify(pack.variants),
    pack.generatedAt,
    pack.generator,
    pack.packageTier ?? null,
  );

  return pack;
}

export async function getMarketingPack(
  leadSlug: string,
  yearMonth: string,
): Promise<MarketingPack | null> {
  if (convexClient) {
    try {
      const pack = (await convexClient.query(api.marketingPacks.getByLeadMonth, {
        leadSlug,
        yearMonth,
        apiSecret: convexApiSecret,
      })) as MarketingPack | null;
      // Convex-primary reads bypass parsePackVariants — soft-cap here so Email
      // pack + dashboard cannot emit pre-generate-cap rows.
      return pack ? softCapMarketingPack(pack) : null;
    } catch (e) {
      console.warn(
        `Failed to get marketing pack for ${leadSlug} from Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM marketing_packs WHERE leadSlug = ? AND yearMonth = ?")
    .get(leadSlug, yearMonth) as SqliteMarketingPackRow | undefined;
  return row ? mapMarketingPackRow(row) : null;
}

/**
 * Every marketing pack for a UTC month — feeds listMarketingPacksDue /
 * pipeline-health / digest. Uncapped: a newest-page slice undercounts
 * fulfillment (false "packs due" once volume exceeds the window).
 * Optional `limit` is ignored (kept for call-site compatibility).
 */
export async function listMarketingPacksForMonth(
  yearMonth: string,
  _limit?: number,
): Promise<MarketingPack[]> {
  void _limit;

  if (convexClient) {
    try {
      const packs = (await convexClient.query(api.marketingPacks.listByMonth, {
        yearMonth,
        apiSecret: convexApiSecret,
      })) as MarketingPack[];
      return packs.map(softCapMarketingPack);
    } catch (e) {
      console.warn(
        "Failed to list marketing packs from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      "SELECT * FROM marketing_packs WHERE yearMonth = ? ORDER BY generatedAt DESC",
    )
    .all(yearMonth) as unknown as SqliteMarketingPackRow[];
  return rows.map(mapMarketingPackRow);
}

/**
 * Durable sent-marker after sendMarketingPackToClientEmail resolves
 * { success: true } in sendMarketingPackToClientAction. Keyed on
 * leadSlug+yearMonth (matches the pack's own uniqueness). Returns whether the
 * row was actually marked (re-checks sentToClientAt unset atomically with the
 * write, matching markCommerceOrderClientReceiptSent's race guard) — see
 * marketing-voice-pack-client-send-visibility.
 */
export async function markMarketingPackSentToClient(
  leadSlug: string,
  yearMonth: string,
  sentToClientAt: string = new Date().toISOString(),
  options?: ConvexPrimaryWriteOptions,
): Promise<boolean> {
  if (convexClient) {
    try {
      return await convexClient.mutation(api.marketingPacks.markSentToClient, {
        leadSlug,
        yearMonth,
        sentToClientAt,
        apiSecret: convexApiSecret,
      });
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("markMarketingPackSentToClient", e);
      }
      console.warn(
        `Failed to mark marketing pack sent to client for ${leadSlug} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  return sqliteMarkMarketingPackSentToClient(getSqliteDb(), leadSlug, yearMonth, sentToClientAt);
}

// --- Commerce catalogs (≤50 SKUs for commerceAddon leads) ---

/**
 * Persist (or replace) a Commerce catalog row.
 *
 * Pass { requireConvex: true } from saveCommerceCatalogAction /
 * syncCommerceCatalogToStripeAction so a Convex mutation failure surfaces
 * instead of SQLite-only success while Convex-first Buy now / unsynced
 * readers still miss stripePriceId on other instances.
 */
export async function upsertCommerceCatalog(
  input: UpsertCommerceCatalogInput,
  options?: ConvexPrimaryWriteOptions,
): Promise<CommerceCatalog> {
  const catalog: CommerceCatalog = {
    leadSlug: input.leadSlug,
    items: input.items,
    updatedAt: input.updatedAt,
  };

  if (convexClient) {
    try {
      await convexClient.mutation(api.commerceCatalogs.upsert, {
        leadSlug: catalog.leadSlug,
        items: catalog.items,
        updatedAt: catalog.updatedAt,
        apiSecret: convexApiSecret,
      });
      return catalog;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("upsertCommerceCatalog", e);
      }
      console.warn(
        `Failed to upsert commerce catalog for ${catalog.leadSlug} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare(`
    INSERT INTO commerce_catalogs (leadSlug, itemsJson, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(leadSlug) DO UPDATE SET
      itemsJson = excluded.itemsJson,
      updatedAt = excluded.updatedAt
  `).run(catalog.leadSlug, JSON.stringify(catalog.items), catalog.updatedAt);

  return catalog;
}

export async function getCommerceCatalog(
  leadSlug: string,
): Promise<CommerceCatalog | null> {
  if (convexClient) {
    try {
      return (await convexClient.query(api.commerceCatalogs.getByLeadSlug, {
        leadSlug,
        apiSecret: convexApiSecret,
      })) as CommerceCatalog | null;
    } catch (e) {
      console.warn(
        `Failed to get commerce catalog for ${leadSlug} from Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM commerce_catalogs WHERE leadSlug = ?")
    .get(leadSlug) as SqliteCommerceCatalogRow | undefined;
  return row ? mapCommerceCatalogRow(row) : null;
}

/**
 * Every commerce catalog — feeds listCommerceCatalogsMissing /
 * listCommerceCatalogsUnsynced / pipeline-health / digest. Uncapped: a
 * newest-page slice invents false "missing" debt and can hide unsynced SKUs
 * (Buy now blocked while Sync due looks clean).
 * Optional `limit` is ignored (kept for call-site compatibility).
 */
export async function listCommerceCatalogs(
  _limit?: number,
): Promise<CommerceCatalog[]> {
  void _limit;

  if (convexClient) {
    try {
      return (await convexClient.query(
        api.commerceCatalogs.list,
        { apiSecret: convexApiSecret },
      )) as CommerceCatalog[];
    } catch (e) {
      console.warn(
        "Failed to list commerce catalogs from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare("SELECT * FROM commerce_catalogs ORDER BY updatedAt DESC")
    .all() as unknown as SqliteCommerceCatalogRow[];
  return rows.map(mapCommerceCatalogRow);
}

// --- Commerce orders (end-customer Buy now purchases — see commerce/orders.ts) ---

/**
 * Idempotent on stripeSessionId — the Stripe webhook may see the same
 * checkout.session.completed event more than once and must never double-count
 * pass-through commerce revenue. Returns alreadyRecorded=true when this
 * session was already ledgered so callers can skip non-idempotent side
 * effects (operator inquiry + client receipt email).
 */
export async function insertCommerceOrder(
  input: InsertCommerceOrderInput,
  options?: ConvexPrimaryWriteOptions,
): Promise<{ alreadyRecorded: boolean }> {
  const createdAt = new Date().toISOString();
  // Generated once up front (not inside the SQLite-only branch) so both
  // backends persist and return the same app-owned id — the Convex
  // commerceOrders table previously had no id column at all, so every row
  // came back with `id: undefined` once Convex was configured.
  const id = newCommerceOrderId();

  if (convexClient) {
    try {
      const result = await convexClient.mutation(api.commerceOrders.insert, {
        ...input,
        orderId: id,
        createdAt,
        apiSecret: convexApiSecret,
      });
      // Convex insert returns null when by_stripeSessionId already exists.
      return { alreadyRecorded: result === null };
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("insertCommerceOrder", e);
      }
      console.warn(
        "Failed to insert commerce order on Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const existing = db
    .prepare("SELECT id FROM commerce_orders WHERE stripeSessionId = ?")
    .get(input.stripeSessionId) as { id: string } | undefined;
  if (existing) {
    return { alreadyRecorded: true };
  }

  db.prepare(
    `INSERT OR IGNORE INTO commerce_orders (
      id, leadSlug, skuId, skuName, amountPaidUsd, stripeSessionId, createdAt, quantity, customerEmail
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.leadSlug,
    input.skuId,
    input.skuName,
    input.amountPaidUsd,
    input.stripeSessionId,
    createdAt,
    input.quantity ?? null,
    input.customerEmail ?? null,
  );
  return { alreadyRecorded: false };
}

/**
 * Newest-first by app createdAt. convex/commerceOrders.list sorts at the
 * source; sortCommerceOrdersNewestFirst here stays as belt-and-suspenders so
 * the Commerce payouts panel cannot regress if a future caller bypasses that
 * query shape (same pattern as listOrders + sortOrdersNewestFirst).
 */
export async function listCommerceOrders(
  limit = 200,
): Promise<CommerceOrderRecord[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 500);

  if (convexClient) {
    try {
      const rows = (await convexClient.query(api.commerceOrders.list, {
        limit: safeLimit,
        apiSecret: convexApiSecret,
      })) as CommerceOrderRecord[];
      return sortCommerceOrdersNewestFirst(rows);
    } catch (e) {
      console.warn(
        "Failed to list commerce orders from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      "SELECT * FROM commerce_orders ORDER BY createdAt DESC LIMIT ?",
    )
    .all(safeLimit) as unknown as SqliteCommerceOrderRow[];
  return rows.map(mapCommerceOrderRow);
}

/**
 * Every unpaid commerce order for manual payout reconciliation / owed totals.
 * Prefer this over listCommerceOrders() for pipeline-health, digest, and the
 * Commerce payouts panel — list()'s newest-page cap undercounts liability.
 *
 * Newest-first by app createdAt on both backends (Convex sorts at source;
 * belt-and-suspenders re-sort here matches listCommerceOrders / listOrders).
 */
export async function listUnpaidCommerceOrders(): Promise<CommerceOrderRecord[]> {
  if (convexClient) {
    try {
      const rows = (await convexClient.query(
        api.commerceOrders.listUnpaid,
        { apiSecret: convexApiSecret },
      )) as CommerceOrderRecord[];
      return sortCommerceOrdersNewestFirst(rows);
    } catch (e) {
      console.warn(
        "Failed to list unpaid commerce orders from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      `SELECT * FROM commerce_orders
       WHERE paidOutAt IS NULL OR paidOutAt = ''
       ORDER BY createdAt DESC`,
    )
    .all() as unknown as SqliteCommerceOrderRow[];
  return rows.map(mapCommerceOrderRow);
}

/**
 * Every refunded commerce order, regardless of paidOutAt — listUnpaidCommerceOrders
 * drops a row once paidOutAt is set, so a refund landing AFTER payout (clawback
 * owed from the client) would otherwise be invisible to pipeline-health/digest.
 * Uncapped for the same reason listUnpaidCommerceOrders is: this is a bounded
 * operator ledger and completeness beats a truncated recent page (see
 * commerce-order-refund-clawback-tracking).
 */
export async function listCommerceOrdersRefunded(): Promise<CommerceOrderRecord[]> {
  if (convexClient) {
    try {
      const rows = (await convexClient.query(
        api.commerceOrders.listRefunded,
        { apiSecret: convexApiSecret },
      )) as CommerceOrderRecord[];
      return sortCommerceOrdersNewestFirst(rows);
    } catch (e) {
      console.warn(
        "Failed to list refunded commerce orders from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      `SELECT * FROM commerce_orders
       WHERE refundedAt IS NOT NULL AND refundedAt != ''
       ORDER BY createdAt DESC`,
    )
    .all() as unknown as SqliteCommerceOrderRow[];
  return rows.map(mapCommerceOrderRow);
}

/**
 * Every disputed commerce order, regardless of paidOutAt — same rationale as
 * listCommerceOrdersRefunded: listUnpaidCommerceOrders drops a row once
 * paidOutAt is set, so a dispute landing AFTER payout (clawback owed from the
 * client) would otherwise be invisible to pipeline-health/digest. Uncapped
 * for the same reason (see commerce-order-dispute-clawback-tracking).
 */
export async function listCommerceOrdersDisputed(): Promise<CommerceOrderRecord[]> {
  if (convexClient) {
    try {
      const rows = (await convexClient.query(
        api.commerceOrders.listDisputed,
        { apiSecret: convexApiSecret },
      )) as CommerceOrderRecord[];
      return sortCommerceOrdersNewestFirst(rows);
    } catch (e) {
      console.warn(
        "Failed to list disputed commerce orders from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      `SELECT * FROM commerce_orders
       WHERE disputedAt IS NOT NULL AND disputedAt != ''
       ORDER BY createdAt DESC`,
    )
    .all() as unknown as SqliteCommerceOrderRow[];
  return rows.map(mapCommerceOrderRow);
}

/**
 * Every commerce order with no client-receipt-sent marker, regardless of
 * paidOutAt/refundedAt/disputedAt — sendCommerceBuyNowClientReceipt notifies
 * the local business (the "client") that their storefront sold something; a
 * permanently-bad email or a sustained Resend outage past Stripe's webhook
 * retry window leaves clientReceiptEmailSentAt unset forever with nothing
 * else surfacing the gap. Uncapped for the same reason
 * listCommerceOrdersRefunded/listCommerceOrdersDisputed are (see
 * commerce-buy-now-client-receipt-visibility).
 */
export async function listCommerceOrdersMissingClientReceipt(): Promise<
  CommerceOrderRecord[]
> {
  if (convexClient) {
    try {
      const rows = (await convexClient.query(
        api.commerceOrders.listMissingClientReceipt,
        { apiSecret: convexApiSecret },
      )) as CommerceOrderRecord[];
      return sortCommerceOrdersNewestFirst(rows);
    } catch (e) {
      console.warn(
        "Failed to list commerce orders missing client receipt from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare(
      `SELECT * FROM commerce_orders
       WHERE clientReceiptEmailSentAt IS NULL OR clientReceiptEmailSentAt = ''
       ORDER BY createdAt DESC`,
    )
    .all() as unknown as SqliteCommerceOrderRow[];
  return rows.map(mapCommerceOrderRow);
}

/** Single commerce order by Stripe Checkout Session id (Mark paid out lookup). */
export async function getCommerceOrderByStripeSessionId(
  stripeSessionId: string,
): Promise<CommerceOrderRecord | null> {
  if (convexClient) {
    try {
      const row = (await convexClient.query(
        api.commerceOrders.getByStripeSessionId,
        { stripeSessionId, apiSecret: convexApiSecret },
      )) as CommerceOrderRecord | null;
      return row;
    } catch (e) {
      console.warn(
        `Failed to get commerce order ${stripeSessionId} from Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM commerce_orders WHERE stripeSessionId = ?")
    .get(stripeSessionId) as SqliteCommerceOrderRow | undefined;
  return row ? mapCommerceOrderRow(row) : null;
}

/**
 * Marks a commerce order as manually paid out to the client — reduces
 * double-pay risk on the payout panel until Stripe Connect ships. Keyed on
 * stripeSessionId (unique, always present), matching recordCheckoutRecoverySent.
 *
 * Pass { requireConvex: true } from markCommerceOrderPaidOutAction so a
 * Convex mutation failure surfaces instead of SQLite-only success while
 * Convex-first unpaid owed readers still show the order as owed.
 *
 * Returns whether the row was actually marked paid out. The caller
 * (markCommerceOrderPaidOutAction) already rejects a refunded/disputed/
 * already-paid-out order based on a row it read moments earlier — but that
 * earlier read can go stale: an independent Stripe webhook
 * (charge.refunded / charge.dispute.created) can record a refund or dispute
 * in the window between that read and this write, since the two are
 * uncorrelated async deliveries. The UPDATE's WHERE clause (and the Convex
 * mutation's matching in-handler check) re-verifies refundedAt/disputedAt/
 * paidOutAt atomically with the write itself, so a race never leaves an
 * order both paid out AND refunded/disputed — the action-level check alone
 * cannot guarantee that. See commerce-order-paid-out-refund-race-guard in
 * /docs/process.
 */
export async function markCommerceOrderPaidOut(
  stripeSessionId: string,
  paidOutAt: string = new Date().toISOString(),
  options?: ConvexPrimaryWriteOptions,
): Promise<boolean> {
  if (convexClient) {
    try {
      return await convexClient.mutation(api.commerceOrders.markPaidOut, {
        stripeSessionId,
        paidOutAt,
        apiSecret: convexApiSecret,
      });
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("markCommerceOrderPaidOut", e);
      }
      console.warn(
        `Failed to mark commerce order ${stripeSessionId} paid out on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  return sqliteMarkCommerceOrderPaidOut(getSqliteDb(), stripeSessionId, paidOutAt);
}

/**
 * Durable client-receipt sent-marker after sendCommerceBuyNowClientReceipt
 * resolves { success: true }. Keyed on stripeSessionId — Stripe redelivery
 * recovers the client order notification while this field is unset.
 *
 * Pass { requireConvex: true } from the Stripe webhook so a Convex mutation
 * failure surfaces (5xx → Stripe retry) instead of SQLite-only success while
 * Convex-first getCommerceOrderByStripeSessionId still looks unmarked.
 *
 * Returns whether the row was actually marked (re-checks clientReceiptEmailSentAt
 * IS NULL atomically with the write, matching markCommerceOrderPaidOut's
 * refunded/disputed/paidOutAt re-check) — see commerce-client-receipt-marker-race-guard.
 */
export async function markCommerceOrderClientReceiptSent(
  stripeSessionId: string,
  clientReceiptEmailSentAt: string = new Date().toISOString(),
  options?: ConvexPrimaryWriteOptions,
): Promise<boolean> {
  if (convexClient) {
    try {
      return await convexClient.mutation(api.commerceOrders.markClientReceiptSent, {
        stripeSessionId,
        clientReceiptEmailSentAt,
        apiSecret: convexApiSecret,
      });
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("markCommerceOrderClientReceiptSent", e);
      }
      console.warn(
        `Failed to mark commerce client receipt sent for ${stripeSessionId} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  return sqliteMarkCommerceOrderClientReceiptSent(
    getSqliteDb(),
    stripeSessionId,
    clientReceiptEmailSentAt,
  );
}

/**
 * Marks a commerce order refunded — called from the Stripe webhook's
 * charge.refunded handler after it resolves the order's Checkout Session.
 * Keyed on stripeSessionId (unique, always present), matching markCommerceOrderPaidOut.
 * Idempotent: a redelivered/duplicate refund event re-applying the same mark is a no-op.
 *
 * Pass { requireConvex: true } from the webhook (WEBHOOK_CONVEX_PRIMARY) so a
 * Convex mutation failure surfaces (5xx → Stripe retry) instead of SQLite-only
 * success while Convex-first owed/clawback readers on other instances still
 * show the order as owed and never flag the clawback.
 */
export async function markCommerceOrderRefunded(
  stripeSessionId: string,
  refundedAt: string = new Date().toISOString(),
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.commerceOrders.markRefunded, {
        stripeSessionId,
        refundedAt,
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("markCommerceOrderRefunded", e);
      }
      console.warn(
        `Failed to mark commerce order ${stripeSessionId} refunded on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare(
    "UPDATE commerce_orders SET refundedAt = ? WHERE stripeSessionId = ? AND (refundedAt IS NULL OR refundedAt = '')",
  ).run(refundedAt, stripeSessionId);
}

/**
 * Clears a commerce order's refundedAt — called from the Stripe webhook's
 * refund.updated handler when the refund that originally set it
 * (failed/canceled) never actually completed, so the funds never left the
 * platform and the order must reopen as owed / eligible for Mark paid out.
 * Keyed on stripeSessionId, matching markCommerceOrderRefunded. Idempotent: a
 * redelivered clear on an already-unrefunded row is a no-op.
 *
 * Pass { requireConvex: true } from the webhook (WEBHOOK_CONVEX_PRIMARY) so a
 * Convex mutation failure surfaces (5xx → Stripe retry) instead of SQLite-only
 * success while Convex-first owed/clawback readers on other instances still
 * show the order as refunded (and permanently excluded from owed) forever.
 */
export async function clearCommerceOrderRefunded(
  stripeSessionId: string,
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.commerceOrders.clearRefunded, {
        stripeSessionId,
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("clearCommerceOrderRefunded", e);
      }
      console.warn(
        `Failed to clear commerce order ${stripeSessionId} refunded on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare(
    "UPDATE commerce_orders SET refundedAt = NULL WHERE stripeSessionId = ? AND refundedAt IS NOT NULL AND refundedAt != ''",
  ).run(stripeSessionId);
}

/**
 * Marks a commerce order disputed — called from the Stripe webhook's
 * charge.dispute.created handler after it resolves the order's Checkout
 * Session. Keyed on stripeSessionId (unique, always present), matching
 * markCommerceOrderRefunded. Idempotent: a redelivered/duplicate dispute
 * event re-applying the same mark is a no-op.
 *
 * Pass { requireConvex: true } from the webhook (WEBHOOK_CONVEX_PRIMARY) so a
 * Convex mutation failure surfaces (5xx → Stripe retry) instead of SQLite-only
 * success while Convex-first owed/clawback readers on other instances still
 * show the order as owed and never flag the clawback.
 */
export async function markCommerceOrderDisputed(
  stripeSessionId: string,
  disputedAt: string = new Date().toISOString(),
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.commerceOrders.markDisputed, {
        stripeSessionId,
        disputedAt,
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("markCommerceOrderDisputed", e);
      }
      console.warn(
        `Failed to mark commerce order ${stripeSessionId} disputed on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare(
    "UPDATE commerce_orders SET disputedAt = ? WHERE stripeSessionId = ? AND (disputedAt IS NULL OR disputedAt = '')",
  ).run(disputedAt, stripeSessionId);
}

/**
 * Clears commerceOrders.disputedAt — called from the Stripe webhook's
 * charge.dispute.closed handler when status is won / warning_closed (funds
 * reinstated or never permanently withdrawn). Keyed on stripeSessionId.
 * Idempotent: a redelivered clear on an already-undisputed row is a no-op.
 *
 * Pass { requireConvex: true } from the webhook (WEBHOOK_CONVEX_PRIMARY) so a
 * Convex mutation failure surfaces (5xx → Stripe retry) instead of SQLite-only
 * success while Convex-first owed/clawback readers on other instances still
 * show the order as disputed forever.
 */
export async function clearCommerceOrderDisputed(
  stripeSessionId: string,
  options?: ConvexPrimaryWriteOptions,
): Promise<void> {
  if (convexClient) {
    try {
      await convexClient.mutation(api.commerceOrders.clearDisputed, {
        stripeSessionId,
        apiSecret: convexApiSecret,
      });
      return;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("clearCommerceOrderDisputed", e);
      }
      console.warn(
        `Failed to clear commerce order ${stripeSessionId} disputed on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  db.prepare(
    "UPDATE commerce_orders SET disputedAt = NULL WHERE stripeSessionId = ? AND disputedAt IS NOT NULL AND disputedAt != ''",
  ).run(stripeSessionId);
}

// --- Client voice FAQ packs (Complete receptionist scripts) ---

export async function upsertClientVoicePack(
  input: UpsertClientVoicePackInput,
  options?: ConvexPrimaryWriteOptions,
): Promise<ClientVoicePack> {
  const pack: ClientVoicePack = {
    id: `cv_${input.leadSlug}`,
    leadSlug: input.leadSlug,
    variants: input.variants,
    generatedAt: input.generatedAt,
    generator: input.generator,
  };

  if (convexClient) {
    try {
      await convexClient.mutation(api.clientVoicePacks.upsert, {
        packId: pack.id,
        leadSlug: pack.leadSlug,
        variants: pack.variants,
        generatedAt: pack.generatedAt,
        generator: pack.generator,
        apiSecret: convexApiSecret,
      });
      return pack;
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("upsertClientVoicePack", e);
      }
      console.warn(
        `Failed to upsert client voice pack for ${pack.leadSlug} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  // Regenerating always clears sentToClientAt — see upsertMarketingPack's
  // matching comment (marketing-voice-pack-client-send-visibility).
  db.prepare(`
    INSERT INTO client_voice_packs (
      id, leadSlug, variantsJson, generatedAt, generator
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(leadSlug) DO UPDATE SET
      id = excluded.id,
      variantsJson = excluded.variantsJson,
      generatedAt = excluded.generatedAt,
      generator = excluded.generator,
      sentToClientAt = NULL
  `).run(
    pack.id,
    pack.leadSlug,
    JSON.stringify(pack.variants),
    pack.generatedAt,
    pack.generator,
  );
  return pack;
}

export async function getClientVoicePackByLeadSlug(
  leadSlug: string,
): Promise<ClientVoicePack | null> {
  if (convexClient) {
    try {
      const pack = (await convexClient.query(api.clientVoicePacks.getByLeadSlug, {
        leadSlug,
        apiSecret: convexApiSecret,
      })) as ClientVoicePack | null;
      // Convex-primary reads bypass parseClientVoiceVariants — soft-cap here so
      // Email voice pack + dashboard cannot emit pre-generate-cap rows.
      return pack ? softCapClientVoicePack(pack) : null;
    } catch (e) {
      console.warn(
        `Failed to get client voice pack for ${leadSlug} from Convex, falling back to SQLite`,
        e,
      );
    }
  }

  const db = getSqliteDb();
  const row = db
    .prepare("SELECT * FROM client_voice_packs WHERE leadSlug = ?")
    .get(leadSlug) as SqliteClientVoicePackRow | undefined;
  return row ? mapClientVoicePackRow(row) : null;
}

/**
 * Every client voice pack — feeds listClientVoicePacksDue / pipeline-health /
 * digest. Uncapped: a newest-page slice undercounts Complete fulfillment
 * (false "voice packs due" once volume exceeds the window).
 * Optional `limit` is ignored (kept for call-site compatibility).
 */
export async function listClientVoicePacks(
  _limit?: number,
): Promise<ClientVoicePack[]> {
  void _limit;

  if (convexClient) {
    try {
      const packs = (await convexClient.query(
        api.clientVoicePacks.list,
        { apiSecret: convexApiSecret },
      )) as ClientVoicePack[];
      return packs.map(softCapClientVoicePack);
    } catch (e) {
      console.warn(
        "Failed to list client voice packs from Convex, falling back to SQLite",
        e,
      );
    }
  }

  const db = getSqliteDb();
  const rows = db
    .prepare("SELECT * FROM client_voice_packs ORDER BY generatedAt DESC")
    .all() as unknown as SqliteClientVoicePackRow[];
  return rows.map(mapClientVoicePackRow);
}

/**
 * Durable sent-marker after sendClientVoicePackToClientEmail resolves
 * { success: true } in sendClientVoicePackToClientAction. Keyed on leadSlug
 * (matches the pack's own uniqueness — one row per lead). Mirrors
 * markMarketingPackSentToClient's race-guard (see
 * marketing-voice-pack-client-send-visibility).
 */
export async function markClientVoicePackSentToClient(
  leadSlug: string,
  sentToClientAt: string = new Date().toISOString(),
  options?: ConvexPrimaryWriteOptions,
): Promise<boolean> {
  if (convexClient) {
    try {
      return await convexClient.mutation(api.clientVoicePacks.markSentToClient, {
        leadSlug,
        sentToClientAt,
        apiSecret: convexApiSecret,
      });
    } catch (e) {
      if (!shouldFallbackToSqliteOnConvexFailure(true, options)) {
        throw new ConvexPrimaryWriteError("markClientVoicePackSentToClient", e);
      }
      console.warn(
        `Failed to mark client voice pack sent to client for ${leadSlug} on Convex, falling back to SQLite`,
        e,
      );
    }
  }

  return sqliteMarkClientVoicePackSentToClient(getSqliteDb(), leadSlug, sentToClientAt);
}
