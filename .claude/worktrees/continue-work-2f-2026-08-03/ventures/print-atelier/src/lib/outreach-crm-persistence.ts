export type ProspectReplyIntent =
  | "upload_link_request"
  | "mockup_request"
  | "rights_question"
  | "not_interested"
  | "pending";

export type NextActionState =
  | "send_onboard_link"
  | "send_mockup_kit"
  | "send_rights_faq"
  | "archive"
  | "wait_reply";

export type SkuGuardrailStatus = "safe" | "held" | "needs_price_adjustment";

export type ProspectCrmRecord = {
  prospectId: string;
  artistHandle: string;
  artistName: string;
  sourceChannel: "instagram_dm" | "email" | "behance" | "artstation" | string;
  fitScore: number;
  replyIntent: ProspectReplyIntent;
  nextActionState: NextActionState;
  skuGuardrailStatus: SkuGuardrailStatus;
  lastContactedAt: string;
  updatedAt: string;
};

export type ProspectCrmSummary = {
  totalProspects: number;
  uploadReadyCount: number;
  mockupRequestCount: number;
  rightsQuestionCount: number;
  heldGuardrailCount: number;
  byChannel: Record<string, number>;
};

const STORAGE_KEY = "print-atelier-prospect-crm-records";

let inMemoryProspectRecords: ProspectCrmRecord[] = [];

export function generateProspectId(handle: string): string {
  const cleanHandle = handle.replace(/^@/, "").toLowerCase();
  return `crm_${cleanHandle}_${Date.now()}`;
}

export function parseProspectCrmRecords(raw: string | null): ProspectCrmRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) => typeof item === "object" && item !== null && typeof item.prospectId === "string",
    );
  } catch {
    return [];
  }
}

export function serializeProspectCrmRecords(records: ProspectCrmRecord[]): string {
  return JSON.stringify(records);
}

export function getProspectCrmRecords(sourceChannel?: string): ProspectCrmRecord[] {
  let records = inMemoryProspectRecords;
  if (typeof window !== "undefined") {
    records = parseProspectCrmRecords(window.localStorage.getItem(STORAGE_KEY));
  }
  if (sourceChannel) {
    return records.filter((r) => r.sourceChannel === sourceChannel);
  }
  return records;
}

export function recordProspectCrmEntry(
  input: Omit<ProspectCrmRecord, "prospectId" | "lastContactedAt" | "updatedAt"> & {
    prospectId?: string;
    lastContactedAt?: string;
    updatedAt?: string;
  },
): ProspectCrmRecord {
  const records = getProspectCrmRecords();
  const now = new Date().toISOString();

  const prospectId = input.prospectId ?? generateProspectId(input.artistHandle);

  const newRecord: ProspectCrmRecord = {
    prospectId,
    artistHandle: input.artistHandle,
    artistName: input.artistName,
    sourceChannel: input.sourceChannel,
    fitScore: input.fitScore,
    replyIntent: input.replyIntent,
    nextActionState: input.nextActionState,
    skuGuardrailStatus: input.skuGuardrailStatus,
    lastContactedAt: input.lastContactedAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };

  const updatedRecords = [newRecord, ...records.filter((r) => r.prospectId !== prospectId)].slice(
    0,
    200,
  );

  inMemoryProspectRecords = updatedRecords;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, serializeProspectCrmRecords(updatedRecords));
  }

  return newRecord;
}

export function updateProspectReplyState(
  prospectId: string,
  replyIntent: ProspectReplyIntent,
  nextActionState: NextActionState,
  skuGuardrailStatus?: SkuGuardrailStatus,
): ProspectCrmRecord | null {
  const records = getProspectCrmRecords();
  const existing = records.find((r) => r.prospectId === prospectId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updatedRecord: ProspectCrmRecord = {
    ...existing,
    replyIntent,
    nextActionState,
    skuGuardrailStatus: skuGuardrailStatus ?? existing.skuGuardrailStatus,
    updatedAt: now,
  };

  const updatedRecords = records.map((r) => (r.prospectId === prospectId ? updatedRecord : r));
  inMemoryProspectRecords = updatedRecords;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, serializeProspectCrmRecords(updatedRecords));
  }

  return updatedRecord;
}

export function clearProspectCrmRecords(): void {
  inMemoryProspectRecords = [];
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function summarizeProspectCrmPipeline(
  records: ProspectCrmRecord[] = getProspectCrmRecords(),
): ProspectCrmSummary {
  const uploadReadyCount = records.filter(
    (r) => r.replyIntent === "upload_link_request" && r.skuGuardrailStatus === "safe",
  ).length;
  const mockupRequestCount = records.filter((r) => r.replyIntent === "mockup_request").length;
  const rightsQuestionCount = records.filter((r) => r.replyIntent === "rights_question").length;
  const heldGuardrailCount = records.filter((r) => r.skuGuardrailStatus === "held").length;

  const byChannel: Record<string, number> = {};
  for (const record of records) {
    byChannel[record.sourceChannel] = (byChannel[record.sourceChannel] ?? 0) + 1;
  }

  return {
    totalProspects: records.length,
    uploadReadyCount,
    mockupRequestCount,
    rightsQuestionCount,
    heldGuardrailCount,
    byChannel,
  };
}
