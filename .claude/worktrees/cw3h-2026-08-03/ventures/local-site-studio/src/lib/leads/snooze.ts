/**
 * Work next snooze — park a hot lead without losing quality-score history.
 * Pure helpers so duration math stays unit-testable (see /docs/process lead-snooze-work-next).
 */

/** Preset deferrals operators can one-click from Work next / the leads table. */
export const SNOOZE_PRESET_MS = {
  "1d": 1 * 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
} as const;

export type SnoozePresetId = keyof typeof SNOOZE_PRESET_MS;

export const SNOOZE_PRESET_IDS = Object.keys(SNOOZE_PRESET_MS) as SnoozePresetId[];

/** Soft ceiling so a typo cannot park a lead for years. */
export const MAX_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

export function isSnoozePresetId(value: string): value is SnoozePresetId {
  return value === "1d" || value === "3d" || value === "7d";
}

/**
 * Compute ISO snoozedUntil from now + preset. Pass nowMs from the caller —
 * do not call Date.now() inside render paths that consume this.
 */
export function snoozedUntilFromPreset(
  preset: SnoozePresetId,
  nowMs: number,
): string {
  return new Date(nowMs + SNOOZE_PRESET_MS[preset]).toISOString();
}

/**
 * Normalize a raw ISO (or empty) snoozedUntil for persistence.
 * Empty/whitespace clears. Rejects invalid dates and durations past MAX_SNOOZE_MS
 * from nowMs (guards against accidental far-future values).
 */
export function normalizeSnoozedUntil(
  raw: string | undefined | null,
  nowMs: number,
):
  | { ok: true; snoozedUntil: string | undefined }
  | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, snoozedUntil: undefined };
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: true, snoozedUntil: undefined };
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) {
    return { ok: false, error: "Snooze until must be a valid ISO timestamp" };
  }
  if (parsed <= nowMs) {
    // Already expired — treat as clear so we do not store stale noise.
    return { ok: true, snoozedUntil: undefined };
  }
  if (parsed - nowMs > MAX_SNOOZE_MS) {
    return {
      ok: false,
      error: `Snooze cannot exceed ${MAX_SNOOZE_MS / (24 * 60 * 60 * 1000)} days`,
    };
  }
  return { ok: true, snoozedUntil: new Date(parsed).toISOString() };
}

/** True while snoozedUntil is a future timestamp relative to nowMs. */
export function isLeadSnoozed(
  snoozedUntil: string | undefined | null,
  nowMs: number,
): boolean {
  if (!snoozedUntil) return false;
  const until = Date.parse(snoozedUntil);
  if (Number.isNaN(until)) return false;
  return until > nowMs;
}

/** Short label for badges — e.g. "Snoozed 2d" or "Snoozed 3h". */
export function snoozeRemainingLabel(
  snoozedUntil: string,
  nowMs: number,
): string {
  const until = Date.parse(snoozedUntil);
  if (Number.isNaN(until) || until <= nowMs) return "Snoozed";
  const ms = until - nowMs;
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  if (hours < 48) return `Snoozed ${hours}h`;
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return `Snoozed ${days}d`;
}

export function snoozePresetLabel(preset: SnoozePresetId): string {
  switch (preset) {
    case "1d":
      return "1 day";
    case "3d":
      return "3 days";
    case "7d":
      return "7 days";
    default: {
      const _exhaustive: never = preset;
      return _exhaustive;
    }
  }
}
