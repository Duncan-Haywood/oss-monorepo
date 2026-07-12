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
import { preserveDeployHandoffOperatorFields } from "./handoff-preserve";

export { formatDnsInstructionsForEmail } from "./dns-email";
export { preserveDeployHandoffOperatorFields } from "./handoff-preserve";

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
  const suggestedHost = `${input.leadSlug}.${productionRootDomain()}`;
  const previewUrl = `${appBaseUrl()}/preview/${input.leadSlug}`;
  const contactFormUrl = `${appBaseUrl()}/api/contact/${input.leadSlug}`;
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
    return {
      ...handoff,
      vercelDomainStatus: "skipped_unconfigured",
      notes: [
        ...handoff.notes,
        "Skipped Vercel domain API (set VERCEL_TOKEN + VERCEL_PROJECT_ID, or assign a per-client Vercel project, to enable).",
      ],
    };
  }

  const domain = handoff.customDomain || handoff.suggestedHost;
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  const url = `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/domains${query}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: domain }),
    });

    if (response.ok) {
      return {
        ...handoff,
        status: "provisioned",
        vercelDomainStatus: "created",
        notes: [
          ...handoff.notes,
          `Vercel domain registered: ${domain}. Await DNS propagation, then mark live.`,
        ],
        updatedAt: new Date().toISOString(),
      };
    }

    const body = await response.text();
    // 409 often means domain already on the project — treat as provisioned.
    if (response.status === 409) {
      return {
        ...handoff,
        status: "provisioned",
        vercelDomainStatus: "already_exists",
        notes: [...handoff.notes, `Vercel already has domain ${domain}.`],
        updatedAt: new Date().toISOString(),
      };
    }

    return {
      ...handoff,
      vercelDomainStatus: `error_${response.status}`,
      notes: [
        ...handoff.notes,
        `Vercel domain API failed (${response.status}): ${body.slice(0, 200)}`,
      ],
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return {
      ...handoff,
      vercelDomainStatus: "error_network",
      notes: [...handoff.notes, `Vercel domain API network error: ${message}`],
      updatedAt: new Date().toISOString(),
    };
  }
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
  await insertDeployHandoff(handoff, options);
  return handoff;
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
  const updated = await updateDeployHandoffVercelProject(leadSlug, vercelProjectId);
  if (!updated) return null;

  const provisioned = await tryProvisionVercelDomain(updated);
  await insertDeployHandoff(provisioned);
  return provisioned;
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
  const updated = await updateDeployHandoffCustomDomain(leadSlug, customDomain);
  if (!updated) return null;

  const provisioned = await tryProvisionVercelDomain(updated);
  await insertDeployHandoff(provisioned);
  return provisioned;
}

export async function markHandoffLive(leadSlug: string): Promise<DeployHandoff | null> {
  const handoff = await getDeployHandoffBySlug(leadSlug);
  if (!handoff) return null;

  const updated = await updateDeployHandoffStatus(leadSlug, "live", [
    "Operator confirmed DNS / publish — lead marked live.",
  ]);
  await updateLeadStage(leadSlug, "live");
  return updated;
}

export async function getHandoffsForOperator(): Promise<DeployHandoff[]> {
  return listDeployHandoffs();
}
