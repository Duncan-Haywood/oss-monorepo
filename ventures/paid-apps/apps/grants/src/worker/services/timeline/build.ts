// Pure timeline assembly: turns already-loaded, content-free rows into chronological events with
// plain-language summaries, the "Who decided?" summary, and keyset pagination. The loader
// (index.ts) strips every text field before calling this, so nothing here can leak content.
import type {
  TimelineActor,
  TimelineDetailValue,
  TimelineEvent,
  TimelineEventKind,
  TimelineResponse,
  WhoDecidedStep,
} from "@shared/api/timeline";
import type {
  ActorType,
  ApplicationStatus,
  FlagKind,
  FlagSeverity,
  FlagStatus,
  ReviewDecision,
  ReviewTier,
  SubmissionChannel,
  SubmissionStatus,
} from "@shared/enums";
import { badRequest } from "../../lib/errors";

// ------------------------------------------------------------------------------ input shapes

export interface TlApplication {
  id: string;
  status: ApplicationStatus;
  createdAt: Date;
  createdBy: string | null;
  currentVersionId: string | null;
}

export interface TlVersion {
  id: string;
  versionNumber: number;
  authorType: "system" | "user";
  authorId: string | null;
  model: string | null;
  /** System-written note ("Initial draft", `Edited section "…"`), never draft text. */
  changeNote: string | null;
  createdAt: Date;
  factsCited: number;
  sections: number;
  gaps: number;
  report: {
    passed: boolean;
    totalClaims: number;
    factualClaims: number;
    supported: number;
    unsupported: number;
    numericMismatches: number;
  } | null;
}

export interface TlFlag {
  id: string;
  versionId: string;
  severity: FlagSeverity;
  kind: FlagKind;
  sectionKey: string | null;
  status: FlagStatus;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface TlReview {
  id: string;
  versionId: string;
  reviewerId: string;
  decision: ReviewDecision;
  hasComments: boolean;
  createdAt: Date;
}

export interface TlFeedback {
  id: string;
  versionId: string | null;
  sectionKey: string | null;
  rating: number;
  tags: string[];
  createdBy: string | null;
  createdAt: Date;
}

export interface TlSubmission {
  id: string;
  versionId: string;
  channel: SubmissionChannel;
  status: SubmissionStatus;
  packageSha256: string;
  submittedByType: "user" | "autopilot";
  submittedBy: string | null;
  approvedBy: string | null;
  sentAt: Date | null;
  confirmedAt: Date | null;
  createdAt: Date;
}

/** llm_calls aggregated by purpose + model (counts and cost only). */
export interface TlLlmUsage {
  purpose: string;
  model: string;
  calls: number;
  costMicros: number;
  firstAt: Date;
  lastAt: Date;
}

export interface TlAudit {
  id: string;
  actorType: ActorType;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface TlInterview {
  id: string;
  createdAt: Date;
}

export interface TimelineSources {
  orgId: string;
  app: TlApplication;
  versions: TlVersion[];
  flags: TlFlag[];
  reviews: TlReview[];
  feedback: TlFeedback[];
  submissions: TlSubmission[];
  llm: TlLlmUsage[];
  audit: TlAudit[];
  gapFillInterviews: TlInterview[];
  /** user id -> display name */
  names: Map<string, string>;
}

// ------------------------------------------------------------------------------ wording helpers

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

export function formatUsd(micros: number): string {
  const usd = micros / 1_000_000;
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return "under a minute";
  if (min < 60) return plural(min, "minute");
  const hours = Math.round(min / 60);
  if (hours < 48) return plural(hours, "hour");
  return plural(Math.round(hours / 24), "day");
}

const FLAG_NOUN: Record<FlagKind, [string, string]> = {
  numeric_mismatch: ["number", "numbers"],
  unsupported_claim: ["unsupported claim", "unsupported claims"],
  missing_info: ["missing detail", "missing details"],
  unconfirmed_fact: ["unconfirmed fact", "unconfirmed facts"],
  stale_fact: ["stale fact", "stale facts"],
  eligibility_risk: ["eligibility risk", "eligibility risks"],
  length_limit: ["length issue", "length issues"],
  policy: ["policy issue", "policy issues"],
  restricted_data: ["restricted-data issue", "restricted-data issues"],
  other: ["other issue", "other issues"],
};

const STAGE_LABEL: Record<string, string> = {
  drafting: "drafting",
  grounding: "fact-checking",
  discovery: "requirements",
  matching: "matching",
  eligibility: "eligibility",
  interview: "interview",
  knowledge: "fact extraction",
};

const CHANNEL_PHRASE: Record<SubmissionChannel, string> = {
  email: "by email",
  manual: "manually",
  portal: "through the funder portal",
  grants_gov_s2s: "through Grants.gov",
};

const shortSha = (sha: string) => `${sha.slice(0, 4)}…`;

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full;
}

export function humanizeAction(action: string): string {
  const s = action.replace(/[._]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Activity";
}

// ------------------------------------------------------------------------------ build

interface Draft {
  id: string;
  t: number;
  /** Tie-break for events in the same millisecond: lifecycle order. */
  rank: number;
  actor: TimelineActor;
  kind: TimelineEventKind;
  summary: string;
  detail?: Record<string, TimelineDetailValue>;
  link?: string;
}

/** Audit actions already represented by a structured source (avoid duplicate events). */
const COVERED_AUDIT = new Set([
  "application.created",
  "application.drafted",
  "application.verified",
  "application.routed",
  "application.section_edited",
  "application.section_regenerated",
  "application.flag_resolved",
  "application.review_approved",
  "application.review_changes_requested",
  "application.review_rejected",
  "application.feedback_added",
  "application.submitted",
  "submission.package_prepared",
  "submission.failed",
  "submission.confirmed",
]);

const AUTOPILOT: TimelineActor = { type: "autopilot", name: "Autopilot" };
const SYSTEM: TimelineActor = { type: "system" };

export function buildTimelineEvents(src: TimelineSources): Draft[] {
  const out: Draft[] = [];
  const nameOf = (id: string | null | undefined) =>
    id ? (src.names.get(id) ?? "A teammate") : "A teammate";
  const human = (id: string | null | undefined): TimelineActor => ({
    type: "human",
    name: nameOf(id),
  });
  const who = (id: string | null | undefined) => firstName(nameOf(id));
  const fromAudit = (a: TlAudit): TimelineActor =>
    a.actorType === "user" ? human(a.actorId) : a.actorType === "autopilot" ? AUTOPILOT : SYSTEM;
  const versionById = new Map(src.versions.map((v) => [v.id, v]));
  const vnum = (id: string | null | undefined) => (id ? versionById.get(id)?.versionNumber : null);
  const metaStr = (a: TlAudit, k: string) =>
    typeof a.metadata?.[k] === "string" ? (a.metadata[k] as string) : null;
  const auditBy = (action: string) => src.audit.filter((a) => a.action === action);

  // 1. Created -------------------------------------------------------------------------------
  const created = auditBy("application.created")[0];
  if (created) {
    const actor = fromAudit(created);
    out.push({
      id: `aud:${created.id}`,
      t: created.createdAt.getTime(),
      rank: 0,
      actor,
      kind: "application.created",
      summary:
        actor.type === "autopilot"
          ? "Autopilot started this application from a top match"
          : actor.type === "human"
            ? `${who(created.actorId)} started this application`
            : "Application created",
    });
  } else {
    out.push({
      id: `app:${src.app.id}`,
      t: src.app.createdAt.getTime(),
      rank: 0,
      actor: src.app.createdBy ? human(src.app.createdBy) : SYSTEM,
      kind: "application.created",
      summary: src.app.createdBy
        ? `${who(src.app.createdBy)} started this application`
        : "Application created",
    });
  }

  // 2. LLM usage per stage (counts and cost only) ----------------------------------------------
  const stages = new Map<string, TlLlmUsage[]>();
  for (const u of src.llm) {
    const stage = u.purpose.split(".")[0] || u.purpose;
    stages.set(stage, [...(stages.get(stage) ?? []), u]);
  }
  for (const [stage, rows] of stages) {
    const calls = rows.reduce((s, r) => s + r.calls, 0);
    const costMicros = rows.reduce((s, r) => s + r.costMicros, 0);
    const firstAt = Math.min(...rows.map((r) => r.firstAt.getTime()));
    const lastAt = Math.max(...rows.map((r) => r.lastAt.getTime()));
    const models = [...new Set(rows.map((r) => r.model))].sort();
    const label = STAGE_LABEL[stage] ?? stage;
    out.push({
      id: `llm:${stage}`,
      t: firstAt,
      rank: stage === "grounding" ? 3 : 1,
      actor: { type: "ai", name: models.length === 1 ? models[0] : undefined },
      kind: "llm.usage",
      summary: `AI made ${plural(calls, `${label} call`)} · ${formatUsd(costMicros)}`,
      detail: {
        stage,
        calls,
        costMicros,
        cost: formatUsd(costMicros),
        purposes: [...new Set(rows.map((r) => r.purpose))].sort(),
        models,
        lastAt: new Date(lastAt).toISOString(),
      },
    });
  }

  // 3. Versions ---------------------------------------------------------------------------------
  const draftedBy = new Map<string, string>(); // versionId -> user who asked for the redraft
  for (const a of auditBy("application.drafted")) {
    const vid = metaStr(a, "versionId");
    if (vid && a.actorType === "user" && a.actorId) draftedBy.set(vid, a.actorId);
  }
  for (const v of src.versions) {
    const facts = plural(v.factsCited, "fact");
    const detail: Record<string, TimelineDetailValue> = {
      versionNumber: v.versionNumber,
      factsCited: v.factsCited,
      sections: v.sections,
      gaps: v.gaps,
      model: v.model,
      note: v.changeNote,
    };
    if (v.authorType === "user") {
      out.push({
        id: `ver:${v.id}`,
        t: v.createdAt.getTime(),
        rank: 2,
        actor: human(v.authorId),
        kind: "version.edited",
        summary: `${who(v.authorId)} edited the draft (version ${v.versionNumber})`,
        detail,
      });
      continue;
    }
    const requester = v.authorId ?? draftedBy.get(v.id) ?? null;
    const note = v.changeNote ?? "";
    let summary: string;
    if (/^Regenerated section/.test(note)) {
      summary = `AI regenerated a section for ${who(requester)} (version ${v.versionNumber}, ${facts})`;
    } else if (v.versionNumber === 1 || note === "Initial draft") {
      summary = `AI drafted version ${v.versionNumber} using ${facts}`;
    } else if (/reviewer/i.test(note)) {
      summary = `AI redrafted version ${v.versionNumber} to address reviewer comments, using ${facts}`;
    } else if (requester) {
      summary = `AI redrafted version ${v.versionNumber} at ${who(requester)}'s request, using ${facts}`;
    } else {
      summary = `AI redrafted version ${v.versionNumber} with new information, using ${facts}`;
    }
    if (requester) detail.requestedBy = nameOf(requester);
    out.push({
      id: `ver:${v.id}`,
      t: v.createdAt.getTime(),
      rank: 2,
      actor: { type: "ai", name: v.model ?? undefined },
      kind: "version.drafted",
      summary,
      detail,
    });
  }

  // 4. Grounding checks (one per version) + needs-info waits ------------------------------------
  const flagsByVersion = new Map<string, TlFlag[]>();
  for (const f of src.flags)
    flagsByVersion.set(f.versionId, [...(flagsByVersion.get(f.versionId) ?? []), f]);
  const verifiedAt = new Map<string, number>();
  for (const a of auditBy("application.verified")) {
    const vid = metaStr(a, "versionId");
    if (vid) verifiedAt.set(vid, a.createdAt.getTime());
  }
  const sortedVersions = [...src.versions].sort((a, b) => a.versionNumber - b.versionNumber);
  for (const [i, v] of sortedVersions.entries()) {
    const flags = flagsByVersion.get(v.id) ?? [];
    if (!v.report && flags.length === 0) continue;
    const t =
      verifiedAt.get(v.id) ??
      (flags.length > 0
        ? Math.min(...flags.map((f) => f.createdAt.getTime()))
        : v.createdAt.getTime());
    const byKind = new Map<FlagKind, number>();
    for (const f of flags) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
    const parts = [...byKind.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k, n]) => `${n} ${FLAG_NOUN[k][n === 1 ? 0 : 1]}`);
    const blockers = flags.filter((f) => f.severity === "blocker").length;
    const r = v.report;
    out.push({
      id: `chk:${v.id}`,
      t,
      rank: 4,
      actor: { type: "ai" },
      kind: flags.length > 0 ? "check.flagged" : "check.passed",
      summary:
        flags.length > 0
          ? `Grounding check flagged ${joinList(parts)} in version ${v.versionNumber}`
          : r && r.factualClaims > 0
            ? `Grounding check passed version ${v.versionNumber}: ${r.supported} of ${plural(r.factualClaims, "factual claim")} supported`
            : `Grounding check passed version ${v.versionNumber}`,
      detail: {
        versionNumber: v.versionNumber,
        passed: r?.passed ?? null,
        claims: r?.totalClaims ?? null,
        factualClaims: r?.factualClaims ?? null,
        supported: r?.supported ?? null,
        unsupported: r?.unsupported ?? null,
        numericMismatches: r?.numericMismatches ?? null,
        flags: flags.length,
        blockers,
        warnings: flags.filter((f) => f.severity === "warning").length,
        flagKinds: [...byKind.keys()].sort(),
      },
    });

    const missing = flags.filter((f) => f.kind === "missing_info" && f.severity === "blocker");
    if (missing.length === 0) continue;
    const start = Math.min(...missing.map((f) => f.createdAt.getTime()));
    const ends: number[] = [];
    const next = sortedVersions[i + 1];
    if (next && next.createdAt.getTime() >= start) ends.push(next.createdAt.getTime());
    if (missing.every((f) => f.status !== "open" && f.resolvedAt)) {
      ends.push(Math.max(...missing.map((f) => f.resolvedAt?.getTime() ?? start)));
    }
    const end = ends.length > 0 ? Math.min(...ends) : null;
    const open =
      end === null && src.app.status === "needs_info" && src.app.currentVersionId === v.id;
    const interview = src.gapFillInterviews
      .filter(
        (iv) =>
          iv.createdAt.getTime() >= start - 5_000 &&
          (end === null || iv.createdAt.getTime() <= end),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    const n = plural(missing.length, "missing detail");
    out.push({
      id: `wni:${v.id}`,
      t: start,
      rank: 5,
      actor: SYSTEM,
      kind: "wait.needs_info",
      summary: open
        ? `Waiting for your team to provide ${n}`
        : end !== null
          ? `Waited ${formatDuration(end - start)} for ${n}`
          : `Paused for ${n}`,
      detail: {
        open,
        missing: missing.length,
        endedAt: end !== null ? new Date(end).toISOString() : null,
        durationMs: end !== null ? end - start : null,
        versionNumber: v.versionNumber,
      },
      link: interview ? `/orgs/${src.orgId}/interviews/${interview.id}` : undefined,
    });
  }

  // 5. Flags resolved by people -----------------------------------------------------------------
  for (const f of src.flags) {
    if (f.status === "open" || !f.resolvedAt) continue;
    const noun = FLAG_NOUN[f.kind][0];
    const verb = f.status === "dismissed" ? "dismissed" : "resolved";
    out.push({
      id: `flg:${f.id}`,
      t: f.resolvedAt.getTime(),
      rank: 6,
      actor: f.resolvedBy ? human(f.resolvedBy) : SYSTEM,
      kind: "flag.resolved",
      summary: f.resolvedBy
        ? `${who(f.resolvedBy)} ${verb} a flag (${noun})`
        : `A flag (${noun}) was ${verb}`,
      detail: {
        flagKind: f.kind,
        severity: f.severity,
        sectionKey: f.sectionKey,
        versionNumber: vnum(f.versionId) ?? null,
        status: f.status,
      },
    });
  }

  // 6. Routing + in-review waits ----------------------------------------------------------------
  const routed = auditBy("application.routed").sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const reviewsAsc = [...src.reviews].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const withdrawnAt = auditBy("application.withdrawn").map((a) => a.createdAt.getTime());
  for (const [i, a] of routed.entries()) {
    const tier = (metaStr(a, "tier") ?? "one_click") as ReviewTier;
    const reasons = Array.isArray(a.metadata?.reasons)
      ? (a.metadata.reasons as unknown[])
          .filter((x): x is string => typeof x === "string")
          .slice(0, 10)
      : [];
    const t = a.createdAt.getTime();
    out.push({
      id: `aud:${a.id}`,
      t,
      rank: 7,
      actor: tier === "auto" ? AUTOPILOT : SYSTEM,
      kind: "application.routed",
      summary:
        tier === "auto"
          ? "Autopilot cleared every gate, so no human review was needed"
          : tier === "full_review"
            ? "Routed for a full human review"
            : "Routed for one-click human approval",
      detail: { tier, reasons, versionNumber: vnum(metaStr(a, "versionId")) ?? null },
    });
    if (tier === "auto") continue;
    const review = reviewsAsc.find((r) => r.createdAt.getTime() >= t);
    const ends = [review?.createdAt.getTime(), ...withdrawnAt.filter((w) => w >= t)].filter(
      (x): x is number => typeof x === "number",
    );
    const end = ends.length > 0 ? Math.min(...ends) : null;
    const isLast = i === routed.length - 1;
    const open = end === null && isLast && src.app.status === "in_review";
    out.push({
      id: `wir:${a.id}`,
      t,
      rank: 8,
      actor: SYSTEM,
      kind: "wait.in_review",
      summary: open
        ? `Waiting for ${tier === "full_review" ? "a full review" : "one-click approval"} by your team`
        : end !== null
          ? `Waited ${formatDuration(end - t)} for human review`
          : "Paused for human review",
      detail: {
        open,
        tier,
        endedAt: end !== null ? new Date(end).toISOString() : null,
        durationMs: end !== null ? end - t : null,
      },
    });
  }

  // 7. Reviews + feedback -----------------------------------------------------------------------
  for (const r of src.reviews) {
    const n = vnum(r.versionId);
    const v = n ? ` version ${n}` : "";
    out.push({
      id: `rev:${r.id}`,
      t: r.createdAt.getTime(),
      rank: 9,
      actor: human(r.reviewerId),
      kind:
        r.decision === "approved"
          ? "review.approved"
          : r.decision === "rejected"
            ? "review.rejected"
            : "review.changes_requested",
      summary:
        r.decision === "approved"
          ? `${who(r.reviewerId)} approved${v}`
          : r.decision === "rejected"
            ? `${who(r.reviewerId)} rejected${v}`
            : `${who(r.reviewerId)} requested changes to${v || " the draft"}`,
      detail: { decision: r.decision, versionNumber: n ?? null, hasComments: r.hasComments },
    });
  }
  for (const f of src.feedback) {
    const n = vnum(f.versionId);
    out.push({
      id: `fbk:${f.id}`,
      t: f.createdAt.getTime(),
      rank: 10,
      actor: human(f.createdBy),
      kind: "feedback.added",
      summary: `${who(f.createdBy)} rated ${f.sectionKey ? "a section" : n ? `version ${n}` : "the draft"} ${f.rating}/5`,
      detail: {
        rating: f.rating,
        sectionKey: f.sectionKey,
        versionNumber: n ?? null,
        tags: f.tags.filter((x) => typeof x === "string").slice(0, 10),
      },
    });
  }

  // 8. Submissions ------------------------------------------------------------------------------
  const confirmedBy = new Map<string, string>();
  for (const a of src.audit) {
    if (a.action === "submission.confirmed" && a.targetId && a.actorId) {
      confirmedBy.set(a.targetId, a.actorId);
    }
  }
  for (const s of src.submissions) {
    const actor =
      s.submittedByType === "autopilot" ? AUTOPILOT : human(s.submittedBy ?? s.approvedBy);
    const by = s.submittedByType === "autopilot" ? "Autopilot" : who(s.submittedBy ?? s.approvedBy);
    const n = vnum(s.versionId);
    const detail: Record<string, TimelineDetailValue> = {
      channel: s.channel,
      status: s.status,
      sha256: s.packageSha256,
      versionNumber: n ?? null,
      approvedBy: s.approvedBy ? nameOf(s.approvedBy) : null,
    };
    const link = `/api/orgs/${src.orgId}/submissions/${s.id}/package`;
    const sha = shortSha(s.packageSha256);
    if (s.status === "failed") {
      out.push({
        id: `sub:${s.id}`,
        t: s.createdAt.getTime(),
        rank: 11,
        actor,
        kind: "submission.failed",
        summary: `${by} tried to submit ${CHANNEL_PHRASE[s.channel]}, but it failed`,
        detail,
      });
      continue;
    }
    if (s.channel === "manual") {
      out.push({
        id: `sub:${s.id}`,
        t: s.createdAt.getTime(),
        rank: 11,
        actor,
        kind: "submission.prepared",
        summary: `${by} prepared the package for manual submission (sha256 ${sha})`,
        detail,
        link,
      });
    } else {
      out.push({
        id: `sub:${s.id}`,
        t: (s.sentAt ?? s.createdAt).getTime(),
        rank: 11,
        actor,
        kind: "submission.sent",
        summary: `${by} submitted ${CHANNEL_PHRASE[s.channel]} (sha256 ${sha})`,
        detail,
        link,
      });
    }
    if (s.confirmedAt) {
      const by2 = confirmedBy.get(s.id) ?? (s.channel === "manual" ? s.submittedBy : null);
      out.push({
        id: `subc:${s.id}`,
        t: s.confirmedAt.getTime(),
        rank: 12,
        actor: by2 ? human(by2) : SYSTEM,
        kind: "submission.confirmed",
        summary: by2
          ? `${who(by2)} confirmed the submission went through`
          : "The submission was confirmed",
        detail: { channel: s.channel, versionNumber: n ?? null },
      });
    }
  }

  // 9. Other audited actions --------------------------------------------------------------------
  for (const a of src.audit) {
    if (COVERED_AUDIT.has(a.action)) continue;
    const actor = fromAudit(a);
    const name =
      actor.type === "human"
        ? who(a.actorId)
        : actor.type === "autopilot"
          ? "Autopilot"
          : "The system";
    const base = { id: `aud:${a.id}`, t: a.createdAt.getTime(), actor };
    if (a.action === "application.withdrawn") {
      out.push({
        ...base,
        rank: 13,
        kind: "application.withdrawn",
        summary: `${name} withdrew this application`,
      });
    } else if (a.action === "application.awarded" || a.action === "application.declined") {
      const awarded = a.action === "application.awarded";
      const cents =
        typeof a.metadata?.awardedAmountCents === "number" ? a.metadata.awardedAmountCents : null;
      out.push({
        ...base,
        rank: 13,
        kind: "application.outcome",
        summary: awarded
          ? `${name} recorded an award${cents ? ` of $${Math.round(cents / 100).toLocaleString("en-US")}` : ""}`
          : `${name} recorded that the funder declined`,
        detail: { outcome: awarded ? "awarded" : "declined", awardedAmountCents: cents },
      });
    } else if (a.action === "application.exported") {
      const fmt = metaStr(a, "format");
      const n = typeof a.metadata?.versionNumber === "number" ? a.metadata.versionNumber : null;
      out.push({
        ...base,
        rank: 14,
        kind: "application.exported",
        summary: `${name} exported ${n ? `version ${n}` : "the draft"}${fmt ? ` as ${fmt.toUpperCase()}` : ""}`,
        detail: { format: fmt, versionNumber: n },
      });
    } else {
      out.push({
        ...base,
        rank: 14,
        kind: "activity",
        summary: `${humanizeAction(a.action)}${actor.type === "human" ? ` by ${name}` : ""}`,
        detail: { action: a.action },
      });
    }
  }

  return out.sort(compareDraft);
}

function compareDraft(a: Pick<Draft, "t" | "rank" | "id">, b: Pick<Draft, "t" | "rank" | "id">) {
  return a.t - b.t || a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// ------------------------------------------------------------------------------ who decided

export function whoDecided(src: TimelineSources): WhoDecidedStep[] {
  const nameOf = (id: string | null | undefined) =>
    id ? (src.names.get(id) ?? "A teammate") : "A teammate";
  const human = (id: string | null | undefined): TimelineActor => ({
    type: "human",
    name: nameOf(id),
  });
  const names = (ids: (string | null)[]) =>
    joinList([...new Set(ids.filter((x): x is string => !!x).map((id) => firstName(nameOf(id))))]);
  const steps: WhoDecidedStep[] = [];

  if (src.versions.some((v) => v.authorType === "system")) {
    steps.push({ step: "drafted", label: "Drafted by AI", actor: { type: "ai" } });
  }
  const editors = src.versions.filter((v) => v.authorType === "user").map((v) => v.authorId);
  if (editors.length > 0) {
    steps.push({
      step: "edited",
      label: `Edited by ${names(editors)}`,
      actor: { type: "human", name: names(editors) },
    });
  }
  if (src.versions.some((v) => v.report) || src.flags.length > 0) {
    steps.push({ step: "checked", label: "Checked by AI", actor: { type: "ai" } });
  }
  const resolvers = src.flags
    .filter((f) => f.status !== "open" && f.resolvedBy)
    .map((f) => f.resolvedBy);
  if (resolvers.length > 0) {
    steps.push({
      step: "resolved",
      label: `Flags resolved by ${names(resolvers)}`,
      actor: { type: "human", name: names(resolvers) },
    });
  }

  const lastReview = [...src.reviews].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];
  const live = src.submissions
    .filter((s) => s.status !== "failed")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const lastRouted = src.audit
    .filter((a) => a.action === "application.routed")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (lastReview) {
    const n = firstName(nameOf(lastReview.reviewerId));
    steps.push({
      step: "decided",
      label:
        lastReview.decision === "approved"
          ? `Approved by ${n}`
          : lastReview.decision === "rejected"
            ? `Rejected by ${n}`
            : `Changes requested by ${n}`,
      actor: human(lastReview.reviewerId),
    });
  } else if (live?.submittedByType === "autopilot" || lastRouted?.metadata?.tier === "auto") {
    steps.push({ step: "decided", label: "Approved by Autopilot", actor: AUTOPILOT });
  } else if (src.app.status === "in_review") {
    steps.push({ step: "decided", label: "Awaiting approval", actor: SYSTEM, pending: true });
  }

  if (live) {
    if (live.submittedByType === "autopilot" && live.channel !== "manual") {
      steps.push({ step: "submitted", label: "Submitted by Autopilot", actor: AUTOPILOT });
    } else if (live.channel === "manual" && !live.confirmedAt) {
      steps.push({
        step: "submitted",
        label: "Manual submission pending",
        actor: SYSTEM,
        pending: true,
      });
    } else {
      const id = live.submittedBy ?? live.approvedBy;
      steps.push({
        step: "submitted",
        label: `Submitted by ${firstName(nameOf(id))}`,
        actor: human(id),
      });
    }
  }
  return steps;
}

// ------------------------------------------------------------------------------ pagination

interface Cursor {
  t: number;
  r: number;
  id: string;
}

export function encodeTimelineCursor(c: Cursor): string {
  return btoa(JSON.stringify([c.t, c.r, c.id]))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeTimelineCursor(s: string): Cursor {
  try {
    const raw = JSON.parse(atob(s.replace(/-/g, "+").replace(/_/g, "/"))) as unknown;
    if (!Array.isArray(raw) || raw.length !== 3) throw new Error("bad cursor");
    const [t, r, id] = raw as unknown[];
    if (typeof t !== "number" || typeof r !== "number" || typeof id !== "string" || !id) {
      throw new Error("bad cursor");
    }
    return { t, r, id };
  } catch {
    throw badRequest("Invalid cursor");
  }
}

export const DEFAULT_TIMELINE_LIMIT = 100;
export const MAX_TIMELINE_LIMIT = 200;

/** Chronological page of events strictly after `cursor`. */
export function paginateTimeline(
  src: TimelineSources,
  opts: { cursor?: string; limit?: number } = {},
): TimelineResponse {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_TIMELINE_LIMIT, 1), MAX_TIMELINE_LIMIT);
  const all = buildTimelineEvents(src);
  const cur = opts.cursor ? decodeTimelineCursor(opts.cursor) : null;
  const after = cur
    ? all.filter((e) => compareDraft(e, { t: cur.t, rank: cur.r, id: cur.id }) > 0)
    : all;
  const page = after.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(
      (d): TimelineEvent => ({
        id: d.id,
        at: new Date(d.t).toISOString(),
        actor: d.actor,
        kind: d.kind,
        summary: d.summary,
        ...(d.detail ? { detail: d.detail } : {}),
        ...(d.link ? { link: d.link } : {}),
      }),
    ),
    nextCursor:
      after.length > limit && last
        ? encodeTimelineCursor({ t: last.t, r: last.rank, id: last.id })
        : null,
    whoDecided: whoDecided(src),
  };
}
