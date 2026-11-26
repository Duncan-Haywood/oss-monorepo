// OWNER: interview agent — /api/orgs/:orgId/transcribe (dictation audio -> text)
import { Hono } from "hono";
import { AppError, badRequest } from "../../lib/errors";
import { requireRole } from "../../middleware/tenant";
import { MAX_AUDIO_BYTES, transcribeAudio } from "../../services/interview";
import type { AppEnv } from "../../types";

const tooLarge = () => new AppError(413, "too_large", "Audio is too large (max 20 MB)");

const routes = new Hono<AppEnv>().post("/", requireRole("editor"), async (c) => {
  const contentType = c.req.header("Content-Type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw badRequest("Send audio as multipart/form-data (field 'audio')");
  }
  const declared = Number(c.req.header("Content-Length") ?? 0);
  if (declared > MAX_AUDIO_BYTES + 64 * 1024) throw tooLarge();
  const form = await c.req.parseBody();
  const audio = form.audio;
  if (!(audio instanceof File)) throw badRequest("Missing audio file (field 'audio')");
  if (audio.size === 0) throw badRequest("Audio is empty");
  if (audio.size > MAX_AUDIO_BYTES) throw tooLarge();
  const mimeType = audio.type.toLowerCase();
  if (!mimeType.startsWith("audio/")) {
    throw new AppError(415, "unsupported_media_type", "Only audio files can be transcribed");
  }
  const { orgId, userId } = c.var.tenant;
  const result = await transcribeAudio(c.var.ctx, {
    orgId,
    userId,
    bytes: await audio.arrayBuffer(),
    mimeType,
  });
  return c.json(result);
});

export default routes;
