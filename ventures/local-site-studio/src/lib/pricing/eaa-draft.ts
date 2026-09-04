const DRAFT_VERSION = 1;

type StoredDraft = {
  version: number;
  checked: string[];
};

/**
 * Reads a locally saved EAA checklist. Accepts the versioned object written
 * by writeChecklistDraft() and the legacy raw string[] that earlier pages
 * stored, so a visitor who already started a checklist keeps their checks.
 */
export function readChecklistDraft(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const draft = JSON.parse(raw) as Partial<StoredDraft> | string[];
    if (Array.isArray(draft)) {
      return draft.filter((id): id is string => typeof id === "string");
    }
    if (draft.version !== DRAFT_VERSION || !Array.isArray(draft.checked)) return [];
    return draft.checked.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function writeChecklistDraft(checked: string[]): string {
  return JSON.stringify({ version: DRAFT_VERSION, checked });
}
