// LLM drafting of implementation statements via ctx.llm. Output is ALWAYS saved as an unreviewed draft
// (control_record.draft_statement); it reaches the SSP only after a person accepts or edits it.
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { controlRecord, evidence, organization } from "../../db/schema";
import { audit } from "../audit";
import { ensureRecord, getRecord, requireControl } from "../controls";
import { getProfile } from "../orgs";
import {
  buildDraftContext,
  buildDraftPrompt,
  DRAFT_PURPOSE,
  DRAFT_SYSTEM,
  draftSchema,
  unsupportedNumbers,
} from "./prompts";

export async function draftStatement(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  controlId: string,
) {
  const control = requireControl(controlId);
  const rec = await ensureRecord(ctx, orgId, controlId);
  const [org, profile, files] = await Promise.all([
    ctx.db
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, orgId))
      .get(),
    getProfile(ctx, orgId),
    ctx.db
      .select({ title: evidence.title })
      .from(evidence)
      .where(and(eq(evidence.orgId, orgId), eq(evidence.controlId, controlId)))
      .all(),
  ]);
  const context = buildDraftContext({
    orgName: org?.name ?? "",
    profile,
    control,
    status: rec.status,
    notes: rec.notes,
    evidenceTitles: files.map((f) => f.title),
  });
  const prompt = buildDraftPrompt(control);
  const { data } = await ctx.llm.generateStructured({
    purpose: DRAFT_PURPOSE,
    orgId,
    system: DRAFT_SYSTEM,
    context,
    prompt,
    schema: draftSchema,
    effort: "medium",
    maxTokens: 4000,
  });
  const questions = [...data.questions];
  for (const n of unsupportedNumbers(data.statement, context + prompt)) {
    questions.push(
      `The draft mentions "${n}", which is not in your notes or profile. Confirm or remove it.`,
    );
  }
  await ctx.db
    .update(controlRecord)
    .set({ draftStatement: data.statement, draftQuestions: questions, draftGeneratedAt: ctx.now() })
    .where(and(eq(controlRecord.orgId, orgId), eq(controlRecord.controlId, controlId)));
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "control.draft",
    targetType: "control",
    targetId: controlId,
  });
  return getRecord(ctx, orgId, controlId);
}
