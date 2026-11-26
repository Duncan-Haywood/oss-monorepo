// Org lifecycle: creation (onboarding step 1), profile + settings reads/updates.
// Every query on a tenant table is scoped by the orgId passed in (from c.var.tenant in routes).
import type { ConsentScope, MemberRole } from "@shared/enums";
import { POLICY_VERSION } from "@shared/legal";
import { and, asc, count, eq, like, or } from "drizzle-orm";
import type { AppContext } from "../../context";
import { consentRecords, member, organization, orgProfiles, orgSettings } from "../../db/schema";
import { AppError, badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../privacy/audit";
import { hashIp } from "../privacy/consents";
import {
  automationLevelOf,
  DEFAULT_AUTOMATION_LEVEL,
  isAutomationLevel,
  isAutoSubmitLevel,
} from "../review/automation";
import { buildPromptProfile } from "./prompt-profile";
import type { CreateOrgInput, ProfilePatch, SettingsPatch } from "./schemas";
import { nextFreeSlug, randomSuffix, slugify } from "./slug";

export type OrgProfile = typeof orgProfiles.$inferSelect;
export type OrgSettings = typeof orgSettings.$inferSelect;
export type OrgRow = typeof organization.$inferSelect;

/** Who is acting and from where; IPs are hashed before storage. */
export interface ActorMeta {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string;
}

/** Consents recorded when an org is created (the creator accepts on the org's behalf). */
export const ORG_CREATION_CONSENTS: ConsentScope[] = [
  "terms_of_service",
  "privacy_policy",
  "data_processing",
];

/** Settings toggles that are also consents; turning one on/off records a consent row. */
export const SETTING_CONSENT_SCOPES = {
  autopilotEnabled: "autopilot_submission",
  allowWebsiteCrawl: "website_crawl",
  storeVoiceRecordings: "voice_recording",
} as const satisfies Partial<Record<keyof SettingsPatch, ConsentScope>>;

export const MAX_OWNED_ORGS_PER_USER = 25;

/**
 * Consent rows are written inside the org-creation / settings batches (atomic), so recordConsent()
 * (one insert per call) is not used; IP hashing is still the privacy module's salted hashIp().
 */
async function consentFields(ctx: AppContext, meta: ActorMeta) {
  return {
    ipHash: await hashIp(ctx, meta.ip),
    userAgent: meta.userAgent ? meta.userAgent.slice(0, 400) : null,
  };
}

const isSlugConflict = (e: unknown): boolean => {
  const text = `${String(e)} ${String((e as { cause?: unknown })?.cause ?? "")}`;
  return /UNIQUE/i.test(text) && text.includes("organization.slug");
};

async function pickSlug(ctx: AppContext, base: string): Promise<string> {
  const rows = await ctx.db
    .select({ slug: organization.slug })
    .from(organization)
    .where(or(eq(organization.slug, base), like(organization.slug, `${base}-%`)))
    .all();
  return nextFreeSlug(
    base,
    rows.map((r) => r.slug),
  );
}

export async function createOrg(
  ctx: AppContext,
  input: CreateOrgInput,
  meta: ActorMeta,
): Promise<{ orgId: string; slug: string }> {
  if (input.acceptTerms !== true) {
    throw new AppError(
      400,
      "terms_not_accepted",
      "You must accept the Terms of Service, Privacy Policy and Data Use policy",
    );
  }
  if (input.policyVersion !== POLICY_VERSION) {
    throw new AppError(
      400,
      "policy_version_mismatch",
      "The policies have been updated. Please review and accept the current version.",
      { currentVersion: POLICY_VERSION },
    );
  }

  const owned = await ctx.db
    .select({ n: count() })
    .from(member)
    .where(and(eq(member.userId, meta.userId), eq(member.role, "owner")))
    .get();
  if ((owned?.n ?? 0) >= MAX_OWNED_ORGS_PER_USER) {
    throw new AppError(429, "org_limit", "You have reached the maximum number of organizations");
  }

  const orgId = newId("org");
  const now = ctx.now();
  const { ipHash, userAgent } = await consentFields(ctx, meta);
  const base = slugify(input.name);

  const insertAll = (slug: string) =>
    ctx.db.batch([
      ctx.db.insert(organization).values({ id: orgId, name: input.name, slug, createdAt: now }),
      ctx.db.insert(member).values({
        id: newId("org").replace("org_", "mem_"),
        organizationId: orgId,
        userId: meta.userId,
        role: "owner",
        createdAt: now,
      }),
      ctx.db.insert(orgProfiles).values({
        orgId,
        legalName: input.legalName,
        orgType: input.orgType,
        city: input.city ?? null,
        state: input.state ?? null,
        websiteUrl: input.websiteUrl ?? null,
        focusAreas: input.focusAreas ?? [],
        serviceAreas: input.serviceAreas ?? [],
      }),
      ctx.db.insert(orgSettings).values({
        orgId,
        dataPolicyVersion: POLICY_VERSION,
        dataPolicyAcceptedAt: now,
        dataPolicyAcceptedBy: meta.userId,
      }),
      ctx.db.insert(consentRecords).values(
        ORG_CREATION_CONSENTS.map((scope) => ({
          id: newId("cns"),
          orgId,
          userId: meta.userId,
          scope,
          policyVersion: POLICY_VERSION,
          granted: true,
          ipHash,
          userAgent,
          createdAt: now,
        })),
      ),
    ]);

  let slug = await pickSlug(ctx, base);
  for (let attempt = 0; ; attempt++) {
    try {
      await insertAll(slug);
      break;
    } catch (e) {
      // Lost a race for the slug (D1 batch is atomic, so nothing was written): retry.
      if (!isSlugConflict(e) || attempt >= 3) throw e;
      slug = `${base}-${randomSuffix()}`;
    }
  }

  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: meta.userId,
    action: "org.created",
    targetType: "organization",
    targetId: orgId,
    metadata: { slug, orgType: input.orgType, policyVersion: POLICY_VERSION },
    requestId: meta.requestId,
  });
  ctx.logger.info("org.created", { orgId });
  return { orgId, slug };
}

export async function listUserOrgs(
  ctx: AppContext,
  userId: string,
): Promise<{ id: string; name: string; slug: string; role: MemberRole }[]> {
  const rows = await ctx.db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(organization.name), asc(organization.createdAt))
    .all();
  return rows.map((r) => ({ ...r, role: r.role as MemberRole }));
}

async function getOrgRow(ctx: AppContext, orgId: string): Promise<OrgRow> {
  const row = await ctx.db.select().from(organization).where(eq(organization.id, orgId)).get();
  if (!row) throw notFound("Organization");
  return row;
}

/** The org's profile row. Self-heals a missing row (e.g. orgs seeded without one). */
export async function getOrgProfile(ctx: AppContext, orgId: string): Promise<OrgProfile> {
  const row = await ctx.db.select().from(orgProfiles).where(eq(orgProfiles.orgId, orgId)).get();
  if (row) return row;
  const org = await getOrgRow(ctx, orgId);
  await ctx.db.insert(orgProfiles).values({ orgId, legalName: org.name }).onConflictDoNothing();
  const created = await ctx.db.select().from(orgProfiles).where(eq(orgProfiles.orgId, orgId)).get();
  if (!created) throw notFound("Organization profile");
  return created;
}

/** The org's settings row (conservative defaults if it was missing). */
export async function getOrgSettings(ctx: AppContext, orgId: string): Promise<OrgSettings> {
  const row = await ctx.db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)).get();
  if (row) return row;
  await getOrgRow(ctx, orgId);
  await ctx.db.insert(orgSettings).values({ orgId }).onConflictDoNothing();
  const created = await ctx.db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)).get();
  if (!created) throw notFound("Organization settings");
  return created;
}

/** Plain-text "User-entered organization profile" block for drafting prompts. */
export async function getOrgPromptProfile(ctx: AppContext, orgId: string): Promise<string> {
  const [org, profile] = await Promise.all([getOrgRow(ctx, orgId), getOrgProfile(ctx, orgId)]);
  return buildPromptProfile(profile, org.name);
}

export async function getOrgOverview(ctx: AppContext, orgId: string) {
  const [org, profile, settings] = await Promise.all([
    getOrgRow(ctx, orgId),
    getOrgProfile(ctx, orgId),
    getOrgSettings(ctx, orgId),
  ]);
  return { org: { id: org.id, name: org.name, slug: org.slug }, profile, settings };
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a instanceof Date ? a.getTime() : (a ?? null)) ===
  JSON.stringify(b instanceof Date ? b.getTime() : (b ?? null));

/** Keys of `patch` whose value differs from `current` (undefined = not provided). */
function diff<T extends object>(current: T, patch: Partial<T>): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const v = patch[key];
    if (v === undefined) continue;
    if (!same(current[key], v)) out[key] = v;
  }
  return out;
}

export async function updateOrgProfile(
  ctx: AppContext,
  orgId: string,
  patch: ProfilePatch,
  meta: ActorMeta,
): Promise<OrgProfile> {
  const [org, current] = await Promise.all([getOrgRow(ctx, orgId), getOrgProfile(ctx, orgId)]);
  const { name, onboardingCompleted, ...fields } = patch;

  const changes: Partial<OrgProfile> = diff(current, fields as Partial<OrgProfile>);
  if (onboardingCompleted === true && !current.onboardingCompletedAt) {
    changes.onboardingCompletedAt = ctx.now();
  } else if (onboardingCompleted === false && current.onboardingCompletedAt) {
    changes.onboardingCompletedAt = null;
  }
  const renamed = name !== undefined && name !== org.name;
  const changedKeys = [...Object.keys(changes), ...(renamed ? ["name"] : [])];
  if (changedKeys.length === 0) return current;

  const profileUpdate = ctx.db.update(orgProfiles).set(changes).where(eq(orgProfiles.orgId, orgId));
  if (renamed) {
    await ctx.db.batch([
      profileUpdate,
      ctx.db.update(organization).set({ name }).where(eq(organization.id, orgId)),
    ]);
  } else {
    await profileUpdate;
  }

  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: meta.userId,
    action: "org.profile_updated",
    targetType: "org_profile",
    targetId: orgId,
    // Keys only: profile values can be PII (contact name/email/phone).
    metadata: { changedKeys },
    requestId: meta.requestId,
  });
  return getOrgProfile(ctx, orgId);
}

/**
 * Keeps automationLevel and the legacy autopilotEnabled switch consistent, and rejects overrides a
 * level cannot honour. autopilotEnabled is true exactly at supervised/full, so the existing consent
 * logic (SETTING_CONSENT_SCOPES) records autopilot_submission whenever autopilot is turned on/off.
 *  - automationLevel given: autopilotEnabled follows it (a contradicting value is a 400).
 *  - only autopilotEnabled given: an explicit level moves to supervised (on) / prepared (off) when
 *    needed; a legacy row (no level) keeps deriving its level from the switch.
 */
export function syncAutomationPatch(current: OrgSettings, patch: SettingsPatch): SettingsPatch {
  const out: SettingsPatch = { ...patch };
  if (patch.automationLevel !== undefined) {
    const auto = isAutoSubmitLevel(patch.automationLevel);
    if (patch.autopilotEnabled !== undefined && patch.autopilotEnabled !== auto) {
      throw badRequest(
        `autopilotEnabled must be ${auto} at the "${patch.automationLevel}" automation level`,
        { automationLevel: patch.automationLevel, autopilotEnabled: patch.autopilotEnabled },
      );
    }
    out.autopilotEnabled = auto;
  } else if (patch.autopilotEnabled !== undefined && isAutomationLevel(current.automationLevel)) {
    const auto = isAutoSubmitLevel(current.automationLevel);
    if (patch.autopilotEnabled && !auto) out.automationLevel = "supervised";
    if (!patch.autopilotEnabled && auto) out.automationLevel = DEFAULT_AUTOMATION_LEVEL;
  }
  const next = automationLevelOf({
    autopilotEnabled: out.autopilotEnabled ?? current.autopilotEnabled,
    automationLevel: out.automationLevel ?? current.automationLevel,
  }).level;
  if (out.requireFactConfirmation === false && isAutoSubmitLevel(next)) {
    throw badRequest(
      "Fact confirmation is always required when autopilot submits (supervised and full levels)",
      { automationLevel: next },
    );
  }
  if (out.requireSubmissionApproval === false && !isAutoSubmitLevel(next)) {
    throw badRequest(
      "Choose the supervised or full automation level to let autopilot submit without approval",
      { automationLevel: next },
    );
  }
  return out;
}

export async function updateOrgSettings(
  ctx: AppContext,
  orgId: string,
  patch: SettingsPatch,
  meta: ActorMeta,
): Promise<OrgSettings> {
  const current = await getOrgSettings(ctx, orgId);
  const synced = syncAutomationPatch(current, patch);
  const changes: Partial<OrgSettings> = diff(current, synced as Partial<OrgSettings>);
  const changedKeys = Object.keys(changes);
  if (changedKeys.length === 0) return current;

  const autoMax = changes.autoSubmitMaxCents ?? current.autoSubmitMaxCents;
  const fullAbove = changes.fullReviewAboveCents ?? current.fullReviewAboveCents;
  if (autoMax > fullAbove) {
    throw badRequest("The auto-submit limit cannot be higher than the full-review threshold", {
      autoSubmitMaxCents: autoMax,
      fullReviewAboveCents: fullAbove,
    });
  }

  const now = ctx.now();
  const consentChanges = (
    Object.entries(SETTING_CONSENT_SCOPES) as [keyof typeof SETTING_CONSENT_SCOPES, ConsentScope][]
  ).filter(([key]) => changes[key] !== undefined);
  const { ipHash, userAgent } = await consentFields(ctx, meta);
  const consentRows = consentChanges.map(([key, scope]) => ({
    id: newId("cns"),
    orgId,
    userId: meta.userId,
    scope,
    policyVersion: POLICY_VERSION,
    granted: changes[key] === true,
    ipHash,
    userAgent,
    createdAt: now,
  }));
  // supervised ↔ full keeps autopilot on but changes what it may submit: record consent again.
  const fromLevel = automationLevelOf(current).level;
  const toLevel = automationLevelOf({ ...current, ...changes }).level;
  if (
    changes.autopilotEnabled === undefined &&
    fromLevel !== toLevel &&
    isAutoSubmitLevel(toLevel) &&
    isAutoSubmitLevel(fromLevel)
  ) {
    consentRows.push({
      id: newId("cns"),
      orgId,
      userId: meta.userId,
      scope: "autopilot_submission",
      policyVersion: POLICY_VERSION,
      granted: true,
      ipHash,
      userAgent,
      createdAt: now,
    });
  }

  const settingsUpdate = ctx.db
    .update(orgSettings)
    .set(changes)
    .where(eq(orgSettings.orgId, orgId));
  if (consentRows.length > 0) {
    await ctx.db.batch([settingsUpdate, ctx.db.insert(consentRecords).values(consentRows)]);
  } else {
    await settingsUpdate;
  }

  // Routing/privacy values are not PII; notification emails are, so only their key is logged.
  const values = Object.fromEntries(Object.entries(changes).filter(([k]) => k !== "notifyEmails"));
  await audit(ctx, {
    orgId,
    actorType: "user",
    actorId: meta.userId,
    action: "org.settings_updated",
    targetType: "org_settings",
    targetId: orgId,
    metadata: {
      changedKeys,
      values,
      consentScopes: consentRows.map((r) => r.scope),
      ...(fromLevel !== toLevel
        ? { automationLevelFrom: fromLevel, automationLevelTo: toLevel }
        : {}),
    },
    requestId: meta.requestId,
  });
  return getOrgSettings(ctx, orgId);
}
