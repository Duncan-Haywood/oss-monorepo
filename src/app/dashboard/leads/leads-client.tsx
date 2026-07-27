"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react";
import Link from "next/link";
import type { Lead, LeadPipelineStage, BusinessCategory } from "@/lib/leads/types";
import type { DeployHandoff } from "@/lib/deploy/types";
import { isVercelDomainProvisioningFailed } from "@/lib/deploy/handoff-preserve";
import type { ClientInquiry, ClientInquiryStatus } from "@/lib/inquiries/types";
import type { CheckoutSessionRecord } from "@/lib/checkout/types";
import { CSV_LEAD_TEMPLATE, formatCsvImportSummary } from "@/lib/leads/csv-import";
import { leadPreviewPath } from "@/lib/leads/slug-path";
import { dashboardRowActionAriaLabel } from "@/lib/leads/dashboard-row-aria-labels";
import {
  inquiryReplyToggleElementId,
  leadCommerceToggleElementId,
  leadNotesToggleElementId,
} from "@/lib/leads/dashboard-focus-restore";
import {
  updateLeadStageAction,
  addLeadAction,
  importLeadsCsvAction,
  markHandoffLiveAction,
  createDeployHandoffForLeadAction,
  updateInquiryStatusAction,
  replyToInquiryAction,
  sendFollowUpAction,
  assignVercelProjectAction,
  assignCustomDomainAction,
  sendCheckoutRecoveryAction,
  sendCommerceCheckoutRecoveryAction,
  markCommerceOrderPaidOutAction,
  resendCommerceClientReceiptAction,
  resendBundleBuyerEmailAction,
  updateLeadNotesAction,
  snoozeLeadAction,
  disposeColdLeadAction,
  openBillingPortalAction,
  sendStarterUpsellAction,
  generateMarketingPackAction,
  sendMarketingPackToClientAction,
  saveCommerceCatalogAction,
  syncCommerceCatalogToStripeAction,
  archiveOrphanCommerceStripeProductsAction,
  generateClientVoicePackAction,
  sendClientVoicePackToClientAction,
  createStripeConnectAccountAction,
  createStripeConnectOnboardingLinkAction,
  sendStripeConnectOnboardingLinkToClientAction,
  checkStripeConnectAccountStatusAction,
  listBufferProfilesAction,
  saveLeadBufferProfilesAction,
  scheduleMarketingPackToBufferAction,
} from "./actions";
import type { OrderRecord } from "@/lib/orders/types";
import { isOrderRefunded, isOrderDisputed } from "@/lib/orders/types";
import type { MarketingPack } from "@/lib/marketing/pack";
import type { CommerceCatalog, CommerceSku } from "@/lib/commerce/types";
import type { CommerceOrderRecord } from "@/lib/commerce/orders";
import { resolveDisplayedConnectStatus } from "@/lib/commerce/stripe-connect";
import {
  MAX_COMMERCE_SKUS,
  MIN_SKU_PRICE_CENTS,
  commerceDraftItemsAfterSync,
  commerceMarkPaidOutAriaLabel,
  commerceOrdersByLeadSummaryNeedsAttention,
  formatPriceUsd,
  isCommerceOrderOwed,
  leadEligibleForCommerceCatalog,
  listCommerceCatalogsMissing,
  listCommerceCatalogsUnsynced,
  newCommerceSkuId,
  oldestCommerceCatalogCandidateAgeHours,
  sumCommerceOrdersByLeadOrderCount,
  summarizeCommerceOrdersByLead,
} from "@/lib/commerce";
import type { ClientVoicePack } from "@/lib/voice/pack";
import {
  leadEligibleForClientVoicePack,
  listClientVoicePacksDue,
  oldestClientVoicePacksDueAgeHours,
  scriptTypeLabel,
} from "@/lib/voice/faq-pack";
import { leadEligibleForClientVoicePackDelivery } from "@/lib/voice/deliver-pack";
import { orderEligibleForBillingPortal } from "@/lib/billing/portal";
import {
  leadEligibleForStarterUpsell,
  listStarterUpsellCandidates,
  oldestStarterUpsellCandidateAgeHours,
  resolveUpsellTargetTier,
} from "@/lib/billing/starter-upsell";
import {
  listRecurringEntitlementPaused,
  oldestRecurringEntitlementPausedAgeHours,
} from "@/lib/orders/recurring";
import { bundlePriceHeadingLabel, getBundle } from "@/lib/pricing/bundles";
import {
  contentTypeLabel,
  leadEligibleForMarketingPack,
  listMarketingPacksDue,
  marketingMonthKey,
  oldestMarketingPacksDueAgeHours,
} from "@/lib/marketing/monthly-pack";
import { leadEligibleForMarketingPackDelivery } from "@/lib/marketing/deliver-pack";
import { resolveBufferSelection } from "@/lib/marketing/buffer";
import {
  FOLLOW_UP_2_AFTER_DAYS,
  FOLLOW_UP_3_AFTER_DAYS,
  isColdLead,
  isFollowUpDue,
  listColdLeads,
  listFollowUpsDue,
  nextFollowUpStep,
  normalizeOutreachStep,
  oldestLastOutreachAgeHours,
} from "@/lib/email/outreach-followups";
import {
  coldLeadDispositionLabel,
  type ColdLeadDisposition,
} from "@/lib/leads/cold-archive";
import {
  ABANDONED_AFTER_HOURS,
  leadSlugsEligibleForCommerceAbandonedRecovery,
  listAbandonedCheckoutsDue,
  listCommerceAbandonedCheckoutsDue,
  oldestCheckoutSessionAgeHours,
} from "@/lib/checkout/abandoned-recovery";
import {
  qualityBandClass,
  qualityBandLabel,
  rankLeadsForOutreach,
  scoreLead,
  type LeadQualityResult,
} from "@/lib/leads/quality-score";
import {
  MAX_ADDRESS_LENGTH,
  MAX_BUSINESS_NAME_LENGTH,
  MAX_CITY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_HOURS_SEGMENT_LENGTH,
  MAX_LEAD_EMAIL_LENGTH,
  MAX_LEAD_PHONE_LENGTH,
  MAX_STATE_LENGTH,
  MAX_TAGLINE_LENGTH,
} from "@/lib/leads/create-fields";
import { MAX_LEAD_SLUG_LENGTH } from "@/lib/leads/slug";
import {
  MAX_OPERATOR_NOTES_LENGTH,
  leadHasNotes,
  notesPromptMessage,
  shouldAutoOpenNotesEditor,
  shouldPromptNotesAfterOutreachStep,
  shouldPromptNotesAfterStageChange,
  type NotesPromptReason,
} from "@/lib/leads/notes";
import {
  decrementInFlightCount,
  incrementInFlightCount,
  mergeFreshLeadsPreservingInFlightEdits,
  revertSingleLeadOptimisticUpdate,
  upsertSavedLeadBySlug,
} from "@/lib/leads/optimistic-updates";
import {
  SNOOZE_PRESET_IDS,
  isLeadSnoozed,
  snoozePresetLabel,
  snoozeRemainingLabel,
  type SnoozePresetId,
} from "@/lib/leads/snooze";
import {
  MAX_INQUIRY_REPLY_LENGTH,
  inquiryCanReceiveReply,
  inquiryShouldAutoMarkRead,
} from "@/lib/inquiries/reply";
import {
  deployHandoffAgeHours,
  formatAbandonedAgeHours,
  formatUsd,
  isUnrepliedInquiryStatus,
  oldestBundleOrderRefundOrDisputeAgeHours,
  oldestCommerceOrdersOwedAgeHours,
  oldestOpenHandoffAgeHours,
  oldestPaidNotLiveAgeHours,
  oldestUnrepliedInquiryAgeHoursFor,
} from "@/lib/metrics/pipeline-health";
import {
  isBundleHandoffMissingBuyerEmail,
  hasBundleReceiptEmailNote,
  hasBundleDnsHandoffEmailNote,
} from "@/lib/payments/bundle-side-effect-recovery";

interface LeadsClientProps {
  initialLeads: Lead[];
  initialHandoffs?: DeployHandoff[];
  initialInquiries?: ClientInquiry[];
  initialCheckoutSessions?: CheckoutSessionRecord[];
  initialOrders?: OrderRecord[];
  initialMarketingPacks?: MarketingPack[];
  initialCommerceCatalogs?: CommerceCatalog[];
  initialClientVoicePacks?: ClientVoicePack[];
  /** Pass-through Buy now ledger for manual client payout reconciliation. */
  initialCommerceOrders?: CommerceOrderRecord[];
  /** Buy now orders whose client-receipt notification never sent — row-level remedy queue. */
  initialCommerceOrdersMissingClientReceipt?: CommerceOrderRecord[];
  /** UTC YYYY-MM for the packs loaded on the server. */
  marketingMonth?: string;
  /** True when ALLOW_STRIPE_CONNECT_ONBOARDING=1 — enables the Payouts panel's account-creation buttons. */
  connectOnboardingAllowed?: boolean;
  /** True when ALLOW_MARKETING_SCHEDULING=1 — enables the Buffer auto-post panel. */
  marketingSchedulingAllowed?: boolean;
}

const STAGES: { id: LeadPipelineStage; label: string; color: string; desc: string }[] = [
  { id: "discovered", label: "Discovered", color: "bg-zinc-100 text-zinc-800 border-zinc-200", desc: "Found via public listings" },
  { id: "site_built", label: "Site Built", color: "bg-blue-50 text-blue-700 border-blue-200", desc: "Preview site generated" },
  { id: "outreach_sent", label: "Outreach Sent", color: "bg-purple-50 text-purple-700 border-purple-200", desc: "Email preview link sent" },
  { id: "discovery_call", label: "Discovery Call", color: "bg-amber-50 text-amber-700 border-amber-200", desc: "Call to review preview" },
  { id: "paid", label: "Paid", color: "bg-emerald-50 text-emerald-700 border-emerald-200", desc: "Stripe checkout complete" },
  { id: "live", label: "Live", color: "bg-indigo-50 text-indigo-700 border-indigo-200", desc: "Custom domain published" },
  { id: "closed", label: "Closed", color: "bg-stone-100 text-stone-700 border-stone-200", desc: "Stopped pursuing (cold close / not a fit)" },
];

const CATEGORIES: { id: BusinessCategory; label: string }[] = [
  { id: "restaurant", label: "Restaurant / Cafe" },
  { id: "salon", label: "Salon / Spa" },
  { id: "trades", label: "Home Services / Trades" },
  { id: "retail", label: "Retail / Shop" },
  { id: "health", label: "Health / Wellness" },
  { id: "automotive", label: "Automotive / Auto Repair" },
  { id: "generic", label: "Generic / Other" },
];

/**
 * Due-queue panel heading ids — see src/components/dashboard/suppressed-emails-panel.tsx
 * for the precedent this mirrors. Each due-queue `<li>` row's own resolve
 * action (or a conditionally-rendered button within a row that survives)
 * unmounts on success with no other guaranteed-mounted control nearby, so
 * the row's/button's handler refocuses the panel's own `<h2>` (id + tabIndex
 * + focus:outline-none on the heading itself) instead of letting focus
 * silently fall back to `<body>`.
 */
const COMMERCE_CATALOGS_MISSING_HEADING_ID = "commerce-catalogs-missing-heading";
const COMMERCE_CATALOGS_UNSYNCED_HEADING_ID = "commerce-catalogs-unsynced-heading";
const STARTER_UPSELL_HEADING_ID = "starter-mrr-upsell-heading";
const MRR_PAUSED_HEADING_ID = "mrr-paused-canceled-heading";
const MARKETING_PACKS_DUE_HEADING_ID = "marketing-packs-due-heading";
const VOICE_PACKS_DUE_HEADING_ID = "voice-packs-due-heading";
const ABANDONED_CHECKOUTS_HEADING_ID = "abandoned-checkouts-heading";
const ABANDONED_BUY_NOW_HEADING_ID = "abandoned-buy-now-heading";
const COMMERCE_PAYOUTS_HEADING_ID = "commerce-payouts-heading";
const MISSING_CLIENT_RECEIPT_HEADING_ID = "missing-client-receipt-heading";
const BUNDLE_ORDER_REFUNDS_DISPUTES_HEADING_ID = "bundle-order-refunds-disputes-heading";
const BUNDLE_MISSING_BUYER_EMAIL_HEADING_ID = "bundle-missing-buyer-email-heading";
const FOLLOW_UPS_DUE_HEADING_ID = "follow-ups-due-heading";
const COLD_LEADS_HEADING_ID = "cold-leads-heading";
const WORK_NEXT_HEADING_ID = "work-next-heading";
const PAID_NOT_LIVE_HEADING_ID = "paid-not-live-heading";
const PRODUCTION_DEPLOY_HANDOFFS_HEADING_ID = "production-deploy-handoffs-heading";
const WEBSITE_INQUIRIES_HEADING_ID = "website-inquiries-heading";
const ALL_LEADS_HEADING_ID = "all-leads-heading";

// Every due-queue panel above is itself conditionally rendered on its own
// list being non-empty (`{list.length > 0 && <section>...}`) — when the
// row a handler just resolved was the LAST row in that queue, the same
// state update that removes the row also empties the list and unmounts the
// whole section, heading included. A same-tick `document.getElementById`
// call transiently finds the still-current (pre-commit) DOM and succeeds,
// then React commits the empty state and silently reverts focus to <body>
// — a different root cause from the disabled-anchor race
// dashboard-focus-restore-async-transition-race already fixed (that fix
// left heading targets as same-tick calls on the assumption headings are
// "never disabled", which is true but doesn't cover them unmounting
// entirely). This stable, always-mounted page heading (src/app/dashboard/leads/page.tsx)
// is the fallback every queued due-queue-panel-heading focus falls back to
// when its own primary target no longer exists post-commit.
const DASHBOARD_HEADING_FALLBACK_ID = "dashboard-leads-heading";

/**
 * Resync a piece of local state to a fresh server-provided `initialX` prop
 * whenever revalidatePath (from any of this component's own actions, an
 * unrelated concurrent action in the same tab, a second tab, or a
 * Stripe/Resend webhook) delivers a new prop reference — adjusted during
 * render, not inside a useEffect, since this repo's
 * react-hooks/set-state-in-effect rule rejects a synchronous setState call
 * there (the same "adjust state when a prop changes" pattern
 * suppressed-emails-panel-prop-resync established). Safe to fully adopt the
 * fresh prop (no merge needed) ONLY because every local write to the arrays
 * this hook backs happens AFTER that write's own server action has already
 * resolved successfully — by the time it runs, the very same round trip's
 * revalidate has already produced a fresh, agreeing prop, so there is
 * nothing local to preserve. `leads` is the one exception in this file
 * (handleStageChange applies a pre-await optimistic edit) and keeps its own
 * bespoke mergeFreshLeadsPreservingInFlightEdits resync instead of this
 * hook — see leads-client-stale-prop-resync.
 */
function useResyncedState<T>(initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setValue(initial);
  }
  return [value, setValue];
}

export function LeadsClient({
  initialLeads,
  initialHandoffs = [],
  initialInquiries = [],
  initialCheckoutSessions = [],
  initialOrders = [],
  initialMarketingPacks = [],
  initialCommerceCatalogs = [],
  initialClientVoicePacks = [],
  initialCommerceOrders = [],
  initialCommerceOrdersMissingClientReceipt = [],
  marketingMonth = "",
  connectOnboardingAllowed = false,
  marketingSchedulingAllowed = false,
}: LeadsClientProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  // Per-slug reference count of optimistic stage-change edits
  // (handleStageChange) applied locally but not yet confirmed by their own
  // server response — every other setLeads call site in this component only
  // patches a row after its own server action already resolved
  // successfully, so this is the only edit that can still be "ahead of" a
  // freshly re-rendered initialLeads prop (see
  // leads-client-stale-prop-resync / mergeFreshLeadsPreservingInFlightEdits).
  // A count rather than a presence flag: two overlapping calls on the same
  // slug (e.g. the main-table stage <select> and a due-queue action button,
  // both visible for the same lead) must keep the slug in-flight until BOTH
  // settle, not just the first (see stage-change-in-flight-refcount-race).
  const [stageChangeInFlightCounts, setStageChangeInFlightCounts] = useState<
    ReadonlyMap<string, number>
  >(() => new Map());
  // `initialLeads` is a fresh server-fetched prop on every RSC re-render —
  // nearly every handler in actions.ts calls
  // revalidatePath("/dashboard/leads"), and so does a Stripe/Resend webhook
  // firing while this tab sits open, or a second tab's own edits. `leads`
  // above only ever reads `initialLeads` on first mount (useState's initial
  // value is a one-time read) and is otherwise patched exclusively by this
  // component's own handlers — a lead changed by anything else stayed
  // frozen at whatever this tab last saw until a hard reload. Same fix
  // shape as suppressed-emails-panel-prop-resync: adjust state during
  // render (not in an effect, which this repo's react-hooks/set-state-in-effect
  // rule rejects) when the prop reference changes.
  const [prevInitialLeads, setPrevInitialLeads] = useState(initialLeads);
  if (prevInitialLeads !== initialLeads) {
    setPrevInitialLeads(initialLeads);
    setLeads((prev) =>
      mergeFreshLeadsPreservingInFlightEdits(prev, initialLeads, stageChangeInFlightCounts),
    );
  }
  // Same stale-prop bug as `leads` above — fed by an external actor rather
  // than only this component's own handlers for `handoffs` specifically: the
  // Stripe checkout.session.completed webhook calls enqueueProductionHandoff
  // to create/upsert a deploy handoff server-side, independent of anything
  // this tab does. All setter call sites for every array below patch a row
  // only after their own await resolves (never optimistically before), so a
  // wholesale adopt-on-prop-change via the shared useResyncedState helper
  // above is safe for all of them — no in-flight-edit merge needed, unlike
  // `leads`.
  const [handoffs, setHandoffs] = useResyncedState<DeployHandoff[]>(initialHandoffs);
  const [inquiries, setInquiries] = useResyncedState<ClientInquiry[]>(initialInquiries);
  const [checkoutSessions, setCheckoutSessions] =
    useResyncedState<CheckoutSessionRecord[]>(initialCheckoutSessions);
  const [orders] = useResyncedState<OrderRecord[]>(initialOrders);
  const [marketingPacks, setMarketingPacks] =
    useResyncedState<MarketingPack[]>(initialMarketingPacks);
  const [marketingPackOpenSlug, setMarketingPackOpenSlug] = useState<string | null>(null);
  const [commerceCatalogs, setCommerceCatalogs] =
    useResyncedState<CommerceCatalog[]>(initialCommerceCatalogs);
  const [commerceEditSlug, setCommerceEditSlug] = useState<string | null>(null);
  const [commerceDraftItems, setCommerceDraftItems] = useState<CommerceSku[]>([]);
  const [commerceCatalogError, setCommerceCatalogError] = useState<string | null>(null);
  // Success/no-op informational notices for the Commerce editor's "Archive
  // orphans" action (archived-count confirmation, zero-orphans notice) —
  // single string like commerceCatalogError since only one Commerce editor
  // can be open at a time; role="status" (not "alert") since neither
  // message is a failure. Cleared/set alongside commerceCatalogError so the
  // two never show stale/contradictory text at once.
  const [commerceCatalogNotice, setCommerceCatalogNotice] = useState<string | null>(null);
  // Sync-to-Stripe failures from the "Commerce catalogs unsynced" due-queue
  // panel's own quick-action button — that <li> renders even when the full
  // Commerce editor isn't open for the lead, so it can't reuse
  // commerceCatalogError (which only renders inside the editor block).
  // Keyed by slug since multiple due-queue rows can fail independently.
  const [commerceSyncQueueErrors, setCommerceSyncQueueErrors] = useState<
    Record<string, string>
  >({});
  const [stripeConnectError, setStripeConnectError] = useState<string | null>(null);
  // Success/informational notices for the Stripe Connect onboarding-link
  // actions (link-copied confirmation, link-emailed confirmation) — single
  // string like stripeConnectError since only one lead's Commerce editor
  // (and thus Payouts panel) can be open at a time; role="status" since
  // neither message is a failure. Cleared/set alongside stripeConnectError.
  const [stripeConnectNotice, setStripeConnectNotice] = useState<string | null>(null);
  // Errors from five independent due-queue panels (Abandoned checkouts,
  // Abandoned Buy now, Commerce payouts, Missing client receipt, Bundle
  // buyer email missing) — one shared map since each panel's rows are
  // always mounted whether or not any other panel/editor is open, unlike
  // commerceCatalogError/commerceSyncQueueErrors' editor-vs-queue split
  // above. Keyed with a per-panel prefix (not just the row id alone) as
  // defense in depth against two different queues' row ids ever coinciding
  // — see the dual-panel id-collision hazard documented on
  // handoffActionErrors below for why this codebase treats that as a real
  // risk rather than a theoretical one.
  const [queueActionErrors, setQueueActionErrors] = useState<Record<string, string>>({});
  // Errors from the main table's per-row Kanban actions (stage change,
  // snooze/unsnooze, cold-lead disposition) — these fire from both the main
  // table AND the due-queue panels below, but are always rendered inline in
  // the main table row (the one place every affected lead is guaranteed to
  // be mounted), keyed by slug since multiple rows' actions can be in
  // flight/failed independently at once.
  const [leadActionErrors, setLeadActionErrors] = useState<Record<string, string>>({});
  // Success/informational notices for the same per-row action cluster as
  // leadActionErrors above (Starter upsell send, Email marketing pack, Email
  // voice pack, and the marketing/voice pack variant Copy buttons' clipboard
  // failure — the one genuine failure in this group, still routed through
  // leadActionErrors, not here) — same Record<string, string>-keyed-by-slug
  // shape, cleared alongside leadActionErrors at the start of each handler so
  // the two never show stale/contradictory text for the same lead at once.
  // role="status" (not "alert") since every message here is a success/no-op
  // confirmation, never a failure.
  const [leadActionNotices, setLeadActionNotices] = useState<Record<string, string>>({});
  // Errors from Paid, not live's Create deploy handoff and Production deploy
  // handoffs' Mark live — two distinct actions from two distinct due-queue
  // panels, sharing one keyed-by-slug map (same convention as
  // leadActionErrors above) since a lead can only be showing one of the two
  // buttons at a time (Create deploy handoff disappears once a handoff
  // exists; Mark live only exists on an already-created handoff row).
  const [handoffActionErrors, setHandoffActionErrors] = useState<Record<string, string>>({});
  const [clientVoicePacks, setClientVoicePacks] =
    useResyncedState<ClientVoicePack[]>(initialClientVoicePacks);
  const [clientVoicePackOpenSlug, setClientVoicePackOpenSlug] = useState<string | null>(
    null,
  );
  const [commerceOrders, setCommerceOrders] =
    useResyncedState<CommerceOrderRecord[]>(initialCommerceOrders);
  const [commerceOrdersMissingClientReceipt, setCommerceOrdersMissingClientReceipt] =
    useResyncedState<CommerceOrderRecord[]>(initialCommerceOrdersMissingClientReceipt);
  /** Snapshot clock for due-queue math — avoid Date.now() during render (react-hooks/purity). */
  const [nowMs] = useState(() => Date.now());
  const [filterStage, setFilterStage] = useState<LeadPipelineStage | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortByQuality, setSortByQuality] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyOpenId, setReplyOpenId] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [inquiryActionErrors, setInquiryActionErrors] = useState<Record<string, string>>({});
  // The mock-reply informational notice ("Reply sent (mock — RESEND_API_KEY
  // not configured)") from handleInquiryReply — keyed by inquiry id like
  // inquiryActionErrors, rendered in the same always-mounted <li> since the
  // reply composer itself unmounts on send (closeReplyComposer) before this
  // message would show. role="status" since it's a success confirmation.
  const [inquiryActionNotices, setInquiryActionNotices] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  // Row-scoped toggle buttons used as refocus anchors (Notes/Commerce/Reply
  // toggles — see dashboard-focus-restore.ts) are `disabled={isPending}`,
  // same as the row action buttons that trigger these closes. A close
  // triggered from inside a `startTransition(async () => ...)` callback
  // (e.g. a successful Save) calls this focus-restore logic before React has
  // committed `isPending` back to false — React keeps an async transition's
  // `isPending` true for the whole awaited operation, not just its
  // synchronous portion, so the anchor button is still disabled (and
  // therefore unfocusable) at the exact moment a same-tick `.focus()` call
  // would run, and the browser silently drops it: focus falls back to
  // <body> instead of the intended anchor. A direct (non-transition) close,
  // e.g. clicking Cancel, has no such race — isPending is already false.
  // Route every toggle-button-target refocus through this queued mechanism
  // instead of a same-tick `document.getElementById(id)?.focus()` so both
  // cases resolve correctly: the effect below fires as soon as isPending is
  // (or becomes) false, whichever happens first (dashboard-focus-restore-async-transition-race).
  // The pending target lives in a ref (not state) so the effect can clear it
  // without a react-hooks/set-state-in-effect violation; focusToken is a
  // monotonic counter (not the id itself) so re-queuing the SAME anchor id
  // twice in a row (e.g. snooze, unsnooze, snooze again) still re-triggers
  // the effect — a repeated identical state value would otherwise bail out
  // of the dependency change entirely and silently skip the second focus.
  // An optional fallbackId covers a due-queue panel heading that may itself
  // unmount (the whole panel is gated on its list being non-empty) — the
  // effect runs post-commit, so it can reliably tell whether the primary
  // target survived and fall back to a stable anchor when it didn't
  // (dashboard-due-queue-panel-heading-unmount-focus-restore).
  const pendingFocusElementIdRef = useRef<{ id: string; fallbackId?: string } | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const queueFocusElement = (id: string, fallbackId?: string) => {
    pendingFocusElementIdRef.current = { id, fallbackId };
    setFocusToken((t) => t + 1);
  };
  useEffect(() => {
    if (isPending) return;
    const target = pendingFocusElementIdRef.current;
    if (!target) return;
    const el =
      document.getElementById(target.id) ??
      (target.fallbackId ? document.getElementById(target.fallbackId) : null);
    el?.focus();
    pendingFocusElementIdRef.current = null;
  }, [isPending, focusToken]);

  // Form State
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formCategory, setFormCategory] = useState<BusinessCategory>("generic");
  const [formTier, setFormTier] = useState<"starter" | "growth" | "complete">("starter");
  const [formStage, setFormStage] = useState<LeadPipelineStage>("discovered");
  const [formCity, setFormCity] = useState("Denver");
  const [formState, setFormState] = useState("CO");
  const [formAddress, setFormAddress] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formTagline, setFormTagline] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formServices, setFormServices] = useState("");
  const [formWeekday, setFormWeekday] = useState("Mon–Fri 8am–5pm");
  const [formWeekend, setFormWeekend] = useState("Sat 9am–2pm · Closed Sun");
  const [formError, setFormError] = useState<string | null>(null);

  // CSV import state
  const [csvText, setCsvText] = useState(CSV_LEAD_TEMPLATE);
  const [csvDataSource, setCsvDataSource] = useState("csv_import");
  const [csvStage, setCsvStage] = useState<LeadPipelineStage>("discovered");
  const [csvMessage, setCsvMessage] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  /** Expanded notes editor slug (one row at a time). */
  const [notesEditSlug, setNotesEditSlug] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesError, setNotesError] = useState<string | null>(null);
  /** Soft CRM prompt after discovery_call stage or Email 3 — never blocks the action. */
  const [notesPromptReason, setNotesPromptReason] = useState<NotesPromptReason | null>(null);
  /**
   * When checked, Re-engage also moves stage to outreach_sent and sends Email 1.
   * Default off keeps Email 1 intentional (reset to discovered only).
   */
  const [reengageSendEmail1, setReengageSendEmail1] = useState(false);

  // Auto-generate slug from name
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormName(val);
    const generated = val
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    setFormSlug(generated);
  };

  const handleStageChange = async (
    slug: string,
    newStage: LeadPipelineStage,
    headingId?: string,
  ) => {
    const current = leads.find((l) => l.slug === slug);
    const previousStage = current?.stage;
    if (!current) return;

    setLeadActionErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });

    const optimisticLead: Lead =
      (newStage === "outreach_sent" || newStage === "discovery_call") && current.email
        ? {
            ...current,
            stage: newStage,
            outreachStep: 1,
            lastOutreachAt: new Date().toISOString(),
          }
        : { ...current, stage: newStage };

    // Optimistic UI update — mark this row in-flight first so a fresh
    // initialLeads prop arriving mid-request (another action's
    // revalidatePath, a webhook, or a second tab) can't clobber this
    // not-yet-confirmed edit back to stale server data (see
    // leads-client-stale-prop-resync / mergeFreshLeadsPreservingInFlightEdits).
    setStageChangeInFlightCounts((prev) => incrementInFlightCount(prev, slug));
    setLeads((prev) => prev.map((l) => (l.slug === slug ? optimisticLead : l)));

    const res = await updateLeadStageAction(slug, newStage);
    setStageChangeInFlightCounts((prev) => decrementInFlightCount(prev, slug));
    if (!res.success) {
      setLeadActionErrors((prev) => ({
        ...prev,
        [slug]: `Error updating stage: ${res.error}`,
      }));
      // Revert only this row's optimistic change back to its pre-update
      // snapshot — resetting to the full initialLeads page-load prop would
      // silently wipe every other in-session optimistic edit (other stage
      // changes, added leads, snooze/notes/cold-disposition updates) back
      // to stale state whenever a single unrelated stage change fails.
      // Passing optimisticLead guards against a slower, overlapping call:
      // if a second stage change on this row already landed and changed it
      // since, this call's revert becomes a no-op instead of clobbering the
      // newer, already-persisted stage (stage-change-optimistic-revert-race).
      setLeads((prev) =>
        revertSingleLeadOptimisticUpdate(prev, slug, current, optimisticLead),
      );
      return;
    }

    if (
      previousStage &&
      shouldPromptNotesAfterStageChange(previousStage, newStage) &&
      shouldAutoOpenNotesEditor(notesEditSlug, slug)
    ) {
      openNotesEditor(current, "discovery_call");
    }
    // Work next's "Send Email 1" button is conditionally rendered on
    // lead.stage === "site_built" — a successful stage change removes that
    // condition and the just-clicked button unmounts with it, so focus goes
    // to the due-queue panel heading instead of vanishing to <body>. The
    // stage <select> in the main leads table (always mounted) omits
    // headingId. Queued with a fallback since this was the last row in the
    // queue can unmount the heading itself too (see DASHBOARD_HEADING_FALLBACK_ID).
    if (headingId) {
      queueFocusElement(headingId, DASHBOARD_HEADING_FALLBACK_ID);
    }
  };

  const openNotesEditor = (lead: Lead, reason?: NotesPromptReason) => {
    setNotesEditSlug(lead.slug);
    setNotesDraft(lead.notes ?? "");
    setNotesError(null);
    setNotesPromptReason(reason ?? null);
    if (reason) {
      // Soft prompt from a due-queue panel (Follow-ups due / Work next) or a
      // stage-change/outreach-step milestone — these can fire while the
      // operator has a stage filter/search active that excludes this lead
      // from filteredLeads, in which case the row (and this panel) isn't in
      // the DOM at all and the prompt would silently no-op. Clear both so
      // the row actually renders, then bring it into view — same fix as
      // openCommerceEditor's bringIntoView above.
      setFilterStage("all");
      setSearchQuery("");
      requestAnimationFrame(() => {
        document
          .getElementById(`lead-notes-${lead.slug}`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  };

  const closeNotesEditor = (slug?: string) => {
    const focusSlug = slug ?? notesEditSlug;
    setNotesEditSlug(null);
    setNotesDraft("");
    setNotesError(null);
    setNotesPromptReason(null);
    // The Save/Cancel button that triggered this close is inside the panel
    // being unmounted here — without this, focus would silently fall back
    // to <body>. The toggle button that opened the panel stays mounted for
    // the row's whole lifetime, so it's always a valid refocus target.
    // Queued via pendingFocusElementId (not a same-tick .focus() call) so
    // the Save path — which calls this from inside startTransition, while
    // the toggle button is still disabled={isPending} — resolves correctly
    // too; see the pendingFocusElementId effect above.
    if (focusSlug) {
      queueFocusElement(leadNotesToggleElementId(focusSlug));
    }
  };

  const handleSaveNotes = (slug: string) => {
    setNotesError(null);
    startTransition(async () => {
      const res = await updateLeadNotesAction(slug, notesDraft);
      if (!res.success) {
        setNotesError(res.error ?? "Failed to save notes");
        return;
      }
      setLeads((prev) =>
        prev.map((l) => (l.slug === slug ? { ...l, notes: res.notes } : l)),
      );
      closeNotesEditor(slug);
    });
  };

  const handleSnooze = (slug: string, preset: SnoozePresetId, headingId?: string) => {
    setLeadActionErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    startTransition(async () => {
      const res = await snoozeLeadAction(slug, { preset });
      if (!res.success) {
        setLeadActionErrors((prev) => ({
          ...prev,
          [slug]: res.error ?? "Failed to snooze lead",
        }));
        return;
      }
      setLeads((prev) =>
        prev.map((l) =>
          l.slug === slug ? { ...l, snoozedUntil: res.snoozedUntil } : l,
        ),
      );
      // Work next's actionable predicate excludes snoozed leads — a
      // successful snooze removes this row (and the just-clicked button)
      // from the Work next due-queue entirely. Queued with a fallback since
      // being the last row in the queue can unmount the heading itself too.
      if (headingId) {
        queueFocusElement(headingId, DASHBOARD_HEADING_FALLBACK_ID);
        return;
      }
      // Main-table snooze controls stay in a mounted <tr>, but the
      // just-clicked preset button itself is inside a
      // `snoozed ? <Unsnooze/> : <PresetButtons/>` ternary that flips on
      // success, unmounting the exact button that had focus — the <tr>
      // staying mounted does not mean the clicked element does. Refocus the
      // row's Notes toggle (always mounted for the row's whole lifetime,
      // same anchor closeNotesEditor already uses) instead of letting focus
      // silently fall back to <body>. Queued (not a same-tick .focus() call)
      // since the Notes toggle is itself disabled={isPending} and this runs
      // from inside startTransition — see the pendingFocusElementId effect.
      queueFocusElement(leadNotesToggleElementId(slug));
    });
  };

  const handleClearSnooze = (slug: string) => {
    setLeadActionErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    startTransition(async () => {
      const res = await snoozeLeadAction(slug, { clear: true });
      if (!res.success) {
        setLeadActionErrors((prev) => ({
          ...prev,
          [slug]: res.error ?? "Failed to clear snooze",
        }));
        return;
      }
      setLeads((prev) =>
        prev.map((l) =>
          l.slug === slug ? { ...l, snoozedUntil: undefined } : l,
        ),
      );
      // Unsnooze only ever renders in the main table (no due-queue
      // equivalent) and sits inside the same snoozed-ternary as the preset
      // buttons above — clicking it unmounts itself and swaps the preset
      // buttons back in. Refocus the row's Notes toggle, the same
      // always-mounted anchor handleSnooze's main-table path uses (queued
      // for the same disabled={isPending} reason as above).
      queueFocusElement(leadNotesToggleElementId(slug));
    });
  };

  const handleColdDisposition = (
    slug: string,
    disposition: ColdLeadDisposition,
    headingId?: string,
  ) => {
    setLeadActionErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    startTransition(async () => {
      const sendEmail1 = disposition === "reengage" && reengageSendEmail1;
      const res = await disposeColdLeadAction(slug, disposition, { sendEmail1 });
      if (!res.success) {
        // Disposition may have persisted before Email 1 failed — refresh row if stage returned.
        if ("stage" in res && res.stage) {
          setLeads((prev) =>
            prev.map((l) =>
              l.slug === slug
                ? {
                    ...l,
                    stage: res.stage!,
                    outreachStep: res.outreachStep ?? l.outreachStep,
                    lastOutreachAt: res.lastOutreachAt,
                    snoozedUntil: res.snoozedUntil,
                  }
                : l,
            ),
          );
        }
        setLeadActionErrors((prev) => ({
          ...prev,
          [slug]: res.error ?? "Failed to update cold lead",
        }));
        return;
      }
      setLeads((prev) =>
        prev.map((l) =>
          l.slug === slug
            ? {
                ...l,
                stage: res.stage,
                outreachStep: res.outreachStep,
                lastOutreachAt: res.lastOutreachAt,
                snoozedUntil: res.snoozedUntil,
              }
            : l,
        ),
      );
      // Re-engage/Close both move the lead off isColdLead, so its <li>
      // unmounts from the Cold leads due-queue with the just-clicked button
      // still inside it. Queued with a fallback since being the last row in
      // the queue can unmount the heading itself too.
      if (headingId) {
        queueFocusElement(headingId, DASHBOARD_HEADING_FALLBACK_ID);
        return;
      }
      // Main-table Re-engage/Close controls are inside a `cold ? <>...</> :
      // null` fragment that unmounts entirely once the lead moves off
      // isColdLead — worse than the snoozed case above (no sibling stays in
      // its place), so focus would otherwise fall straight to <body>.
      // Refocus the row's Notes toggle, the same always-mounted anchor used
      // for the snooze handlers' main-table path (queued — see above).
      queueFocusElement(leadNotesToggleElementId(slug));
    });
  };

  const handleCsvFile = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
  };

  const handleCsvImport = (e: React.FormEvent) => {
    e.preventDefault();
    setCsvError(null);
    setCsvMessage(null);

    startTransition(async () => {
      const res = await importLeadsCsvAction({
        csvText,
        dataSource: csvDataSource || "csv_import",
        defaultStage: csvStage,
      });

      if (!res.success) {
        setCsvError(res.error ?? "Import failed");
        return;
      }

      setCsvMessage(formatCsvImportSummary(res));

      // Refresh list from optimistic parse by reloading — server owns truth
      window.location.reload();
    });
  };

  const handleAddLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formName || !formSlug) {
      setFormError("Business Name and Slug are required.");
      return;
    }

    const servicesArray = formServices
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const newLeadData = {
      slug: formSlug,
      businessName: formName,
      category: formCategory,
      city: formCity,
      state: formState,
      address: formAddress || undefined,
      tagline: formTagline,
      description: formDesc,
      phone: formPhone,
      email: formEmail || undefined,
      services: servicesArray.length > 0 ? servicesArray : ["Custom digital setup"],
      hours: {
        weekday: formWeekday,
        weekend: formWeekend,
      },
      recommendedTier: formTier,
      stage: formStage,
      dataSource: "manual_entry" as const,
    };

    startTransition(async () => {
      const res = await addLeadAction(newLeadData);
      if (res.success) {
        // addLeadAction normalizes the slug server-side (lowercase,
        // non-[a-z0-9-] -> '-') before persisting and returns that
        // normalized value in res.slug. The Slug field is free-text with
        // no client-side normalization, so if the typed value differs from
        // the server-normalized one, using the raw formSlug here would add
        // a row whose slug matches no DB record — every later action
        // (stage change, snooze, notes, follow-up) on that row would then
        // silently target a non-existent lead until the page reloads.
        const savedLead =
          (formStage === "outreach_sent" || formStage === "discovery_call") && newLeadData.email
            ? {
                ...newLeadData,
                slug: res.slug,
                outreachStep: 1 as const,
                lastOutreachAt: new Date().toISOString(),
              }
            : { ...newLeadData, slug: res.slug };
        setLeads((prev) => upsertSavedLeadBySlug(prev, savedLead));
        
        // Reset form
        setFormName("");
        setFormSlug("");
        setFormCategory("generic");
        setFormTier("starter");
        setFormStage("discovered");
        setFormAddress("");
        setFormPhone("");
        setFormEmail("");
        setFormTagline("");
        setFormDesc("");
        setFormServices("");
        setShowAddForm(false);
      } else {
        setFormError(res.error ?? "Failed to save lead.");
      }
    });
  };

  const handleMarkHandoffLive = (slug: string) => {
    setHandoffActionErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    startTransition(async () => {
      const res = await markHandoffLiveAction(slug);
      if (!res.success) {
        setHandoffActionErrors((prev) => ({
          ...prev,
          [slug]: res.error ?? "Error marking live",
        }));
        return;
      }
      setHandoffs((prev) =>
        prev.map((h) => (h.leadSlug === slug ? { ...h, status: "live" } : h)),
      );
      setLeads((prev) =>
        prev.map((l) => (l.slug === slug ? { ...l, stage: "live" } : l)),
      );
      // Production deploy handoffs filters out status === "live" — the
      // just-clicked Mark live button's <li> unmounts on success, so focus
      // goes to the panel heading instead of vanishing to <body>. Queued
      // with a fallback since being the last row in the queue can unmount
      // the heading itself too (dashboard-due-queue-panel-heading-unmount-focus-restore).
      queueFocusElement(PRODUCTION_DEPLOY_HANDOFFS_HEADING_ID, DASHBOARD_HEADING_FALLBACK_ID);
    });
  };

  const handleCreateDeployHandoff = (slug: string) => {
    setHandoffActionErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    startTransition(async () => {
      const res = await createDeployHandoffForLeadAction(slug);
      if (!res.success) {
        setHandoffActionErrors((prev) => ({
          ...prev,
          [slug]: res.error ?? "Error creating deploy handoff",
        }));
        return;
      }
      setHandoffs((prev) => [...prev, res.handoff]);
      // Paid, not live's Create deploy handoff button is conditionally
      // rendered on !handoffSlugs.has(slug) — a successful create removes
      // that condition and the just-clicked button unmounts with it, so
      // focus goes to the panel heading instead of vanishing to <body>.
      document.getElementById(PAID_NOT_LIVE_HEADING_ID)?.focus();
    });
  };

  const [vercelProjectInputs, setVercelProjectInputs] = useState<Record<string, string>>({});
  const [vercelProjectErrors, setVercelProjectErrors] = useState<Record<string, string>>({});

  const handleAssignVercelProject = (slug: string) => {
    const value = vercelProjectInputs[slug] ?? "";
    setVercelProjectErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    startTransition(async () => {
      const res = await assignVercelProjectAction(slug, value);
      if (!res.success) {
        setVercelProjectErrors((prev) => ({
          ...prev,
          [slug]: res.error ?? "Failed to assign Vercel project",
        }));
        return;
      }
      setHandoffs((prev) =>
        prev.map((h) => (h.leadSlug === slug ? res.handoff : h)),
      );
    });
  };

  const [customDomainInputs, setCustomDomainInputs] = useState<Record<string, string>>({});
  const [customDomainErrors, setCustomDomainErrors] = useState<Record<string, string>>({});

  const handleAssignCustomDomain = (slug: string) => {
    const value = customDomainInputs[slug] ?? "";
    setCustomDomainErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    startTransition(async () => {
      const res = await assignCustomDomainAction(slug, value);
      if (!res.success) {
        setCustomDomainErrors((prev) => ({
          ...prev,
          [slug]: res.error ?? "Failed to save custom domain",
        }));
        return;
      }
      setHandoffs((prev) =>
        prev.map((h) => (h.leadSlug === slug ? res.handoff : h)),
      );
    });
  };

  const handleInquiryStatus = (
    inquiryId: string,
    status: ClientInquiryStatus,
    headingId?: string,
  ) => {
    setInquiryActionErrors((prev) => {
      const next = { ...prev };
      delete next[inquiryId];
      return next;
    });
    setInquiryActionNotices((prev) => {
      const next = { ...prev };
      delete next[inquiryId];
      return next;
    });
    startTransition(async () => {
      const res = await updateInquiryStatusAction(inquiryId, status);
      if (!res.success) {
        setInquiryActionErrors((prev) => ({
          ...prev,
          [inquiryId]: `Error updating inquiry: ${res.error}`,
        }));
        return;
      }
      setInquiries((prev) =>
        prev.map((inq) => (inq.id === inquiryId ? { ...inq, status } : inq)),
      );
      // Mark read unmounts the just-clicked button (rendered only while
      // status === "new"); Archive unmounts the whole <li> (openInquiries
      // filters out status === "archived"). Either way the just-clicked
      // control disappears from the Website inquiries due-queue, so focus
      // goes to the panel heading instead of vanishing to <body>. The
      // internal auto-mark-read call from handleToggleReplyComposer omits
      // headingId since it isn't triggered by this button. Queued with a
      // fallback since being the last row in the queue can unmount the
      // heading itself too.
      if (headingId) {
        queueFocusElement(headingId, DASHBOARD_HEADING_FALLBACK_ID);
      }
    });
  };

  const handleToggleReplyComposer = (inq: ClientInquiry) => {
    const isOpening = replyOpenId !== inq.id;
    setReplyOpenId((prev) => (prev === inq.id ? null : inq.id));
    setReplyError(null);
    if (inquiryShouldAutoMarkRead(inq, isOpening)) {
      handleInquiryStatus(inq.id, "read");
    }
  };

  // Cancel and a successful Send reply both close the composer from a
  // button *inside* the panel that unmounts on close — same refocus fix as
  // closeNotesEditor/closeCommerceEditor above, back onto the still-mounted
  // Reply toggle button rather than letting focus fall to <body>. Queued
  // (not a same-tick .focus() call) for the same disabled={isPending} race
  // as closeNotesEditor when the Send-reply path calls this from inside
  // startTransition — see the pendingFocusElementId effect above.
  const closeReplyComposer = (inquiryId: string) => {
    setReplyOpenId(null);
    setReplyError(null);
    queueFocusElement(inquiryReplyToggleElementId(inquiryId));
  };

  const handleInquiryReply = (inquiryId: string) => {
    const body = replyDrafts[inquiryId] ?? "";
    setReplyError(null);
    setInquiryActionNotices((prev) => {
      const next = { ...prev };
      delete next[inquiryId];
      return next;
    });
    startTransition(async () => {
      const res = await replyToInquiryAction(inquiryId, body);
      if (!res.success) {
        // Persist-then-notify may have already marked replied before a send
        // failure — refresh the row so unreplied UI matches the durable mark.
        if ("inquiry" in res && res.inquiry) {
          setInquiries((prev) =>
            prev.map((inq) => (inq.id === inquiryId ? res.inquiry! : inq)),
          );
        }
        setReplyError(res.error ?? "Failed to send reply");
        return;
      }
      setInquiries((prev) =>
        prev.map((inq) => (inq.id === inquiryId ? res.inquiry : inq)),
      );
      setReplyDrafts((prev) => {
        const next = { ...prev };
        delete next[inquiryId];
        return next;
      });
      closeReplyComposer(inquiryId);
      if (res.mock) {
        setInquiryActionNotices((prev) => ({
          ...prev,
          [inquiryId]: "Reply sent (mock — RESEND_API_KEY not configured).",
        }));
      }
    });
  };

  const handleSendFollowUp = (slug: string, headingId?: string) => {
    const current = leads.find((l) => l.slug === slug);
    const previousStep = current?.outreachStep;
    setLeadActionErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    startTransition(async () => {
      const res = await sendFollowUpAction(slug);
      if (!res.success) {
        setLeadActionErrors((prev) => ({
          ...prev,
          [slug]: `Follow-up failed: ${res.error}`,
        }));
        return;
      }
      const sentAt = new Date().toISOString();
      setLeads((prev) =>
        prev.map((l) =>
          l.slug === slug
            ? { ...l, outreachStep: res.outreachStep, lastOutreachAt: sentAt }
            : l,
        ),
      );
      if (
        current &&
        shouldPromptNotesAfterOutreachStep(previousStep, res.outreachStep) &&
        shouldAutoOpenNotesEditor(notesEditSlug, slug)
      ) {
        openNotesEditor(current, "email_3");
      }
      // Follow-ups due filters on isFollowUpDue (false right after sending)
      // and Work next's Send Email N button is conditioned on the same
      // predicate — either way the just-clicked button's row/control
      // unmounts on success, so focus goes to whichever due-queue panel
      // heading called this. The main-table row's Send Email N (always
      // mounted) omits headingId. Queued with a fallback since being the
      // last row in the queue can unmount the heading itself too.
      if (headingId) {
        queueFocusElement(headingId, DASHBOARD_HEADING_FALLBACK_ID);
      }
    });
  };

  const handleSendCheckoutRecovery = (stripeSessionId: string) => {
    const errorKey = `checkout-recovery:${stripeSessionId}`;
    setQueueActionErrors((prev) => {
      const next = { ...prev };
      delete next[errorKey];
      return next;
    });
    startTransition(async () => {
      const res = await sendCheckoutRecoveryAction(stripeSessionId);
      if (!res.success) {
        setQueueActionErrors((prev) => ({
          ...prev,
          [errorKey]: `Recovery email failed: ${res.error}`,
        }));
        return;
      }
      const sentAt = new Date().toISOString();
      setCheckoutSessions((prev) =>
        prev.map((s) =>
          s.stripeSessionId === stripeSessionId
            ? { ...s, recoverySentAt: sentAt, recoverySentCount: (s.recoverySentCount ?? 0) + 1 }
            : s,
        ),
      );
      // isRecoveryDue starts a cooldown from recoverySentAt, so a
      // successful send removes this <li> from Abandoned checkouts — the
      // just-clicked button unmounts with it. Queued with a fallback since
      // being the last row in the queue can unmount the heading itself too.
      queueFocusElement(ABANDONED_CHECKOUTS_HEADING_ID, DASHBOARD_HEADING_FALLBACK_ID);
    });
  };

  const handleSendCommerceCheckoutRecovery = (stripeSessionId: string) => {
    const errorKey = `commerce-recovery:${stripeSessionId}`;
    setQueueActionErrors((prev) => {
      const next = { ...prev };
      delete next[errorKey];
      return next;
    });
    startTransition(async () => {
      const res = await sendCommerceCheckoutRecoveryAction(stripeSessionId);
      if (!res.success) {
        setQueueActionErrors((prev) => ({
          ...prev,
          [errorKey]: `Buy now recovery failed: ${res.error}`,
        }));
        return;
      }
      const sentAt = new Date().toISOString();
      setCheckoutSessions((prev) =>
        prev.map((s) =>
          s.stripeSessionId === stripeSessionId
            ? { ...s, recoverySentAt: sentAt, recoverySentCount: (s.recoverySentCount ?? 0) + 1 }
            : s,
        ),
      );
      // Same cooldown-driven removal as bundle recovery above, but from the
      // Abandoned Buy now panel. Queued with a fallback since being the
      // last row in the queue can unmount the heading itself too.
      queueFocusElement(ABANDONED_BUY_NOW_HEADING_ID, DASHBOARD_HEADING_FALLBACK_ID);
    });
  };

  const handleMarkCommerceOrderPaidOut = (stripeSessionId: string) => {
    const errorKey = `payout:${stripeSessionId}`;
    setQueueActionErrors((prev) => {
      const next = { ...prev };
      delete next[errorKey];
      return next;
    });
    startTransition(async () => {
      const res = await markCommerceOrderPaidOutAction(stripeSessionId);
      if (!res.success) {
        setQueueActionErrors((prev) => ({
          ...prev,
          [errorKey]: `Mark paid out failed: ${res.error}`,
        }));
        return;
      }
      setCommerceOrders((prev) =>
        prev.map((o) =>
          o.stripeSessionId === stripeSessionId ? { ...o, paidOutAt: res.paidOutAt } : o,
        ),
      );
      // The just-clicked Mark paid out button is conditionally rendered on
      // !row.paidOutAt and swaps to a "Paid out" status span on success; the
      // owning lead's outer <li> also unmounts once every owed order for
      // that lead is resolved. Either way focus goes to the panel heading
      // instead of vanishing to <body>. Queued with a fallback since being
      // the last row in the queue can unmount the heading itself too.
      queueFocusElement(COMMERCE_PAYOUTS_HEADING_ID, DASHBOARD_HEADING_FALLBACK_ID);
    });
  };

  const handleResendCommerceClientReceipt = (stripeSessionId: string) => {
    const errorKey = `receipt:${stripeSessionId}`;
    setQueueActionErrors((prev) => {
      const next = { ...prev };
      delete next[errorKey];
      return next;
    });
    startTransition(async () => {
      const res = await resendCommerceClientReceiptAction(stripeSessionId);
      if (!res.success) {
        setQueueActionErrors((prev) => ({
          ...prev,
          [errorKey]: `Resend client receipt failed: ${res.error}`,
        }));
        return;
      }
      setCommerceOrdersMissingClientReceipt((prev) =>
        prev.filter((o) => o.stripeSessionId !== stripeSessionId),
      );
      // The just-clicked Resend receipt button's <li> unmounts on success.
      // Queued with a fallback since being the last row in the queue can
      // unmount the heading itself too.
      queueFocusElement(MISSING_CLIENT_RECEIPT_HEADING_ID, DASHBOARD_HEADING_FALLBACK_ID);
    });
  };

  const handleResendBundleBuyerEmail = (leadSlug: string) => {
    const errorKey = `buyer-email:${leadSlug}`;
    setQueueActionErrors((prev) => {
      const next = { ...prev };
      delete next[errorKey];
      return next;
    });
    startTransition(async () => {
      const res = await resendBundleBuyerEmailAction(leadSlug);
      if (res.handoff) {
        const stillMissing = isBundleHandoffMissingBuyerEmail(res.handoff);
        setHandoffs((prev) =>
          prev.map((h) => (h.leadSlug === leadSlug ? res.handoff! : h)),
        );
        // Only the fully-resolved case unmounts this row's <li> (both emails
        // now marked sent) — a partial success (one half still missing)
        // keeps the button in place, so only move focus off it on unmount.
        // Queued with a fallback since being the last row in the queue can
        // unmount the heading itself too.
        if (!stillMissing) {
          queueFocusElement(BUNDLE_MISSING_BUYER_EMAIL_HEADING_ID, DASHBOARD_HEADING_FALLBACK_ID);
        }
      }
      if (!res.success) {
        setQueueActionErrors((prev) => ({
          ...prev,
          [errorKey]: `Resend buyer email failed: ${res.error}`,
        }));
      }
    });
  };

  // Grouped/keyed once per render (not per row) so the leads table stays
  // O(leads + orders) instead of re-scanning the full orders/catalogs/packs
  // arrays for every row × every eligibility check (dashboard-leads-table-
  // per-row-linear-scan-to-map-lookup).
  const ordersByLeadSlug = new Map<string, OrderRecord[]>();
  for (const order of orders) {
    const existing = ordersByLeadSlug.get(order.leadSlug);
    if (existing) {
      existing.push(order);
    } else {
      ordersByLeadSlug.set(order.leadSlug, [order]);
    }
  }
  const catalogByLeadSlug = new Map(commerceCatalogs.map((c) => [c.leadSlug, c]));
  const packByLeadSlug = new Map(marketingPacks.map((p) => [p.leadSlug, p]));
  const voicePackByLeadSlug = new Map(clientVoicePacks.map((p) => [p.leadSlug, p]));

  const leadHasBillingPortal = (slug: string) =>
    (ordersByLeadSlug.get(slug) ?? []).some((o) => orderEligibleForBillingPortal(o));

  const leadEligibleForUpsell = (lead: Lead) =>
    leadEligibleForStarterUpsell({
      stage: lead.stage,
      email: lead.email,
      ordersForLead: ordersByLeadSlug.get(lead.slug) ?? [],
    });

  const leadHasMarketingPack = (lead: Lead) =>
    leadEligibleForMarketingPack(lead, ordersByLeadSlug.get(lead.slug) ?? []);

  const packForLead = (slug: string) => packByLeadSlug.get(slug) ?? null;

  const handleOpenBillingPortal = (slug: string) => {
    setLeadActionErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    startTransition(async () => {
      const res = await openBillingPortalAction(slug);
      if (!res.success) {
        setLeadActionErrors((prev) => ({
          ...prev,
          [slug]: `Billing portal failed: ${res.error}`,
        }));
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    });
  };

  const handleSendStarterUpsell = (slug: string) => {
    setLeadActionErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    setLeadActionNotices((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    startTransition(async () => {
      const res = await sendStarterUpsellAction(slug);
      if (!res.success) {
        setLeadActionErrors((prev) => ({
          ...prev,
          [slug]: `Upsell email failed: ${res.error}`,
        }));
        return;
      }
      const label = res.targetTier === "complete" ? "Complete" : "Growth";
      setLeadActionNotices((prev) => ({
        ...prev,
        [slug]: res.mock
          ? `Mock upsell email logged (Resend unset) — ${label} checkout link`
          : `Upsell email sent — ${label} checkout link`,
      }));
    });
  };

  const handleGenerateMarketingPack = (
    slug: string,
    opts?: { bringIntoView?: boolean; headingId?: string },
  ) => {
    setLeadActionErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    startTransition(async () => {
      const res = await generateMarketingPackAction(slug);
      if (!res.success) {
        setLeadActionErrors((prev) => ({
          ...prev,
          [slug]: `Marketing pack failed: ${res.error}`,
        }));
        return;
      }
      setMarketingPacks((prev) => {
        const without = prev.filter((p) => p.leadSlug !== slug);
        return [res.pack, ...without];
      });
      setMarketingPackOpenSlug(slug);
      // Marketing packs due filters out leads that already have a pack for
      // the current month — a successful generate removes this <li> (and
      // the just-clicked button inside it) from the due-queue. The
      // scrollIntoView below (when bringIntoView) only scrolls the viewport,
      // it doesn't move DOM focus, so this call is still required even when
      // that option is set. The main-table "Generate pack" button (always
      // mounted) omits headingId. Queued with a fallback since being the
      // last row in the queue can unmount the heading itself too.
      if (opts?.headingId) {
        queueFocusElement(opts.headingId, DASHBOARD_HEADING_FALLBACK_ID);
      }
      if (opts?.bringIntoView) {
        // Called from the Marketing packs due panel, which lists leads from
        // the full unfiltered `leads` array — the generated pack's own
        // result panel only renders inside filteredLeads.map(), so a lead
        // excluded by the operator's current stage filter/search would set
        // marketingPackOpenSlug with no row ever mounting to show it (same
        // dead-click shape as openCommerceEditor's bringIntoView and
        // openNotesEditor's queue-prompt scroll above). Clear both so the
        // row (and its pack panel) actually renders, then bring it into view.
        setFilterStage("all");
        setSearchQuery("");
        requestAnimationFrame(() => {
          document
            .getElementById(`lead-pack-${slug}`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }
    });
  };

  const handleEmailMarketingPack = (slug: string) => {
    setLeadActionErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    setLeadActionNotices((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    startTransition(async () => {
      const res = await sendMarketingPackToClientAction(slug);
      if (!res.success) {
        setLeadActionErrors((prev) => ({
          ...prev,
          [slug]: `Email pack failed: ${res.error}`,
        }));
        return;
      }
      if ("sentToClientAt" in res && res.sentToClientAt) {
        const sentToClientAt = res.sentToClientAt;
        setMarketingPacks((prev) =>
          prev.map((p) =>
            p.leadSlug === slug && p.yearMonth === res.yearMonth ? { ...p, sentToClientAt } : p,
          ),
        );
      }
      setLeadActionNotices((prev) => ({
        ...prev,
        [slug]: res.mock
          ? `Mock marketing pack email logged (Resend unset) — ${res.yearMonth}`
          : `Marketing pack emailed to client — ${res.yearMonth}`,
      }));
    });
  };

  // The one genuine failure in this alert()-conversion pass (clipboard API
  // threw) — role="alert", not "status". Called from three places with two
  // different existing error-state shapes (the marketing/voice pack variant
  // Copy buttons share the per-row leadActionErrors map; the Stripe Connect
  // onboarding-link copy flow uses the single-string stripeConnectError), so
  // it takes the caller's setter as a parameter rather than owning its own
  // state or guessing which map to write into.
  const copyMarketingVariant = async (text: string, onError: (message: string) => void) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      onError("Could not copy to clipboard");
    }
  };

  // Shared by the marketing pack and client voice pack variant Copy buttons
  // (both per-lead, both already routing their panel's other action failures
  // through leadActionErrors) — clears any stale error/notice for this lead
  // first, matching every other leadActionErrors-writing handler's shape.
  const handleCopyLeadVariant = (slug: string, text: string) => {
    setLeadActionErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    setLeadActionNotices((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    void copyMarketingVariant(text, (message) =>
      setLeadActionErrors((prev) => ({ ...prev, [slug]: message })),
    );
  };

  const catalogForLead = (slug: string) => catalogByLeadSlug.get(slug) ?? null;

  const leadHasCommerceCatalog = (lead: Lead) =>
    leadEligibleForCommerceCatalog(lead, ordersByLeadSlug.get(lead.slug) ?? []);

  const openCommerceEditor = (lead: Lead, opts?: { bringIntoView?: boolean }) => {
    const existing = catalogForLead(lead.slug);
    setCommerceEditSlug(lead.slug);
    setCommerceDraftItems(
      existing?.items.length
        ? existing.items.map((item) => ({ ...item }))
        : [{ id: newCommerceSkuId(), name: "", priceCents: 0 }],
    );
    setCommerceCatalogError(null);
    setCommerceCatalogNotice(null);
    setStripeConnectError(null);
    setStripeConnectNotice(null);
    if (opts?.bringIntoView) {
      // Called from the Commerce catalogs missing/unsynced due-queue panels,
      // which list leads from the full unfiltered `leads` array — the target
      // row (and its editor panel) may not exist in the DOM if the operator's
      // current stage filter/search excludes it. Clear both so the row (and
      // this panel) actually renders, then bring it into view, same as
      // openNotesEditor's queue-prompt scroll below.
      setFilterStage("all");
      setSearchQuery("");
      requestAnimationFrame(() => {
        document
          .getElementById(`lead-commerce-${lead.slug}`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  };

  const closeCommerceEditor = (slug?: string) => {
    const focusSlug = slug ?? commerceEditSlug;
    setCommerceEditSlug(null);
    setCommerceDraftItems([]);
    setCommerceCatalogError(null);
    setCommerceCatalogNotice(null);
    setStripeConnectError(null);
    setStripeConnectNotice(null);
    // Same refocus fix as closeNotesEditor above — the Close/Save button
    // that triggered this is inside the panel being unmounted here. Queued
    // (not a same-tick .focus() call) for the same disabled={isPending}
    // race as closeNotesEditor — see the pendingFocusElementId effect above.
    if (focusSlug) {
      queueFocusElement(leadCommerceToggleElementId(focusSlug));
    }
  };

  const handleSaveCommerceCatalog = (slug: string) => {
    setCommerceCatalogError(null);
    startTransition(async () => {
      const res = await saveCommerceCatalogAction(slug, commerceDraftItems);
      if (!res.success) {
        setCommerceCatalogError(res.error ?? "Failed to save commerce catalog");
        return;
      }
      setCommerceCatalogs((prev) => {
        const without = prev.filter((c) => c.leadSlug !== slug);
        return [res.catalog, ...without];
      });
      closeCommerceEditor(slug);
    });
  };

  const handleSyncCommerceCatalogToStripe = (slug: string, headingId?: string) => {
    // headingId is only passed from the due-queue panel's own button (see
    // its call site below) — the editor's identical button omits it, and
    // that distinction is what decides which error surface below can
    // actually render for this call (the editor block is unmounted unless
    // commerceEditSlug === slug).
    if (headingId) {
      setCommerceSyncQueueErrors((prev) => {
        const next = { ...prev };
        delete next[slug];
        return next;
      });
    } else {
      setCommerceCatalogError(null);
    }
    startTransition(async () => {
      const res = await syncCommerceCatalogToStripeAction(slug);
      if (!res.success) {
        const message = `Stripe sync failed: ${res.error}`;
        if (headingId) {
          setCommerceSyncQueueErrors((prev) => ({ ...prev, [slug]: message }));
        } else {
          setCommerceCatalogError(message);
        }
        return;
      }
      setCommerceCatalogs((prev) => {
        const without = prev.filter((c) => c.leadSlug !== slug);
        return [res.catalog, ...without];
      });
      setCommerceDraftItems((prev) =>
        commerceDraftItemsAfterSync(commerceEditSlug, slug, prev, res.catalog.items),
      );
      // Commerce catalogs unsynced filters out fully-synced catalogs — a
      // successful sync unmounts this <li> (and the just-clicked "Sync to
      // Stripe" button) from that due-queue. The Commerce editor's own
      // "Sync to Stripe" button (inside the always-mounted row editor)
      // omits headingId. Queued with a fallback since being the last row in
      // the queue can unmount the heading itself too.
      if (headingId) {
        queueFocusElement(headingId, DASHBOARD_HEADING_FALLBACK_ID);
      }
    });
  };

  const handleArchiveOrphanCommerceStripeProducts = (slug: string) => {
    setCommerceCatalogError(null);
    setCommerceCatalogNotice(null);
    startTransition(async () => {
      const res = await archiveOrphanCommerceStripeProductsAction(slug);
      if (!res.success) {
        setCommerceCatalogError(`Archive orphans failed: ${res.error}`);
        return;
      }
      if (res.archivedCount === 0) {
        setCommerceCatalogNotice("No orphan Stripe Products for this lead.");
        return;
      }
      setCommerceCatalogNotice(
        `Archived ${res.archivedCount} orphan Stripe Product${res.archivedCount === 1 ? "" : "s"} (removed SKUs).`,
      );
    });
  };

  const [connectStatusByLead, setConnectStatusByLead] = useState<
    Record<string, { chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean }>
  >({});

  const handleCreateStripeConnectAccount = (slug: string) => {
    setStripeConnectError(null);
    setStripeConnectNotice(null);
    startTransition(async () => {
      const res = await createStripeConnectAccountAction(slug);
      if (!res.success) {
        setStripeConnectError(`Create Connect account failed: ${res.error}`);
        return;
      }
      setLeads((prev) =>
        prev.map((l) => (l.slug === slug ? { ...l, stripeConnectAccountId: res.accountId } : l)),
      );
      // The just-clicked "Create Connect account" button is inside a
      // `lead.stripeConnectAccountId ? <span>Account: ...</span> : <button>`
      // ternary in the still-open commerce editor panel — a successful
      // create flips that ternary and unmounts the button. Refocus the
      // panel's own toggle button (leadCommerceToggleElementId, always
      // mounted for the row's whole lifetime, same anchor
      // closeCommerceEditor already uses on full-panel close). Queued (not
      // a same-tick .focus() call) — see the pendingFocusElementId effect.
      queueFocusElement(leadCommerceToggleElementId(slug));
    });
  };

  const handleGetStripeConnectOnboardingLink = (slug: string) => {
    setStripeConnectError(null);
    setStripeConnectNotice(null);
    startTransition(async () => {
      const res = await createStripeConnectOnboardingLinkAction(slug);
      if (!res.success) {
        setStripeConnectError(`Get onboarding link failed: ${res.error}`);
        return;
      }
      // A clipboard failure here does not block the notice below — the
      // notice text includes the full link as a manual-copy fallback, same
      // as the alert() this replaced always showed the link regardless of
      // whether the copy itself succeeded.
      await copyMarketingVariant(res.url, (message) => setStripeConnectError(message));
      setStripeConnectNotice(
        `Onboarding link copied. This link is single-use and expires within minutes — send it to the client right away, or use "Email onboarding link" to skip the copy/paste delay:\n${res.url}`,
      );
    });
  };

  const handleSendStripeConnectOnboardingLink = (slug: string) => {
    setStripeConnectError(null);
    setStripeConnectNotice(null);
    startTransition(async () => {
      const res = await sendStripeConnectOnboardingLinkToClientAction(slug);
      if (!res.success) {
        setStripeConnectError(`Email onboarding link failed: ${res.error}`);
        return;
      }
      setStripeConnectNotice(
        res.mock
          ? "Onboarding link email queued (mock — set RESEND_API_KEY to actually deliver)."
          : "Onboarding link emailed to the client.",
      );
    });
  };

  const handleCheckStripeConnectStatus = (slug: string) => {
    setStripeConnectError(null);
    setStripeConnectNotice(null);
    startTransition(async () => {
      const res = await checkStripeConnectAccountStatusAction(slug);
      if (!res.success) {
        setStripeConnectError(`Check status failed: ${res.error}`);
        return;
      }
      setConnectStatusByLead((prev) => ({
        ...prev,
        [slug]: {
          chargesEnabled: res.chargesEnabled,
          payoutsEnabled: res.payoutsEnabled,
          detailsSubmitted: res.detailsSubmitted,
        },
      }));
    });
  };

  const [bufferProfiles, setBufferProfiles] = useState<
    Array<{ id: string; service: string; formattedUsername?: string }>
  >([]);
  const [bufferSelectionByLead, setBufferSelectionByLead] = useState<Record<string, string[]>>({});
  const [bufferScheduleResultByLead, setBufferScheduleResultByLead] = useState<
    Record<string, { scheduled: string[]; skipped: string[]; failed: string[] }>
  >({});
  // Load/save/send are all inside the same dormant Buffer scaffold panel and
  // only one lead's Marketing pack panel (which contains it) can be open at
  // a time, per marketingPackOpenSlug above — a single non-slug-keyed string
  // mirrors the stripeConnectError precedent rather than a Record.
  const [bufferActionError, setBufferActionError] = useState<string | null>(null);

  const handleListBufferProfiles = () => {
    setBufferActionError(null);
    startTransition(async () => {
      const res = await listBufferProfilesAction();
      if (!res.success) {
        setBufferActionError(`Load Buffer profiles failed: ${res.error}`);
        return;
      }
      setBufferProfiles(res.profiles);
    });
  };

  const bufferSelectionForLead = (lead: Lead) =>
    resolveBufferSelection(bufferSelectionByLead, lead.slug, lead.bufferProfileIds);

  const handleToggleBufferProfile = (slug: string, profileId: string) => {
    setBufferSelectionByLead((prev) => {
      const current = resolveBufferSelection(
        prev,
        slug,
        leads.find((l) => l.slug === slug)?.bufferProfileIds,
      );
      const next = current.includes(profileId)
        ? current.filter((id) => id !== profileId)
        : [...current, profileId];
      return { ...prev, [slug]: next };
    });
  };

  const handleSaveBufferProfiles = (slug: string) => {
    const selected = resolveBufferSelection(
      bufferSelectionByLead,
      slug,
      leads.find((l) => l.slug === slug)?.bufferProfileIds,
    );
    setBufferActionError(null);
    startTransition(async () => {
      const res = await saveLeadBufferProfilesAction(slug, selected);
      if (!res.success) {
        setBufferActionError(`Save Buffer profiles failed: ${res.error}`);
        return;
      }
      setLeads((prev) =>
        prev.map((l) => (l.slug === slug ? { ...l, bufferProfileIds: res.bufferProfileIds } : l)),
      );
    });
  };

  const handleScheduleMarketingPackToBuffer = (slug: string) => {
    setBufferActionError(null);
    startTransition(async () => {
      const res = await scheduleMarketingPackToBufferAction(slug);
      if (!res.success) {
        setBufferActionError(`Send to Buffer failed: ${res.error}`);
        return;
      }
      setBufferScheduleResultByLead((prev) => ({
        ...prev,
        [slug]: { scheduled: res.scheduled, skipped: res.skipped, failed: res.failed },
      }));
    });
  };

  const leadHasClientVoicePack = (lead: Lead) =>
    leadEligibleForClientVoicePack(lead, ordersByLeadSlug.get(lead.slug) ?? []);

  const voicePackForLead = (slug: string) => voicePackByLeadSlug.get(slug) ?? null;

  const handleGenerateClientVoicePack = (
    slug: string,
    opts?: { bringIntoView?: boolean; headingId?: string },
  ) => {
    setLeadActionErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    startTransition(async () => {
      const res = await generateClientVoicePackAction(slug);
      if (!res.success) {
        setLeadActionErrors((prev) => ({
          ...prev,
          [slug]: `Client voice pack failed: ${res.error}`,
        }));
        return;
      }
      setClientVoicePacks((prev) => {
        const without = prev.filter((p) => p.leadSlug !== slug);
        return [res.pack, ...without];
      });
      setClientVoicePackOpenSlug(slug);
      // Same due-queue removal shape as handleGenerateMarketingPack above —
      // Voice packs due filters out leads that already have a pack, so a
      // successful generate unmounts this <li>. The main-table "Generate
      // pack" button (always mounted) omits headingId. Queued with a
      // fallback since being the last row in the queue can unmount the
      // heading itself too.
      if (opts?.headingId) {
        queueFocusElement(opts.headingId, DASHBOARD_HEADING_FALLBACK_ID);
      }
      if (opts?.bringIntoView) {
        // Same due-queue dead-open fix as handleGenerateMarketingPack above —
        // the Voice packs due panel lists leads from the full unfiltered
        // `leads` array, but the result panel only renders inside
        // filteredLeads.map().
        setFilterStage("all");
        setSearchQuery("");
        requestAnimationFrame(() => {
          document
            .getElementById(`lead-voice-${slug}`)
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }
    });
  };

  const handleEmailClientVoicePack = (slug: string) => {
    setLeadActionErrors((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    setLeadActionNotices((prev) => {
      const next = { ...prev };
      delete next[slug];
      return next;
    });
    startTransition(async () => {
      const res = await sendClientVoicePackToClientAction(slug);
      if (!res.success) {
        setLeadActionErrors((prev) => ({
          ...prev,
          [slug]: `Email voice pack failed: ${res.error}`,
        }));
        return;
      }
      if ("sentToClientAt" in res && res.sentToClientAt) {
        const sentToClientAt = res.sentToClientAt;
        setClientVoicePacks((prev) =>
          prev.map((p) => (p.leadSlug === slug ? { ...p, sentToClientAt } : p)),
        );
      }
      setLeadActionNotices((prev) => ({
        ...prev,
        [slug]: res.mock
          ? "Mock voice pack email logged (Resend unset)"
          : "Voice pack emailed to client",
      }));
    });
  };

  // Filtered Leads — abandoned open checkouts boost quality so Work next
  // surfaces the hottest purchase-intent rows ahead of plain outreach-due.
  const scoreOptions = { openCheckoutSessions: checkoutSessions };
  const qualityBySlug = new Map<string, LeadQualityResult>(
    leads.map((lead) => [lead.slug, scoreLead(lead, nowMs, scoreOptions)]),
  );
  const workNext = rankLeadsForOutreach(leads, nowMs, 5, scoreOptions);
  const snoozedLeadCount = leads.filter((l) =>
    isLeadSnoozed(l.snoozedUntil, nowMs),
  ).length;

  const filteredLeads = leads
    .filter((lead) => {
      const matchesStage = filterStage === "all" || lead.stage === filterStage;
      const matchesSearch =
        lead.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (lead.notes ?? "").toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStage && matchesSearch;
    })
    .slice()
    .sort((a, b) => {
      if (!sortByQuality) return a.businessName.localeCompare(b.businessName);
      const scoreA = qualityBySlug.get(a.slug)?.score ?? 0;
      const scoreB = qualityBySlug.get(b.slug)?.score ?? 0;
      return scoreB - scoreA || a.businessName.localeCompare(b.businessName);
    });

  const openHandoffs = handoffs.filter((h) => h.status !== "live");
  // Same aggregate staleness signal pipeline-health's MetricCard hint and the
  // daily digest's "Production handoffs open" section header already show —
  // this per-lead panel previously had per-row ages (deployHandoffAgeHours,
  // shipped by open-deploy-handoff-header-count-and-row-ages) but no header
  // oldest suffix, unlike every sibling due-queue panel (see
  // open-handoff-and-commerce-payouts-header-staleness-signal).
  const oldestOpenHandoffsHours = oldestOpenHandoffAgeHours(openHandoffs, nowMs);
  const handoffSlugs = new Set(handoffs.map((h) => h.leadSlug));
  // Same lead.stage === "paid" predicate as pipeline-health paidNotLiveCount
  // and the daily digest's paidNotLive section — distinct from openHandoffs
  // above, since a lead can be moved to stage=paid via the stage dropdown or
  // CSV import with no deploy_handoffs row ever created (see
  // paid-not-live-dashboard-panel-and-remedy).
  const paidNotLive = leads.filter((lead) => lead.stage === "paid");
  // Same order-anchored, refund/dispute-aware staleness signal already shown
  // by pipeline-health's MetricCard hint and the daily digest's paidNotLive
  // section header — this per-lead panel previously had no staleness signal
  // at all, unlike every sibling due-queue panel (Website inquiries,
  // Production deploy handoffs) once those closed the same gap.
  const oldestPaidNotLiveHours = oldestPaidNotLiveAgeHours(paidNotLive, orders, nowMs);
  const openInquiries = inquiries.filter((inq) => inq.status !== "archived");
  // Unreplied = new OR read (isUnrepliedInquiryStatus), matching
  // pipeline-health's unrepliedInquiryCount / oldestUnrepliedInquiryAgeHours
  // and the daily digest's "Unreplied inquiries" header — this panel's own
  // header previously counted status === "new" only, silently dropping
  // "read"-but-unreplied inquiries from the count (they still rendered in
  // the list, just uncounted) and never showed any staleness signal at all,
  // unlike every sibling due-queue panel (see inquiries-panel-unreplied-count-and-staleness).
  const unrepliedOpenInquiries = openInquiries.filter((inq) =>
    isUnrepliedInquiryStatus(inq.status),
  );
  const newOpenInquiryCount = openInquiries.filter((inq) => inq.status === "new").length;
  const oldestUnrepliedOpenInquiryAgeHours = oldestUnrepliedInquiryAgeHoursFor(
    openInquiries,
    nowMs,
  );
  // Snapshot clock from mount — server re-checks cadence on send.
  const followUpsDue = listFollowUpsDue(leads, nowMs);
  const coldLeads = listColdLeads(leads, nowMs);
  // Same oldestLastOutreachAgeHours pipeline-health/daily-digest already use for
  // these exact due queues — these two panels previously had zero staleness
  // signal at all, unlike every sibling due-queue panel once the
  // staleness-signal series closed their gaps (see
  // followups-due-panel-staleness-signal).
  const oldestFollowUpDueHours = oldestLastOutreachAgeHours(followUpsDue, nowMs);
  const oldestColdLeadHours = oldestLastOutreachAgeHours(coldLeads, nowMs);
  const abandonedCheckoutsDue = listAbandonedCheckoutsDue(checkoutSessions, nowMs);
  // Same oldestCheckoutSessionAgeHours pipeline-health/daily-digest already use for
  // this exact due queue — this panel previously had zero staleness signal at all,
  // unlike every sibling due-queue panel once the staleness-signal series closed
  // their gaps (see abandoned-checkout-panels-staleness-signal).
  const oldestAbandonedCheckoutHours = oldestCheckoutSessionAgeHours(abandonedCheckoutsDue, nowMs);
  const commerceAbandonedCheckoutsDue = listCommerceAbandonedCheckoutsDue(
    checkoutSessions,
    nowMs,
    leadSlugsEligibleForCommerceAbandonedRecovery(leads, orders),
  );
  const oldestCommerceAbandonedCheckoutHours = oldestCheckoutSessionAgeHours(
    commerceAbandonedCheckoutsDue,
    nowMs,
  );
  const starterUpsellCandidates = listStarterUpsellCandidates(leads, orders);
  const oldestStarterUpsellHours = oldestStarterUpsellCandidateAgeHours(
    starterUpsellCandidates,
    orders,
    nowMs,
  );
  const recurringEntitlementPaused = listRecurringEntitlementPaused(leads, orders);
  // Same aggregate staleness signal pipeline-health's MetricCard hint and the
  // daily digest already show for this due-queue — this per-lead panel
  // previously had per-row ages (pausedAgeHours) but no header oldest suffix,
  // unlike every sibling due-queue panel (see
  // open-handoff-and-commerce-payouts-header-staleness-signal).
  const oldestRecurringEntitlementPausedHours = oldestRecurringEntitlementPausedAgeHours(
    recurringEntitlementPaused,
    nowMs,
  );
  const marketingPacksDueMonth = marketingMonthKey(nowMs);
  const marketingPacksDue = listMarketingPacksDue(
    leads,
    orders,
    marketingPacks,
    marketingPacksDueMonth,
  );
  const oldestMarketingPacksDueHours = oldestMarketingPacksDueAgeHours(
    marketingPacksDue,
    orders,
    marketingPacksDueMonth,
    nowMs,
  );
  const clientVoicePacksDue = listClientVoicePacksDue(leads, orders, clientVoicePacks);
  const oldestClientVoicePacksDueHours = oldestClientVoicePacksDueAgeHours(
    clientVoicePacksDue,
    orders,
    nowMs,
  );
  const commerceCatalogsMissing = listCommerceCatalogsMissing(
    leads,
    orders,
    commerceCatalogs,
  );
  const oldestCommerceCatalogsMissingHours = oldestCommerceCatalogCandidateAgeHours(
    commerceCatalogsMissing,
    orders,
    nowMs,
  );
  const commerceCatalogsUnsynced = listCommerceCatalogsUnsynced(
    leads,
    orders,
    commerceCatalogs,
  );
  const oldestCommerceCatalogsUnsyncedHours = oldestCommerceCatalogCandidateAgeHours(
    commerceCatalogsUnsynced,
    orders,
    nowMs,
  );
  const commercePayoutsByLead = summarizeCommerceOrdersByLead(commerceOrders).filter(
    commerceOrdersByLeadSummaryNeedsAttention,
  );
  const commercePayoutsOrderCount = sumCommerceOrdersByLeadOrderCount(commercePayoutsByLead);
  // Same unpaid/unrefunded/undisputed "still owed" set + aggregate staleness
  // signal already shown by pipeline-health's "Commerce sales (pass-through)"
  // MetricCard hint and the daily digest's "Commerce payouts owed" section
  // header — this per-lead panel previously had per-row ages (`owed Xh ago`)
  // but no header oldest suffix, unlike every sibling due-queue panel (see
  // open-handoff-and-commerce-payouts-header-staleness-signal).
  const commerceOrdersStillOwed = commerceOrders.filter(isCommerceOrderOwed);
  const oldestCommercePayoutsOwedHours = oldestCommerceOrdersOwedAgeHours(
    commerceOrdersStillOwed,
    nowMs,
  );
  const bundleOrderRefunds = orders.filter(isOrderRefunded);
  const bundleOrderDisputes = orders.filter(isOrderDisputed);
  const oldestBundleOrderRefundOrDisputeHours = oldestBundleOrderRefundOrDisputeAgeHours(
    bundleOrderRefunds,
    bundleOrderDisputes,
    nowMs,
  );
  const bundleHandoffsMissingBuyerEmail = handoffs.filter(isBundleHandoffMissingBuyerEmail);
  const oldestBundleHandoffsMissingBuyerEmailHours = oldestOpenHandoffAgeHours(
    bundleHandoffsMissingBuyerEmail,
    nowMs,
  );
  const businessNameBySlug = new Map(leads.map((l) => [l.slug, l.businessName]));
  const emailBySlug = new Map(leads.map((l) => [l.slug, l.email]));
  const oldestCommerceOrdersMissingClientReceiptHours = oldestCommerceOrdersOwedAgeHours(
    commerceOrdersMissingClientReceipt,
    nowMs,
  );

  return (
    <div className="mt-8">
      {commerceCatalogsMissing.length > 0 && (
        <section aria-labelledby={COMMERCE_CATALOGS_MISSING_HEADING_ID} className="mb-8 rounded-2xl border border-orange-200 bg-orange-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={COMMERCE_CATALOGS_MISSING_HEADING_ID}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
            >
              Commerce catalogs missing
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({commerceCatalogsMissing.length}
                {oldestCommerceCatalogsMissingHours !== null
                  ? ` · oldest ${formatAbandonedAgeHours(oldestCommerceCatalogsMissingHours)}`
                  : ""}
                )
              </span>
            </h2>
            <Link
              href="/docs/product-bundles"
              className="text-xs font-medium text-orange-800 underline underline-offset-2"
            >
              Product bundles
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Paid Commerce add-on leads without a catalog yet (≤{MAX_COMMERCE_SKUS}{" "}
            SKUs). Save items here so /preview shows Menu &amp; products and
            Request order notifies the inquiry inbox.
          </p>
          <ul className="mt-4 space-y-3" aria-live="polite" aria-relevant="removals">
            {commerceCatalogsMissing.map((lead) => {
              const catalogMissingAgeHours = oldestCommerceCatalogCandidateAgeHours(
                [{ slug: lead.slug }],
                orders,
                nowMs,
              );
              return (
                <li
                  key={lead.slug}
                  className="rounded-xl border border-orange-100 bg-white px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-900">
                        {lead.businessName}{" "}
                        <span className="font-normal text-zinc-500">({lead.slug})</span>
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        {lead.stage} · Commerce add-on
                        {catalogMissingAgeHours !== null ? (
                          <> · due {formatAbandonedAgeHours(catalogMissingAgeHours)} ago</>
                        ) : null}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => openCommerceEditor(lead, { bringIntoView: true })}
                      aria-label={dashboardRowActionAriaLabel("Add catalog", lead.businessName, lead.slug)}
                      className="rounded-lg bg-orange-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-900 disabled:opacity-60"
                    >
                      Add catalog
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {commerceCatalogsUnsynced.length > 0 && (
        <section aria-labelledby={COMMERCE_CATALOGS_UNSYNCED_HEADING_ID} className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={COMMERCE_CATALOGS_UNSYNCED_HEADING_ID}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
            >
              Commerce catalogs unsynced
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({commerceCatalogsUnsynced.length}
                {oldestCommerceCatalogsUnsyncedHours !== null
                  ? ` · oldest ${formatAbandonedAgeHours(oldestCommerceCatalogsUnsyncedHours)}`
                  : ""}
                )
              </span>
            </h2>
            <Link
              href="/docs/product-bundles"
              className="text-xs font-medium text-amber-800 underline underline-offset-2"
            >
              Product bundles
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Saved catalogs with at least one SKU missing a Stripe Price — Buy now
            doesn&apos;t work for that item until it&apos;s synced.
          </p>
          <ul className="mt-4 space-y-3" aria-live="polite" aria-relevant="removals">
            {commerceCatalogsUnsynced.map((lead) => {
              const catalogUnsyncedAgeHours = oldestCommerceCatalogCandidateAgeHours(
                [{ slug: lead.slug }],
                orders,
                nowMs,
              );
              return (
              <li
                key={lead.slug}
                className="rounded-xl border border-amber-100 bg-white px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-zinc-900">
                      {lead.businessName}{" "}
                      <span className="font-normal text-zinc-500">({lead.slug})</span>
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      {lead.stage} · Commerce add-on
                      {catalogUnsyncedAgeHours !== null ? (
                        <> · due {formatAbandonedAgeHours(catalogUnsyncedAgeHours)} ago</>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => openCommerceEditor(lead, { bringIntoView: true })}
                      aria-label={dashboardRowActionAriaLabel("Edit catalog", lead.businessName, lead.slug)}
                      className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
                    >
                      Edit catalog
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        handleSyncCommerceCatalogToStripe(
                          lead.slug,
                          COMMERCE_CATALOGS_UNSYNCED_HEADING_ID,
                        )
                      }
                      aria-label={dashboardRowActionAriaLabel("Sync to Stripe", lead.businessName, lead.slug)}
                      aria-describedby={
                        commerceSyncQueueErrors[lead.slug]
                          ? `commerce-sync-queue-error-${lead.slug}`
                          : undefined
                      }
                      className="rounded-lg bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-900 disabled:opacity-60"
                    >
                      Sync to Stripe
                    </button>
                  </div>
                </div>
                {commerceSyncQueueErrors[lead.slug] ? (
                  <p
                    id={`commerce-sync-queue-error-${lead.slug}`}
                    className="mt-2 text-xs font-medium text-red-600"
                    role="alert"
                  >
                    {commerceSyncQueueErrors[lead.slug]}
                  </p>
                ) : null}
              </li>
              );
            })}
          </ul>
        </section>
      )}
      {starterUpsellCandidates.length > 0 && (
        <section aria-labelledby={STARTER_UPSELL_HEADING_ID} className="mb-8 rounded-2xl border border-teal-200 bg-teal-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={STARTER_UPSELL_HEADING_ID}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
            >
              Starter → MRR upsell
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({starterUpsellCandidates.length}
                {oldestStarterUpsellHours !== null
                  ? ` · oldest ${formatAbandonedAgeHours(oldestStarterUpsellHours)}`
                  : ""}
                )
              </span>
            </h2>
            <Link
              href="/docs/product-bundles"
              className="text-xs font-medium text-teal-800 underline underline-offset-2"
            >
              Product bundles
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Paid Starter customers with no Growth/Complete/Commerce yet. Operator-triggered
            upgrade email with a preselected checkout link (honors suppression).
          </p>
          <ul className="mt-4 space-y-3" aria-live="polite" aria-relevant="removals">
            {starterUpsellCandidates.map((lead) => {
              const targetTier = resolveUpsellTargetTier(lead.recommendedTier);
              const bundle = getBundle(targetTier);
              const upsellAgeHours = oldestStarterUpsellCandidateAgeHours(
                [{ slug: lead.slug }],
                orders,
                nowMs,
              );
              return (
                <li
                  key={lead.slug}
                  className="rounded-xl border border-teal-100 bg-white px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-900">
                        {lead.businessName}{" "}
                        <span className="font-normal text-zinc-500">({lead.slug})</span>
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        {lead.stage} · suggest {bundle?.name ?? targetTier}
                        {bundle?.monthlyPriceUsd != null
                          ? ` · $${bundle.monthlyPriceUsd}/mo`
                          : null}
                        {lead.email ? ` · ${lead.email}` : null}
                        {upsellAgeHours !== null ? (
                          <> · paid {formatAbandonedAgeHours(upsellAgeHours)} ago</>
                        ) : null}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleSendStarterUpsell(lead.slug)}
                      aria-label={dashboardRowActionAriaLabel(
                        `Send ${bundle?.name ?? targetTier} upsell`,
                        lead.businessName,
                        lead.slug,
                      )}
                      aria-describedby={
                        leadActionErrors[lead.slug]
                          ? `starter-upsell-action-error-${lead.slug}`
                          : leadActionNotices[lead.slug]
                            ? `starter-upsell-action-notice-${lead.slug}`
                            : undefined
                      }
                      className="rounded-lg bg-teal-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-900 disabled:opacity-60"
                    >
                      Send {bundle?.name ?? targetTier} upsell
                    </button>
                  </div>
                  {leadActionErrors[lead.slug] ? (
                    <p
                      id={`starter-upsell-action-error-${lead.slug}`}
                      className="mt-2 text-xs font-medium text-red-600"
                      role="alert"
                    >
                      {leadActionErrors[lead.slug]}
                    </p>
                  ) : null}
                  {leadActionNotices[lead.slug] ? (
                    <p
                      id={`starter-upsell-action-notice-${lead.slug}`}
                      className="mt-2 text-xs font-medium text-emerald-700"
                      role="status"
                    >
                      {leadActionNotices[lead.slug]}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {recurringEntitlementPaused.length > 0 && (
        <section aria-labelledby={MRR_PAUSED_HEADING_ID} className="mb-8 rounded-2xl border border-rose-200 bg-rose-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={MRR_PAUSED_HEADING_ID}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
            >
              MRR paused / canceled
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({recurringEntitlementPaused.length}
                {oldestRecurringEntitlementPausedHours !== null
                  ? ` · oldest ${formatAbandonedAgeHours(oldestRecurringEntitlementPausedHours)}`
                  : ""}
                )
              </span>
            </h2>
            <Link
              href="/docs/architecture#payments"
              className="text-xs font-medium text-rose-800 underline underline-offset-2"
            >
              Payments
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Paid/live Growth/Complete/Commerce subscribers whose recurring entitlement is
            currently paused or canceled (card decline, pause_collection, or Stripe
            cancellation). Open Billing Portal to chase recovery.
          </p>
          <ul className="mt-4 space-y-3" aria-live="polite" aria-relevant="removals">
            {recurringEntitlementPaused.map((lead) => {
              const pausedAgeHours = Math.max(
                0,
                Math.floor((nowMs - lead.pausedAtMs) / (60 * 60 * 1000)),
              );
              return (
                <li
                  key={lead.slug}
                  className="rounded-xl border border-rose-100 bg-white px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-900">
                        {lead.businessName}{" "}
                        <span className="font-normal text-zinc-500">({lead.slug})</span>
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        {lead.stage} · paused {formatAbandonedAgeHours(pausedAgeHours)} ago
                        {lead.hasStripeCustomerId
                          ? null
                          : " · no Stripe customer on file"}
                      </p>
                    </div>
                    {lead.hasStripeCustomerId ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleOpenBillingPortal(lead.slug)}
                        aria-label={dashboardRowActionAriaLabel("Manage billing", lead.businessName, lead.slug)}
                        aria-describedby={
                          leadActionErrors[lead.slug]
                            ? `mrr-paused-action-error-${lead.slug}`
                            : undefined
                        }
                        className="rounded-lg bg-rose-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-900 disabled:opacity-60"
                      >
                        Manage billing
                      </button>
                    ) : null}
                  </div>
                  {leadActionErrors[lead.slug] ? (
                    <p
                      id={`mrr-paused-action-error-${lead.slug}`}
                      className="mt-2 text-xs font-medium text-red-600"
                      role="alert"
                    >
                      {leadActionErrors[lead.slug]}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {marketingPacksDue.length > 0 && (
        <section aria-labelledby={MARKETING_PACKS_DUE_HEADING_ID} className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={MARKETING_PACKS_DUE_HEADING_ID}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
            >
              Marketing packs due
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({marketingPacksDue.length}
                {oldestMarketingPacksDueHours !== null
                  ? ` · oldest ${formatAbandonedAgeHours(oldestMarketingPacksDueHours)}`
                  : ""}
                )
              </span>
            </h2>
            <Link
              href="/docs/marketing-automation"
              className="text-xs font-medium text-emerald-800 underline underline-offset-2"
            >
              Marketing automation
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Paid Growth/Complete leads still missing their {marketingPacksDueMonth} marketing
            pack — the sold monthly fulfillment promise.
          </p>
          <ul className="mt-4 space-y-3" aria-live="polite" aria-relevant="removals">
            {marketingPacksDue.map((lead) => {
              const packDueAgeHours = oldestMarketingPacksDueAgeHours(
                [{ slug: lead.slug }],
                orders,
                marketingPacksDueMonth,
                nowMs,
              );
              return (
              <li
                key={lead.slug}
                className="rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-zinc-900">
                      {lead.businessName}{" "}
                      <span className="font-normal text-zinc-500">({lead.slug})</span>
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      {lead.stage} · {marketingPacksDueMonth}
                      {packDueAgeHours !== null
                        ? ` · due ${formatAbandonedAgeHours(packDueAgeHours)} ago`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      handleGenerateMarketingPack(lead.slug, {
                        bringIntoView: true,
                        headingId: MARKETING_PACKS_DUE_HEADING_ID,
                      })
                    }
                    aria-label={dashboardRowActionAriaLabel(
                      "Generate marketing pack",
                      lead.businessName,
                      lead.slug,
                    )}
                    aria-describedby={
                      leadActionErrors[lead.slug]
                        ? `marketing-packs-due-action-error-${lead.slug}`
                        : undefined
                    }
                    className="rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-900 disabled:opacity-60"
                  >
                    Generate pack
                  </button>
                </div>
                {leadActionErrors[lead.slug] ? (
                  <p
                    id={`marketing-packs-due-action-error-${lead.slug}`}
                    className="mt-2 text-xs font-medium text-red-600"
                    role="alert"
                  >
                    {leadActionErrors[lead.slug]}
                  </p>
                ) : null}
              </li>
              );
            })}
          </ul>
        </section>
      )}

      {clientVoicePacksDue.length > 0 && (
        <section aria-labelledby={VOICE_PACKS_DUE_HEADING_ID} className="mb-8 rounded-2xl border border-violet-200 bg-violet-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={VOICE_PACKS_DUE_HEADING_ID}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
            >
              Voice packs due
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({clientVoicePacksDue.length}
                {oldestClientVoicePacksDueHours !== null
                  ? ` · oldest ${formatAbandonedAgeHours(oldestClientVoicePacksDueHours)}`
                  : ""}
                )
              </span>
            </h2>
            <Link
              href="/docs/voice-agent-flow"
              className="text-xs font-medium text-violet-800 underline underline-offset-2"
            >
              Voice agent flow
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Paid/live Complete leads still missing their FAQ voice pack — the sold phone
            fulfillment promise (Twilio stays separate).
          </p>
          <ul className="mt-4 space-y-3" aria-live="polite" aria-relevant="removals">
            {clientVoicePacksDue.map((lead) => {
              const packDueAgeHours = oldestClientVoicePacksDueAgeHours(
                [{ slug: lead.slug }],
                orders,
                nowMs,
              );
              return (
              <li
                key={lead.slug}
                className="rounded-xl border border-violet-100 bg-white px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-zinc-900">
                      {lead.businessName}{" "}
                      <span className="font-normal text-zinc-500">({lead.slug})</span>
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      {lead.stage} · Complete
                      {packDueAgeHours !== null
                        ? ` · due ${formatAbandonedAgeHours(packDueAgeHours)} ago`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      handleGenerateClientVoicePack(lead.slug, {
                        bringIntoView: true,
                        headingId: VOICE_PACKS_DUE_HEADING_ID,
                      })
                    }
                    aria-label={dashboardRowActionAriaLabel(
                      "Generate voice pack",
                      lead.businessName,
                      lead.slug,
                    )}
                    aria-describedby={
                      leadActionErrors[lead.slug]
                        ? `voice-packs-due-action-error-${lead.slug}`
                        : undefined
                    }
                    className="rounded-lg bg-violet-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-900 disabled:opacity-60"
                  >
                    Generate pack
                  </button>
                </div>
                {leadActionErrors[lead.slug] ? (
                  <p
                    id={`voice-packs-due-action-error-${lead.slug}`}
                    className="mt-2 text-xs font-medium text-red-600"
                    role="alert"
                  >
                    {leadActionErrors[lead.slug]}
                  </p>
                ) : null}
              </li>
              );
            })}
          </ul>
        </section>
      )}

      {abandonedCheckoutsDue.length > 0 && (
        <section aria-labelledby={ABANDONED_CHECKOUTS_HEADING_ID} className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={ABANDONED_CHECKOUTS_HEADING_ID}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
            >
              Abandoned checkouts
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({abandonedCheckoutsDue.length}
                {oldestAbandonedCheckoutHours !== null
                  ? ` · oldest ${oldestAbandonedCheckoutHours}h`
                  : ""}
                )
              </span>
            </h2>
            <Link
              href="/docs/architecture#payments"
              className="text-xs font-medium text-amber-800 underline underline-offset-2"
            >
              Payments
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Local Site Studio plan checkout started but not completed after {ABANDONED_AFTER_HOURS}h.
            Operator-triggered recovery email; suppresses honor the unsubscribe list.
          </p>
          <ul className="mt-4 space-y-3" aria-live="polite" aria-relevant="removals">
            {abandonedCheckoutsDue.map((session) => {
              const sessionAgeHours = oldestCheckoutSessionAgeHours([session], nowMs);
              return (
              <li
                key={session.stripeSessionId}
                className="rounded-xl border border-amber-100 bg-white px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-zinc-900">
                      {businessNameBySlug.get(session.leadSlug) || session.leadSlug}{" "}
                      <span className="font-normal text-zinc-500">({session.leadSlug})</span>
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      {session.tier} plan · started{" "}
                      {formatAbandonedAgeHours(sessionAgeHours)} ago
                      {session.customerEmail ? ` · ${session.customerEmail}` : null}
                      {session.recoverySentAt
                        ? ` · last nudged ${formatAbandonedAgeHours(
                            deployHandoffAgeHours(session.recoverySentAt, nowMs),
                          )} ago (#${session.recoverySentCount ?? 1})`
                        : null}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleSendCheckoutRecovery(session.stripeSessionId)}
                    aria-label={dashboardRowActionAriaLabel(
                      "Send recovery email",
                      businessNameBySlug.get(session.leadSlug) || session.leadSlug,
                      session.leadSlug,
                      `${session.tier} plan`,
                    )}
                    aria-describedby={
                      queueActionErrors[`checkout-recovery:${session.stripeSessionId}`]
                        ? `checkout-recovery-error-${session.stripeSessionId}`
                        : undefined
                    }
                    className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-800 disabled:opacity-60"
                  >
                    Send recovery email
                  </button>
                </div>
                {queueActionErrors[`checkout-recovery:${session.stripeSessionId}`] ? (
                  <p
                    id={`checkout-recovery-error-${session.stripeSessionId}`}
                    role="alert"
                    className="mt-2 text-xs font-medium text-red-600"
                  >
                    {queueActionErrors[`checkout-recovery:${session.stripeSessionId}`]}
                  </p>
                ) : null}
              </li>
              );
            })}
          </ul>
        </section>
      )}

      {commerceAbandonedCheckoutsDue.length > 0 && (
        <section aria-labelledby={ABANDONED_BUY_NOW_HEADING_ID} className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={ABANDONED_BUY_NOW_HEADING_ID}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
            >
              Abandoned Buy now
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({commerceAbandonedCheckoutsDue.length}
                {oldestCommerceAbandonedCheckoutHours !== null
                  ? ` · oldest ${oldestCommerceAbandonedCheckoutHours}h`
                  : ""}
                )
              </span>
            </h2>
            <Link
              href="/docs/architecture#commerce"
              className="text-xs font-medium text-emerald-800 underline underline-offset-2"
            >
              Commerce
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            End-customer Commerce checkout started but not completed after {ABANDONED_AFTER_HOURS}h.
            Recovery links to the client preview catalog — never a Local Site Studio plan checkout.
            Requires the shopper&apos;s email on the Stripe session.
          </p>
          <ul className="mt-4 space-y-3" aria-live="polite" aria-relevant="removals">
            {commerceAbandonedCheckoutsDue.map((session) => {
              const skuName =
                catalogForLead(session.leadSlug)?.items.find(
                  (item) => item.id === session.skuId,
                )?.name ??
                session.skuId ??
                "SKU";
              const sessionAgeHours = oldestCheckoutSessionAgeHours([session], nowMs);
              return (
                <li
                  key={session.stripeSessionId}
                  className="rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-900">
                        {businessNameBySlug.get(session.leadSlug) || session.leadSlug}{" "}
                        <span className="font-normal text-zinc-500">({session.leadSlug})</span>
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        {skuName} · started {formatAbandonedAgeHours(sessionAgeHours)} ago
                        {session.customerEmail ? ` · ${session.customerEmail}` : " · no email"}
                        {session.recoverySentAt
                          ? ` · last nudged ${formatAbandonedAgeHours(
                              deployHandoffAgeHours(session.recoverySentAt, nowMs),
                            )} ago (#${session.recoverySentCount ?? 1})`
                          : null}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isPending || !session.customerEmail}
                      onClick={() => handleSendCommerceCheckoutRecovery(session.stripeSessionId)}
                      aria-label={dashboardRowActionAriaLabel(
                        "Send Buy now recovery",
                        businessNameBySlug.get(session.leadSlug) || session.leadSlug,
                        session.leadSlug,
                        skuName,
                      )}
                      aria-describedby={
                        queueActionErrors[`commerce-recovery:${session.stripeSessionId}`]
                          ? `commerce-recovery-error-${session.stripeSessionId}`
                          : undefined
                      }
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
                      title={
                        session.customerEmail
                          ? "Email shopper a link back to the catalog"
                          : "No customer email on this session"
                      }
                    >
                      Send Buy now recovery
                    </button>
                  </div>
                  {queueActionErrors[`commerce-recovery:${session.stripeSessionId}`] ? (
                    <p
                      id={`commerce-recovery-error-${session.stripeSessionId}`}
                      role="alert"
                      className="mt-2 text-xs font-medium text-red-600"
                    >
                      {queueActionErrors[`commerce-recovery:${session.stripeSessionId}`]}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {commercePayoutsByLead.length > 0 && (
        <section aria-labelledby={COMMERCE_PAYOUTS_HEADING_ID} className="mb-8 rounded-2xl border border-teal-200 bg-teal-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={COMMERCE_PAYOUTS_HEADING_ID}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
            >
              Commerce payouts (manual)
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({commercePayoutsOrderCount} order{commercePayoutsOrderCount === 1 ? "" : "s"}
                {oldestCommercePayoutsOwedHours !== null
                  ? ` · oldest ${formatAbandonedAgeHours(oldestCommercePayoutsOwedHours)}`
                  : ""}
                )
              </span>
            </h2>
            <Link
              href="/docs/architecture#commerce"
              className="text-xs font-medium text-teal-800 underline underline-offset-2"
            >
              Commerce
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Pass-through Buy now money collected on the platform Stripe account — every unpaid
            order owed to each Commerce client until Stripe Connect ships (not just the newest
            page), plus any order refunded or disputed after you already paid the client out
            (claw that back). Use these per-lead totals to reconcile manual payouts; this is not
            Local Site Studio revenue.
          </p>
          <ul className="mt-4 space-y-3" aria-live="polite" aria-relevant="removals">
            {commercePayoutsByLead.map((summary) => (
              <li
                key={summary.leadSlug}
                className="rounded-xl border border-teal-100 bg-white px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-zinc-900">
                      {businessNameBySlug.get(summary.leadSlug) || summary.leadSlug}{" "}
                      <span className="font-normal text-zinc-500">({summary.leadSlug})</span>
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      {summary.orderCount} order{summary.orderCount === 1 ? "" : "s"} · latest{" "}
                      {formatAbandonedAgeHours(
                        deployHandoffAgeHours(summary.latestCreatedAt, nowMs),
                      )}{" "}
                      ago
                    </p>
                    <ul className="mt-2 space-y-1.5 text-xs text-zinc-600">
                      {summary.orders.slice(0, 5).map((row) => (
                        <li key={row.stripeSessionId} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className={row.paidOutAt ? "text-zinc-500 line-through" : undefined}>
                              {formatUsd(row.amountPaidUsd)} · {row.skuName}
                              {row.quantity && row.quantity > 1 ? ` × ${row.quantity}` : ""} ·{" "}
                              {formatAbandonedAgeHours(deployHandoffAgeHours(row.createdAt, nowMs))} ago
                            </span>
                            {row.refundedAt ? (
                              <span className="shrink-0 font-semibold text-red-700">
                                {row.paidOutAt
                                  ? "Refunded after payout — claw back from client"
                                  : "Refunded — nothing owed"}
                              </span>
                            ) : row.disputedAt ? (
                              <span className="shrink-0 font-semibold text-red-700">
                                {row.paidOutAt
                                  ? "Disputed after payout — claw back from client"
                                  : "Disputed — nothing owed"}
                              </span>
                            ) : row.paidOutAt ? (
                              <span className="shrink-0 text-teal-700">
                                Paid out{" "}
                                {formatAbandonedAgeHours(deployHandoffAgeHours(row.paidOutAt, nowMs))} ago
                              </span>
                            ) : row.amountPaidUsd === 0 ? (
                              <span className="shrink-0 text-zinc-500">
                                Free order — nothing owed
                              </span>
                            ) : (
                              <span className="flex shrink-0 items-center gap-2">
                                <span className="text-zinc-500">
                                  owed {formatAbandonedAgeHours(deployHandoffAgeHours(row.createdAt, nowMs))} ago
                                </span>
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => handleMarkCommerceOrderPaidOut(row.stripeSessionId)}
                                  aria-label={commerceMarkPaidOutAriaLabel(
                                    row,
                                    businessNameBySlug.get(summary.leadSlug) || summary.leadSlug,
                                  )}
                                  aria-describedby={
                                    queueActionErrors[`payout:${row.stripeSessionId}`]
                                      ? `payout-error-${row.stripeSessionId}`
                                      : undefined
                                  }
                                  className="rounded-lg border border-teal-700 px-2 py-0.5 text-xs font-semibold text-teal-800 transition hover:bg-teal-100 disabled:opacity-60"
                                >
                                  Mark paid out
                                </button>
                              </span>
                            )}
                          </div>
                          {queueActionErrors[`payout:${row.stripeSessionId}`] ? (
                            <p
                              id={`payout-error-${row.stripeSessionId}`}
                              role="alert"
                              className="text-xs font-medium text-red-600"
                            >
                              {queueActionErrors[`payout:${row.stripeSessionId}`]}
                            </p>
                          ) : null}
                        </li>
                      ))}
                      {summary.orders.length > 5 ? (
                        <li className="text-zinc-500">
                          +{summary.orders.length - 5} more
                        </li>
                      ) : null}
                    </ul>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-teal-900">
                    {formatUsd(summary.unpaidTotalUsd)} owed
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {commerceOrdersMissingClientReceipt.length > 0 && (
        <section aria-labelledby={MISSING_CLIENT_RECEIPT_HEADING_ID} className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={MISSING_CLIENT_RECEIPT_HEADING_ID}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
            >
              Missing client receipt
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({commerceOrdersMissingClientReceipt.length}
                {oldestCommerceOrdersMissingClientReceiptHours !== null
                  ? ` · oldest ${formatAbandonedAgeHours(oldestCommerceOrdersMissingClientReceiptHours)}`
                  : ""}
                )
              </span>
            </h2>
            <Link
              href="/docs/architecture#commerce"
              className="text-xs font-medium text-amber-800 underline underline-offset-2"
            >
              Commerce
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Buy now sales never notified to the client — a permanently-bad lead email or a
            sustained Resend outage. Resend below, or add an email on the lead first.
          </p>
          <ul className="mt-4 space-y-3" aria-live="polite" aria-relevant="removals">
            {commerceOrdersMissingClientReceipt.map((row) => {
              const email = emailBySlug.get(row.leadSlug);
              return (
                <li
                  key={row.stripeSessionId}
                  className="rounded-xl border border-amber-100 bg-white px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-900">
                        {businessNameBySlug.get(row.leadSlug) || row.leadSlug}{" "}
                        <span className="font-normal text-zinc-500">({row.leadSlug})</span>
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        {formatUsd(row.amountPaidUsd)} · {row.skuName}
                        {row.quantity && row.quantity > 1 ? ` × ${row.quantity}` : ""} ·{" "}
                        {formatAbandonedAgeHours(deployHandoffAgeHours(row.createdAt, nowMs))} ago
                        {email ? ` · ${email}` : " · no email on file"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isPending || !email}
                      onClick={() => handleResendCommerceClientReceipt(row.stripeSessionId)}
                      aria-label={`Resend receipt for ${businessNameBySlug.get(row.leadSlug) || row.leadSlug}`}
                      aria-describedby={
                        queueActionErrors[`receipt:${row.stripeSessionId}`]
                          ? `receipt-error-${row.stripeSessionId}`
                          : undefined
                      }
                      className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-800 disabled:opacity-60"
                      title={email ? "Resend the order notification email" : "No email on file for this lead"}
                    >
                      Resend receipt
                    </button>
                  </div>
                  {queueActionErrors[`receipt:${row.stripeSessionId}`] ? (
                    <p
                      id={`receipt-error-${row.stripeSessionId}`}
                      role="alert"
                      className="mt-2 text-xs font-medium text-red-600"
                    >
                      {queueActionErrors[`receipt:${row.stripeSessionId}`]}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(bundleOrderRefunds.length > 0 || bundleOrderDisputes.length > 0) && (
        <section aria-labelledby={BUNDLE_ORDER_REFUNDS_DISPUTES_HEADING_ID} className="mb-8 rounded-2xl border border-rose-200 bg-rose-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={BUNDLE_ORDER_REFUNDS_DISPUTES_HEADING_ID}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
            >
              Bundle order refunds &amp; disputes
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({bundleOrderRefunds.length + bundleOrderDisputes.length}
                {oldestBundleOrderRefundOrDisputeHours !== null
                  ? ` · oldest ${formatAbandonedAgeHours(oldestBundleOrderRefundOrDisputeHours)}`
                  : ""}
                )
              </span>
            </h2>
            <Link
              href="/docs/architecture#payments"
              className="text-xs font-medium text-rose-800 underline underline-offset-2"
            >
              Payments
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Starter/Growth/Complete orders Stripe refunded or disputed — already excluded from
            Recorded revenue. Visibility only (no payout to claw back on this ledger); named here
            so you know which client to follow up with.
          </p>
          <ul className="mt-4 space-y-2" aria-live="polite" aria-relevant="removals">
            {bundleOrderRefunds.map((order) => (
              <li
                key={`refund-${order.stripeSessionId}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-100 bg-white px-4 py-3 text-sm"
              >
                <span className="font-semibold text-zinc-900">
                  {businessNameBySlug.get(order.leadSlug) || order.leadSlug}{" "}
                  <span className="font-normal text-zinc-500">({order.leadSlug})</span>
                </span>
                <span className="text-xs text-zinc-600">
                  {order.tier} · {formatUsd(order.amountPaid)} · refunded{" "}
                  {formatAbandonedAgeHours(
                    order.refundedAt ? deployHandoffAgeHours(order.refundedAt, nowMs) : null,
                  )}{" "}
                  ago
                </span>
              </li>
            ))}
            {bundleOrderDisputes.map((order) => (
              <li
                key={`dispute-${order.stripeSessionId}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-100 bg-white px-4 py-3 text-sm"
              >
                <span className="font-semibold text-zinc-900">
                  {businessNameBySlug.get(order.leadSlug) || order.leadSlug}{" "}
                  <span className="font-normal text-zinc-500">({order.leadSlug})</span>
                </span>
                <span className="text-xs text-zinc-600">
                  {order.tier} · {formatUsd(order.amountPaid)} · disputed{" "}
                  {formatAbandonedAgeHours(
                    order.disputedAt ? deployHandoffAgeHours(order.disputedAt, nowMs) : null,
                  )}{" "}
                  ago
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {bundleHandoffsMissingBuyerEmail.length > 0 && (
        <section aria-labelledby={BUNDLE_MISSING_BUYER_EMAIL_HEADING_ID} className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={BUNDLE_MISSING_BUYER_EMAIL_HEADING_ID}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
            >
              Bundle buyer email missing
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({bundleHandoffsMissingBuyerEmail.length}
                {oldestBundleHandoffsMissingBuyerEmailHours !== null
                  ? ` · oldest ${formatAbandonedAgeHours(oldestBundleHandoffsMissingBuyerEmailHours)}`
                  : ""}
                )
              </span>
            </h2>
            <Link
              href="/docs/architecture#payments"
              className="text-xs font-medium text-amber-800 underline underline-offset-2"
            >
              Payments
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Starter/Growth/Complete buyers never sent a receipt and/or DNS go-live email — a
            permanently-bad email or a sustained Resend outage past Stripe&apos;s retry window.
            Resend below, or reply to the customer directly to follow up.
          </p>
          <ul className="mt-4 space-y-3" aria-live="polite" aria-relevant="removals">
            {bundleHandoffsMissingBuyerEmail.map((handoff) => {
              const businessName =
                businessNameBySlug.get(handoff.leadSlug) ||
                handoff.businessName ||
                handoff.leadSlug;
              const missingReceipt = !hasBundleReceiptEmailNote(
                handoff.notes,
                handoff.stripeSessionId,
              );
              const missingDns = !hasBundleDnsHandoffEmailNote(
                handoff.notes,
                handoff.stripeSessionId,
              );
              const missingLabel = [missingReceipt && "receipt", missingDns && "DNS"]
                .filter(Boolean)
                .join(" + ");
              return (
                <li
                  key={handoff.stripeSessionId}
                  className="rounded-xl border border-amber-100 bg-white px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-900">
                        {businessName}{" "}
                        <span className="font-normal text-zinc-500">({handoff.leadSlug})</span>
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        {handoff.tier} · missing {missingLabel} ·{" "}
                        {formatAbandonedAgeHours(deployHandoffAgeHours(handoff.createdAt, nowMs))}{" "}
                        ago · {handoff.customerEmail}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleResendBundleBuyerEmail(handoff.leadSlug)}
                      aria-label={`Resend ${missingLabel} email for ${businessName}`}
                      aria-describedby={
                        queueActionErrors[`buyer-email:${handoff.leadSlug}`]
                          ? `buyer-email-error-${handoff.leadSlug}`
                          : undefined
                      }
                      className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-800 disabled:opacity-60"
                      title={`Resend the missing ${missingLabel} email`}
                    >
                      Resend {missingLabel}
                    </button>
                  </div>
                  {queueActionErrors[`buyer-email:${handoff.leadSlug}`] ? (
                    <p
                      id={`buyer-email-error-${handoff.leadSlug}`}
                      role="alert"
                      className="mt-2 text-xs font-medium text-red-600"
                    >
                      {queueActionErrors[`buyer-email:${handoff.leadSlug}`]}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {followUpsDue.length > 0 && (
        <section aria-labelledby={FOLLOW_UPS_DUE_HEADING_ID} className="mb-8 rounded-2xl border border-violet-200 bg-violet-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={FOLLOW_UPS_DUE_HEADING_ID}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
            >
              Follow-ups due
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({followUpsDue.length}
                {oldestFollowUpDueHours !== null
                  ? ` · oldest ${formatAbandonedAgeHours(oldestFollowUpDueHours)}`
                  : ""}
                )
              </span>
            </h2>
            <Link
              href="/docs/business-model"
              className="text-xs font-medium text-violet-800 underline underline-offset-2"
            >
              Email 2/3 cadence
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Operator-triggered (not auto-cron): Email 2 after {FOLLOW_UP_2_AFTER_DAYS}d, Email 3
            after {FOLLOW_UP_3_AFTER_DAYS}d more. Suppresses honor the unsubscribe list.
          </p>
          <ul className="mt-4 space-y-3" aria-live="polite" aria-relevant="removals">
            {followUpsDue.map((lead) => {
              const next = nextFollowUpStep(lead.outreachStep);
              return (
                <li
                  key={lead.slug}
                  className="rounded-xl border border-violet-100 bg-white px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-900">
                        {lead.businessName}{" "}
                        <span className="font-normal text-zinc-500">({lead.slug})</span>
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        Next: Email {next ?? "?"} · last step{" "}
                        {normalizeOutreachStep(lead.outreachStep) || "—"}
                        {lead.lastOutreachAt
                          ? ` · last sent ${formatAbandonedAgeHours(
                              deployHandoffAgeHours(lead.lastOutreachAt, nowMs),
                            )} ago`
                          : " · no timestamp (treat as due)"}
                        {lead.email ? ` · ${lead.email}` : null}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isPending || !next}
                      onClick={() => handleSendFollowUp(lead.slug, FOLLOW_UPS_DUE_HEADING_ID)}
                      aria-label={dashboardRowActionAriaLabel(
                        `Send Email ${next ?? "?"}`,
                        lead.businessName,
                        lead.slug,
                      )}
                      className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-800 disabled:opacity-60"
                    >
                      Send Email {next ?? "?"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {coldLeads.length > 0 && (
        <section aria-labelledby={COLD_LEADS_HEADING_ID} className="mb-8 rounded-2xl border border-stone-200 bg-stone-50/50 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={COLD_LEADS_HEADING_ID}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
            >
              Cold leads
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({coldLeads.length}
                {oldestColdLeadHours !== null
                  ? ` · oldest ${formatAbandonedAgeHours(oldestColdLeadHours)}`
                  : ""}
                )
              </span>
            </h2>
            <Link
              href="/docs/process"
              className="text-xs font-medium text-stone-700 underline underline-offset-2"
            >
              Re-engage vs close
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Email 1–3 exhausted with no reply. Re-engage resets the cadence to Discovered by default
            (Email 1 sends when you move stage to Outreach Sent). Check &quot;Also send Email 1&quot;
            to re-enter outreach_sent and fire Email 1 in one click. Close parks the lead in the
            terminal Closed stage without deleting history.
          </p>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-zinc-700">
            <input
              type="checkbox"
              checked={reengageSendEmail1}
              onChange={(e) => setReengageSendEmail1(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-stone-300 text-stone-800 focus:ring-stone-500"
            />
            Also send Email 1 when Re-engaging (requires email on the lead)
          </label>
          <ul className="mt-4 space-y-3" aria-live="polite" aria-relevant="removals">
            {coldLeads.map((lead) => (
              <li
                key={lead.slug}
                className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-zinc-900">
                      {lead.businessName}{" "}
                      <span className="font-normal text-zinc-500">({lead.slug})</span>
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      Step {normalizeOutreachStep(lead.outreachStep) || 0}/3
                      {lead.lastOutreachAt
                        ? ` · last sent ${formatAbandonedAgeHours(
                            deployHandoffAgeHours(lead.lastOutreachAt, nowMs),
                          )} ago`
                        : null}
                      {lead.email ? ` · ${lead.email}` : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={
                        isPending || (reengageSendEmail1 && !lead.email?.trim())
                      }
                      title={
                        reengageSendEmail1 && !lead.email?.trim()
                          ? "Add an email before sending Email 1 on re-engage"
                          : reengageSendEmail1
                            ? "Reset cadence and send Email 1 now"
                            : "Reset cadence to Discovered"
                      }
                      onClick={() =>
                        handleColdDisposition(lead.slug, "reengage", COLD_LEADS_HEADING_ID)
                      }
                      aria-label={dashboardRowActionAriaLabel(
                        reengageSendEmail1 ? "Re-engage + Email 1" : coldLeadDispositionLabel("reengage"),
                        lead.businessName,
                        lead.slug,
                      )}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 transition hover:bg-stone-100 disabled:opacity-60"
                    >
                      {reengageSendEmail1
                        ? "Re-engage + Email 1"
                        : coldLeadDispositionLabel("reengage")}
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleColdDisposition(lead.slug, "close", COLD_LEADS_HEADING_ID)}
                      aria-label={dashboardRowActionAriaLabel(
                        coldLeadDispositionLabel("close"),
                        lead.businessName,
                        lead.slug,
                      )}
                      className="rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-stone-900 disabled:opacity-60"
                    >
                      {coldLeadDispositionLabel("close")}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {workNext.length > 0 && (
        <section aria-labelledby={WORK_NEXT_HEADING_ID} className="mb-8 rounded-2xl border border-rose-200 bg-rose-50/30 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={WORK_NEXT_HEADING_ID}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
            >
              Work next
              <span className="ml-2 text-sm font-normal text-zinc-500">
                (quality score)
              </span>
            </h2>
            <Link
              href="/docs/process"
              className="text-xs font-medium text-rose-900 underline underline-offset-2"
            >
              Scoring rules
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Highest-probability targets first — abandoned checkout (hottest), email/phone/address,
            stage momentum, follow-up due, preview opens, category↔tier fit. Demo leads are
            deprioritized. Paid/live rows stay in fulfillment, not this queue. Snooze parks a lead
            off this list without wiping its score.
          </p>
          {snoozedLeadCount > 0 ? (
            <p className="mt-2 text-xs text-slate-700">
              {snoozedLeadCount} lead{snoozedLeadCount === 1 ? "" : "s"} currently snoozed
              (hidden above) — see pipeline health Snoozed count, or Unsnooze in the table when
              ready.
            </p>
          ) : null}
          <ul className="mt-4 space-y-3" aria-live="polite" aria-relevant="removals">
            {workNext.map((row) => {
              const lead = leads.find((l) => l.slug === row.slug);
              if (!lead) return null;
              const topFactors = row.factors
                .filter((f) => f.id !== "stage_base")
                .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
                .slice(0, 3);
              return (
                <li
                  key={row.slug}
                  className="rounded-xl border border-rose-100 bg-white px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-900">
                        {lead.businessName}{" "}
                        <span className="font-normal text-zinc-500">({lead.slug})</span>
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-600">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${qualityBandClass(row.band)}`}
                        >
                          {qualityBandLabel(row.band)} · {row.score}
                        </span>
                        <span className="capitalize">{lead.stage.replaceAll("_", " ")}</span>
                        {row.factors.some((f) => f.id === "abandoned_checkout") ? (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                            Cart
                          </span>
                        ) : null}
                        {lead.email ? <span>· {lead.email}</span> : null}
                      </p>
                      <ul className="mt-2 space-y-0.5 text-[11px] text-zinc-500">
                        {topFactors.map((f) => (
                          <li key={f.id}>
                            <span className={f.delta >= 0 ? "text-emerald-700" : "text-orange-700"}>
                              {f.delta >= 0 ? "+" : ""}
                              {f.delta}
                            </span>{" "}
                            {f.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Link
                        href={leadPreviewPath(lead.slug)}
                        aria-label={dashboardRowActionAriaLabel("Preview", lead.businessName, lead.slug)}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-center text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
                        target="_blank"
                      >
                        Preview
                      </Link>
                      {lead.stage === "site_built" && lead.email ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() =>
                            handleStageChange(lead.slug, "outreach_sent", WORK_NEXT_HEADING_ID)
                          }
                          aria-label={dashboardRowActionAriaLabel(
                            "Send Email 1",
                            lead.businessName,
                            lead.slug,
                          )}
                          className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-800 disabled:opacity-60"
                        >
                          Send Email 1
                        </button>
                      ) : null}
                      {isFollowUpDue(lead, nowMs) ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleSendFollowUp(lead.slug, WORK_NEXT_HEADING_ID)}
                          aria-label={dashboardRowActionAriaLabel(
                            `Send Email ${nextFollowUpStep(lead.outreachStep) ?? "?"}`,
                            lead.businessName,
                            lead.slug,
                          )}
                          className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-800 disabled:opacity-60"
                        >
                          Send Email {nextFollowUpStep(lead.outreachStep) ?? "?"}
                        </button>
                      ) : null}
                      <div className="flex flex-wrap gap-1">
                        {SNOOZE_PRESET_IDS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            disabled={isPending}
                            title={`Snooze ${snoozePresetLabel(preset)}`}
                            onClick={() => handleSnooze(lead.slug, preset, WORK_NEXT_HEADING_ID)}
                            aria-label={dashboardRowActionAriaLabel(
                              `Snooze ${snoozePresetLabel(preset)}`,
                              lead.businessName,
                              lead.slug,
                            )}
                            className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {paidNotLive.length > 0 && (
        <section aria-labelledby={PAID_NOT_LIVE_HEADING_ID} className="mb-8 rounded-2xl border border-red-200 bg-red-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={PAID_NOT_LIVE_HEADING_ID}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
            >
              Paid, not live
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({paidNotLive.length}
                {oldestPaidNotLiveHours !== null
                  ? ` · oldest ${formatAbandonedAgeHours(oldestPaidNotLiveHours)}`
                  : ""}
                )
              </span>
            </h2>
            <Link
              href="/docs/production-deploy"
              className="text-xs font-medium text-red-800 underline underline-offset-2"
            >
              Docs
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Leads at stage=Paid (stage dropdown or CSV import, not necessarily
            a Stripe checkout). A row with no deploy handoff yet had no
            fulfillment record at all until Create deploy handoff below — the
            same DNS/Mark live flow the Stripe webhook already queues
            automatically appears in Production deploy handoffs once created.
          </p>
          <ul className="mt-4 space-y-3" aria-live="polite" aria-relevant="removals">
            {paidNotLive.map((lead) => {
              const leadPaidAgeHours = oldestPaidNotLiveAgeHours(
                [{ slug: lead.slug }],
                orders,
                nowMs,
              );
              return (
                <li
                  key={lead.slug}
                  className="rounded-xl border border-red-100 bg-white px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-900">
                        {lead.businessName}{" "}
                        <span className="font-normal text-zinc-500">({lead.slug})</span>
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        {handoffSlugs.has(lead.slug)
                          ? "Has a deploy handoff — see Production deploy handoffs below."
                          : "No deploy handoff on file."}
                        {leadPaidAgeHours !== null ? (
                          <> · paid {formatAbandonedAgeHours(leadPaidAgeHours)} ago</>
                        ) : null}
                      </p>
                    </div>
                    {!handoffSlugs.has(lead.slug) && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleCreateDeployHandoff(lead.slug)}
                        aria-label={dashboardRowActionAriaLabel(
                          "Create deploy handoff",
                          lead.businessName,
                          lead.slug,
                        )}
                        aria-describedby={
                          handoffActionErrors[lead.slug]
                            ? `paid-not-live-handoff-error-${lead.slug}`
                            : undefined
                        }
                        className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-800 disabled:opacity-60"
                      >
                        Create deploy handoff
                      </button>
                    )}
                  </div>
                  {/* Guarded the same as the button above (rather than on
                      handoffActionErrors[lead.slug] alone): a lead with
                      stage=paid AND an already-open (not-yet-live) handoff
                      renders in both this panel and Production deploy
                      handoffs below simultaneously, and a Mark live failure
                      from that other panel's own action sets this same
                      slug-keyed map — without this guard both panels would
                      render a role="alert" paragraph with a duplicate id for
                      an action this panel's button can't even trigger. */}
                  {!handoffSlugs.has(lead.slug) && handoffActionErrors[lead.slug] ? (
                    <p
                      id={`paid-not-live-handoff-error-${lead.slug}`}
                      className="mt-2 text-xs font-medium text-red-600"
                      role="alert"
                    >
                      {handoffActionErrors[lead.slug]}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {openHandoffs.length > 0 && (
        <section aria-labelledby={PRODUCTION_DEPLOY_HANDOFFS_HEADING_ID} className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={PRODUCTION_DEPLOY_HANDOFFS_HEADING_ID}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
            >
              Production deploy handoffs
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({openHandoffs.length}
                {oldestOpenHandoffsHours !== null
                  ? ` · oldest ${formatAbandonedAgeHours(oldestOpenHandoffsHours)}`
                  : ""}
                )
              </span>
            </h2>
            <Link
              href="/docs/production-deploy"
              className="text-xs font-medium text-emerald-800 underline underline-offset-2"
            >
              Docs
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Created automatically after Stripe checkout. Confirm DNS, then mark live.
          </p>
          <ul className="mt-4 space-y-3" aria-live="polite" aria-relevant="removals">
            {openHandoffs.map((h) => {
              const handoffAgeHours = deployHandoffAgeHours(h.createdAt, nowMs);
              return (
                <li
                  key={h.id}
                  className="rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-900">
                        {h.businessName}{" "}
                        <span className="font-normal text-zinc-500">({h.leadSlug})</span>
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        Status: <code>{h.status}</code> · opened{" "}
                        {formatAbandonedAgeHours(handoffAgeHours)} ago
                        {h.vercelDomainStatus ? (
                          <>
                            {" "}
                            · Vercel:{" "}
                            <code
                              className={
                                isVercelDomainProvisioningFailed(h)
                                  ? "font-semibold text-red-700"
                                  : undefined
                              }
                            >
                              {h.vercelDomainStatus}
                            </code>
                            {isVercelDomainProvisioningFailed(h) ? (
                              <span className="ml-1 font-semibold text-red-700">
                                — fix in Vercel console
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        Host: <code>{h.suggestedHost}</code> ·{" "}
                        <a
                          href={h.previewUrl}
                          className="underline underline-offset-2"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Preview
                        </a>{" "}
                        · Contact: <code>{h.contactFormUrl}</code>
                        {h.customDomain ? (
                          <>
                            {" "}
                            · Custom domain: <code>{h.customDomain}</code>
                          </>
                        ) : null}
                      </p>
                      <ul className="mt-2 space-y-0.5 text-xs text-zinc-500">
                        {h.dnsInstructions.map((d) => (
                          <li key={`${d.type}-${d.host}`}>
                            <code>{d.type}</code> {d.host} → {d.value}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Dedicated Vercel project ID (optional isolation)"
                          value={vercelProjectInputs[h.leadSlug] ?? h.vercelProjectId ?? ""}
                          onChange={(e) =>
                            setVercelProjectInputs((prev) => ({
                              ...prev,
                              [h.leadSlug]: e.target.value,
                            }))
                          }
                          aria-label={dashboardRowActionAriaLabel(
                            "Dedicated Vercel project ID",
                            h.businessName,
                            h.leadSlug,
                          )}
                          aria-invalid={Boolean(vercelProjectErrors[h.leadSlug])}
                          aria-describedby={
                            vercelProjectErrors[h.leadSlug]
                              ? `vercel-project-error-${h.leadSlug}`
                              : undefined
                          }
                          className="w-72 max-w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs outline-none transition focus:border-zinc-900"
                        />
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleAssignVercelProject(h.leadSlug)}
                          aria-label={dashboardRowActionAriaLabel(
                            "Save + provision Vercel project",
                            h.businessName,
                            h.leadSlug,
                          )}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
                        >
                          Save + provision
                        </button>
                      </div>
                      {vercelProjectErrors[h.leadSlug] ? (
                        <p
                          id={`vercel-project-error-${h.leadSlug}`}
                          className="mt-1 text-xs font-medium text-red-600"
                          role="alert"
                        >
                          {vercelProjectErrors[h.leadSlug]}
                        </p>
                      ) : null}
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Client's own domain (e.g. joesplumbing.com)"
                          value={customDomainInputs[h.leadSlug] ?? h.customDomain ?? ""}
                          onChange={(e) =>
                            setCustomDomainInputs((prev) => ({
                              ...prev,
                              [h.leadSlug]: e.target.value,
                            }))
                          }
                          aria-label={dashboardRowActionAriaLabel(
                            "Client's own domain",
                            h.businessName,
                            h.leadSlug,
                          )}
                          aria-invalid={Boolean(customDomainErrors[h.leadSlug])}
                          aria-describedby={
                            customDomainErrors[h.leadSlug]
                              ? `custom-domain-error-${h.leadSlug}`
                              : undefined
                          }
                          className="w-72 max-w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs outline-none transition focus:border-zinc-900"
                        />
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleAssignCustomDomain(h.leadSlug)}
                          aria-label={dashboardRowActionAriaLabel(
                            "Save domain",
                            h.businessName,
                            h.leadSlug,
                          )}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
                        >
                          Save domain
                        </button>
                      </div>
                      {customDomainErrors[h.leadSlug] ? (
                        <p
                          id={`custom-domain-error-${h.leadSlug}`}
                          className="mt-1 text-xs font-medium text-red-600"
                          role="alert"
                        >
                          {customDomainErrors[h.leadSlug]}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleMarkHandoffLive(h.leadSlug)}
                      aria-label={dashboardRowActionAriaLabel("Mark live", h.businessName, h.leadSlug)}
                      aria-describedby={
                        handoffActionErrors[h.leadSlug]
                          ? `production-deploy-handoff-error-${h.leadSlug}`
                          : undefined
                      }
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
                    >
                      Mark live
                    </button>
                  </div>
                  {handoffActionErrors[h.leadSlug] ? (
                    <p
                      id={`production-deploy-handoff-error-${h.leadSlug}`}
                      className="mt-2 text-xs font-medium text-red-600"
                      role="alert"
                    >
                      {handoffActionErrors[h.leadSlug]}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {openInquiries.length > 0 && (
        <section aria-labelledby={WEBSITE_INQUIRIES_HEADING_ID} className="mb-8 rounded-2xl border border-sky-200 bg-sky-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id={WEBSITE_INQUIRIES_HEADING_ID}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
            >
              Website inquiries
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({unrepliedOpenInquiries.length} unreplied
                {newOpenInquiryCount > 0 ? ` · ${newOpenInquiryCount} new` : ""}
                {oldestUnrepliedOpenInquiryAgeHours !== null
                  ? ` · oldest ${formatAbandonedAgeHours(oldestUnrepliedOpenInquiryAgeHours)}`
                  : ""}
                )
              </span>
            </h2>
            <Link
              href="/docs/production-deploy"
              className="text-xs font-medium text-sky-800 underline underline-offset-2"
            >
              Docs
            </Link>
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            Contact-form posts from <code>/api/contact/[slug]</code> — reply from here (Resend +
            suppression), or archive when done.
          </p>
          <ul className="mt-4 space-y-3" aria-live="polite" aria-relevant="removals">
            {openInquiries.map((inq) => (
              <li
                key={inq.id}
                className={`rounded-xl border px-4 py-3 text-sm ${
                  inq.status === "new"
                    ? "border-sky-200 bg-white"
                    : "border-zinc-100 bg-white/80"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-zinc-900">
                      {inq.businessName}{" "}
                      <span className="font-normal text-zinc-500">({inq.leadSlug})</span>
                      {inq.status === "new" ? (
                        <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                          New
                        </span>
                      ) : null}
                      {inq.status === "replied" ? (
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                          Replied
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600">
                      {inq.name || "Anonymous"}
                      {inq.email ? (
                        <>
                          {" "}
                          ·{" "}
                          <a className="underline underline-offset-2" href={`mailto:${inq.email}`}>
                            {inq.email}
                          </a>
                        </>
                      ) : null}
                      {inq.phone ? <> · {inq.phone}</> : null}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">
                      {inq.message}
                    </p>
                    {inq.operatorReply ? (
                      <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                          Your reply
                          {inq.repliedAt
                            ? ` · ${formatAbandonedAgeHours(
                                deployHandoffAgeHours(inq.repliedAt, nowMs),
                              )} ago`
                            : null}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-800">
                          {inq.operatorReply}
                        </p>
                      </div>
                    ) : null}
                    <p className="mt-2 text-[11px] text-zinc-500">
                      {formatAbandonedAgeHours(deployHandoffAgeHours(inq.createdAt, nowMs))} ago
                      {isUnrepliedInquiryStatus(inq.status) ? " · unreplied" : null}
                      {inq.source ? (
                        <>
                          {" "}
                          · source: <code className="break-all">{inq.source.slice(0, 80)}</code>
                        </>
                      ) : null}
                    </p>
                    {inquiryActionErrors[inq.id] ? (
                      <p
                        id={`inquiry-action-error-${inq.id}`}
                        className="mt-1 text-xs font-medium text-red-600"
                        role="alert"
                      >
                        {inquiryActionErrors[inq.id]}
                      </p>
                    ) : null}
                    {inquiryActionNotices[inq.id] ? (
                      <p className="mt-1 text-xs font-medium text-emerald-700" role="status">
                        {inquiryActionNotices[inq.id]}
                      </p>
                    ) : null}
                    {replyOpenId === inq.id && inquiryCanReceiveReply(inq) ? (
                      <div className="mt-3 space-y-2" id={`inquiry-reply-${inq.id}`}>
                        <textarea
                          value={replyDrafts[inq.id] ?? ""}
                          onChange={(e) =>
                            setReplyDrafts((prev) => ({
                              ...prev,
                              [inq.id]: e.target.value,
                            }))
                          }
                          rows={4}
                          maxLength={MAX_INQUIRY_REPLY_LENGTH}
                          placeholder="Write a reply to the inquirer…"
                          aria-label={dashboardRowActionAriaLabel(
                            "Reply to inquiry",
                            inq.businessName,
                            inq.leadSlug,
                            inq.name || inq.email || undefined,
                          )}
                          aria-invalid={Boolean(replyError)}
                          aria-describedby={replyError ? `inquiry-reply-error-${inq.id}` : undefined}
                          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleInquiryReply(inq.id)}
                            className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-800 disabled:opacity-60"
                          >
                            Send reply
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => closeReplyComposer(inq.id)}
                            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
                          >
                            Cancel
                          </button>
                          <span className="text-[11px] text-zinc-500">
                            {(replyDrafts[inq.id] ?? "").length}/{MAX_INQUIRY_REPLY_LENGTH}
                          </span>
                        </div>
                        {replyError ? (
                          <p
                            id={`inquiry-reply-error-${inq.id}`}
                            className="text-xs font-medium text-red-600"
                            role="alert"
                          >
                            {replyError}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    {inq.status === "new" ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() =>
                          handleInquiryStatus(inq.id, "read", WEBSITE_INQUIRIES_HEADING_ID)
                        }
                        aria-label={dashboardRowActionAriaLabel(
                          "Mark read",
                          inq.businessName,
                          inq.leadSlug,
                          inq.name || inq.email || undefined,
                        )}
                        aria-describedby={
                          inquiryActionErrors[inq.id] ? `inquiry-action-error-${inq.id}` : undefined
                        }
                        className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-800 disabled:opacity-60"
                      >
                        Mark read
                      </button>
                    ) : null}
                    {inquiryCanReceiveReply(inq) ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleToggleReplyComposer(inq)}
                        id={inquiryReplyToggleElementId(inq.id)}
                        aria-expanded={replyOpenId === inq.id}
                        aria-controls={`inquiry-reply-${inq.id}`}
                        aria-label={dashboardRowActionAriaLabel(
                          inq.status === "replied" ? "Reply again" : "Reply",
                          inq.businessName,
                          inq.leadSlug,
                          inq.name || inq.email || undefined,
                        )}
                        className="rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 transition hover:bg-sky-50 disabled:opacity-60"
                      >
                        {inq.status === "replied" ? "Reply again" : "Reply"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() =>
                        handleInquiryStatus(inq.id, "archived", WEBSITE_INQUIRIES_HEADING_ID)
                      }
                      aria-label={dashboardRowActionAriaLabel(
                        "Archive",
                        inq.businessName,
                        inq.leadSlug,
                        inq.name || inq.email || undefined,
                      )}
                      aria-describedby={
                        inquiryActionErrors[inq.id] ? `inquiry-action-error-${inq.id}` : undefined
                      }
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
                    >
                      Archive
                    </button>
                    <Link
                      href={leadPreviewPath(inq.leadSlug)}
                      aria-label={dashboardRowActionAriaLabel(
                        "Preview",
                        inq.businessName,
                        inq.leadSlug,
                        inq.name || inq.email || undefined,
                      )}
                      className="text-center text-[11px] font-medium text-sky-800 underline underline-offset-2"
                      target="_blank"
                    >
                      Preview
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Search and Action Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            aria-label="Search leads by name, city, or slug"
            placeholder="Search leads by name, city, or slug..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 pl-10 text-sm outline-none transition focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950"
          />
          <svg
            className="absolute left-3.5 top-3 h-4.5 w-4.5 text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSortByQuality((v) => !v)}
            aria-pressed={sortByQuality}
            className={`inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-semibold transition ${
              sortByQuality
                ? "border-rose-300 bg-rose-50 text-rose-900"
                : "border-zinc-300 bg-white text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50"
            }`}
          >
            {sortByQuality ? "Sorted by quality" : "Sort by quality"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCsvImport(!showCsvImport);
              if (!showCsvImport) setShowAddForm(false);
            }}
            aria-expanded={showCsvImport}
            aria-controls="csv-import-panel"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50"
          >
            {showCsvImport ? "Close CSV" : "Import CSV"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowAddForm(!showAddForm);
              if (!showAddForm) setShowCsvImport(false);
            }}
            aria-expanded={showAddForm}
            aria-controls="add-lead-panel"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            {showAddForm ? "Close Form" : "Add Lead Manually"}
          </button>
        </div>
      </div>

      {/* CSV bulk import */}
      {showCsvImport && (
        <div id="csv-import-panel" className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50/50 p-6">
          <h2 className="text-lg font-semibold tracking-tight">Import leads from CSV</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Compliant scale-up before Places API — tag each batch with a data source. Max 100 rows.
            Services use <code>;</code> inside a cell. See{" "}
            <Link href="/docs/compliance" className="underline underline-offset-2">
              Compliance
            </Link>
            .
          </p>

          <form onSubmit={handleCsvImport} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-zinc-700" htmlFor="csv-data-source">
                  Data source
                </label>
                <input
                  id="csv-data-source"
                  type="text"
                  value={csvDataSource}
                  onChange={(e) => setCsvDataSource(e.target.value)}
                  placeholder="csv_import"
                  className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700" htmlFor="csv-initial-stage">
                  Initial stage
                </label>
                <select
                  id="csv-initial-stage"
                  value={csvStage}
                  onChange={(e) => setCsvStage(e.target.value as LeadPipelineStage)}
                  className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
                >
                  {STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700" htmlFor="csv-upload-file">
                Upload file
              </label>
              <input
                id="csv-upload-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => void handleCsvFile(e.target.files?.[0] ?? null)}
                className="mt-1.5 block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700" htmlFor="csv-text">
                CSV text
              </label>
              <textarea
                id="csv-text"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={8}
                spellCheck={false}
                aria-invalid={Boolean(csvError)}
                aria-describedby={csvError ? "csv-import-error" : undefined}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs leading-5 outline-none transition focus:border-zinc-900"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-400"
              >
                {isPending ? "Importing..." : "Import leads"}
              </button>
              <button
                type="button"
                onClick={() => setCsvText(CSV_LEAD_TEMPLATE)}
                className="text-xs font-medium text-zinc-600 underline-offset-2 hover:underline"
              >
                Reset to template
              </button>
            </div>
          </form>

          {csvError && (
            <p id="csv-import-error" className="mt-4 text-xs font-medium text-red-600" role="alert">
              {csvError}
            </p>
          )}
          {csvMessage && (
            <p className="mt-4 text-xs font-medium text-emerald-700" role="status">
              {csvMessage}
            </p>
          )}
        </div>
      )}

      {/* Manual Add Form (Collapse panel) */}
      {showAddForm && (
        <div id="add-lead-panel" className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50/50 p-6 backdrop-blur-sm transition-all duration-300">
          <h2 className="text-lg font-semibold tracking-tight">Add New Lead</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Input business info to pre-generate a customized preview site.
          </p>

          <form onSubmit={handleAddLeadSubmit} className="mt-6 grid gap-6 sm:grid-cols-2 md:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700" htmlFor="add-lead-business-name">
                Business Name
              </label>
              <input
                id="add-lead-business-name"
                type="text"
                required
                value={formName}
                onChange={handleNameChange}
                maxLength={MAX_BUSINESS_NAME_LENGTH}
                placeholder="e.g. Blue River Salon"
                aria-invalid={Boolean(formError)}
                aria-describedby={formError ? "add-lead-form-error" : undefined}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700" htmlFor="add-lead-preview-slug">
                Preview Slug
              </label>
              <input
                id="add-lead-preview-slug"
                type="text"
                required
                value={formSlug}
                onChange={(e) => setFormSlug(e.target.value)}
                maxLength={MAX_LEAD_SLUG_LENGTH}
                placeholder="e.g. blue-river-salon"
                aria-invalid={Boolean(formError)}
                aria-describedby={formError ? "add-lead-form-error" : undefined}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700" htmlFor="add-lead-category">
                Category Theme
              </label>
              <select
                id="add-lead-category"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as BusinessCategory)}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700" htmlFor="add-lead-tier">
                Recommended Tier
              </label>
              <select
                id="add-lead-tier"
                value={formTier}
                onChange={(e) => setFormTier(e.target.value as "starter" | "growth" | "complete")}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              >
                <option value="starter">
                  Starter (${getBundle("starter")!.setupPriceUsd})
                </option>
                <option value="growth">
                  Growth ({bundlePriceHeadingLabel(getBundle("growth")!)})
                </option>
                <option value="complete">
                  Complete ({bundlePriceHeadingLabel(getBundle("complete")!)})
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700" htmlFor="add-lead-stage">
                Pipeline Stage
              </label>
              <select
                id="add-lead-stage"
                value={formStage}
                onChange={(e) => setFormStage(e.target.value as LeadPipelineStage)}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              >
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700" htmlFor="add-lead-phone">
                Phone
              </label>
              <input
                id="add-lead-phone"
                type="text"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                maxLength={MAX_LEAD_PHONE_LENGTH}
                placeholder="e.g. (303) 555-0199"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700" htmlFor="add-lead-email">
                Email Address
              </label>
              <input
                id="add-lead-email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                maxLength={MAX_LEAD_EMAIL_LENGTH}
                placeholder="e.g. contact@blueriversalon.com"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700" htmlFor="add-lead-city">
                City
              </label>
              <input
                id="add-lead-city"
                type="text"
                value={formCity}
                onChange={(e) => setFormCity(e.target.value)}
                maxLength={MAX_CITY_LENGTH}
                placeholder="Denver"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700" htmlFor="add-lead-state">
                State
              </label>
              <input
                id="add-lead-state"
                type="text"
                value={formState}
                onChange={(e) => setFormState(e.target.value)}
                maxLength={MAX_STATE_LENGTH}
                placeholder="CO"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700" htmlFor="add-lead-address">
                Street Address (optional)
              </label>
              <input
                id="add-lead-address"
                type="text"
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                maxLength={MAX_ADDRESS_LENGTH}
                placeholder="e.g. 1200 Blake St"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700" htmlFor="add-lead-tagline">
                Tagline
              </label>
              <input
                id="add-lead-tagline"
                type="text"
                value={formTagline}
                onChange={(e) => setFormTagline(e.target.value)}
                maxLength={MAX_TAGLINE_LENGTH}
                placeholder="e.g. Premium local style"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-zinc-700" htmlFor="add-lead-description">
                Description
              </label>
              <input
                id="add-lead-description"
                type="text"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                maxLength={MAX_DESCRIPTION_LENGTH}
                placeholder="Brief description of business for the preview page"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div className="sm:col-span-2 md:col-span-3">
              <label className="block text-xs font-semibold text-zinc-700" htmlFor="add-lead-services">
                Services (Comma separated)
              </label>
              <input
                id="add-lead-services"
                type="text"
                value={formServices}
                onChange={(e) => setFormServices(e.target.value)}
                placeholder="e.g. Hair Coloring, Precision Cut, Blowout"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700" htmlFor="add-lead-hours-weekday">
                Hours (Weekday)
              </label>
              <input
                id="add-lead-hours-weekday"
                type="text"
                value={formWeekday}
                onChange={(e) => setFormWeekday(e.target.value)}
                maxLength={MAX_HOURS_SEGMENT_LENGTH}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700" htmlFor="add-lead-hours-weekend">
                Hours (Weekend)
              </label>
              <input
                id="add-lead-hours-weekend"
                type="text"
                value={formWeekend}
                onChange={(e) => setFormWeekend(e.target.value)}
                maxLength={MAX_HOURS_SEGMENT_LENGTH}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div className="flex items-end md:col-span-1">
              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:bg-zinc-400 transition"
              >
                {isPending ? "Creating..." : "Save Lead"}
              </button>
            </div>
          </form>
          {formError && (
            <p id="add-lead-form-error" className="mt-4 text-xs font-medium text-red-600" role="alert">
              {formError}
            </p>
          )}
        </div>
      )}

      <h2
        id={ALL_LEADS_HEADING_ID}
        tabIndex={-1}
        className="mt-10 text-lg font-semibold tracking-tight text-zinc-900 focus:outline-none"
      >
        All leads
      </h2>

      {/* Kanban Filters */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        <button
          type="button"
          onClick={() => setFilterStage("all")}
          aria-pressed={filterStage === "all"}
          className={`flex flex-col rounded-xl border p-4 text-left transition ${
            filterStage === "all"
              ? "border-zinc-950 bg-zinc-50 shadow-sm"
              : "border-zinc-200 hover:border-zinc-300"
          }`}
        >
          <span className="text-xs font-medium text-zinc-500">All Stages</span>
          <span className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
            {leads.length}
          </span>
        </button>

        {STAGES.map((s) => {
          const count = leads.filter((l) => l.stage === s.id).length;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setFilterStage(s.id)}
              aria-pressed={filterStage === s.id}
              className={`flex flex-col rounded-xl border p-4 text-left transition ${
                filterStage === s.id
                  ? "border-zinc-950 bg-zinc-50 shadow-sm"
                  : "border-zinc-200 hover:border-zinc-300"
              }`}
            >
              <span className="text-xs font-medium text-zinc-500">{s.label}</span>
              <span className="mt-2 text-2xl font-bold tracking-tight text-zinc-900">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Leads Table */}
      <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm text-zinc-600">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/50 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                <th scope="col" className="px-6 py-4">Business</th>
                <th scope="col" className="px-6 py-4">Quality</th>
                <th scope="col" className="px-6 py-4">Category</th>
                <th scope="col" className="px-6 py-4">Recommended Tier</th>
                <th scope="col" className="px-6 py-4">Pipeline Stage</th>
                <th scope="col" className="px-6 py-4">Outreach</th>
                <th scope="col" className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-zinc-500">
                    No leads found matching current filter or search.
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => {
                  const step = normalizeOutreachStep(lead.outreachStep);
                  const next = nextFollowUpStep(step);
                  const due = isFollowUpDue(lead, nowMs);
                  const cold = isColdLead(lead, nowMs);
                  const quality = qualityBySlug.get(lead.slug);
                  const notesOpen = notesEditSlug === lead.slug;
                  const snoozed = isLeadSnoozed(lead.snoozedUntil, nowMs);
                  const marketingEligible = leadHasMarketingPack(lead);
                  const packOpen = marketingPackOpenSlug === lead.slug;
                  const existingPack = packForLead(lead.slug);
                  const commerceEligible = leadHasCommerceCatalog(lead);
                  const commerceOpen = commerceEditSlug === lead.slug;
                  const existingCatalog = catalogForLead(lead.slug);
                  const voiceEligible = leadHasClientVoicePack(lead);
                  const voicePackOpen = clientVoicePackOpenSlug === lead.slug;
                  const existingVoicePack = voicePackForLead(lead.slug);
                  return (
                    <React.Fragment key={lead.slug}>
                    <tr className="hover:bg-zinc-50/50 transition">
                      <td className="px-6 py-4.5">
                        <div>
                          <p className="font-semibold text-zinc-900">{lead.businessName}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {lead.city}, {lead.state}
                            {lead.phone && ` · ${lead.phone}`}
                            {lead.email && ` · ${lead.email}`}
                          </p>
                          {leadHasNotes(lead.notes) && !notesOpen ? (
                            <p className="mt-1.5 max-w-xs truncate text-[11px] text-zinc-500" title={lead.notes}>
                              Note: {lead.notes}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4.5">
                        <div className="flex flex-col items-start gap-1">
                          {quality ? (
                            <details>
                              <summary
                                className={`inline-flex cursor-pointer items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${qualityBandClass(quality.band)}`}
                                aria-label={`${quality.score} · ${qualityBandLabel(quality.band)} quality score — show factors`}
                              >
                                {quality.score} · {qualityBandLabel(quality.band)}
                              </summary>
                              <ul className="mt-1 space-y-0.5 text-[11px] text-zinc-500">
                                {quality.factors.map((f) => (
                                  <li key={f.id}>
                                    {f.delta >= 0 ? "+" : ""}
                                    {f.delta} {f.label}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ) : (
                            <span className="text-xs text-zinc-500">—</span>
                          )}
                          {snoozed && lead.snoozedUntil ? (
                            <span
                              className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700"
                              title={lead.snoozedUntil}
                            >
                              {snoozeRemainingLabel(lead.snoozedUntil, nowMs)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4.5">
                        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-800 capitalize">
                          {lead.category}
                        </span>
                      </td>
                      <td className="px-6 py-4.5">
                        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-800 capitalize">
                          {lead.recommendedTier}
                        </span>
                      </td>
                      <td className="px-6 py-4.5">
                        <select
                          value={lead.stage}
                          onChange={(e) =>
                            handleStageChange(lead.slug, e.target.value as LeadPipelineStage)
                          }
                          aria-label={dashboardRowActionAriaLabel(
                            "Change pipeline stage",
                            lead.businessName,
                            lead.slug,
                          )}
                          aria-invalid={Boolean(leadActionErrors[lead.slug])}
                          aria-describedby={
                            leadActionErrors[lead.slug]
                              ? `lead-action-error-${lead.slug}`
                              : undefined
                          }
                          className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold outline-none transition focus:border-zinc-900"
                        >
                          {STAGES.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-6 py-4.5">
                        <p className="text-xs font-medium text-zinc-700">
                          Step {step || 0}/3
                          {due ? (
                            <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                              Due
                            </span>
                          ) : null}
                          {lead.lastPreviewOpenAt ? (
                            <span className="ml-1.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                              Opened
                            </span>
                          ) : null}
                          {quality?.factors.some((f) => f.id === "abandoned_checkout") ? (
                            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                              Cart
                            </span>
                          ) : null}
                          {cold ? (
                            <span
                              className="ml-1.5 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700"
                              title="No reply after all 3 outreach emails — use Re-engage or Close"
                            >
                              Cold
                            </span>
                          ) : null}
                        </p>
                        {lead.lastOutreachAt ? (
                          <p className="mt-0.5 text-[11px] text-zinc-500">
                            {formatAbandonedAgeHours(
                              deployHandoffAgeHours(lead.lastOutreachAt, nowMs),
                            )}{" "}
                            ago
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[11px] text-zinc-500">No sends yet</p>
                        )}
                        {lead.lastPreviewOpenAt ? (
                          <p className="mt-0.5 text-[11px] text-sky-700">
                            Preview{" "}
                            {formatAbandonedAgeHours(
                              deployHandoffAgeHours(lead.lastPreviewOpenAt, nowMs),
                            )}{" "}
                            ago
                          </p>
                        ) : null}
                      </td>
                      <td className="px-6 py-4.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              notesOpen ? closeNotesEditor(lead.slug) : openNotesEditor(lead)
                            }
                            id={leadNotesToggleElementId(lead.slug)}
                            aria-expanded={notesOpen}
                            aria-controls={`lead-notes-${lead.slug}`}
                            aria-label={dashboardRowActionAriaLabel(
                              notesOpen ? "Close notes" : leadHasNotes(lead.notes) ? "Edit notes" : "Notes",
                              lead.businessName,
                              lead.slug,
                            )}
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
                          >
                            {notesOpen ? "Close" : leadHasNotes(lead.notes) ? "Edit notes" : "Notes"}
                          </button>
                          {lead.stage !== "paid" &&
                          lead.stage !== "live" &&
                          lead.stage !== "closed" ? (
                            snoozed ? (
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleClearSnooze(lead.slug)}
                                aria-label={dashboardRowActionAriaLabel(
                                  "Unsnooze",
                                  lead.businessName,
                                  lead.slug,
                                )}
                                className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-100 disabled:opacity-60"
                              >
                                Unsnooze
                              </button>
                            ) : (
                              <div className="inline-flex h-8 items-center gap-0.5 rounded-lg border border-zinc-200 bg-white px-1">
                                {SNOOZE_PRESET_IDS.map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    disabled={isPending}
                                    title={`Snooze ${snoozePresetLabel(preset)}`}
                                    onClick={() => handleSnooze(lead.slug, preset)}
                                    aria-label={dashboardRowActionAriaLabel(
                                      `Snooze ${snoozePresetLabel(preset)}`,
                                      lead.businessName,
                                      lead.slug,
                                    )}
                                    className="rounded-md px-1.5 py-1 text-[10px] font-semibold text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-60"
                                  >
                                    {preset}
                                  </button>
                                ))}
                              </div>
                            )
                          ) : null}
                          {cold ? (
                            <>
                              <button
                                type="button"
                                disabled={
                                  isPending || (reengageSendEmail1 && !lead.email?.trim())
                                }
                                title={
                                  reengageSendEmail1 && !lead.email?.trim()
                                    ? "Add an email before sending Email 1 on re-engage"
                                    : reengageSendEmail1
                                      ? "Reset cadence and send Email 1 now"
                                      : "Reset cadence to Discovered"
                                }
                                onClick={() => handleColdDisposition(lead.slug, "reengage")}
                                aria-label={dashboardRowActionAriaLabel(
                                  reengageSendEmail1 ? "Re-engage + Email 1" : "Re-engage",
                                  lead.businessName,
                                  lead.slug,
                                )}
                                className="inline-flex h-8 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-800 transition hover:bg-stone-100 disabled:opacity-60"
                              >
                                {reengageSendEmail1 ? "Re-engage + Email 1" : "Re-engage"}
                              </button>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleColdDisposition(lead.slug, "close")}
                                aria-label={dashboardRowActionAriaLabel("Close", lead.businessName, lead.slug)}
                                className="inline-flex h-8 items-center justify-center rounded-lg border border-stone-700 bg-stone-800 px-3 text-xs font-semibold text-white transition hover:bg-stone-900 disabled:opacity-60"
                              >
                                Close
                              </button>
                            </>
                          ) : null}
                          {next &&
                          lead.email &&
                          lead.stage !== "paid" &&
                          lead.stage !== "live" &&
                          lead.stage !== "closed" ? (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleSendFollowUp(lead.slug)}
                              aria-label={dashboardRowActionAriaLabel(
                                `Email ${next}`,
                                lead.businessName,
                                lead.slug,
                              )}
                              className="inline-flex h-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-semibold text-violet-900 transition hover:border-violet-300 hover:bg-violet-100 disabled:opacity-60"
                            >
                              Email {next}
                            </button>
                          ) : null}
                          {(lead.stage === "paid" || lead.stage === "live") &&
                          leadHasBillingPortal(lead.slug) ? (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleOpenBillingPortal(lead.slug)}
                              aria-label={dashboardRowActionAriaLabel("Billing", lead.businessName, lead.slug)}
                              aria-describedby={
                                leadActionErrors[lead.slug]
                                  ? `lead-action-error-${lead.slug}`
                                  : undefined
                              }
                              className="inline-flex h-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-900 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:opacity-60"
                            >
                              Billing
                            </button>
                          ) : null}
                          {leadEligibleForUpsell(lead) ? (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleSendStarterUpsell(lead.slug)}
                              aria-label={dashboardRowActionAriaLabel("Upsell", lead.businessName, lead.slug)}
                              aria-describedby={
                                leadActionErrors[lead.slug]
                                  ? `lead-action-error-${lead.slug}`
                                  : leadActionNotices[lead.slug]
                                    ? `lead-action-notice-${lead.slug}`
                                    : undefined
                              }
                              className="inline-flex h-8 items-center justify-center rounded-lg border border-teal-200 bg-teal-50 px-3 text-xs font-semibold text-teal-900 transition hover:border-teal-300 hover:bg-teal-100 disabled:opacity-60"
                            >
                              Upsell
                            </button>
                          ) : null}
                          {marketingEligible ? (
                            <>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleGenerateMarketingPack(lead.slug)}
                                aria-label={dashboardRowActionAriaLabel(
                                  existingPack ? "Regenerate marketing pack" : "Generate marketing pack",
                                  lead.businessName,
                                  lead.slug,
                                )}
                                aria-describedby={
                                  leadActionErrors[lead.slug]
                                    ? `lead-action-error-${lead.slug}`
                                    : undefined
                                }
                                className="inline-flex h-8 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-900 transition hover:border-sky-300 hover:bg-sky-100 disabled:opacity-60"
                              >
                                {existingPack ? "Regenerate pack" : "Generate pack"}
                              </button>
                              {existingPack ? (
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() =>
                                    setMarketingPackOpenSlug(packOpen ? null : lead.slug)
                                  }
                                  aria-expanded={packOpen}
                                  aria-controls={`lead-pack-${lead.slug}`}
                                  aria-label={dashboardRowActionAriaLabel(
                                    packOpen ? "Hide marketing pack" : "View marketing pack",
                                    lead.businessName,
                                    lead.slug,
                                  )}
                                  className="inline-flex h-8 items-center justify-center rounded-lg border border-sky-200 px-3 text-xs font-semibold text-sky-800 transition hover:bg-sky-50 disabled:opacity-60"
                                >
                                  {packOpen ? "Hide pack" : "View pack"}
                                </button>
                              ) : null}
                              {existingPack &&
                              leadEligibleForMarketingPackDelivery(
                                lead,
                                ordersByLeadSlug.get(lead.slug) ?? [],
                              ) ? (
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => handleEmailMarketingPack(lead.slug)}
                                  aria-label={dashboardRowActionAriaLabel(
                                    "Email marketing pack",
                                    lead.businessName,
                                    lead.slug,
                                  )}
                                  aria-describedby={
                                    leadActionErrors[lead.slug]
                                      ? `lead-action-error-${lead.slug}`
                                      : leadActionNotices[lead.slug]
                                        ? `lead-action-notice-${lead.slug}`
                                        : undefined
                                  }
                                  className="inline-flex h-8 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-900 transition hover:border-sky-300 hover:bg-sky-100 disabled:opacity-60"
                                >
                                  Email pack
                                </button>
                              ) : null}
                            </>
                          ) : null}
                          {commerceEligible ? (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() =>
                                commerceOpen
                                  ? closeCommerceEditor(lead.slug)
                                  : openCommerceEditor(lead)
                              }
                              id={leadCommerceToggleElementId(lead.slug)}
                              aria-expanded={commerceOpen}
                              aria-controls={`lead-commerce-${lead.slug}`}
                              aria-label={dashboardRowActionAriaLabel(
                                commerceOpen
                                  ? "Close catalog"
                                  : existingCatalog
                                    ? "Edit catalog"
                                    : "Add catalog",
                                lead.businessName,
                                lead.slug,
                              )}
                              className="inline-flex h-8 items-center justify-center rounded-lg border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-900 transition hover:border-orange-300 hover:bg-orange-100 disabled:opacity-60"
                            >
                              {commerceOpen
                                ? "Close catalog"
                                : existingCatalog
                                  ? "Edit catalog"
                                  : "Add catalog"}
                            </button>
                          ) : null}
                          {voiceEligible ? (
                            <>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleGenerateClientVoicePack(lead.slug)}
                                aria-label={dashboardRowActionAriaLabel(
                                  existingVoicePack ? "Regenerate voice pack" : "Generate voice pack",
                                  lead.businessName,
                                  lead.slug,
                                )}
                                aria-describedby={
                                  leadActionErrors[lead.slug]
                                    ? `lead-action-error-${lead.slug}`
                                    : undefined
                                }
                                className="inline-flex h-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-semibold text-violet-900 transition hover:border-violet-300 hover:bg-violet-100 disabled:opacity-60"
                              >
                                {existingVoicePack ? "Regenerate voice" : "Generate voice"}
                              </button>
                              {existingVoicePack ? (
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() =>
                                    setClientVoicePackOpenSlug(
                                      voicePackOpen ? null : lead.slug,
                                    )
                                  }
                                  aria-expanded={voicePackOpen}
                                  aria-controls={`lead-voice-${lead.slug}`}
                                  aria-label={dashboardRowActionAriaLabel(
                                    voicePackOpen ? "Hide voice pack" : "View voice pack",
                                    lead.businessName,
                                    lead.slug,
                                  )}
                                  className="inline-flex h-8 items-center justify-center rounded-lg border border-violet-200 px-3 text-xs font-semibold text-violet-800 transition hover:bg-violet-50 disabled:opacity-60"
                                >
                                  {voicePackOpen ? "Hide voice" : "View voice"}
                                </button>
                              ) : null}
                              {existingVoicePack &&
                              leadEligibleForClientVoicePackDelivery(
                                lead,
                                ordersByLeadSlug.get(lead.slug) ?? [],
                              ) ? (
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => handleEmailClientVoicePack(lead.slug)}
                                  aria-label={dashboardRowActionAriaLabel(
                                    "Email voice pack",
                                    lead.businessName,
                                    lead.slug,
                                  )}
                                  aria-describedby={
                                    leadActionErrors[lead.slug]
                                      ? `lead-action-error-${lead.slug}`
                                      : leadActionNotices[lead.slug]
                                        ? `lead-action-notice-${lead.slug}`
                                        : undefined
                                  }
                                  className="inline-flex h-8 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-semibold text-violet-900 transition hover:border-violet-300 hover:bg-violet-100 disabled:opacity-60"
                                >
                                  Email voice pack
                                </button>
                              ) : null}
                            </>
                          ) : null}
                          <Link
                            href={leadPreviewPath(lead.slug)}
                            aria-label={dashboardRowActionAriaLabel(
                              "Preview Site",
                              lead.businessName,
                              lead.slug,
                            )}
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
                          >
                            Preview Site
                          </Link>
                        </div>
                        {leadActionErrors[lead.slug] ? (
                          <p
                            id={`lead-action-error-${lead.slug}`}
                            className="mt-1.5 text-right text-xs font-medium text-red-600"
                            role="alert"
                          >
                            {leadActionErrors[lead.slug]}
                          </p>
                        ) : null}
                        {leadActionNotices[lead.slug] ? (
                          <p
                            id={`lead-action-notice-${lead.slug}`}
                            className="mt-1.5 text-right text-xs font-medium text-emerald-700"
                            role="status"
                          >
                            {leadActionNotices[lead.slug]}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                    {packOpen && existingPack ? (
                      <tr className="bg-sky-50/40" id={`lead-pack-${lead.slug}`}>
                        <td colSpan={7} className="px-6 py-4">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h3 className="text-sm font-semibold text-zinc-900">
                              Marketing pack
                              {marketingMonth ? (
                                <span className="ml-2 font-normal text-zinc-500">
                                  {marketingMonth} (UTC)
                                </span>
                              ) : null}
                            </h3>
                            <p className="text-[11px] text-zinc-500">
                              {existingPack.generator === "stub"
                                ? "Stub copy — set ANTHROPIC_API_KEY for LLM"
                                : "Generated via Anthropic"}{" "}
                              · {existingPack.variants.length} pieces · copy to post,
                              or auto-post via the Buffer scaffold below (dormant by
                              default) ·{" "}
                              <span
                                className={
                                  existingPack.sentToClientAt
                                    ? "font-medium text-emerald-700"
                                    : "font-medium text-amber-700"
                                }
                              >
                                {existingPack.sentToClientAt
                                  ? `Emailed to client ${formatAbandonedAgeHours(deployHandoffAgeHours(existingPack.sentToClientAt, nowMs))} ago`
                                  : "Not yet emailed to client"}
                              </span>
                            </p>
                          </div>
                          <ul className="mt-3 space-y-3">
                            {existingPack.variants.map((variant, index) => {
                              const copyText = [
                                variant.title,
                                variant.body,
                                variant.cta ? `CTA: ${variant.cta}` : null,
                                variant.hashtags?.length
                                  ? variant.hashtags.join(" ")
                                  : null,
                              ]
                                .filter(Boolean)
                                .join("\n\n");
                              return (
                                <li
                                  key={`${variant.contentType}-${index}`}
                                  className="rounded-lg border border-sky-100 bg-white px-3 py-2"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-xs font-semibold text-sky-900">
                                      {index + 1}. {contentTypeLabel(variant.contentType)}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyLeadVariant(lead.slug, copyText)}
                                      aria-label={`Copy variant ${index + 1}: ${contentTypeLabel(
                                        variant.contentType,
                                      )}`}
                                      aria-describedby={
                                        leadActionErrors[lead.slug]
                                          ? `lead-action-error-${lead.slug}`
                                          : undefined
                                      }
                                      className="inline-flex h-7 items-center justify-center rounded-md border border-zinc-200 px-2 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-50"
                                    >
                                      Copy
                                    </button>
                                  </div>
                                  {variant.title ? (
                                    <p className="mt-1 text-xs font-medium text-zinc-800">
                                      {variant.title}
                                    </p>
                                  ) : null}
                                  <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-600">
                                    {variant.body}
                                  </p>
                                  {variant.cta ? (
                                    <p className="mt-1 text-[11px] text-zinc-500">
                                      CTA: {variant.cta}
                                    </p>
                                  ) : null}
                                  {variant.hashtags?.length ? (
                                    <p className="mt-1 text-[11px] text-sky-700/80">
                                      {variant.hashtags.join(" ")}
                                    </p>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                          <div className="mt-4 border-t border-sky-100 pt-3">
                            <h4 className="text-xs font-semibold text-zinc-900">
                              Auto-post to Buffer — scaffold, dormant by default
                            </h4>
                            <p className="mt-1 text-[11px] text-zinc-500">
                              Posts all of this month&apos;s facebook_caption / instagram_caption
                              variants to the Buffer profiles you connect below, using
                              the operator&apos;s own Buffer account (no per-lead OAuth).
                              Requires ALLOW_MARKETING_SCHEDULING=1 on this deploy.
                            </p>
                            {!marketingSchedulingAllowed ? (
                              <p className="mt-2 text-[11px] font-medium text-zinc-600">
                                Set ALLOW_MARKETING_SCHEDULING=1 (and
                                BUFFER_ACCESS_TOKEN) on this deploy to enable Buffer
                                auto-posting.
                              </p>
                            ) : (
                              <>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={handleListBufferProfiles}
                                    aria-describedby={
                                      bufferActionError
                                        ? `buffer-action-error-${lead.slug}`
                                        : undefined
                                    }
                                    className="inline-flex h-8 items-center rounded-lg border border-sky-200 px-3 text-xs font-semibold text-sky-900 hover:bg-sky-50 disabled:opacity-60"
                                  >
                                    Load Buffer profiles
                                  </button>
                                  {lead.bufferProfileIds?.length ? (
                                    <button
                                      type="button"
                                      disabled={isPending}
                                      onClick={() =>
                                        handleScheduleMarketingPackToBuffer(lead.slug)
                                      }
                                      aria-describedby={
                                        bufferActionError
                                          ? `buffer-action-error-${lead.slug}`
                                          : undefined
                                      }
                                      className="inline-flex h-8 items-center rounded-lg border border-sky-200 px-3 text-xs font-semibold text-sky-900 hover:bg-sky-50 disabled:opacity-60"
                                    >
                                      Send pack to Buffer
                                    </button>
                                  ) : null}
                                </div>
                                {bufferProfiles.length > 0 ? (
                                  <div className="mt-2">
                                    <p className="text-[11px] text-zinc-500">
                                      Select which of the operator&apos;s connected
                                      Buffer profiles this lead posts to:
                                    </p>
                                    <ul className="mt-1 flex flex-wrap gap-2">
                                      {bufferProfiles.map((profile) => {
                                        const selected = bufferSelectionForLead(lead).includes(
                                          profile.id,
                                        );
                                        return (
                                          <li key={profile.id}>
                                            <label className="inline-flex items-center gap-1 rounded-lg border border-sky-200 px-2 py-1 text-[11px] text-zinc-700">
                                              <input
                                                type="checkbox"
                                                checked={selected}
                                                onChange={() =>
                                                  handleToggleBufferProfile(
                                                    lead.slug,
                                                    profile.id,
                                                  )
                                                }
                                              />
                                              {profile.service}
                                              {profile.formattedUsername
                                                ? ` (${profile.formattedUsername})`
                                                : ""}
                                            </label>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                    <button
                                      type="button"
                                      disabled={isPending}
                                      onClick={() => handleSaveBufferProfiles(lead.slug)}
                                      aria-describedby={
                                        bufferActionError
                                          ? `buffer-action-error-${lead.slug}`
                                          : undefined
                                      }
                                      className="mt-2 inline-flex h-8 items-center rounded-lg border border-sky-200 px-3 text-xs font-semibold text-sky-900 hover:bg-sky-50 disabled:opacity-60"
                                    >
                                      Save profiles for this lead
                                    </button>
                                  </div>
                                ) : null}
                              </>
                            )}
                            {bufferActionError ? (
                              <p
                                id={`buffer-action-error-${lead.slug}`}
                                className="mt-2 text-xs font-medium text-red-600"
                                role="alert"
                              >
                                {bufferActionError}
                              </p>
                            ) : null}
                            {marketingSchedulingAllowed && bufferScheduleResultByLead[lead.slug] ? (
                              <p
                                className="mt-2 text-[11px] text-zinc-600"
                                role={
                                  bufferScheduleResultByLead[lead.slug].failed.length > 0
                                    ? "alert"
                                    : "status"
                                }
                              >
                                Scheduled:{" "}
                                {bufferScheduleResultByLead[lead.slug].scheduled.length} ·
                                Skipped: {bufferScheduleResultByLead[lead.slug].skipped.length} ·
                                Failed: {bufferScheduleResultByLead[lead.slug].failed.length}
                              </p>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    {commerceOpen ? (
                      <tr className="bg-orange-50/40" id={`lead-commerce-${lead.slug}`}>
                        <td colSpan={7} className="px-6 py-4">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h3 className="text-sm font-semibold text-zinc-900">
                              Commerce catalog
                              <span className="ml-2 font-normal text-zinc-500">
                                ≤{MAX_COMMERCE_SKUS} SKUs · shown on preview
                              </span>
                            </h3>
                            <p className="text-[11px] text-zinc-500">
                              Prices in USD. Save, then Sync to Stripe to turn Request
                              order into a direct Buy now checkout on preview. After
                              removing SKUs, Archive orphans deactivates leftover Stripe
                              Products (never auto-deletes).
                            </p>
                          </div>
                          <ul className="mt-3 space-y-3">
                            {commerceDraftItems.map((item, index) => (
                              <li
                                key={item.id}
                                className="grid gap-2 rounded-lg border border-orange-100 bg-white px-3 py-2 sm:grid-cols-[1fr_1fr_7rem_auto]"
                              >
                                <label className="block text-[11px] font-semibold text-zinc-600">
                                  Name
                                  <input
                                    type="text"
                                    value={item.name}
                                    onChange={(e) => {
                                      const name = e.target.value;
                                      setCommerceDraftItems((prev) =>
                                        prev.map((row, i) =>
                                          i === index ? { ...row, name } : row,
                                        ),
                                      );
                                    }}
                                    className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-900"
                                    placeholder="e.g. Latte"
                                  />
                                </label>
                                <label className="block text-[11px] font-semibold text-zinc-600">
                                  Description
                                  <input
                                    type="text"
                                    value={item.description ?? ""}
                                    onChange={(e) => {
                                      const description = e.target.value;
                                      setCommerceDraftItems((prev) =>
                                        prev.map((row, i) =>
                                          i === index
                                            ? {
                                                ...row,
                                                description: description || undefined,
                                              }
                                            : row,
                                        ),
                                      );
                                    }}
                                    className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-900"
                                    placeholder="Optional"
                                  />
                                </label>
                                <label className="block text-[11px] font-semibold text-zinc-600">
                                  Price (USD)
                                  <input
                                    type="number"
                                    min={MIN_SKU_PRICE_CENTS / 100}
                                    step={0.01}
                                    value={(item.priceCents / 100).toFixed(2)}
                                    onChange={(e) => {
                                      const dollars = Number.parseFloat(e.target.value);
                                      const priceCents = Number.isFinite(dollars)
                                        ? Math.round(dollars * 100)
                                        : 0;
                                      setCommerceDraftItems((prev) =>
                                        prev.map((row, i) =>
                                          i === index ? { ...row, priceCents } : row,
                                        ),
                                      );
                                    }}
                                    className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-900"
                                  />
                                </label>
                                <div className="flex items-end justify-end gap-2 pb-0.5">
                                  <span className="hidden text-[11px] text-zinc-500 sm:inline">
                                    {formatPriceUsd(item.priceCents)}
                                  </span>
                                  {item.stripePriceId ? (
                                    <span className="hidden rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 sm:inline">
                                      Synced
                                    </span>
                                  ) : null}
                                  <button
                                    type="button"
                                    disabled={isPending || commerceDraftItems.length <= 1}
                                    onClick={() =>
                                      setCommerceDraftItems((prev) =>
                                        prev.filter((_, i) => i !== index),
                                      )
                                    }
                                    aria-label={`Remove item ${index + 1}${item.name ? `: ${item.name}` : ""}`}
                                    className="inline-flex h-8 items-center rounded-md border border-zinc-200 px-2 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={
                                isPending || commerceDraftItems.length >= MAX_COMMERCE_SKUS
                              }
                              onClick={() =>
                                setCommerceDraftItems((prev) => [
                                  ...prev,
                                  {
                                    id: newCommerceSkuId(),
                                    name: "",
                                    priceCents: 0,
                                  },
                                ])
                              }
                              className="inline-flex h-8 items-center rounded-lg border border-orange-200 px-3 text-xs font-semibold text-orange-900 hover:bg-orange-50 disabled:opacity-60"
                            >
                              Add SKU
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleSaveCommerceCatalog(lead.slug)}
                              className="inline-flex h-8 items-center rounded-lg bg-orange-800 px-3 text-xs font-semibold text-white hover:bg-orange-900 disabled:opacity-60"
                            >
                              Save catalog
                            </button>
                            <button
                              type="button"
                              disabled={isPending || !catalogForLead(lead.slug)}
                              title={
                                catalogForLead(lead.slug)
                                  ? "Create/find Stripe Products + Prices for every saved SKU"
                                  : "Save the catalog first"
                              }
                              onClick={() => handleSyncCommerceCatalogToStripe(lead.slug)}
                              className="inline-flex h-8 items-center rounded-lg border border-orange-300 px-3 text-xs font-semibold text-orange-900 hover:bg-orange-50 disabled:opacity-60"
                            >
                              Sync to Stripe
                            </button>
                            <button
                              type="button"
                              disabled={isPending || !catalogForLead(lead.slug)}
                              title={
                                catalogForLead(lead.slug)
                                  ? "Archive Stripe Products for SKUs removed from this catalog (never auto-deletes)"
                                  : "Save the catalog first"
                              }
                              onClick={() =>
                                handleArchiveOrphanCommerceStripeProducts(lead.slug)
                              }
                              className="inline-flex h-8 items-center rounded-lg border border-orange-200 px-3 text-xs font-semibold text-orange-900 hover:bg-orange-50 disabled:opacity-60"
                            >
                              Archive orphans
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => closeCommerceEditor(lead.slug)}
                              className="inline-flex h-8 items-center rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </div>
                          {commerceCatalogError ? (
                            <p
                              id={`commerce-catalog-error-${lead.slug}`}
                              className="mt-2 text-xs font-medium text-red-600"
                              role="alert"
                            >
                              {commerceCatalogError}
                            </p>
                          ) : null}
                          {commerceCatalogNotice ? (
                            <p className="mt-2 text-xs font-medium text-emerald-700" role="status">
                              {commerceCatalogNotice}
                            </p>
                          ) : null}
                          <div className="mt-4 border-t border-orange-100 pt-3">
                            <h4 className="text-xs font-semibold text-zinc-900">
                              Payouts (Stripe Connect) — scaffold, dormant by default
                            </h4>
                            <p className="mt-1 text-[11px] text-zinc-500">
                              Creates a Connect Express account for this business so
                              it&apos;s ready once payout wiring ships. Buy now money
                              still lands entirely in the platform&apos;s own Stripe
                              account — no transfers happen yet. Requires
                              ALLOW_STRIPE_CONNECT_ONBOARDING=1 on this deploy.
                            </p>
                            {!connectOnboardingAllowed ? (
                              <p className="mt-2 text-[11px] font-medium text-zinc-600">
                                Set ALLOW_STRIPE_CONNECT_ONBOARDING=1 (and
                                STRIPE_SECRET_KEY) on this deploy to enable Connect
                                account creation for clients.
                              </p>
                            ) : (
                              <>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  {lead.stripeConnectAccountId ? (
                                    <span className="text-[11px] text-zinc-600">
                                      Account: <code>{lead.stripeConnectAccountId}</code>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={isPending}
                                      onClick={() =>
                                        handleCreateStripeConnectAccount(lead.slug)
                                      }
                                      className="inline-flex h-8 items-center rounded-lg border border-orange-200 px-3 text-xs font-semibold text-orange-900 hover:bg-orange-50 disabled:opacity-60"
                                    >
                                      Create Connect account
                                    </button>
                                  )}
                                  {lead.stripeConnectAccountId ? (
                                    <>
                                      <button
                                        type="button"
                                        disabled={isPending}
                                        onClick={() =>
                                          handleGetStripeConnectOnboardingLink(lead.slug)
                                        }
                                        className="inline-flex h-8 items-center rounded-lg border border-orange-200 px-3 text-xs font-semibold text-orange-900 hover:bg-orange-50 disabled:opacity-60"
                                      >
                                        Get onboarding link
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isPending}
                                        onClick={() =>
                                          handleSendStripeConnectOnboardingLink(lead.slug)
                                        }
                                        className="inline-flex h-8 items-center rounded-lg border border-orange-200 px-3 text-xs font-semibold text-orange-900 hover:bg-orange-50 disabled:opacity-60"
                                      >
                                        Email onboarding link
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isPending}
                                        onClick={() =>
                                          handleCheckStripeConnectStatus(lead.slug)
                                        }
                                        className="inline-flex h-8 items-center rounded-lg border border-orange-200 px-3 text-xs font-semibold text-orange-900 hover:bg-orange-50 disabled:opacity-60"
                                      >
                                        Check status
                                      </button>
                                    </>
                                  ) : null}
                                </div>
                              </>
                            )}
                            {stripeConnectError ? (
                              <p
                                id={`stripe-connect-error-${lead.slug}`}
                                className="mt-2 text-xs font-medium text-red-600"
                                role="alert"
                              >
                                {stripeConnectError}
                              </p>
                            ) : null}
                            {stripeConnectNotice ? (
                              <p
                                className="mt-2 whitespace-pre-wrap text-xs font-medium text-emerald-700"
                                role="status"
                              >
                                {stripeConnectNotice}
                              </p>
                            ) : null}
                            {connectOnboardingAllowed
                              ? (() => {
                                  const connectStatus = resolveDisplayedConnectStatus(
                                    lead,
                                    connectStatusByLead[lead.slug],
                                  );
                                  if (!connectStatus) return null;
                                  return (
                                    <p className="mt-2 text-[11px] text-zinc-600">
                                      Charges enabled: {connectStatus.chargesEnabled ? "yes" : "no"}{" "}
                                      · Payouts enabled:{" "}
                                      {connectStatus.payoutsEnabled ? "yes" : "no"} · Details
                                      submitted: {connectStatus.detailsSubmitted ? "yes" : "no"}
                                      {connectStatus.live
                                        ? " (just checked)"
                                        : connectStatus.checkedAt
                                          ? ` (as of ${formatAbandonedAgeHours(deployHandoffAgeHours(connectStatus.checkedAt, nowMs))} ago)`
                                          : ""}
                                    </p>
                                  );
                                })()
                              : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    {voicePackOpen && existingVoicePack ? (
                      <tr className="bg-indigo-50/40" id={`lead-voice-${lead.slug}`}>
                        <td colSpan={7} className="px-6 py-4">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h3 className="text-sm font-semibold text-zinc-900">
                              Client voice FAQ pack
                            </h3>
                            <p className="text-[11px] text-zinc-500">
                              {existingVoicePack.generator === "stub"
                                ? "Stub scripts — set ANTHROPIC_API_KEY for LLM"
                                : "Generated via Anthropic"}{" "}
                              · {existingVoicePack.variants.length} scripts · copy into a temp
                              number / Cal.com (Twilio stays Phase 7) ·{" "}
                              <span
                                className={
                                  existingVoicePack.sentToClientAt
                                    ? "font-medium text-emerald-700"
                                    : "font-medium text-amber-700"
                                }
                              >
                                {existingVoicePack.sentToClientAt
                                  ? `Emailed to client ${formatAbandonedAgeHours(deployHandoffAgeHours(existingVoicePack.sentToClientAt, nowMs))} ago`
                                  : "Not yet emailed to client"}
                              </span>
                            </p>
                          </div>
                          <ul className="mt-3 space-y-3">
                            {existingVoicePack.variants.map((variant, index) => {
                              const copyText = [
                                variant.title,
                                variant.body,
                                variant.cta ? `Next: ${variant.cta}` : null,
                              ]
                                .filter(Boolean)
                                .join("\n\n");
                              return (
                                <li
                                  key={`${variant.scriptType}-${index}`}
                                  className="rounded-lg border border-indigo-100 bg-white px-3 py-2"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-xs font-semibold text-indigo-900">
                                      {index + 1}. {scriptTypeLabel(variant.scriptType)}
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyLeadVariant(lead.slug, copyText)}
                                      aria-label={`Copy variant ${index + 1}: ${scriptTypeLabel(
                                        variant.scriptType,
                                      )}`}
                                      aria-describedby={
                                        leadActionErrors[lead.slug]
                                          ? `lead-action-error-${lead.slug}`
                                          : undefined
                                      }
                                      className="inline-flex h-7 items-center justify-center rounded-md border border-zinc-200 px-2 text-[11px] font-semibold text-zinc-700 transition hover:bg-zinc-50"
                                    >
                                      Copy
                                    </button>
                                  </div>
                                  <p className="mt-1 text-xs font-medium text-zinc-800">
                                    {variant.title}
                                  </p>
                                  <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-600">
                                    {variant.body}
                                  </p>
                                  {variant.cta ? (
                                    <p className="mt-1 text-[11px] font-medium text-zinc-500">
                                      Next: {variant.cta}
                                    </p>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                    {notesOpen ? (
                      <tr className="bg-zinc-50/80" id={`lead-notes-${lead.slug}`}>
                        <td colSpan={7} className="px-6 py-4">
                          {notesPromptReason ? (
                            <p
                              className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                              role="status"
                            >
                              {notesPromptMessage(
                                notesPromptReason,
                                leadHasNotes(lead.notes),
                              )}{" "}
                              <span className="text-amber-700/80">
                                Optional — stage and email already saved.
                              </span>
                            </p>
                          ) : null}
                          <label
                            className="block text-xs font-semibold text-zinc-700"
                            htmlFor={`operator-notes-${lead.slug}`}
                          >
                            Operator notes
                            <span className="ml-2 font-normal text-zinc-500">
                              Call outcomes, objections, next steps — not shown on the preview site
                            </span>
                          </label>
                          <textarea
                            id={`operator-notes-${lead.slug}`}
                            value={notesDraft}
                            onChange={(e) => setNotesDraft(e.target.value)}
                            rows={3}
                            maxLength={MAX_OPERATOR_NOTES_LENGTH}
                            placeholder="e.g. Left VM 7/12 — interested in Growth, call back Thursday"
                            aria-invalid={Boolean(notesError)}
                            aria-describedby={notesError ? `operator-notes-error-${lead.slug}` : undefined}
                            className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900"
                            autoFocus={Boolean(notesPromptReason)}
                          />
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleSaveNotes(lead.slug)}
                              className="inline-flex h-8 items-center justify-center rounded-lg bg-zinc-900 px-3 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
                            >
                              {isPending ? "Saving…" : "Save notes"}
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => closeNotesEditor(lead.slug)}
                              className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60"
                            >
                              {notesPromptReason ? "Skip for now" : "Cancel"}
                            </button>
                            <span className="text-[11px] text-zinc-500">
                              {notesDraft.trim().length}/{MAX_OPERATOR_NOTES_LENGTH}
                            </span>
                            {notesError ? (
                              <span
                                id={`operator-notes-error-${lead.slug}`}
                                className="text-xs font-medium text-red-600"
                                role="alert"
                              >
                                {notesError}
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
