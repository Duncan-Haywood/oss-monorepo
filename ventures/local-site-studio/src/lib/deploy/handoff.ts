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
import { DEPLOY_HANDOFF_CONVEX_PRIMARY } from "./handoff-persist";
import { preserveDeployHandoffOperatorFields } from "./handoff-preserve";
import { isAppUrlConfigured } from "@/lib/seo/app-url-env-readiness";
import {
  isProductionDomainConfigured,
  normalizeProductionDomainHost,
} from "./production-domain-env-readiness";

export {
  DeployInstructionsBlockedError,
  assertDeployInstructionsReady,
  formatDnsInstructionsForEmail,
} from "./dns-email";
export {
  isProgressedHandoffStatus,
  preserveDeployHandoffOperatorFields,
} from "./handoff-preserve";

/**
 * Customer-facing origin, or null when NEXT_PUBLIC_APP_URL is unset, localhost,
 * or a documented placeholder.
 *
 * Null rather than "http://localhost:3000": previewUrl and contactFormUrl are
 * persisted on the handoff and then emailed to the buyer as the links their new
 * site lives at. A localhost link is not a weaker version of that artifact, it
 * is a wrong one, and the Deployment sets no env — so the fallback *was* the
 * production value. Validation is shared with the operator readiness banner so
 * the two cannot disagree.
 */
function appBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!isAppUrlConfigured(raw)) return null;
  return raw!.trim().replace(/\/$/, "");
}

/** NEXT_PUBLIC_PREVIEW_DOMAIN as set, or null. No default: see productionRootDomain. */
function previewRootDomain(): string | null {
  const trimmed = process.env.NEXT_PUBLIC_PREVIEW_DOMAIN?.trim();
  return trimmed ? trimmed : null;
}

/**
 * The platform's own root domain, or "" when no usable root is configured.
 *
 * Exported for proxy.ts host-based routing, and used to build the
 * `{slug}.{root}` suggestedHost we counsel a paying customer to point DNS at.
 * That second use is why there is no fallback literal here any more: the old
 * default was `preview.localsitestudio.com`, and localsitestudio.com is a
 * registered third party (live Zoho MX records). Handing a buyer DNS
 * instructions for a domain we do not own is worse than handing them none, so
 * an unconfigured root yields "" and buildHandoffRecord withholds the
 * instructions entirely.
 *
 * "" is also the correct answer for proxy.ts: with no platform root, no host is
 * platform-owned, and every request host falls through to the custom-domain
 * lookup (isPlatformHost / extractPreviewSubdomainSlug both handle an empty
 * root).
 */
export function productionRootDomain(): string {
  // Prefer a dedicated production host root; fall back to stripping "preview."
  const explicit = process.env.NEXT_PUBLIC_PRODUCTION_DOMAIN?.trim();
  if (isProductionDomainConfigured(explicit)) {
    return normalizeProductionDomainHost(explicit!);
  }
  const preview = previewRootDomain();
  if (!preview) return "";
  const derived = preview.startsWith("preview.")
    ? preview.slice("preview.".length)
    : preview;
  // A preview root that is itself localhost/example.com/a bare label cannot
  // become a production host just by dropping a label off the front.
  if (!isProductionDomainConfigured(derived)) return "";
  return normalizeProductionDomainHost(derived);
}

/**
 * Env vars whose absence blocks the go-live artifact, in the order an operator
 * should set them. Empty when the handoff can advertise real hosts and links.
 */
function missingHandoffArtifactEnv(): string[] {
  const missing: string[] = [];
  if (!appBaseUrl()) missing.push("NEXT_PUBLIC_APP_URL");
  if (!productionRootDomain()) missing.push("NEXT_PUBLIC_PRODUCTION_DOMAIN");
  return missing;
}

export const HANDOFF_BLOCKED_NOTE_PREFIX = "Go-live instructions withheld:";

/** Operator-facing note explaining exactly why a handoff carries no instructions. */
export function handoffBlockedNote(missing: readonly string[]): string {
  return (
    `${HANDOFF_BLOCKED_NOTE_PREFIX} set ${missing.join(" and ")} before ` +
    "sending go-live instructions. No hostname, preview link, or DNS record is " +
    "generated while these are unset — the platform will not counsel a customer " +
    "to point DNS at a domain it has not been told it owns."
  );
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
  const baseUrl = appBaseUrl();
  const root = productionRootDomain();
  // Absent config produces absent fields, never invented ones. The order is
  // recorded either way — fulfillment must not be lost over an env gap — but
  // the customer-facing half of the record stays empty and says why.
  const suggestedHost = root ? `${input.leadSlug}.${root}` : "";
  const previewUrl = baseUrl ? `${baseUrl}/preview/${input.leadSlug}` : "";
  const contactFormUrl = baseUrl ? `${baseUrl}/api/contact/${input.leadSlug}` : "";
  const missingEnv = missingHandoffArtifactEnv();
  const notes: string[] = [
    "Payment received — production handoff queued.",
    "Preview remains live at the preview URL until DNS is confirmed.",
    "Contact form stub accepts POSTs and emails/logs submissions for this slug.",
  ];

  if (missingEnv.length > 0) {
    notes.push(handoffBlockedNote(missingEnv));
  }

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
    dnsInstructions: suggestedHost ? buildDnsInstructions(suggestedHost) : [],
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

  const domain = handoff.customDomain?.trim() || handoff.suggestedHost.trim();
  if (!domain) {
    // No customer domain and no platform root — there is nothing to register,
    // and posting an empty name to Vercel would only produce a confusing 4xx.
    const missing = missingHandoffArtifactEnv();
    const blockedNote =
      missing.length > 0
        ? handoffBlockedNote(missing)
        : `${HANDOFF_BLOCKED_NOTE_PREFIX} this handoff has no hostname to register.`;
    return {
      ...handoff,
      vercelDomainStatus: handoff.vercelDomainStatus ?? "skipped_no_domain",
      notes: handoff.notes.includes(blockedNote)
        ? handoff.notes
        : [...handoff.notes, blockedNote],
    };
  }
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
        // Never downgrade Mark live → provisioned on an upsell re-provision.
        status: handoff.status === "live" ? "live" : "provisioned",
        vercelDomainStatus: "created",
        notes: [
          ...handoff.notes,
          `Vercel domain registered: ${domain}. Await DNS propagation, then mark live.`,
        ],
        updatedAt: new Date().toISOString(),
      };
    }

    const body = await response.text();
    // 409 often means domain already on the project — treat as provisioned
    // (or keep live when the operator already confirmed DNS).
    if (response.status === 409) {
      return {
        ...handoff,
        status: handoff.status === "live" ? "live" : "provisioned",
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
  const updated = await updateDeployHandoffVercelProject(
    leadSlug,
    vercelProjectId,
    DEPLOY_HANDOFF_CONVEX_PRIMARY,
  );
  if (!updated) return null;

  const provisioned = await tryProvisionVercelDomain(updated);
  await insertDeployHandoff(provisioned, DEPLOY_HANDOFF_CONVEX_PRIMARY);
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
  const updated = await updateDeployHandoffCustomDomain(
    leadSlug,
    customDomain,
    DEPLOY_HANDOFF_CONVEX_PRIMARY,
  );
  if (!updated) return null;

  const provisioned = await tryProvisionVercelDomain(updated);
  await insertDeployHandoff(provisioned, DEPLOY_HANDOFF_CONVEX_PRIMARY);
  return provisioned;
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
  await updateLeadStage(leadSlug, "live", DEPLOY_HANDOFF_CONVEX_PRIMARY);
  return updated;
}

export async function getHandoffsForOperator(): Promise<DeployHandoff[]> {
  return listDeployHandoffs();
}
