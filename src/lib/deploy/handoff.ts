import type {
  CreateDeployHandoffInput,
  DeployHandoff,
  DnsInstruction,
} from "./types";
import {
  getDeployHandoffBySlug,
  insertDeployHandoff,
  listDeployHandoffs,
  updateDeployHandoffCustomDomain,
  updateDeployHandoffStatus,
  updateDeployHandoffVercelProject,
  updateLeadStage,
} from "@/lib/db";
import type { ConvexPrimaryWriteOptions } from "@/lib/payments/convex-primary";
import {
  leadContactAbsoluteUrl,
  leadPreviewAbsoluteUrl,
  leadSlugAsDnsLabel,
} from "@/lib/leads/slug-path";
import { DEPLOY_HANDOFF_CONVEX_PRIMARY } from "./handoff-persist";
import {
  mergeProvisionOntoFreshHandoff,
  preserveDeployHandoffOperatorFields,
} from "./handoff-preserve";
import { customDomainHostAliases } from "./custom-domain-routing";

export { formatDnsInstructionsForEmail } from "./dns-email";
export {
  isProgressedHandoffStatus,
  mergeProvisionOntoFreshHandoff,
  preserveDeployHandoffOperatorFields,
} from "./handoff-preserve";

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

function previewRootDomain(): string {
  return (
    process.env.NEXT_PUBLIC_PREVIEW_DOMAIN?.trim() ||
    "preview.localsitestudio.com"
  );
}

/** Exported for proxy.ts host-based routing — the platform's own root domain(s). */
export function productionRootDomain(): string {
  // Prefer a dedicated production host root; fall back to stripping "preview."
  const explicit = process.env.NEXT_PUBLIC_PRODUCTION_DOMAIN?.trim();
  if (explicit) return explicit;
  const preview = previewRootDomain();
  if (preview.startsWith("preview.")) {
    return preview.slice("preview.".length);
  }
  return preview;
}

function buildDnsInstructions(suggestedHost: string): DnsInstruction[] {
  const vercelCname = "cname.vercel-dns.com";
  return [
    {
      type: "CNAME",
      host: suggestedHost,
      value: vercelCname,
      purpose: "Point the platform subdomain at Vercel for production hosting",
    },
    {
      type: "TXT",
      host: `_localsite.${suggestedHost}`,
      value: "localsite-studio-claim",
      purpose: "Optional ownership marker for operator audits",
    },
  ];
}

function buildHandoffRecord(input: CreateDeployHandoffInput): DeployHandoff {
  const now = new Date().toISOString();
  // DNS label sanitize (hostnames can't percent-encode); path URLs encode-at-use
  // so legacy free-form slugs stay a single segment (see slug-path.ts).
  const suggestedHost = `${leadSlugAsDnsLabel(input.leadSlug)}.${productionRootDomain()}`;
  const previewUrl = leadPreviewAbsoluteUrl(appBaseUrl(), input.leadSlug);
  const contactFormUrl = leadContactAbsoluteUrl(appBaseUrl(), input.leadSlug);
  const notes: string[] = [
    "Payment received — production handoff queued.",
    "Preview remains live at the preview URL until DNS is confirmed.",
    "Contact form stub accepts POSTs and emails/logs submissions for this slug.",
  ];

  if (!process.env.VERCEL_TOKEN) {
    notes.push(
      "VERCEL_TOKEN not set — domain provisioning is manual (operator checklist).",
    );
  }

  return {
    id: `deploy_${input.leadSlug}_${Date.now()}`,
    leadSlug: input.leadSlug,
    businessName: input.businessName,
    tier: input.tier,
    commerceAddon: input.commerceAddon,
    stripeSessionId: input.stripeSessionId,
    customerEmail: input.customerEmail,
    previewUrl,
    suggestedHost,
    customDomain: input.customDomain,
    contactFormUrl,
    dnsInstructions: buildDnsInstructions(suggestedHost),
    status: "awaiting_dns",
    notes,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Best-effort Vercel Domains API call. Never throws — failures become notes.
 * Full custom-domain automation stays operator-gated until tokens + project IDs exist.
 *
 * Resolves the target project per-handoff first (handoff.vercelProjectId — an
 * operator-assigned dedicated Vercel project isolating this client, see
 * vercel-per-client-projects in /docs/process) and falls back to the single
 * shared VERCEL_PROJECT_ID when the client hasn't been isolated onto one.
 */
async function tryProvisionVercelDomain(
  handoff: DeployHandoff,
): Promise<DeployHandoff> {
  const token = process.env.VERCEL_TOKEN?.trim();
  const projectId = handoff.vercelProjectId?.trim() || process.env.VERCEL_PROJECT_ID?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();

  if (!token || !projectId) {
    // On upsell rebuild, keep a prior vercelDomainStatus (e.g. already_exists)
    // rather than clobbering it with skipped_unconfigured when tokens are still unset.
    const skipNote =
      "Skipped Vercel domain API (set VERCEL_TOKEN + VERCEL_PROJECT_ID, or assign a per-client Vercel project, to enable).";
    return {
      ...handoff,
      vercelDomainStatus: handoff.vercelDomainStatus ?? "skipped_unconfigured",
      notes: handoff.notes.includes(skipNote)
        ? handoff.notes
        : [...handoff.notes, skipNote],
    };
  }

  // Client custom domains: register www↔apex twins so either Host form reaches
  // the project (custom-domain-www-apex-alias). Platform suggestedHost stays
  // a single label — no www twin.
  const domains = handoff.customDomain
    ? customDomainHostAliases(handoff.customDomain)
    : [handoff.suggestedHost];
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const url = `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/domains${query}`;

  let notes = [...handoff.notes];
  // Prefer "created" if any alias was newly registered; else already_exists if
  // every successful call was a 409; else the first hard error.
  let vercelDomainStatus: string | undefined;
  let sawCreated = false;
  let sawAlreadyExists = false;
  let hardError: string | undefined;

  try {
    for (const domain of domains) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: domain }),
      });

      if (response.ok) {
        sawCreated = true;
        notes = [
          ...notes,
          `Vercel domain registered: ${domain}. Await DNS propagation, then mark live.`,
        ];
        continue;
      }

      const body = await response.text();
      // 409 often means domain already on the project — treat as provisioned
      // (or keep live when the operator already confirmed DNS).
      if (response.status === 409) {
        sawAlreadyExists = true;
        notes = [...notes, `Vercel already has domain ${domain}.`];
        continue;
      }

      hardError = `error_${response.status}`;
      notes = [
        ...notes,
        `Vercel domain API failed (${response.status}) for ${domain}: ${body.slice(0, 200)}`,
      ];
      // Keep trying remaining aliases — one twin may still succeed.
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return {
      ...handoff,
      vercelDomainStatus: "error_network",
      notes: [...notes, `Vercel domain API network error: ${message}`],
      updatedAt: new Date().toISOString(),
    };
  }

  if (sawCreated) {
    vercelDomainStatus = "created";
  } else if (sawAlreadyExists && !hardError) {
    vercelDomainStatus = "already_exists";
  } else if (hardError) {
    vercelDomainStatus = hardError;
  } else {
    vercelDomainStatus = "created";
  }

  return {
    ...handoff,
    // Never downgrade Mark live → provisioned on an upsell re-provision.
    status:
      hardError && !sawCreated && !sawAlreadyExists
        ? handoff.status
        : handoff.status === "live"
          ? "live"
          : "provisioned",
    vercelDomainStatus,
    notes,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Idempotent: if a handoff already exists for this slug + stripe session, return it.
 * Otherwise create, optionally call Vercel, and persist.
 */
export async function enqueueProductionHandoff(
  input: CreateDeployHandoffInput,
  options?: ConvexPrimaryWriteOptions,
): Promise<DeployHandoff> {
  const existing = await getDeployHandoffBySlug(input.leadSlug);
  if (
    existing &&
    existing.stripeSessionId === input.stripeSessionId &&
    existing.status !== "failed"
  ) {
    return existing;
  }

  let handoff = preserveDeployHandoffOperatorFields(
    buildHandoffRecord(input),
    existing,
  );
  handoff = await tryProvisionVercelDomain(handoff);
  // Re-read after the Vercel network window so a concurrent Mark live /
  // Save domain / Assign project is not wiped by the full-row upsert.
  const fresh = await getDeployHandoffBySlug(input.leadSlug);
  const toPersist = fresh
    ? mergeProvisionOntoFreshHandoff(fresh, handoff)
    : handoff;
  await insertDeployHandoff(toPersist, options);
  return toPersist;
}

/**
 * Isolate a client onto their own Vercel project (or clear the override to
 * fall back to the shared platform project), then retry domain provisioning
 * against whichever project now resolves.
 */
export async function assignVercelProjectAndProvision(
  leadSlug: string,
  vercelProjectId: string | null,
): Promise<DeployHandoff | null> {
  const updated = await updateDeployHandoffVercelProject(
    leadSlug,
    vercelProjectId,
    DEPLOY_HANDOFF_CONVEX_PRIMARY,
  );
  if (!updated) return null;

  const provisioned = await tryProvisionVercelDomain(updated);
  const fresh = await getDeployHandoffBySlug(leadSlug);
  const toPersist = fresh
    ? mergeProvisionOntoFreshHandoff(fresh, provisioned)
    : provisioned;
  await insertDeployHandoff(toPersist, DEPLOY_HANDOFF_CONVEX_PRIMARY);
  return toPersist;
}

/**
 * Record the client's own domain (or clear it to fall back to suggestedHost),
 * then retry Vercel domain provisioning — tryProvisionVercelDomain already
 * prefers customDomain over suggestedHost. proxy.ts serves this lead's
 * preview for requests on the saved domain once DNS points here (see
 * getLeadSlugByCustomDomain in src/lib/db.ts).
 */
export async function assignCustomDomainAndProvision(
  leadSlug: string,
  customDomain: string | null,
): Promise<DeployHandoff | null> {
  const updated = await updateDeployHandoffCustomDomain(
    leadSlug,
    customDomain,
    DEPLOY_HANDOFF_CONVEX_PRIMARY,
  );
  if (!updated) return null;

  const provisioned = await tryProvisionVercelDomain(updated);
  const fresh = await getDeployHandoffBySlug(leadSlug);
  const toPersist = fresh
    ? mergeProvisionOntoFreshHandoff(fresh, provisioned)
    : provisioned;
  await insertDeployHandoff(toPersist, DEPLOY_HANDOFF_CONVEX_PRIMARY);
  return toPersist;
}

export async function markHandoffLive(leadSlug: string): Promise<DeployHandoff | null> {
  const handoff = await getDeployHandoffBySlug(leadSlug);
  if (!handoff) return null;

  const updated = await updateDeployHandoffStatus(
    leadSlug,
    "live",
    ["Operator confirmed DNS / publish — lead marked live."],
    DEPLOY_HANDOFF_CONVEX_PRIMARY,
  );
  // updateDeployHandoffStatus returns null when the handoff row vanished
  // between the get above and the status write (or never existed on the
  // backend that served the write). Do not advance lead stage without a
  // durable handoff status=live — otherwise the operator sees "No deploy
  // handoff found" while stage=live and paid-not-live / open-handoff
  // metrics diverge (mark-handoff-live-null-status-guard).
  if (!updated) return null;
  await updateLeadStage(leadSlug, "live", DEPLOY_HANDOFF_CONVEX_PRIMARY);
  return updated;
}

export async function getHandoffsForOperator(): Promise<DeployHandoff[]> {
  return listDeployHandoffs();
}
