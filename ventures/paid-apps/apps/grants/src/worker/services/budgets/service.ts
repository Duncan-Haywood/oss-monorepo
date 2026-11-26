// Application budgets: read, save (user edits) and propose (from facts). Every query is scoped by
// orgId; the application is loaded tenant-scoped first, so another org's id is a 404. Totals and
// line totals are always recomputed here; a "fact" line keeps that source only while its amounts
// still match its cited facts.
import {
  type BudgetDto,
  BudgetLine,
  BudgetLineInput,
  type BudgetRules,
  budgetWarnings,
  computeLine,
  computeTotals,
  MAX_BUDGET_LINES,
  MAX_LINE_CENTS,
} from "@shared/budget";
import { and, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../context";
import { applicationBudgets, applications, opportunities, projects } from "../../db/schema";
import { AppError, badRequest, conflict, notFound } from "../../lib/errors";
import { LlmOutputError, LlmRefusalError } from "../../ports/llm";
import type { FactRow } from "../grounding";
import { getFactsByIds, getFactsForDrafting } from "../knowledge";
import { audit } from "../privacy/audit";
import {
  amountInFacts,
  buildProposeContext,
  buildProposePrompt,
  citableFact,
  finalizeProposal,
  lineSupported,
  PROJECT_BUDGET_REF,
  PROPOSE_SYSTEM,
  ProposedBudget,
  PURPOSE_PROPOSE,
} from "./propose";

export interface BudgetIds {
  orgId: string;
  applicationId: string;
}

export interface Actor {
  userId: string;
  requestId?: string;
}

/** No budget edits once the application is being submitted or is decided. */
const LOCKED_STATUSES = new Set(["submitting", "submitted", "awarded", "declined", "withdrawn"]);

export const BudgetPut = z.object({
  lines: z.array(BudgetLineInput).max(MAX_BUDGET_LINES),
  notes: z.string().max(10_000).default(""),
  requiredMatchCents: z.number().int().min(0).max(MAX_LINE_CENTS).nullable().default(null),
});
export type BudgetPut = z.input<typeof BudgetPut>;

export const ProposeBody = z.object({ replace: z.boolean().default(false) });

type BudgetRow = typeof applicationBudgets.$inferSelect;

interface Loaded {
  app: typeof applications.$inferSelect;
  opp: typeof opportunities.$inferSelect | undefined;
  project: typeof projects.$inferSelect | undefined;
  row: BudgetRow | undefined;
}

async function load(ctx: AppContext, ids: BudgetIds): Promise<Loaded> {
  const app = await ctx.db
    .select()
    .from(applications)
    .where(and(eq(applications.id, ids.applicationId), eq(applications.orgId, ids.orgId)))
    .get();
  if (!app) throw notFound("Application");
  const [opp, project, row] = await Promise.all([
    ctx.db
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.id, app.opportunityId),
          or(isNull(opportunities.privateToOrgId), eq(opportunities.privateToOrgId, ids.orgId)),
        ),
      )
      .get(),
    app.projectId
      ? ctx.db
          .select()
          .from(projects)
          .where(and(eq(projects.id, app.projectId), eq(projects.orgId, ids.orgId)))
          .get()
      : Promise.resolve(undefined),
    ctx.db
      .select()
      .from(applicationBudgets)
      .where(
        and(
          eq(applicationBudgets.applicationId, ids.applicationId),
          eq(applicationBudgets.orgId, ids.orgId),
        ),
      )
      .get(),
  ]);
  return { app, opp, project, row };
}

function rulesOf(l: Loaded, requiredMatchCents: number | null): BudgetRules {
  return {
    awardCeilingCents: l.opp?.awardCeilingCents ?? null,
    costSharingRequired: l.opp?.costSharingRequired ?? null,
    requiredMatchCents,
    requestedAmountCents: l.app.requestedAmountCents ?? null,
  };
}

function toDto(l: Loaded): BudgetDto {
  const lines = (l.row?.lines ?? []).map((x) => computeLine(x));
  const requiredMatchCents = l.row?.requiredMatchCents ?? null;
  const rules = rulesOf(l, requiredMatchCents);
  const totals = computeTotals(lines, rules);
  return {
    applicationId: l.app.id,
    exists: !!l.row,
    lines,
    notes: l.row?.notes ?? "",
    requiredMatchCents,
    totals,
    warnings: budgetWarnings(totals, rules),
    rules: {
      awardCeilingCents: rules.awardCeilingCents ?? null,
      costSharingRequired: rules.costSharingRequired ?? null,
      requestedAmountCents: rules.requestedAmountCents ?? null,
      projectNeedCents: l.project?.budgetNeededCents ?? null,
    },
    updatedBy: l.row?.updatedBy ?? null,
    updatedAt: l.row?.updatedAt ? l.row.updatedAt.toISOString() : null,
  };
}

export async function getBudget(ctx: AppContext, ids: BudgetIds): Promise<BudgetDto> {
  return toDto(await load(ctx, ids));
}

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const LINE_ID_RE = /^bln_[0-9a-z]{8,32}$/;
export function newLineId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `bln_${[...bytes].map((b) => ALPHABET[b % 32]).join("")}`;
}

/** The project's budget need as a citable pseudo-fact (when no mirrored project fact exists). */
function projectNeedFact(p: Loaded["project"]): FactRow | null {
  if (!p?.budgetNeededCents || p.budgetNeededCents <= 0) return null;
  const dollars = p.budgetNeededCents / 100;
  const statement = `The project "${p.title}" needs $${dollars.toLocaleString("en-US", { maximumFractionDigits: 2 })} in funding (project budget need).`;
  return {
    id: PROJECT_BUDGET_REF,
    statement,
    sourceQuote: statement,
    value: { number: dollars, unit: "USD", year: null, text: null },
    status: "confirmed",
    sensitivity: "internal",
    asOf: null,
    category: "project",
  };
}

/** Normalizes client lines: ids, totals, citations limited to this org, "fact" source re-checked. */
async function normalizeLines(
  ctx: AppContext,
  l: Loaded,
  input: z.infer<typeof BudgetPut>["lines"],
): Promise<BudgetLine[]> {
  const askedIds = [
    ...new Set(input.flatMap((x) => x.factIds).filter((id) => id !== PROJECT_BUDGET_REF)),
  ];
  const known = new Map<string, FactRow>(
    (askedIds.length ? await getFactsByIds(ctx, l.app.orgId, askedIds) : []).map((f) => [f.id, f]),
  );
  const need = projectNeedFact(l.project);
  if (need) known.set(need.id, need);
  const seen = new Set<string>();
  return input.map((x) => {
    let id = x.id && LINE_ID_RE.test(x.id) && !seen.has(x.id) ? x.id : newLineId();
    while (seen.has(id)) id = newLineId();
    seen.add(id);
    const factIds = [...new Set(x.factIds)].filter((f) => known.has(f));
    const line = computeLine({
      id,
      category: x.category,
      description: x.description,
      quantity: x.quantity,
      unitCostCents: x.unitCostCents,
      source: x.source,
      factIds,
      fundingSource: x.fundingSource,
      note: x.note ?? "",
    });
    if (line.source === "fact") {
      const cited = factIds.map((f) => known.get(f) as FactRow).filter(citableFact);
      if (!lineSupported(line, cited)) line.source = "user";
    }
    return BudgetLine.parse(line);
  });
}

async function write(
  ctx: AppContext,
  l: Loaded,
  data: { lines: BudgetLine[]; notes: string; requiredMatchCents: number | null },
  actor: Actor,
) {
  const rules = rulesOf(l, data.requiredMatchCents);
  const totals = computeTotals(data.lines, rules);
  const now = ctx.now();
  const values = {
    lines: data.lines,
    totals,
    notes: data.notes,
    requiredMatchCents: data.requiredMatchCents,
    updatedBy: actor.userId,
    updatedAt: now,
  };
  await ctx.db
    .insert(applicationBudgets)
    .values({
      applicationId: l.app.id,
      orgId: l.app.orgId,
      createdAt: now,
      ...values,
    })
    .onConflictDoUpdate({
      target: applicationBudgets.applicationId,
      set: values,
      setWhere: eq(applicationBudgets.orgId, l.app.orgId),
    });
  return { totals, warnings: budgetWarnings(totals, rules) };
}

function assertEditable(l: Loaded) {
  if (LOCKED_STATUSES.has(l.app.status)) {
    throw conflict(`Application is ${l.app.status} and its budget can no longer be edited`);
  }
}

export async function saveBudget(
  ctx: AppContext,
  ids: BudgetIds,
  body: BudgetPut,
  actor: Actor,
): Promise<BudgetDto> {
  const input = BudgetPut.parse(body);
  const l = await load(ctx, ids);
  assertEditable(l);
  const lines = await normalizeLines(ctx, l, input.lines);
  const { totals, warnings } = await write(
    ctx,
    l,
    { lines, notes: input.notes.trim(), requiredMatchCents: input.requiredMatchCents },
    actor,
  );
  await audit(ctx, {
    orgId: ids.orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "application.budget_updated",
    targetType: "application",
    targetId: ids.applicationId,
    metadata: {
      lines: lines.length,
      requestCents: totals.match.requestCents,
      matchCents: totals.match.matchCents,
      totalCents: totals.match.totalProjectCents,
      warnings: warnings.map((w) => w.code),
    },
    requestId: actor.requestId,
  });
  return getBudget(ctx, ids);
}

/** Confirmed facts with a dollar amount, financial facts, and facts tagged to the project. */
async function proposalSources(ctx: AppContext, l: Loaded): Promise<FactRow[]> {
  const rows = await getFactsForDrafting(ctx, l.app.orgId, {
    projectId: l.app.projectId ?? undefined,
  });
  const out: FactRow[] = rows
    .filter(citableFact)
    .filter(
      (f) =>
        f.category === "financial" ||
        (!!l.app.projectId && f.projectId === l.app.projectId) ||
        /\$\s?\d/.test(`${f.statement} ${f.sourceQuote}`),
    )
    .slice(0, 200);
  const need = projectNeedFact(l.project);
  const mirrored = need && out.some((f) => amountInFacts(l.project?.budgetNeededCents ?? 0, [f]));
  if (need && !mirrored) out.push(need);
  return out;
}

export async function proposeBudget(
  ctx: AppContext,
  ids: BudgetIds,
  opts: { replace?: boolean },
  actor: Actor,
): Promise<BudgetDto> {
  const l = await load(ctx, ids);
  assertEditable(l);
  if (l.row && l.row.lines.length > 0 && !opts.replace) {
    throw conflict("This application already has budget lines. Replace them to propose again.");
  }
  const sources = await proposalSources(ctx, l);
  if (sources.length === 0) {
    throw badRequest(
      "No confirmed financial facts or project budget are on file to propose from. Add them, or enter the lines yourself.",
    );
  }
  const needRef = l.project?.budgetNeededCents
    ? (sources.find(
        (f) => f.id === PROJECT_BUDGET_REF || amountInFacts(l.project?.budgetNeededCents ?? 0, [f]),
      )?.id ?? null)
    : null;
  let raw: ProposedBudget;
  try {
    const { data } = await ctx.llm.generateStructured({
      purpose: PURPOSE_PROPOSE,
      orgId: ids.orgId,
      applicationId: ids.applicationId,
      system: PROPOSE_SYSTEM,
      context: buildProposeContext(sources),
      prompt: buildProposePrompt({
        project: l.project
          ? {
              title: l.project.title,
              summary: l.project.summary,
              budgetNeededCents: l.project.budgetNeededCents,
              needRef,
            }
          : null,
        opportunity: l.opp
          ? {
              funderName: l.opp.funderName,
              title: l.opp.title,
              awardCeilingCents: l.opp.awardCeilingCents,
              costSharingRequired: l.opp.costSharingRequired,
            }
          : null,
      }),
      effort: "medium",
      maxTokens: 8000,
      schema: ProposedBudget,
    });
    raw = data;
  } catch (e) {
    if (!(e instanceof LlmOutputError || e instanceof LlmRefusalError)) throw e;
    ctx.logger.warn("budgets.propose_failed", { applicationId: ids.applicationId });
    throw new AppError(
      502,
      "llm_unavailable",
      "Couldn't propose a budget right now. Try again, or enter the lines yourself.",
    );
  }
  const { lines, stats } = finalizeProposal(raw, sources, newLineId);
  await write(
    ctx,
    l,
    { lines, notes: l.row?.notes ?? "", requiredMatchCents: l.row?.requiredMatchCents ?? null },
    actor,
  );
  await audit(ctx, {
    orgId: ids.orgId,
    actorType: "user",
    actorId: actor.userId,
    action: "application.budget_proposed",
    targetType: "application",
    targetId: ids.applicationId,
    metadata: { lines: lines.length, ...stats, replaced: !!l.row },
    requestId: actor.requestId,
  });
  return getBudget(ctx, ids);
}
