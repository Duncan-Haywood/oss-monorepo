// Dictation / voice answers: audio -> text via ctx.transcriber. Audio is discarded unless the org
// turned on org_settings.storeVoiceRecordings AND has a granted voice_recording consent.
import { and, desc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { consentRecords, orgSettings } from "../../db/schema";
import { AppError } from "../../lib/errors";

export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export interface TranscribeResult {
  text: string;
  /** Present only when the recording was kept (R2 key under orgs/{orgId}/audio/). */
  audioKey?: string;
}

export async function canStoreVoiceRecordings(ctx: AppContext, orgId: string): Promise<boolean> {
  const settings = await ctx.db
    .select({ store: orgSettings.storeVoiceRecordings })
    .from(orgSettings)
    .where(eq(orgSettings.orgId, orgId))
    .get();
  if (!settings?.store) return false;
  const consent = await ctx.db
    .select({ granted: consentRecords.granted })
    .from(consentRecords)
    .where(and(eq(consentRecords.orgId, orgId), eq(consentRecords.scope, "voice_recording")))
    .orderBy(desc(consentRecords.createdAt))
    .get();
  return consent?.granted === true;
}

export function audioKeyPrefix(orgId: string): string {
  return `orgs/${orgId}/audio/`;
}

const EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/flac": "flac",
};

export async function transcribeAudio(
  ctx: AppContext,
  input: { orgId: string; userId: string; bytes: ArrayBuffer; mimeType: string },
): Promise<TranscribeResult> {
  const mimeType = input.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  let text: string;
  try {
    text = (await ctx.transcriber.transcribe(input.bytes, mimeType)).text.trim();
  } catch (e) {
    ctx.logger.error("transcribe.failed", { error: String(e), bytes: input.bytes.byteLength });
    throw new AppError(
      502,
      "transcription_failed",
      "Could not transcribe the audio. Please retry.",
    );
  }

  if (!(await canStoreVoiceRecordings(ctx, input.orgId))) return { text };
  const now = ctx.now();
  const month = now.toISOString().slice(0, 7);
  const key = `${audioKeyPrefix(input.orgId)}${month}/${crypto.randomUUID()}.${EXT[mimeType] ?? "bin"}`;
  await ctx.env.FILES.put(key, input.bytes, {
    httpMetadata: { contentType: mimeType || "application/octet-stream" },
    customMetadata: { uploadedBy: input.userId },
  });
  return { text, audioKey: key };
}
