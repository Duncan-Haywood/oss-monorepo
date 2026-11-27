// "Draft with AI" for one procedure of a written security policy. The draft is stored beside the
// policy (policy_procedure_draft), never in its text: a person puts it in the editor and saves, and
// an admin still approves the policy. Each draft counts as one of the plan's AI drafts this month
// (services/billing usage counts the "policy.procedure_draft" audit rows).
import type { FamilyCode } from "@shared/controls";
import { familyRequirements } from "@shared/security-policies";
import { shareSentence, sharesByControl } from "@shared/service-providers";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { controlRecord, evidence, policyProcedureDraft, securityPolicy } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { audit } from "../audit";
import { getOrg } from "../orgs";
import { listProviders } from "../service-providers";
import {
  buildProcedureContext,
  buildProcedurePrompt,
  PROCEDURE_PURPOSE,
  PROCEDURE_SYSTEM,
  procedureSchema,
} from "./procedure-prompts";
import { unsupportedNumbers } from "./prompts";

export interface ProcedureDraft {
  controlId: string;
  text: string;
  questions: string[];
  generatedAt: Date;
}

/** The requirement in this family, or 404 (a control from another family is not this policy's). */
export function requireFamilyControl(family: FamilyCode, controlId: string) {
  const c = familyRequirements(family).find((r) => r.id === controlId);
  if (!c) throw notFound("Requirement in this policy family");
  return c;
}

export async function listProcedureDrafts(
  ctx: AppContext,
  orgId: string,
  family: FamilyCode,
): Promise<ProcedureDraft[]> {
  const rows = await ctx.db
    .select({
      controlId: policyProcedureDraft.controlId,
      text: policyProcedureDraft.text,
      questions: policyProcedureDraft.questions,
      generatedAt: policyProcedureDraft.generatedAt,
    })
    .from(policyProcedureDraft)
    .where(and(eq(policyProcedureDraft.orgId, orgId), eq(policyProcedureDraft.family, family)))
    .all();
  const order = familyRequirements(family).map((c) => c.id);
  return rows.sort((a, b) => order.indexOf(a.controlId) - order.indexOf(b.controlId));
}

export async function draftProcedure(
  ctx: AppContext,
  orgId: string,
  actorUserId: string,
  family: FamilyCode,
  controlId: string,
): Promise<ProcedureDraft> {
  const control = requireFamilyControl(family, controlId);
  const nistId = control.nistIds[0] ?? control.ref;
  const [{ org, profile }, rec, files, policy, providers] = await Promise.all([
    getOrg(ctx, orgId),
    ctx.db
      .select()
      .from(controlRecord)
      .where(and(eq(controlRecord.orgId, orgId), eq(controlRecord.controlId, controlId)))
      .get(),
    ctx.db
      .select({ title: evidence.title })
      .from(evidence)
      .where(and(eq(evidence.orgId, orgId), eq(evidence.controlId, controlId)))
      .all(),
    ctx.db
      .select({ ownerUserId: securityPolicy.ownerUserId })
      .from(securityPolicy)
      .where(and(eq(securityPolicy.orgId, orgId), eq(securityPolicy.family, family)))
      .get(),
    listProviders(ctx, orgId),
  ]);
  const context = buildProcedureContext({
    orgName: profile.legalName.trim() || org.name,
    systemName: profile.systemName,
    hasPolicyOwner: Boolean(policy?.ownerUserId),
    control,
    nistId,
    status: rec?.status ?? "not_assessed",
    notes: rec?.notes ?? "",
    statement: rec?.statement ?? "",
    evidenceTitles: files.map((f) => f.title),
    providers: shareSentence(sharesByControl(providers).get(controlId) ?? []),
  });
  const prompt = buildProcedurePrompt(control, nistId);
  const { data } = await ctx.llm.generateStructured({
    purpose: PROCEDURE_PURPOSE,
    orgId,
    system: PROCEDURE_SYSTEM,
    context,
    prompt,
    schema: procedureSchema,
    effort: "medium",
    maxTokens: 4000,
  });
  const questions = [...data.questions];
  // Step numbers at the start of a line ("1.", "2)") are the format, not facts.
  const body = data.procedure.replace(/^\s*\d{1,2}[.)]\s/gm, "");
  for (const n of unsupportedNumbers(body, context + prompt)) {
    questions.push(
      `The draft mentions "${n}", which is not in your notes or records. Confirm or remove it.`,
    );
  }
  const now = ctx.now();
  await ctx.db
    .insert(policyProcedureDraft)
    .values({
      id: newId("ppd"),
      orgId,
      family,
      controlId,
      text: data.procedure,
      questions,
      generatedBy: actorUserId,
      generatedAt: now,
    })
    .onConflictDoUpdate({
      target: [policyProcedureDraft.orgId, policyProcedureDraft.controlId],
      set: { text: data.procedure, questions, generatedBy: actorUserId, generatedAt: now },
    });
  await audit(ctx, {
    orgId,
    actorUserId,
    action: "policy.procedure_draft",
    targetType: "security_policy",
    targetId: `${family}:${controlId}`,
  });
  return { controlId, text: data.procedure, questions, generatedAt: now };
}

/** Throw a draft away (or after it has been put in the policy). */
export async function discardProcedureDraft(
  ctx: AppContext,
  orgId: string,
  family: FamilyCode,
  controlId: string,
) {
  requireFamilyControl(family, controlId);
  await ctx.db
    .delete(policyProcedureDraft)
    .where(
      and(eq(policyProcedureDraft.orgId, orgId), eq(policyProcedureDraft.controlId, controlId)),
    );
}
