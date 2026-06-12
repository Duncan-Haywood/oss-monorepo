export type ArtistOnboardingConsent = {
  podLicense: boolean;
  adRights: boolean;
  aiRoomScenes: boolean;
  payoutAcknowledgement: boolean;
};

export type ArtistOnboardingSource = "outreach" | "organic" | "referral" | "direct";

export type ArtistOnboardingStatus = "draft" | "submitted" | "capture-linked" | "ready-for-review";

export type ArtistOnboardingIntake = {
  intakeId: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  email: string;
  handle: string;
  portfolioUrl: string;
  medium: string;
  sourceChannel: ArtistOnboardingSource;
  outreachHandle: string | null;
  consent: ArtistOnboardingConsent;
  captureSessionId: string | null;
  status: ArtistOnboardingStatus;
};

export type ArtistOnboardingValidation = {
  valid: boolean;
  errors: string[];
  missingConsent: Array<keyof ArtistOnboardingConsent>;
};

export type ArtistOnboardingReadiness = {
  score: number;
  status: "blocked" | "in_progress" | "ready";
  completedSteps: string[];
  blockers: string[];
  nextAction: string;
};

const STORAGE_KEY = "print-atelier-artist-onboarding";

function generateIntakeId(): string {
  return `intake_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyArtistOnboardingIntake(
  partial: Partial<ArtistOnboardingIntake> = {},
): ArtistOnboardingIntake {
  const now = new Date().toISOString();
  return {
    intakeId: partial.intakeId ?? generateIntakeId(),
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    name: partial.name ?? "",
    email: partial.email ?? "",
    handle: partial.handle ?? "",
    portfolioUrl: partial.portfolioUrl ?? "",
    medium: partial.medium ?? "",
    sourceChannel: partial.sourceChannel ?? "direct",
    outreachHandle: partial.outreachHandle ?? null,
    consent: partial.consent ?? {
      podLicense: false,
      adRights: false,
      aiRoomScenes: false,
      payoutAcknowledgement: false,
    },
    captureSessionId: partial.captureSessionId ?? null,
    status: partial.status ?? "draft",
  };
}

export function validateArtistOnboardingIntake(
  intake: ArtistOnboardingIntake,
): ArtistOnboardingValidation {
  const errors: string[] = [];
  const missingConsent: Array<keyof ArtistOnboardingConsent> = [];

  if (!intake.name.trim()) {
    errors.push("Artist name is required");
  }
  if (!intake.email.trim() || !intake.email.includes("@")) {
    errors.push("Valid email is required");
  }
  if (!intake.handle.trim()) {
    errors.push("Social or portfolio handle is required");
  }
  if (!intake.medium.trim()) {
    errors.push("Primary medium is required");
  }

  const consentFields: Array<keyof ArtistOnboardingConsent> = [
    "podLicense",
    "adRights",
    "aiRoomScenes",
    "payoutAcknowledgement",
  ];
  for (const field of consentFields) {
    if (!intake.consent[field]) {
      missingConsent.push(field);
    }
  }
  if (missingConsent.length > 0) {
    errors.push(`Missing consent: ${missingConsent.join(", ")}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    missingConsent,
  };
}

export function calculateArtistOnboardingReadiness(
  intake: ArtistOnboardingIntake,
): ArtistOnboardingReadiness {
  const validation = validateArtistOnboardingIntake(intake);
  const completedSteps: string[] = [];
  const blockers: string[] = [];

  if (intake.name.trim() && intake.email.includes("@") && intake.handle.trim()) {
    completedSteps.push("Profile details");
  } else {
    blockers.push("Complete name, email, and handle");
  }

  if (intake.medium.trim()) {
    completedSteps.push("Medium selected");
  } else {
    blockers.push("Select primary art medium");
  }

  if (validation.missingConsent.length === 0) {
    completedSteps.push("Rights & payout consent");
  } else {
    blockers.push("Accept POD license, ad rights, AI room scenes, and payout terms");
  }

  if (intake.captureSessionId) {
    completedSteps.push("Capture session linked");
  } else {
    blockers.push("Upload artwork via capture app");
  }

  const score = Math.round((completedSteps.length / 4) * 100);
  let status: ArtistOnboardingReadiness["status"] = "blocked";
  if (score >= 100) {
    status = "ready";
  } else if (score >= 50) {
    status = "in_progress";
  }

  let nextAction = "Start with profile details and consent checkboxes";
  if (status === "ready") {
    nextAction = "Submit for catalog review — ops will verify payout guardrails";
  } else if (intake.captureSessionId) {
    nextAction = "Finish consent checkboxes and submit intake";
  } else if (validation.missingConsent.length === 0) {
    nextAction = "Open capture app and link your upload session";
  } else if (intake.name.trim()) {
    nextAction = "Review and accept all four consent items";
  }

  return {
    score,
    status,
    completedSteps,
    blockers,
    nextAction,
  };
}

export function submitArtistOnboardingIntake(
  intake: ArtistOnboardingIntake,
): { intake: ArtistOnboardingIntake; validation: ArtistOnboardingValidation } {
  const validation = validateArtistOnboardingIntake(intake);
  const now = new Date().toISOString();
  const readiness = calculateArtistOnboardingReadiness(intake);

  const nextStatus: ArtistOnboardingStatus = validation.valid
    ? readiness.score >= 75
      ? "ready-for-review"
      : intake.captureSessionId
        ? "capture-linked"
        : "submitted"
    : "draft";

  return {
    intake: { ...intake, updatedAt: now, status: nextStatus },
    validation,
  };
}

export function linkCaptureSessionToIntake(
  intake: ArtistOnboardingIntake,
  captureSessionId: string,
): ArtistOnboardingIntake {
  const now = new Date().toISOString();
  const readiness = calculateArtistOnboardingReadiness({
    ...intake,
    captureSessionId,
  });

  return {
    ...intake,
    captureSessionId,
    updatedAt: now,
    status:
      readiness.status === "ready"
        ? "ready-for-review"
        : intake.status === "draft"
          ? "draft"
          : "capture-linked",
  };
}

export function serializeArtistOnboardingIntakes(intakes: ArtistOnboardingIntake[]): string {
  return JSON.stringify(intakes);
}

export function parseArtistOnboardingIntakes(raw: string | null): ArtistOnboardingIntake[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ArtistOnboardingIntake[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item.intakeId === "string");
  } catch {
    return [];
  }
}

export function loadArtistOnboardingIntakesFromStorage(): ArtistOnboardingIntake[] {
  if (typeof window === "undefined") return [];
  return parseArtistOnboardingIntakes(window.localStorage.getItem(STORAGE_KEY));
}

export function saveArtistOnboardingIntakesToStorage(intakes: ArtistOnboardingIntake[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, serializeArtistOnboardingIntakes(intakes));
}

export function upsertArtistOnboardingIntake(intake: ArtistOnboardingIntake): ArtistOnboardingIntake[] {
  const existing = loadArtistOnboardingIntakesFromStorage();
  const next = [
    intake,
    ...existing.filter((item) => item.intakeId !== intake.intakeId),
  ].slice(0, 25);
  saveArtistOnboardingIntakesToStorage(next);
  return next;
}
