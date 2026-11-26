// Pure: turns counted org state into the getting-started checklist (no I/O, unit-tested).
import {
  GUIDE_STEPS,
  GUIDE_TARGETS,
  type GuideDto,
  type GuideStepDto,
  type GuideStepKey,
} from "@shared/guide";

/** Everything the checklist needs, counted for one org (see index.ts for the queries). */
export interface GuideState {
  /** Human labels of required profile fields that are still empty. */
  profileMissing: string[];
  /** Documents that are not failed. */
  documents: number;
  /** Of those, documents of kind `past_application`. */
  pastApplications: number;
  confirmedFacts: number;
  proposedFacts: number;
  completedInterviews: number;
  activeInterviews: number;
  projects: number;
  /** Matches the org moved past "new" towards applying: shortlisted, drafting or applied. */
  shortlisted: number;
  /** Applications that have at least one drafted version. */
  drafts: number;
  /** A person engaged with a draft: edited a section, resolved a flag, reviewed or rated it. */
  draftChecked: boolean;
  /** automationLevel was set, or the routing settings were saved by a person. */
  automationChosen: boolean;
  /** Members besides the first one (total members - 1). */
  otherMembers: number;
  pendingInvitations: number;
}

/** Required profile fields and their labels (shown as "Missing: …"). */
export const PROFILE_REQUIRED = [
  ["legalName", "legal name"],
  ["ein", "EIN"],
  ["city", "city"],
  ["state", "state"],
  ["focusAreas", "focus areas"],
  ["serviceAreas", "service areas"],
] as const;

export interface ProfileLike {
  legalName?: string | null;
  ein?: string | null;
  city?: string | null;
  state?: string | null;
  focusAreas?: readonly string[] | null;
  serviceAreas?: readonly string[] | null;
}

export function missingProfileFields(p: ProfileLike | null | undefined): string[] {
  if (!p) return PROFILE_REQUIRED.map(([, label]) => label);
  return PROFILE_REQUIRED.filter(([key]) => {
    const v = p[key];
    if (Array.isArray(v)) return v.filter((s) => String(s).trim()).length === 0;
    return typeof v !== "string" || v.trim() === "";
  }).map(([, label]) => label);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Status = Pick<GuideStepDto, "done" | "progress" | "detail">;

function statusFor(key: GuideStepKey, s: GuideState): Status {
  switch (key) {
    case "profile":
      return s.profileMissing.length === 0
        ? { done: true }
        : { done: false, detail: `Missing: ${s.profileMissing.join(", ")}` };
    case "documents": {
      const target = GUIDE_TARGETS.documents;
      const done = s.documents >= target && s.pastApplications > 0;
      const detail = done
        ? undefined
        : s.documents >= target
          ? "Add a past application (any outcome) so drafts match your voice"
          : `${s.documents} of ${target} uploaded${s.pastApplications > 0 ? ", including a past application" : ""}`;
      return { done, progress: { current: Math.min(s.documents, target), target }, detail };
    }
    case "facts": {
      const target = GUIDE_TARGETS.confirmedFacts;
      const done = s.confirmedFacts >= target;
      const waiting =
        s.proposedFacts > 0 ? `; ${plural(s.proposedFacts, "fact")} waiting for you` : "";
      return {
        done,
        progress: { current: Math.min(s.confirmedFacts, target), target },
        detail: done ? undefined : `${s.confirmedFacts} of ${target} confirmed${waiting}`,
      };
    }
    case "interview":
      return s.completedInterviews > 0
        ? { done: true }
        : {
            done: false,
            detail: s.activeInterviews > 0 ? "You have an interview in progress" : undefined,
          };
    case "project":
      return { done: s.projects > 0 };
    case "matches": {
      const target = GUIDE_TARGETS.shortlisted;
      const done = s.shortlisted >= target;
      return {
        done,
        progress: { current: Math.min(s.shortlisted, target), target },
        detail: done ? undefined : `${s.shortlisted} of ${target} shortlisted`,
      };
    }
    case "first_draft":
      if (s.drafts === 0) return { done: false, detail: "Start a draft from a shortlisted grant" };
      return s.draftChecked
        ? { done: true }
        : { done: false, detail: `${plural(s.drafts, "draft")} ready: check a citation or flag` };
    case "automation":
      return { done: s.automationChosen };
    case "teammate":
      return s.otherMembers > 0
        ? { done: true }
        : s.pendingInvitations > 0
          ? { done: true, detail: `${plural(s.pendingInvitations, "invitation")} sent` }
          : { done: false };
  }
}

export function buildGuide(state: GuideState): GuideDto {
  const steps: GuideStepDto[] = GUIDE_STEPS.map((meta) => {
    const { done, progress, detail } = statusFor(meta.key, state);
    const step: GuideStepDto = { ...meta, done };
    if (progress) step.progress = progress;
    if (detail) step.detail = detail;
    return step;
  });
  const doneCount = steps.filter((s) => s.done).length;
  return {
    steps,
    doneCount,
    total: steps.length,
    complete: doneCount === steps.length,
    nextStep: steps.find((s) => !s.done)?.key ?? null,
  };
}
