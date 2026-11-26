// OWNER: interview agent — /api/orgs/:orgId/interviews (+ turns, transcript upload)

import { INPUT_MODES, INTERVIEW_KINDS, INTERVIEW_STATUSES } from "@shared/enums";
import { Hono } from "hono";
import { z } from "zod";
import { AppError, badRequest } from "../../lib/errors";
import { validate } from "../../lib/validate";
import { requireRole } from "../../middleware/tenant";
import {
  answerInterview,
  audioKeyPrefix,
  completeInterview,
  getInterview,
  importTranscript,
  listInterviews,
  startInterview,
} from "../../services/interview";
import type { AppEnv } from "../../types";

const StartBody = z.object({
  kind: z.enum(["onboarding", "follow_up", "project", "gap_fill", "update"]),
  mode: z.enum(["ai_chat", "dictation"]).optional(),
  focusProjectId: z.string().min(1).max(64).optional().nullable(),
  focusApplicationId: z.string().min(1).max(64).optional().nullable(),
});

const AnswerBody = z.object({
  content: z.string().trim().min(1).max(20_000),
  inputMode: z.enum(INPUT_MODES).default("text"),
  /** Key returned by POST /transcribe when the org keeps voice recordings. */
  audioKey: z.string().max(300).optional().nullable(),
});

const ListQuery = z.object({
  status: z.enum(INTERVIEW_STATUSES).optional(),
  kind: z.enum(INTERVIEW_KINDS).optional(),
});

const TranscriptJson = z.object({
  title: z.string().trim().max(200).default(""),
  text: z.string().min(1).max(500_000),
  interviewerNames: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
});

const MAX_TRANSCRIPT_FILE_BYTES = 5 * 1024 * 1024;
const TRANSCRIPT_EXTENSIONS = [".txt", ".md", ".markdown", ".vtt", ".srt"];

const routes = new Hono<AppEnv>()
  .get("/", validate("query", ListQuery), async (c) => {
    const items = await listInterviews(c.var.ctx, c.var.tenant.orgId, c.req.valid("query"));
    return c.json({ items, nextCursor: null });
  })
  .post("/", requireRole("editor"), validate("json", StartBody), async (c) => {
    const body = c.req.valid("json");
    const { orgId, userId } = c.var.tenant;
    const interview = await startInterview(c.var.ctx, {
      orgId,
      userId,
      kind: body.kind,
      ...(body.mode ? { mode: body.mode } : {}),
      focusProjectId: body.focusProjectId ?? null,
      focusApplicationId: body.focusApplicationId ?? null,
    });
    return c.json(interview, 201);
  })
  .post("/transcript", requireRole("editor"), async (c) => {
    const { orgId, userId } = c.var.tenant;
    const contentType = c.req.header("Content-Type") ?? "";
    let input: { title: string; text: string; filename?: string; interviewerNames?: string[] };
    if (contentType.includes("multipart/form-data")) {
      const declared = Number(c.req.header("Content-Length") ?? 0);
      if (declared > MAX_TRANSCRIPT_FILE_BYTES + 64 * 1024) throw tooLarge();
      const form = await c.req.parseBody();
      const file = form.file;
      if (!(file instanceof File)) throw badRequest("Missing transcript file (field 'file')");
      const name = file.name.toLowerCase();
      if (!TRANSCRIPT_EXTENSIONS.some((ext) => name.endsWith(ext))) {
        throw badRequest("Transcript must be a .txt, .md, .vtt or .srt file");
      }
      if (file.size > MAX_TRANSCRIPT_FILE_BYTES) throw tooLarge();
      const title = typeof form.title === "string" ? form.title.trim().slice(0, 200) : "";
      const interviewer = typeof form.interviewerNames === "string" ? form.interviewerNames : "";
      input = {
        title: title || file.name.replace(/\.[^.]+$/, ""),
        text: await file.text(),
        filename: file.name,
        ...(interviewer
          ? {
              interviewerNames: interviewer
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            }
          : {}),
      };
    } else {
      const body = TranscriptJson.parse(await c.req.json().catch(() => ({})));
      input = {
        title: body.title,
        text: body.text,
        ...(body.interviewerNames ? { interviewerNames: body.interviewerNames } : {}),
      };
    }
    const interview = await importTranscript(c.var.ctx, { orgId, userId, ...input });
    return c.json(interview, 201);
  })
  .get("/:id", async (c) => {
    return c.json(await getInterview(c.var.ctx, c.var.tenant.orgId, c.req.param("id")));
  })
  .post("/:id/answer", requireRole("editor"), validate("json", AnswerBody), async (c) => {
    const body = c.req.valid("json");
    const { orgId, userId } = c.var.tenant;
    if (body.audioKey && !body.audioKey.startsWith(audioKeyPrefix(orgId))) {
      throw badRequest("Invalid audioKey");
    }
    const result = await answerInterview(c.var.ctx, {
      orgId,
      userId,
      interviewId: c.req.param("id"),
      content: body.content,
      inputMode: body.inputMode,
      audioR2Key: body.audioKey ?? null,
    });
    return c.json(result);
  })
  .post("/:id/complete", requireRole("editor"), async (c) => {
    const { orgId, userId } = c.var.tenant;
    return c.json(
      await completeInterview(c.var.ctx, { orgId, userId, interviewId: c.req.param("id") }),
    );
  });

function tooLarge() {
  return new AppError(413, "too_large", "Transcript file is too large (max 5 MB)");
}

export default routes;
