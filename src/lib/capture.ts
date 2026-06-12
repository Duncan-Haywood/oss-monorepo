export type CaptureProcessingStage =
  | "uploaded"
  | "edge-detect"
  | "color-correct"
  | "upscale"
  | "mockups"
  | "seo-copy"
  | "complete";

export type CaptureUploadMetadata = {
  sessionId: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  capturedAt: string;
  stage: CaptureProcessingStage;
  titleSuggestion?: string;
  tagsSuggestion?: string[];
};

const STORAGE_KEY = "print-atelier-capture-sessions";

function generateSessionId(): string {
  return `cap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createCaptureSessionFromFile(file: File): CaptureUploadMetadata {
  return {
    sessionId: generateSessionId(),
    fileName: file.name,
    fileSizeBytes: file.size,
    mimeType: file.type || "application/octet-stream",
    capturedAt: new Date().toISOString(),
    stage: "uploaded",
    titleSuggestion: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
    tagsSuggestion: [],
  };
}

export function advanceCaptureStage(
  session: CaptureUploadMetadata,
  stage: CaptureProcessingStage,
): CaptureUploadMetadata {
  return { ...session, stage };
}

export function serializeCaptureSessions(sessions: CaptureUploadMetadata[]): string {
  return JSON.stringify(sessions);
}

export function parseCaptureSessions(raw: string | null): CaptureUploadMetadata[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CaptureUploadMetadata[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        typeof item.sessionId === "string" &&
        typeof item.fileName === "string" &&
        typeof item.capturedAt === "string",
    );
  } catch {
    return [];
  }
}

export function loadCaptureSessionsFromStorage(): CaptureUploadMetadata[] {
  if (typeof window === "undefined") return [];
  return parseCaptureSessions(window.localStorage.getItem(STORAGE_KEY));
}

export function saveCaptureSessionsToStorage(sessions: CaptureUploadMetadata[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, serializeCaptureSessions(sessions));
}

export function upsertCaptureSession(session: CaptureUploadMetadata): CaptureUploadMetadata[] {
  const existing = loadCaptureSessionsFromStorage();
  const next = [session, ...existing.filter((item) => item.sessionId !== session.sessionId)].slice(
    0,
    20,
  );
  saveCaptureSessionsToStorage(next);
  return next;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
