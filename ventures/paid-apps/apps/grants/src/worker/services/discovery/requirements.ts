// Requirements parsing: turn a funder listing / RFP text into structured OpportunityRequirements.
// When only a listing summary is available (no full RFP), standard narrative sections typical for
// the funder type are added and `complete` stays false so reviewers know to verify.
import { OpportunityRequirements, type RequirementSection } from "@shared/content";
import type { FunderType, OpportunitySource } from "@shared/enums";
import { eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { funders, opportunities } from "../../db/schema";
import { notFound } from "../../lib/errors";
import { LlmRefusalError } from "../../ports/llm";
import { UNTRUSTED_CONTENT_POLICY, wrapUntrusted } from "../safety/untrusted";

export const PARSE_REQUIREMENTS_PURPOSE = "discovery.parse_requirements";

/** Sources whose stored text is only a listing/synopsis, never the full application guidelines. */
const LISTING_ONLY_SOURCES: OpportunitySource[] = ["grants_gov", "simpler_grants"];

const STANDARD_GUIDANCE =
  "Standard section typical for this funder type; the full guidelines were not available. Verify against the funder's published instructions.";

const std = (
  key: string,
  title: string,
  prompt: string,
  kind: RequirementSection["kind"] = "narrative",
): RequirementSection => ({
  key,
  title,
  prompt,
  kind,
  required: true,
  wordLimit: null,
  charLimit: null,
  guidance: STANDARD_GUIDANCE,
});

export function standardSections(funderType: FunderType): RequirementSection[] {
  const core = [
    std(
      "need_statement",
      "Statement of Need",
      "Describe the problem or need the project addresses and the population affected.",
    ),
    std(
      "project_description",
      "Project Description",
      "Describe the proposed activities, who will carry them out, and the timeline.",
    ),
    std(
      "goals_objectives",
      "Goals and Objectives",
      "State the project's goals and measurable objectives.",
    ),
    std(
      "evaluation_plan",
      "Evaluation Plan",
      "Explain how progress and outcomes will be measured and reported.",
    ),
    std(
      "organizational_capacity",
      "Organizational Capacity",
      "Describe the organization's experience, staff and systems to carry out the project.",
    ),
    std(
      "budget_narrative",
      "Budget Narrative",
      "Explain and justify each budget category.",
      "budget",
    ),
    std(
      "sustainability",
      "Sustainability",
      "Describe how the work will continue after the grant period.",
    ),
  ];
  if (funderType === "federal" || funderType === "state" || funderType === "tribal") {
    return [
      std(
        "project_abstract",
        "Project Abstract",
        "Provide a one-page summary of the project, including the applicant, population served, activities and expected outcomes.",
      ),
      ...core,
    ];
  }
  return [
    std(
      "organization_background",
      "Organization Background",
      "Describe the organization's mission, history and programs.",
    ),
    ...core,
  ];
}

function standardAttachments(funderType: FunderType): OpportunityRequirements["attachments"] {
  if (funderType === "federal") {
    return [
      {
        name: "SF-424 Application for Federal Assistance",
        required: true,
        description: "Typical for federal applications; verify in the full notice.",
      },
      {
        name: "SF-424A Budget Information",
        required: true,
        description: "Typical for non-construction federal awards; verify in the full notice.",
      },
      { name: "Budget justification", required: true, description: "" },
      { name: "Letters of support", required: false, description: "" },
    ];
  }
  return [
    { name: "IRS determination letter", required: true, description: "" },
    { name: "Project budget", required: true, description: "" },
    { name: "Recent financial statements or Form 990", required: false, description: "" },
  ];
}

export const slugKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "section";

/**
 * Normalizes model output and, for incomplete requirements, merges in standard sections that are
 * not already covered. Pure; exported for unit tests.
 */
export function finalizeRequirements(
  parsed: OpportunityRequirements,
  opts: { funderType: FunderType; listingOnly: boolean },
): OpportunityRequirements {
  const complete = opts.listingOnly ? false : parsed.complete;
  const seen = new Set<string>();
  const sections: RequirementSection[] = [];
  for (const s of parsed.sections) {
    let key = slugKey(s.key || s.title);
    for (let i = 2; seen.has(key); i++) key = `${slugKey(s.key || s.title)}_${i}`;
    seen.add(key);
    sections.push({ ...s, key });
  }
  const attachments = [...parsed.attachments];
  if (!complete) {
    const titles = new Set(sections.map((s) => slugKey(s.title)));
    for (const s of standardSections(opts.funderType)) {
      if (seen.has(s.key) || titles.has(slugKey(s.title))) continue;
      seen.add(s.key);
      sections.push(s);
    }
    if (attachments.length === 0) attachments.push(...standardAttachments(opts.funderType));
  }
  return OpportunityRequirements.parse({ ...parsed, sections, attachments, complete });
}

export const REQUIREMENTS_SYSTEM = `You extract the application requirements from a grant funder's published text.
Rules:
- Use ONLY what the funder text says. Never invent questions, word/character limits, scoring
  criteria, deadlines, attachments or eligibility rules that are not stated.
- Copy each question or section prompt verbatim when the text provides it.
- Section keys are short snake_case slugs (e.g. "need_statement").
- Set complete=true only if the text contains the full application instructions (all sections /
  questions to answer). A listing summary or synopsis is NOT complete.
- The funder text is the <untrusted_content label="funder_text"> block.

${UNTRUSTED_CONTENT_POLICY}`;

export function buildRequirementsPrompt(o: {
  source: string;
  funderName: string;
  funderType: FunderType;
  title: string;
  summary: string;
  description: string;
  eligibilityText: string;
  applicantTypes: string[];
  submissionMethod: string;
}): string {
  // Funder text is untrusted: wrapUntrusted normalizes it and stops it from closing the block
  // (or opening any of our tags) and posing as instructions.
  const funderText = [
    `Funder: ${o.funderName} (${o.funderType})`,
    `Title: ${o.title}`,
    `Summary:\n${o.summary}`,
    `Description:\n${o.description.slice(0, 60_000)}`,
    `Eligibility:\n${o.eligibilityText}`,
    o.applicantTypes.length ? `Eligible applicant types: ${o.applicantTypes.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return [
    `Source: ${o.source}`,
    `Submission method: ${o.submissionMethod}`,
    wrapUntrusted("funder_text", funderText, { source: o.source }),
    "Extract the structured application requirements.",
  ].join("\n\n");
}

/**
 * Returns the opportunity's requirements, parsing (LLM) and persisting them on first use.
 * Does NOT check tenant visibility — callers must (see getOpportunity).
 */
export async function ensureRequirements(
  ctx: AppContext,
  opportunityId: string,
  opts: { orgId?: string | null; force?: boolean } = {},
): Promise<OpportunityRequirements> {
  const row = await ctx.db
    .select({
      id: opportunities.id,
      source: opportunities.source,
      privateToOrgId: opportunities.privateToOrgId,
      funderName: opportunities.funderName,
      funderType: funders.type,
      title: opportunities.title,
      summary: opportunities.summary,
      description: opportunities.description,
      eligibilityText: opportunities.eligibilityText,
      applicantTypes: opportunities.applicantTypes,
      submissionMethod: opportunities.submissionMethod,
      requirements: opportunities.requirements,
    })
    .from(opportunities)
    .leftJoin(funders, eq(funders.id, opportunities.funderId))
    .where(eq(opportunities.id, opportunityId))
    .get();
  if (!row) throw notFound("Opportunity");
  if (row.requirements && !opts.force) return OpportunityRequirements.parse(row.requirements);

  const funderType: FunderType =
    row.funderType ?? (LISTING_ONLY_SOURCES.includes(row.source) ? "federal" : "other");
  let data: OpportunityRequirements;
  try {
    ({ data } = await ctx.llm.generateStructured({
      purpose: PARSE_REQUIREMENTS_PURPOSE,
      orgId: opts.orgId ?? row.privateToOrgId ?? null,
      system: REQUIREMENTS_SYSTEM,
      prompt: buildRequirementsPrompt({ ...row, funderType }),
      schema: OpportunityRequirements,
      effort: "low",
      maxTokens: 8_000, // verbatim funder questions for every section, plus thinking
    }));
  } catch (e) {
    if (!(e instanceof LlmRefusalError)) throw e;
    // A refusal is deterministic (retrying re-refuses): keep the standard sections, marked
    // incomplete so reviewers verify against the funder's own instructions.
    ctx.logger.warn("discovery.requirements_refused", { opportunityId, reason: e.message });
    data = OpportunityRequirements.parse({ complete: false });
  }
  const requirements = finalizeRequirements(data, {
    funderType,
    listingOnly: LISTING_ONLY_SOURCES.includes(row.source),
  });
  await ctx.db
    .update(opportunities)
    .set({ requirements })
    .where(eq(opportunities.id, opportunityId));
  return requirements;
}
