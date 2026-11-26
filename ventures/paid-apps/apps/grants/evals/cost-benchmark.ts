// Cost benchmark: measures real token usage / cost per pipeline stage for one application-sized run,
// and compares it with the cost model that prices the plans (src/shared/billing/cost-model.ts).
//
//   pnpm tsx evals/cost-benchmark.ts                 # no key: prints the cost-model estimate + plan table
//   ANTHROPIC_API_KEY=... pnpm tsx evals/cost-benchmark.ts [--sections=6] [--markdown]
//
// The example org is fictional ("Example Valley Trades Collective"); all facts below are synthetic.
// A full run (6 sections) costs roughly $1–2 on claude-opus-5-5 and a few cents on claude-haiku-5-5
// (the default since 2026-11-24).

import {
  applicationCostEstimate,
  DEFAULT_MODEL,
  microsToUsd,
  STAGE_TOKENS,
  type StageKey,
  type TokenUsage,
  usageCostMicros,
} from "@shared/billing/cost-model";
import { PAID_PLAN_KEYS, PLANS, planMarkup, planMonthlyCost } from "@shared/billing/plans";
import { AnthropicLlm } from "@worker/ports/anthropic-llm";
import type { LlmUsage } from "@worker/ports/llm";
import { anthropicApiKey, hasAnthropicCredentials } from "./lib/credentials";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k ?? "", v ?? "true"] as const;
  }),
);
const SECTIONS = Math.max(1, Number(args.get("sections") ?? 6));
const MARKDOWN = args.has("markdown");
const MODEL = process.env.LLM_MODEL || DEFAULT_MODEL;
const usd = (micros: number) => `$${microsToUsd(micros).toFixed(micros < 100_000 ? 4 : 2)}`;

// ---- Synthetic, clearly fictional inputs sized like a real application ----------------------------
const ORG = "Example Valley Trades Collective";
const PROGRAMS = [
  "pre-apprenticeship carpentry",
  "solar installer training",
  "youth welding lab",
  "adult GED + trades bridge",
  "tool lending library",
];
const TOWNS = ["North Example", "Valley Flats", "Cedar Example", "Mesa Example"];

function syntheticFacts(count: number): string {
  const lines: string[] = [];
  for (let i = 0; i < count; i++) {
    const p = PROGRAMS[i % PROGRAMS.length];
    const t = TOWNS[i % TOWNS.length];
    lines.push(
      `[fct_${String(i).padStart(4, "0")}] (confirmed, ${["program", "outcome", "metric", "financial", "staff"][i % 5]}) ` +
        `${ORG} runs its ${p} program in ${t}; in program year ${2021 + (i % 4)} it enrolled ${20 + (i % 37)} participants, ` +
        `${10 + (i % 23)} of whom completed and ${5 + (i % 17)} were placed with local employers. ` +
        `Source quote: "Our ${p} cohort in ${t} graduated ${10 + (i % 23)} people this year."`,
    );
  }
  return lines.join("\n");
}

function syntheticRfp(paragraphs: number): string {
  const out = ["# Example Workforce Futures Fund — Request for Proposals (fictional)"];
  for (let i = 0; i < paragraphs; i++) {
    out.push(
      `## Section ${i + 1}\nApplicants must describe their approach to workforce development in rural communities, ` +
        `including recruitment of underserved residents, partnerships with employers, wraparound supports such as ` +
        `transportation and childcare, measurable outcomes (enrollment, completion, placement, wage gains), a ` +
        `sustainability plan beyond the grant period, and a line-item budget with narrative justification. ` +
        `Responses for this section are limited to ${500 + i * 25} words. Reviewers score clarity, feasibility, ` +
        `evidence of need, and organizational capacity on a 1-5 scale; incomplete responses are not scored.`,
    );
  }
  return out.join("\n\n");
}

const FACTS = syntheticFacts(260); // ≈15k tokens
const RFP = syntheticRfp(110); // ≈10k tokens
const SECTION_NAMES = [
  "Statement of need",
  "Program design",
  "Partnerships",
  "Evaluation plan",
  "Sustainability",
  "Budget narrative",
  "Organizational capacity",
  "Equity",
];

const DRAFT_SYSTEM =
  "You draft grant application sections for a nonprofit. Use ONLY the facts provided in the context. " +
  "Every factual sentence must cite fact ids in brackets. If a requirement cannot be answered from the facts, " +
  "write a GAP line instead of inventing anything. Write in a clear, warm, specific voice.";

interface Measured {
  stage: StageKey;
  label: string;
  usage: LlmUsage[];
}

async function measure(): Promise<Measured[]> {
  if (!hasAnthropicCredentials()) return [];
  const apiKey = anthropicApiKey();
  const llm = new AnthropicLlm({ ...(apiKey ? { apiKey } : {}), defaultModel: MODEL });
  const out: Measured[] = [];
  const run = async (stage: StageKey, label: string, fn: () => Promise<LlmUsage>) => {
    const started = Date.now();
    const usage = await fn();
    const m = out.find((x) => x.stage === stage) ?? { stage, label, usage: [] };
    if (!out.includes(m)) out.push(m);
    m.usage.push(usage);
    console.error(
      `  ${label}: ${usage.inputTokens}+${usage.cacheReadTokens}r+${usage.cacheWriteTokens}w in / ${usage.outputTokens} out, ${usd(usage.costMicros)} (${Date.now() - started}ms)`,
    );
  };

  console.error(`Measuring with ${MODEL}, ${SECTIONS} sections…`);
  await run(
    "requirementsParse",
    "requirements.parse",
    async () =>
      (
        await llm.generateText({
          purpose: "requirements.parse",
          system:
            "Extract every requirement, word limit and scoring criterion from the RFP as a compact JSON array.",
          prompt: RFP,
          effort: "medium",
          maxTokens: 6000,
        })
      ).usage,
  );
  const drafts: string[] = [];
  for (let i = 0; i < SECTIONS; i++) {
    const name = SECTION_NAMES[i % SECTION_NAMES.length] ?? `Section ${i + 1}`;
    await run(
      i === 0 ? "sectionDraftFirst" : "sectionDraftCached",
      "drafting.section",
      async () => {
        const r = await llm.generateText({
          purpose: "drafting.section",
          system: DRAFT_SYSTEM,
          context: `# Fact base for ${ORG}\n${FACTS}`,
          prompt: `Draft the "${name}" section (≤ 450 words) for the Example Workforce Futures Fund. Requirements: ${RFP.slice(i * 600, i * 600 + 2400)}`,
          effort: "medium",
          maxTokens: 6000,
        });
        drafts.push(r.text);
        return r.usage;
      },
    );
  }
  await run(
    "summary",
    "drafting.summary",
    async () =>
      (
        await llm.generateText({
          purpose: "drafting.summary",
          system: "Write a 200-word executive summary of this application using only its content.",
          prompt: drafts.join("\n\n"),
          effort: "low",
          maxTokens: 3000,
        })
      ).usage,
  );
  for (const d of drafts) {
    await run(
      "groundingVerify",
      "grounding.verify",
      async () =>
        (
          await llm.generateText({
            purpose: "grounding.verify",
            system:
              "For each sentence of the draft, judge whether the cited facts fully support it. Output JSON verdicts: supported | partially_supported | unsupported, with a reason.",
            prompt: `Draft:\n${d}\n\nCited facts:\n${FACTS.slice(0, 9000)}`,
            effort: "medium",
            maxTokens: 5000,
          })
        ).usage,
    );
  }
  const profile = `# ${ORG} profile\n${FACTS.slice(0, 14_000)}`;
  for (let i = 0; i < 2; i++) {
    await run(
      "matchScore",
      "matching.score",
      async () =>
        (
          await llm.generateText({
            purpose: "matching.score",
            system:
              "Score fit (0-100) and eligibility of this opportunity for the org. JSON: { fit, eligibility, rationale }.",
            context: profile,
            prompt: RFP.slice(i * 6000, i * 6000 + 6000),
            effort: "low",
            maxTokens: 2000,
          })
        ).usage,
    );
  }
  await run(
    "factExtractPage",
    "knowledge.extract",
    async () =>
      (
        await llm.generateText({
          purpose: "knowledge.extract",
          system:
            "Extract atomic, verifiable facts from this document page with verbatim source quotes. JSON array.",
          prompt: FACTS.slice(20_000, 23_600),
          effort: "low",
          maxTokens: 3000,
        })
      ).usage,
  );
  await run(
    "interviewTurn",
    "interview.turn",
    async () =>
      (
        await llm.generateText({
          purpose: "interview.turn",
          system:
            "You interview a nonprofit staff member to fill gaps in their fact base. Ask one short, specific question.",
          context: profile.slice(0, 12_000),
          prompt:
            "Previous answer: We also run a summer program but I don't have the numbers handy.",
          effort: "low",
          maxTokens: 1000,
        })
      ).usage,
  );
  return out;
}

function avg(usages: LlmUsage[]): TokenUsage & { costMicros: number } {
  const n = usages.length || 1;
  const s = (f: (u: LlmUsage) => number) => Math.round(usages.reduce((a, u) => a + f(u), 0) / n);
  return {
    inputTokens: s((u) => u.inputTokens),
    outputTokens: s((u) => u.outputTokens),
    cacheReadTokens: s((u) => u.cacheReadTokens),
    cacheWriteTokens: s((u) => u.cacheWriteTokens),
    costMicros: s((u) => u.costMicros),
  };
}

function printStageTable(measured: Measured[]) {
  console.log(`\n## Per-call cost by stage (${MODEL})\n`);
  console.log(
    "| Stage | Model estimate (in / out / cache r / cache w) | Est. cost | Measured avg | Measured cost |",
  );
  console.log("| --- | --- | --- | --- | --- |");
  for (const key of Object.keys(STAGE_TOKENS) as StageKey[]) {
    const t = STAGE_TOKENS[key];
    const m = measured.find((x) => x.stage === key);
    const a = m ? avg(m.usage) : null;
    console.log(
      `| ${key} | ${t.inputTokens} / ${t.outputTokens} / ${t.cacheReadTokens} / ${t.cacheWriteTokens} | ${usd(usageCostMicros(t, MODEL))} | ` +
        (a
          ? `${a.inputTokens} / ${a.outputTokens} / ${a.cacheReadTokens} / ${a.cacheWriteTokens} (n=${m?.usage.length}) | ${usd(a.costMicros)} |`
          : "— | — |"),
    );
  }
  const est = applicationCostEstimate(MODEL);
  console.log(
    `\nEstimated cost per application (6 sections, +30% revisions): ${usd(est.totalMicros)}`,
  );
  for (const l of est.lines)
    console.log(`  - ${l.stage}: ${usd(l.costMicros)} (${Number(l.calls.toFixed(1))} calls)`);
  if (measured.length) {
    const appStages: StageKey[] = [
      "requirementsParse",
      "sectionDraftFirst",
      "sectionDraftCached",
      "summary",
      "groundingVerify",
    ];
    const total = measured
      .filter((m) => appStages.includes(m.stage))
      .reduce((s, m) => s + m.usage.reduce((a, u) => a + u.costMicros, 0), 0);
    console.log(
      `Measured cost for this ${SECTIONS}-section application (no revisions): ${usd(total)}`,
    );
  }
}

function printPlanTable() {
  console.log(
    "\n## Plans (full allowance used; cost includes LLM + hosting + MoR fee + refund reserve)\n",
  );
  console.log(
    "| Plan | Price/mo | Drafts/mo | Scores/mo | Est. cost/mo | Markup (monthly) | Annual price | Markup (annual) |",
  );
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const key of ["comp", ...PAID_PLAN_KEYS] as const) {
    const p = PLANS[key];
    const c = planMonthlyCost(p, "month", MODEL);
    const paid = p.priceCents > 0;
    console.log(
      `| ${p.name} | $${(p.priceCents / 100).toFixed(2)} | ${p.includedApplicationDrafts} | ${p.maxOpportunityScoresPerMonth} | ${usd(c.totalMicros)} | ` +
        `${paid ? `${planMarkup(p, "month", MODEL).toFixed(2)}×` : "absorbed"} | ${p.annualPriceCents ? `$${(p.annualPriceCents / 100).toFixed(0)}` : "—"} | ` +
        `${p.annualPriceCents ? `${planMarkup(p, "year", MODEL).toFixed(2)}×` : "—"} |`,
    );
  }
}

async function main() {
  const measured = await measure().catch((e: unknown) => {
    console.error(`Measurement failed (${String(e)}); printing estimates only.`);
    return [] as Measured[];
  });
  if (!hasAnthropicCredentials())
    console.error(
      "No Anthropic credentials (API key or WIF): printing the cost-model estimate only.",
    );
  printStageTable(measured);
  printPlanTable();
  if (!MARKDOWN)
    console.log("\n(re-run with --markdown and paste into docs/PRICING.md after prompt changes)");
}

void main();
