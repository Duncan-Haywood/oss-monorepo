"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import type { Lead, LeadPipelineStage, BusinessCategory } from "@/lib/leads/types";
import type { DeployHandoff } from "@/lib/deploy/types";
import type { ClientInquiry, ClientInquiryStatus } from "@/lib/inquiries/types";
import type { CheckoutSessionRecord } from "@/lib/checkout/types";
import { CSV_LEAD_TEMPLATE } from "@/lib/leads/csv-import";
import {
  updateLeadStageAction,
  addLeadAction,
  importLeadsCsvAction,
  markHandoffLiveAction,
  updateInquiryStatusAction,
  replyToInquiryAction,
  sendFollowUpAction,
  assignVercelProjectAction,
  sendCheckoutRecoveryAction,
  updateLeadNotesAction,
  snoozeLeadAction,
  disposeColdLeadAction,
  openBillingPortalAction,
  sendStarterUpsellAction,
  generateMarketingPackAction,
  saveCommerceCatalogAction,
  syncCommerceCatalogToStripeAction,
  generateClientVoicePackAction,
} from "./actions";
import type { OrderRecord } from "@/lib/orders/types";
import type { MarketingPack } from "@/lib/marketing/pack";
import type { CommerceCatalog, CommerceSku } from "@/lib/commerce/types";
import {
  MAX_COMMERCE_SKUS,
  formatPriceUsd,
  leadEligibleForCommerceCatalog,
  listCommerceCatalogsMissing,
  newCommerceSkuId,
} from "@/lib/commerce";
import type { ClientVoicePack } from "@/lib/voice/pack";
import {
  leadEligibleForClientVoicePack,
  scriptTypeLabel,
} from "@/lib/voice/faq-pack";
import { orderEligibleForBillingPortal } from "@/lib/billing/portal";
import {
  leadEligibleForStarterUpsell,
  listStarterUpsellCandidates,
  resolveUpsellTargetTier,
} from "@/lib/billing/starter-upsell";
import { getBundle } from "@/lib/pricing/bundles";
import {
  contentTypeLabel,
  leadEligibleForMarketingPack,
} from "@/lib/marketing/monthly-pack";
import {
  FOLLOW_UP_2_AFTER_DAYS,
  FOLLOW_UP_3_AFTER_DAYS,
  isColdLead,
  isFollowUpDue,
  listColdLeads,
  listFollowUpsDue,
  nextFollowUpStep,
  normalizeOutreachStep,
} from "@/lib/email/outreach-followups";
import {
  coldLeadDispositionLabel,
  type ColdLeadDisposition,
} from "@/lib/leads/cold-archive";
import {
  ABANDONED_AFTER_HOURS,
  listAbandonedCheckoutsDue,
} from "@/lib/checkout/abandoned-recovery";
import {
  qualityBandClass,
  qualityBandLabel,
  rankLeadsForOutreach,
  scoreLead,
  type LeadQualityResult,
} from "@/lib/leads/quality-score";
import {
  MAX_OPERATOR_NOTES_LENGTH,
  leadHasNotes,
  notesPromptMessage,
  shouldPromptNotesAfterOutreachStep,
  shouldPromptNotesAfterStageChange,
  type NotesPromptReason,
} from "@/lib/leads/notes";
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

interface LeadsClientProps {
  initialLeads: Lead[];
  initialHandoffs?: DeployHandoff[];
  initialInquiries?: ClientInquiry[];
  initialCheckoutSessions?: CheckoutSessionRecord[];
  initialOrders?: OrderRecord[];
  initialMarketingPacks?: MarketingPack[];
  initialCommerceCatalogs?: CommerceCatalog[];
  initialClientVoicePacks?: ClientVoicePack[];
  /** UTC YYYY-MM for the packs loaded on the server. */
  marketingMonth?: string;
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
  { id: "generic", label: "Generic / Other" },
];

export function LeadsClient({
  initialLeads,
  initialHandoffs = [],
  initialInquiries = [],
  initialCheckoutSessions = [],
  initialOrders = [],
  initialMarketingPacks = [],
  initialCommerceCatalogs = [],
  initialClientVoicePacks = [],
  marketingMonth = "",
}: LeadsClientProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [handoffs, setHandoffs] = useState<DeployHandoff[]>(initialHandoffs);
  const [inquiries, setInquiries] = useState<ClientInquiry[]>(initialInquiries);
  const [checkoutSessions, setCheckoutSessions] =
    useState<CheckoutSessionRecord[]>(initialCheckoutSessions);
  const [orders] = useState<OrderRecord[]>(initialOrders);
  const [marketingPacks, setMarketingPacks] =
    useState<MarketingPack[]>(initialMarketingPacks);
  const [marketingPackOpenSlug, setMarketingPackOpenSlug] = useState<string | null>(null);
  const [commerceCatalogs, setCommerceCatalogs] =
    useState<CommerceCatalog[]>(initialCommerceCatalogs);
  const [commerceEditSlug, setCommerceEditSlug] = useState<string | null>(null);
  const [commerceDraftItems, setCommerceDraftItems] = useState<CommerceSku[]>([]);
  const [clientVoicePacks, setClientVoicePacks] =
    useState<ClientVoicePack[]>(initialClientVoicePacks);
  const [clientVoicePackOpenSlug, setClientVoicePackOpenSlug] = useState<string | null>(
    null,
  );
  /** Snapshot clock for due-queue math — avoid Date.now() during render (react-hooks/purity). */
  const [nowMs] = useState(() => Date.now());
  const [filterStage, setFilterStage] = useState<LeadPipelineStage | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortByQuality, setSortByQuality] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyOpenId, setReplyOpenId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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

  const handleStageChange = async (slug: string, newStage: LeadPipelineStage) => {
    const current = leads.find((l) => l.slug === slug);
    const previousStage = current?.stage;

    // Optimistic UI update
    setLeads((prev) =>
      prev.map((l) => {
        if (l.slug !== slug) return l;
        if (newStage === "outreach_sent" && l.email) {
          return {
            ...l,
            stage: newStage,
            outreachStep: 1,
            lastOutreachAt: new Date().toISOString(),
          };
        }
        return { ...l, stage: newStage };
      }),
    );

    const res = await updateLeadStageAction(slug, newStage);
    if (!res.success) {
      alert(`Error updating stage: ${res.error}`);
      // Revert if error
      setLeads(initialLeads);
      return;
    }

    if (
      current &&
      previousStage &&
      shouldPromptNotesAfterStageChange(previousStage, newStage)
    ) {
      openNotesEditor(current, "discovery_call");
    }
  };

  const openNotesEditor = (lead: Lead, reason?: NotesPromptReason) => {
    setNotesEditSlug(lead.slug);
    setNotesDraft(lead.notes ?? "");
    setNotesError(null);
    setNotesPromptReason(reason ?? null);
    if (reason) {
      // Soft prompt from Work next / follow-up queue — bring the row into view.
      requestAnimationFrame(() => {
        document
          .getElementById(`lead-notes-${lead.slug}`)
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  };

  const closeNotesEditor = () => {
    setNotesEditSlug(null);
    setNotesDraft("");
    setNotesError(null);
    setNotesPromptReason(null);
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
      closeNotesEditor();
    });
  };

  const handleSnooze = (slug: string, preset: SnoozePresetId) => {
    startTransition(async () => {
      const res = await snoozeLeadAction(slug, { preset });
      if (!res.success) {
        alert(res.error ?? "Failed to snooze lead");
        return;
      }
      setLeads((prev) =>
        prev.map((l) =>
          l.slug === slug ? { ...l, snoozedUntil: res.snoozedUntil } : l,
        ),
      );
    });
  };

  const handleClearSnooze = (slug: string) => {
    startTransition(async () => {
      const res = await snoozeLeadAction(slug, { clear: true });
      if (!res.success) {
        alert(res.error ?? "Failed to clear snooze");
        return;
      }
      setLeads((prev) =>
        prev.map((l) =>
          l.slug === slug ? { ...l, snoozedUntil: undefined } : l,
        ),
      );
    });
  };

  const handleColdDisposition = (slug: string, disposition: ColdLeadDisposition) => {
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
        alert(res.error ?? "Failed to update cold lead");
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

      setCsvMessage(
        `Imported ${res.imported} lead${res.imported === 1 ? "" : "s"}` +
          (res.skipped ? ` (${res.skipped} skipped)` : "") +
          (res.errors.length ? `. ${res.errors.length} row warning(s).` : "."),
      );

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
        setLeads((prev) => {
          const existsIdx = prev.findIndex((l) => l.slug === newLeadData.slug);
          if (existsIdx !== -1) {
            const updated = [...prev];
            updated[existsIdx] = newLeadData;
            return updated;
          }
          return [...prev, newLeadData];
        });
        
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
    startTransition(async () => {
      const res = await markHandoffLiveAction(slug);
      if (!res.success) {
        alert(`Error marking live: ${res.error}`);
        return;
      }
      setHandoffs((prev) =>
        prev.map((h) => (h.leadSlug === slug ? { ...h, status: "live" } : h)),
      );
      setLeads((prev) =>
        prev.map((l) => (l.slug === slug ? { ...l, stage: "live" } : l)),
      );
    });
  };

  const [vercelProjectInputs, setVercelProjectInputs] = useState<Record<string, string>>({});

  const handleAssignVercelProject = (slug: string) => {
    const value = vercelProjectInputs[slug] ?? "";
    startTransition(async () => {
      const res = await assignVercelProjectAction(slug, value);
      if (!res.success) {
        alert(`Error assigning Vercel project: ${res.error}`);
        return;
      }
      setHandoffs((prev) =>
        prev.map((h) => (h.leadSlug === slug ? res.handoff : h)),
      );
    });
  };

  const handleInquiryStatus = (inquiryId: string, status: ClientInquiryStatus) => {
    startTransition(async () => {
      const res = await updateInquiryStatusAction(inquiryId, status);
      if (!res.success) {
        alert(`Error updating inquiry: ${res.error}`);
        return;
      }
      setInquiries((prev) =>
        prev.map((inq) => (inq.id === inquiryId ? { ...inq, status } : inq)),
      );
    });
  };

  const handleToggleReplyComposer = (inq: ClientInquiry) => {
    const isOpening = replyOpenId !== inq.id;
    setReplyOpenId((prev) => (prev === inq.id ? null : inq.id));
    if (inquiryShouldAutoMarkRead(inq, isOpening)) {
      handleInquiryStatus(inq.id, "read");
    }
  };

  const handleInquiryReply = (inquiryId: string) => {
    const body = replyDrafts[inquiryId] ?? "";
    startTransition(async () => {
      const res = await replyToInquiryAction(inquiryId, body);
      if (!res.success) {
        alert(`Reply failed: ${res.error}`);
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
      setReplyOpenId(null);
      if (res.mock) {
        alert("Reply sent (mock — RESEND_API_KEY not configured).");
      }
    });
  };

  const handleSendFollowUp = (slug: string) => {
    const current = leads.find((l) => l.slug === slug);
    const previousStep = current?.outreachStep;
    startTransition(async () => {
      const res = await sendFollowUpAction(slug);
      if (!res.success) {
        alert(`Follow-up failed: ${res.error}`);
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
        shouldPromptNotesAfterOutreachStep(previousStep, res.outreachStep)
      ) {
        openNotesEditor(current, "email_3");
      }
    });
  };

  const handleSendCheckoutRecovery = (stripeSessionId: string) => {
    startTransition(async () => {
      const res = await sendCheckoutRecoveryAction(stripeSessionId);
      if (!res.success) {
        alert(`Recovery email failed: ${res.error}`);
        return;
      }
      const sentAt = new Date().toISOString();
      setCheckoutSessions((prev) =>
        prev.map((s) =>
          s.stripeSessionId === stripeSessionId ? { ...s, recoverySentAt: sentAt } : s,
        ),
      );
    });
  };

  const leadHasBillingPortal = (slug: string) =>
    orders.some((o) => o.leadSlug === slug && orderEligibleForBillingPortal(o));

  const leadEligibleForUpsell = (lead: Lead) =>
    leadEligibleForStarterUpsell({
      stage: lead.stage,
      email: lead.email,
      ordersForLead: orders.filter((o) => o.leadSlug === lead.slug),
    });

  const leadHasMarketingPack = (lead: Lead) =>
    leadEligibleForMarketingPack(
      lead,
      orders.filter((o) => o.leadSlug === lead.slug),
    );

  const packForLead = (slug: string) =>
    marketingPacks.find((p) => p.leadSlug === slug) ?? null;

  const handleOpenBillingPortal = (slug: string) => {
    startTransition(async () => {
      const res = await openBillingPortalAction(slug);
      if (!res.success) {
        alert(`Billing portal failed: ${res.error}`);
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    });
  };

  const handleSendStarterUpsell = (slug: string) => {
    startTransition(async () => {
      const res = await sendStarterUpsellAction(slug);
      if (!res.success) {
        alert(`Upsell email failed: ${res.error}`);
        return;
      }
      const label = res.targetTier === "complete" ? "Complete" : "Growth";
      alert(
        res.mock
          ? `Mock upsell email logged (Resend unset) — ${label} checkout link`
          : `Upsell email sent — ${label} checkout link`,
      );
    });
  };

  const handleGenerateMarketingPack = (slug: string) => {
    startTransition(async () => {
      const res = await generateMarketingPackAction(slug);
      if (!res.success) {
        alert(`Marketing pack failed: ${res.error}`);
        return;
      }
      setMarketingPacks((prev) => {
        const without = prev.filter((p) => p.leadSlug !== slug);
        return [res.pack, ...without];
      });
      setMarketingPackOpenSlug(slug);
    });
  };

  const copyMarketingVariant = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      alert("Could not copy to clipboard");
    }
  };

  const catalogForLead = (slug: string) =>
    commerceCatalogs.find((c) => c.leadSlug === slug) ?? null;

  const leadHasCommerceCatalog = (lead: Lead) =>
    leadEligibleForCommerceCatalog(
      lead,
      orders.filter((o) => o.leadSlug === lead.slug),
    );

  const openCommerceEditor = (lead: Lead) => {
    const existing = catalogForLead(lead.slug);
    setCommerceEditSlug(lead.slug);
    setCommerceDraftItems(
      existing?.items.length
        ? existing.items.map((item) => ({ ...item }))
        : [{ id: newCommerceSkuId(), name: "", priceCents: 0 }],
    );
  };

  const closeCommerceEditor = () => {
    setCommerceEditSlug(null);
    setCommerceDraftItems([]);
  };

  const handleSaveCommerceCatalog = (slug: string) => {
    startTransition(async () => {
      const res = await saveCommerceCatalogAction(slug, commerceDraftItems);
      if (!res.success) {
        alert(`Commerce catalog failed: ${res.error}`);
        return;
      }
      setCommerceCatalogs((prev) => {
        const without = prev.filter((c) => c.leadSlug !== slug);
        return [res.catalog, ...without];
      });
      closeCommerceEditor();
    });
  };

  const handleSyncCommerceCatalogToStripe = (slug: string) => {
    startTransition(async () => {
      const res = await syncCommerceCatalogToStripeAction(slug);
      if (!res.success) {
        alert(`Stripe sync failed: ${res.error}`);
        return;
      }
      setCommerceCatalogs((prev) => {
        const without = prev.filter((c) => c.leadSlug !== slug);
        return [res.catalog, ...without];
      });
      setCommerceDraftItems(res.catalog.items.map((item) => ({ ...item })));
    });
  };

  const leadHasClientVoicePack = (lead: Lead) =>
    leadEligibleForClientVoicePack(
      lead,
      orders.filter((o) => o.leadSlug === lead.slug),
    );

  const voicePackForLead = (slug: string) =>
    clientVoicePacks.find((p) => p.leadSlug === slug) ?? null;

  const handleGenerateClientVoicePack = (slug: string) => {
    startTransition(async () => {
      const res = await generateClientVoicePackAction(slug);
      if (!res.success) {
        alert(`Client voice pack failed: ${res.error}`);
        return;
      }
      setClientVoicePacks((prev) => {
        const without = prev.filter((p) => p.leadSlug !== slug);
        return [res.pack, ...without];
      });
      setClientVoicePackOpenSlug(slug);
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
  const openInquiries = inquiries.filter((inq) => inq.status !== "archived");
  // Snapshot clock from mount — server re-checks cadence on send.
  const followUpsDue = listFollowUpsDue(leads, nowMs);
  const coldLeads = listColdLeads(leads, nowMs);
  const abandonedCheckoutsDue = listAbandonedCheckoutsDue(checkoutSessions, nowMs);
  const starterUpsellCandidates = listStarterUpsellCandidates(leads, orders);
  const commerceCatalogsMissing = listCommerceCatalogsMissing(
    leads,
    orders,
    commerceCatalogs,
  );
  const businessNameBySlug = new Map(leads.map((l) => [l.slug, l.businessName]));

  return (
    <div className="mt-8">
      {commerceCatalogsMissing.length > 0 && (
        <section className="mb-8 rounded-2xl border border-orange-200 bg-orange-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
              Commerce catalogs missing
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({commerceCatalogsMissing.length})
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
          <ul className="mt-4 space-y-3">
            {commerceCatalogsMissing.map((lead) => (
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
                    <p className="mt-1 text-xs text-zinc-600">{lead.stage} · Commerce add-on</p>
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => openCommerceEditor(lead)}
                    className="rounded-lg bg-orange-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-900 disabled:opacity-60"
                  >
                    Add catalog
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {starterUpsellCandidates.length > 0 && (
        <section className="mb-8 rounded-2xl border border-teal-200 bg-teal-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
              Starter → MRR upsell
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({starterUpsellCandidates.length})
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
          <ul className="mt-4 space-y-3">
            {starterUpsellCandidates.map((lead) => {
              const targetTier = resolveUpsellTargetTier(lead.recommendedTier);
              const bundle = getBundle(targetTier);
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
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleSendStarterUpsell(lead.slug)}
                      className="rounded-lg bg-teal-800 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-900 disabled:opacity-60"
                    >
                      Send {bundle?.name ?? targetTier} upsell
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {abandonedCheckoutsDue.length > 0 && (
        <section className="mb-8 rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
              Abandoned checkouts
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({abandonedCheckoutsDue.length})
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
            Checkout started but not completed after {ABANDONED_AFTER_HOURS}h. Operator-triggered
            recovery email; suppresses honor the unsubscribe list.
          </p>
          <ul className="mt-4 space-y-3">
            {abandonedCheckoutsDue.map((session) => (
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
                      {new Date(session.createdAt).toLocaleString()}
                      {session.customerEmail ? ` · ${session.customerEmail}` : null}
                      {session.recoverySentAt
                        ? ` · last nudged ${new Date(session.recoverySentAt).toLocaleDateString()}`
                        : null}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleSendCheckoutRecovery(session.stripeSessionId)}
                    className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-800 disabled:opacity-60"
                  >
                    Send recovery email
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {followUpsDue.length > 0 && (
        <section className="mb-8 rounded-2xl border border-violet-200 bg-violet-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
              Follow-ups due
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({followUpsDue.length})
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
          <ul className="mt-4 space-y-3">
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
                          ? ` · last sent ${new Date(lead.lastOutreachAt).toLocaleDateString()}`
                          : " · no timestamp (treat as due)"}
                        {lead.email ? ` · ${lead.email}` : null}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isPending || !next}
                      onClick={() => handleSendFollowUp(lead.slug)}
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
        <section className="mb-8 rounded-2xl border border-stone-200 bg-stone-50/50 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
              Cold leads
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({coldLeads.length})
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
          <ul className="mt-4 space-y-3">
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
                        ? ` · last sent ${new Date(lead.lastOutreachAt).toLocaleDateString()}`
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
                      onClick={() => handleColdDisposition(lead.slug, "reengage")}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 transition hover:bg-stone-100 disabled:opacity-60"
                    >
                      {reengageSendEmail1
                        ? "Re-engage + Email 1"
                        : coldLeadDispositionLabel("reengage")}
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleColdDisposition(lead.slug, "close")}
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
        <section className="mb-8 rounded-2xl border border-rose-200 bg-rose-50/30 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
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
          <ul className="mt-4 space-y-3">
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
                        href={`/preview/${lead.slug}`}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-center text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
                        target="_blank"
                      >
                        Preview
                      </Link>
                      {lead.stage === "site_built" && lead.email ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleStageChange(lead.slug, "outreach_sent")}
                          className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-800 disabled:opacity-60"
                        >
                          Send Email 1
                        </button>
                      ) : null}
                      {isFollowUpDue(lead, nowMs) ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleSendFollowUp(lead.slug)}
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
                            onClick={() => handleSnooze(lead.slug, preset)}
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

      {openHandoffs.length > 0 && (
        <section className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
              Production deploy handoffs
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
          <ul className="mt-4 space-y-3">
            {openHandoffs.map((h) => (
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
                      Status: <code>{h.status}</code>
                      {h.vercelDomainStatus ? (
                        <>
                          {" "}
                          · Vercel: <code>{h.vercelDomainStatus}</code>
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
                        className="w-72 max-w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs outline-none transition focus:border-zinc-900"
                      />
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleAssignVercelProject(h.leadSlug)}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-60"
                      >
                        Save + provision
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleMarkHandoffLive(h.leadSlug)}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
                  >
                    Mark live
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {openInquiries.length > 0 && (
        <section className="mb-8 rounded-2xl border border-sky-200 bg-sky-50/40 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
              Website inquiries
              <span className="ml-2 text-sm font-normal text-zinc-500">
                ({openInquiries.filter((i) => i.status === "new").length} new)
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
          <ul className="mt-4 space-y-3">
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
                            ? ` · ${new Date(inq.repliedAt).toLocaleString()}`
                            : null}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-800">
                          {inq.operatorReply}
                        </p>
                      </div>
                    ) : null}
                    <p className="mt-2 text-[11px] text-zinc-400">
                      {new Date(inq.createdAt).toLocaleString()}
                      {inq.source ? (
                        <>
                          {" "}
                          · source: <code className="break-all">{inq.source.slice(0, 80)}</code>
                        </>
                      ) : null}
                    </p>
                    {replyOpenId === inq.id && inquiryCanReceiveReply(inq) ? (
                      <div className="mt-3 space-y-2">
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
                            onClick={() => setReplyOpenId(null)}
                            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
                          >
                            Cancel
                          </button>
                          <span className="text-[11px] text-zinc-400">
                            {(replyDrafts[inq.id] ?? "").length}/{MAX_INQUIRY_REPLY_LENGTH}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    {inq.status === "new" ? (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleInquiryStatus(inq.id, "read")}
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
                        className="rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-900 transition hover:bg-sky-50 disabled:opacity-60"
                      >
                        {inq.status === "replied" ? "Reply again" : "Reply"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleInquiryStatus(inq.id, "archived")}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-60"
                    >
                      Archive
                    </button>
                    <Link
                      href={`/preview/${inq.leadSlug}`}
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
            placeholder="Search leads by name, city, or slug..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 pl-10 text-sm outline-none transition focus:border-zinc-950 focus:ring-1 focus:ring-zinc-950"
          />
          <svg
            className="absolute left-3.5 top-3 h-4.5 w-4.5 text-zinc-400"
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
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            {showAddForm ? "Close Form" : "Add Lead Manually"}
          </button>
        </div>
      </div>

      {/* CSV bulk import */}
      {showCsvImport && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50/50 p-6">
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
                <label className="block text-xs font-semibold text-zinc-700">Data source</label>
                <input
                  type="text"
                  value={csvDataSource}
                  onChange={(e) => setCsvDataSource(e.target.value)}
                  placeholder="csv_import"
                  className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700">Initial stage</label>
                <select
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
              <label className="block text-xs font-semibold text-zinc-700">Upload file</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => void handleCsvFile(e.target.files?.[0] ?? null)}
                className="mt-1.5 block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">CSV text</label>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={8}
                spellCheck={false}
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

          {csvError && <p className="mt-4 text-xs font-medium text-red-600">{csvError}</p>}
          {csvMessage && <p className="mt-4 text-xs font-medium text-emerald-700">{csvMessage}</p>}
        </div>
      )}

      {/* Manual Add Form (Collapse panel) */}
      {showAddForm && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50/50 p-6 backdrop-blur-sm transition-all duration-300">
          <h2 className="text-lg font-semibold tracking-tight">Add New Lead</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Input business info to pre-generate a customized preview site.
          </p>

          <form onSubmit={handleAddLeadSubmit} className="mt-6 grid gap-6 sm:grid-cols-2 md:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700">Business Name</label>
              <input
                type="text"
                required
                value={formName}
                onChange={handleNameChange}
                placeholder="e.g. Blue River Salon"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">Preview Slug</label>
              <input
                type="text"
                required
                value={formSlug}
                onChange={(e) => setFormSlug(e.target.value)}
                placeholder="e.g. blue-river-salon"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">Category Theme</label>
              <select
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
              <label className="block text-xs font-semibold text-zinc-700">Recommended Tier</label>
              <select
                value={formTier}
                onChange={(e) => setFormTier(e.target.value as "starter" | "growth" | "complete")}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              >
                <option value="starter">Starter ($500)</option>
                <option value="growth">Growth ($500 + $99/mo)</option>
                <option value="complete">Complete ($500 + $199/mo)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">Pipeline Stage</label>
              <select
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
              <label className="block text-xs font-semibold text-zinc-700">Phone</label>
              <input
                type="text"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="e.g. (303) 555-0199"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">Email Address</label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="e.g. contact@blueriversalon.com"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">City</label>
              <input
                type="text"
                value={formCity}
                onChange={(e) => setFormCity(e.target.value)}
                placeholder="Denver"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">State</label>
              <input
                type="text"
                value={formState}
                onChange={(e) => setFormState(e.target.value)}
                placeholder="CO"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">Street Address (optional)</label>
              <input
                type="text"
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                placeholder="e.g. 1200 Blake St"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">Tagline</label>
              <input
                type="text"
                value={formTagline}
                onChange={(e) => setFormTagline(e.target.value)}
                placeholder="e.g. Premium local style"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-zinc-700">Description</label>
              <input
                type="text"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Brief description of business for the preview page"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div className="sm:col-span-2 md:col-span-3">
              <label className="block text-xs font-semibold text-zinc-700">Services (Comma separated)</label>
              <input
                type="text"
                value={formServices}
                onChange={(e) => setFormServices(e.target.value)}
                placeholder="e.g. Hair Coloring, Precision Cut, Blowout"
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">Hours (Weekday)</label>
              <input
                type="text"
                value={formWeekday}
                onChange={(e) => setFormWeekday(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700">Hours (Weekend)</label>
              <input
                type="text"
                value={formWeekend}
                onChange={(e) => setFormWeekend(e.target.value)}
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
          {formError && <p className="mt-4 text-xs font-medium text-red-600">{formError}</p>}
        </div>
      )}

      {/* Kanban Filters */}
      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        <button
          onClick={() => setFilterStage("all")}
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
              onClick={() => setFilterStage(s.id)}
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
                <th className="px-6 py-4">Business</th>
                <th className="px-6 py-4">Quality</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Recommended Tier</th>
                <th className="px-6 py-4">Pipeline Stage</th>
                <th className="px-6 py-4">Outreach</th>
                <th className="px-6 py-4 text-right">Actions</th>
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
                          <p className="text-xs text-zinc-400 mt-0.5">
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
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${qualityBandClass(quality.band)}`}
                              title={quality.factors
                                .map((f) => `${f.delta >= 0 ? "+" : ""}${f.delta} ${f.label}`)
                                .join("\n")}
                            >
                              {quality.score} · {qualityBandLabel(quality.band)}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">—</span>
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
                          <p className="mt-0.5 text-[11px] text-zinc-400">
                            {new Date(lead.lastOutreachAt).toLocaleDateString()}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[11px] text-zinc-400">No sends yet</p>
                        )}
                        {lead.lastPreviewOpenAt ? (
                          <p className="mt-0.5 text-[11px] text-sky-700">
                            Preview {new Date(lead.lastPreviewOpenAt).toLocaleDateString()}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-6 py-4.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              notesOpen ? closeNotesEditor() : openNotesEditor(lead)
                            }
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
                                className="inline-flex h-8 items-center justify-center rounded-lg border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-800 transition hover:bg-stone-100 disabled:opacity-60"
                              >
                                {reengageSendEmail1 ? "Re-engage + Email 1" : "Re-engage"}
                              </button>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleColdDisposition(lead.slug, "close")}
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
                                  className="inline-flex h-8 items-center justify-center rounded-lg border border-sky-200 px-3 text-xs font-semibold text-sky-800 transition hover:bg-sky-50 disabled:opacity-60"
                                >
                                  {packOpen ? "Hide pack" : "View pack"}
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
                                  ? closeCommerceEditor()
                                  : openCommerceEditor(lead)
                              }
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
                                  className="inline-flex h-8 items-center justify-center rounded-lg border border-violet-200 px-3 text-xs font-semibold text-violet-800 transition hover:bg-violet-50 disabled:opacity-60"
                                >
                                  {voicePackOpen ? "Hide voice" : "View voice"}
                                </button>
                              ) : null}
                            </>
                          ) : null}
                          <Link
                            href={`/preview/${lead.slug}`}
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
                          >
                            Preview Site
                          </Link>
                        </div>
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
                              · {existingPack.variants.length} pieces · copy to post
                              (auto-schedule stays operator-gated)
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
                                      onClick={() => void copyMarketingVariant(copyText)}
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
                              order into a direct Buy now checkout on preview.
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
                                    min={0}
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
                                  <span className="hidden text-[11px] text-zinc-400 sm:inline">
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
                              disabled={isPending}
                              onClick={() => closeCommerceEditor()}
                              className="inline-flex h-8 items-center rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                            >
                              Cancel
                            </button>
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
                              number / Cal.com (Twilio stays Phase 7)
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
                                      onClick={() => void copyMarketingVariant(copyText)}
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
                          <label className="block text-xs font-semibold text-zinc-700">
                            Operator notes
                            <span className="ml-2 font-normal text-zinc-400">
                              Call outcomes, objections, next steps — not shown on the preview site
                            </span>
                          </label>
                          <textarea
                            value={notesDraft}
                            onChange={(e) => setNotesDraft(e.target.value)}
                            rows={3}
                            maxLength={MAX_OPERATOR_NOTES_LENGTH}
                            placeholder="e.g. Left VM 7/12 — interested in Growth, call back Thursday"
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
                              onClick={closeNotesEditor}
                              className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-60"
                            >
                              {notesPromptReason ? "Skip for now" : "Cancel"}
                            </button>
                            <span className="text-[11px] text-zinc-400">
                              {notesDraft.trim().length}/{MAX_OPERATOR_NOTES_LENGTH}
                            </span>
                            {notesError ? (
                              <span className="text-xs font-medium text-red-600">{notesError}</span>
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
