// Grounding evals: draft -> verify -> metrics, plus an adversarial fabrication-detection check.
//   pnpm exec tsx evals/run.ts            # real Claude when ANTHROPIC_API_KEY is set, else fake
//   pnpm exec tsx evals/run.ts --fake     # deterministic FakeLlm (CI smoke test, no network)
//   pnpm exec tsx evals/run.ts --org evtc # one fixture org (see evals/fixtures/index.ts)
// Writes evals/results/<timestamp>.json and exits non-zero when a gate below fails.
// See docs/EVALS.md.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROMPT_VERSION as DRAFTING_PROMPT_VERSION,
  draftApplication,
} from "@worker/services/drafting";
import { draftingDeps } from "@worker/services/drafting/deps";
import {
  deriveOrgNames,
  PROMPT_VERSION as GROUNDING_PROMPT_VERSION,
  verifyDraft,
} from "@worker/services/grounding";
import { EVAL_ORGS, type EvalOpportunity, type EvalOrg } from "./fixtures";
import { createEvalContext, type EvalContext, type UsageTotals } from "./lib/context";
import {
  type DetectionResult,
  type DraftMetrics,
  detectionResults,
  draftMetrics,
  injectFabrications,
} from "./lib/metrics";

// ---- Gates (exit non-zero when violated) ----------------------------------------------------
/** Share of injected fabrications the verifier must flag. */
export const MIN_DETECTION_RATE = 1.0;
/** Share of the drafter's factual claims the verifier must mark "supported" (all cases pooled). */
export const MIN_SUPPORTED_RATE = 0.9;
/** Share of unanswerable sections where the drafter must emit a gap instead of text. */
export const MIN_GAP_RECALL = 1.0;
/** Citations of restricted / rejected / superseded / unknown facts allowed in a draft. */
export const MAX_FORBIDDEN_CITATIONS = 0;

interface Args {
  fake: boolean;
  org: string | null;
  verbose: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { fake: false, org: null, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fake") args.fake = true;
    else if (a === "--verbose" || a === "-v") args.verbose = true;
    else if (a === "--org") args.org = argv[++i] ?? null;
    else if (a?.startsWith("--org=")) args.org = a.slice(6);
    else if (a === "--help" || a === "-h") {
      console.log("usage: tsx evals/run.ts [--fake] [--org <key>] [--verbose]");
      console.log(`orgs: ${EVAL_ORGS.map((o) => o.key).join(", ")}`);
      process.exit(0);
    } else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

interface CaseResult {
  org: string;
  opportunity: string;
  draftModel: string;
  metrics: DraftMetrics | null;
  detection: DetectionResult[];
  detectionRate: number;
  usage: { draft: UsageTotals; verify: UsageTotals; adversarial: UsageTotals; total: UsageTotals };
  durationMs: number;
  error?: string;
}

async function runCase(ec: EvalContext, org: EvalOrg, opp: EvalOpportunity): Promise<CaseResult> {
  const { ctx, meter } = ec;
  const started = Date.now();
  const tag = `${org.key}/${opp.key}`;
  const applicationId = `app_eval_${org.key}_${opp.key}`;
  const allowedNames = [org.name, ...deriveOrgNames(org.facts)];

  meter.phase = `${tag}:draft`;
  const draft = await draftApplication(ctx, {
    orgId: org.orgId,
    applicationId,
    opportunity: opp.opportunity,
    requirements: opp.requirements,
    facts: org.facts,
    requestedAmountCents: opp.requestedAmountCents,
  });

  meter.phase = `${tag}:verify`;
  const verification = await verifyDraft(ctx, {
    orgId: org.orgId,
    applicationId,
    content: draft.content,
    facts: org.facts,
    requirements: opp.requirements,
    autopilot: false,
    allowedNames,
  });

  meter.phase = `${tag}:adversarial`;
  const { content: tampered, injected } = injectFabrications(draft.content, org.fabrications);
  const advVerification = await verifyDraft(ctx, {
    orgId: org.orgId,
    applicationId: `${applicationId}_adv`,
    content: tampered,
    facts: org.facts,
    requirements: opp.requirements,
    autopilot: false,
    allowedNames,
  });
  const detection = detectionResults(injected, advVerification);

  const metrics = draftMetrics({
    content: draft.content,
    requirements: opp.requirements,
    facts: org.facts,
    verification,
    expectGapSections: opp.expectGapSections,
    allowedNames,
  });
  const byPhase = (p: string) => meter.totals((r) => r.phase === `${tag}:${p}`);
  return {
    org: org.key,
    opportunity: opp.key,
    draftModel: draft.model,
    metrics,
    detection,
    detectionRate: detection.length
      ? detection.filter((d) => d.detected).length / detection.length
      : 0,
    usage: {
      draft: byPhase("draft"),
      verify: byPhase("verify"),
      adversarial: byPhase("adversarial"),
      total: meter.totals((r) => r.phase.startsWith(`${tag}:`)),
    },
    durationMs: Date.now() - started,
  };
}

// ---- Output ---------------------------------------------------------------------------------
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const usd = (micros: number) => `$${(micros / 1e6).toFixed(4)}`;

function printTable(rows: Record<string, string>[]) {
  const first = rows[0];
  if (!first) return;
  const cols = Object.keys(first);
  const width = (c: string) => Math.max(c.length, ...rows.map((r) => (r[c] ?? "").length));
  const line = (r: Record<string, string>) =>
    cols.map((c) => (r[c] ?? "").padEnd(width(c))).join("  ");
  console.log(line(Object.fromEntries(cols.map((c) => [c, c]))));
  console.log(cols.map((c) => "-".repeat(width(c))).join("  "));
  for (const r of rows) console.log(line(r));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const orgs = args.org ? EVAL_ORGS.filter((o) => o.key === args.org) : EVAL_ORGS;
  if (orgs.length === 0) {
    console.error(`no fixture org "${args.org}" (have: ${EVAL_ORGS.map((o) => o.key).join(", ")})`);
    process.exit(2);
  }
  const ec = createEvalContext({ fake: args.fake, verbose: args.verbose });

  // Seams that would hit D1 / Vectorize / Workers AI: the org profile comes from the fixture, and
  // style examples (past applications) are not part of these evals.
  const profiles = new Map(EVAL_ORGS.map((o) => [o.orgId, o.profile]));
  draftingDeps.orgProfile = async (_ctx, orgId) => profiles.get(orgId) ?? "";
  draftingDeps.styleExamples = async () => [];

  const startedAt = new Date();
  console.log(
    `Grant Autopilot grounding evals — mode=${ec.mode}${ec.mode === "anthropic" ? ` model=${ec.model}` : ""} ` +
      `orgs=${orgs.map((o) => o.key).join(",")} drafting=${DRAFTING_PROMPT_VERSION} grounding=${GROUNDING_PROMPT_VERSION}\n`,
  );

  const cases: CaseResult[] = [];
  for (const org of orgs) {
    for (const opp of org.opportunities) {
      process.stdout.write(`  running ${org.key}/${opp.key} ... `);
      try {
        const r = await runCase(ec, org, opp);
        cases.push(r);
        console.log(`done in ${(r.durationMs / 1000).toFixed(1)}s`);
      } catch (e) {
        console.log("FAILED");
        console.error(e);
        cases.push({
          org: org.key,
          opportunity: opp.key,
          draftModel: "n/a",
          metrics: null,
          detection: [],
          detectionRate: 0,
          usage: {
            draft: ec.meter.totals(() => false),
            verify: ec.meter.totals(() => false),
            adversarial: ec.meter.totals(() => false),
            total: ec.meter.totals((r) => r.phase.startsWith(`${org.key}/${opp.key}:`)),
          },
          durationMs: 0,
          error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        });
      }
    }
  }

  const ok = cases.filter((c): c is CaseResult & { metrics: DraftMetrics } => c.metrics !== null);
  console.log("");
  printTable(
    ok.map((c) => ({
      case: `${c.org}/${c.opportunity}`,
      claims: String(c.metrics.claims),
      factual: String(c.metrics.factualClaims),
      cited: pct(c.metrics.citedRate),
      supported: pct(c.metrics.supportedRate),
      partial: String(c.metrics.partiallySupported),
      unsup: String(c.metrics.unsupported),
      numMis: String(c.metrics.numericMismatches),
      framingBad: String(c.metrics.framingViolations.length),
      forbidden: String(c.metrics.forbiddenCitations.length),
      gapRecall: pct(c.metrics.gapRecall),
      wordLimit: pct(c.metrics.wordLimitCompliance),
      detect: `${c.detection.filter((d) => d.detected).length}/${c.detection.length}`,
      tokensIn: String(
        c.usage.total.inputTokens + c.usage.total.cacheReadTokens + c.usage.total.cacheWriteTokens,
      ),
      tokensOut: String(c.usage.total.outputTokens),
      cost: usd(c.usage.total.costMicros),
    })),
  );

  // Pooled metrics + gates.
  const factual = ok.reduce((n, c) => n + c.metrics.factualClaims, 0);
  const supported = ok.reduce((n, c) => n + c.metrics.supportedRate * c.metrics.factualClaims, 0);
  const detections = ok.flatMap((c) => c.detection);
  const gapSections = ok.flatMap((c) => c.metrics.gapSectionDetail);
  const totals = {
    factualClaims: factual,
    supportedRate: factual ? supported / factual : 0,
    detectionRate: detections.length
      ? detections.filter((d) => d.detected).length / detections.length
      : 0,
    gapRecall: gapSections.length
      ? gapSections.filter((g) => g.gaps > 0).length / gapSections.length
      : 1,
    forbiddenCitations: ok.reduce((n, c) => n + c.metrics.forbiddenCitations.length, 0),
    numericMismatches: ok.reduce((n, c) => n + c.metrics.numericMismatches, 0),
    framingViolations: ok.reduce((n, c) => n + c.metrics.framingViolations.length, 0),
    usage: ec.meter.totals(),
  };
  const gates = [
    {
      name: "fabrication detection",
      value: totals.detectionRate,
      min: MIN_DETECTION_RATE,
      fmt: pct,
    },
    { name: "supported claims", value: totals.supportedRate, min: MIN_SUPPORTED_RATE, fmt: pct },
    {
      name: "gap recall (unanswerable sections)",
      value: totals.gapRecall,
      min: MIN_GAP_RECALL,
      fmt: pct,
    },
    {
      name: "forbidden citations (restricted/rejected/superseded)",
      value: -totals.forbiddenCitations,
      min: -MAX_FORBIDDEN_CITATIONS,
      fmt: (x: number) => String(-x),
    },
    {
      name: "cases completed",
      value: ok.length,
      min: cases.length,
      fmt: (x: number) => `${x}/${cases.length}`,
    },
  ].map((g) => ({ ...g, pass: g.value >= g.min }));

  console.log("");
  for (const g of gates) {
    console.log(
      `${g.pass ? "PASS" : "FAIL"}  ${g.name}: ${g.fmt(g.value)} (required ${g.fmt(g.min)})`,
    );
  }
  console.log(
    `info  numeric mismatches in drafts: ${totals.numericMismatches} · framing claims with numbers/names: ${totals.framingViolations}` +
      ` · LLM calls: ${totals.usage.calls} · tokens in/out: ${totals.usage.inputTokens + totals.usage.cacheReadTokens + totals.usage.cacheWriteTokens}/${totals.usage.outputTokens}` +
      ` · cost: ${usd(totals.usage.costMicros)}`,
  );

  for (const c of ok) {
    for (const d of c.detection.filter((x) => !x.detected)) {
      console.log(
        `MISS  ${c.org}/${c.opportunity} ${d.kind} (${d.claimId}): verdict=${d.verdict} ${d.reason}`,
      );
    }
    for (const g of c.metrics.gapSectionDetail.filter((x) => x.gaps === 0)) {
      console.log(
        `MISS  ${c.org}/${c.opportunity} no gap in unanswerable section "${g.key}" (${g.factualClaims} factual claims)`,
      );
    }
    for (const f of c.metrics.forbiddenCitations) {
      console.log(`BAD   ${c.org}/${c.opportunity} ${f.claimId} cites ${f.why} fact ${f.factId}`);
    }
    for (const f of c.metrics.framingViolations) {
      console.log(
        `warn  ${c.org}/${c.opportunity} framing ${f.claimId} has ${f.problems.join(", ")}: "${f.text}"`,
      );
    }
  }
  for (const c of cases.filter((x) => x.error))
    console.log(`ERROR ${c.org}/${c.opportunity}: ${c.error}`);

  const warnings = ec.logs.filter((l) => l.level === "warn" || l.level === "error");
  const uniq = (xs: string[]) => [...new Set(xs)];
  const stubs = { db: uniq(ec.access.db), ports: uniq(ec.access.ports) };
  if (stubs.db.length || stubs.ports.length) {
    console.log(
      `info  stub ctx touched — db: [${stubs.db.join("; ")}] ports: [${stubs.ports.join("; ")}]`,
    );
  }
  if (warnings.length)
    console.log(
      `info  ${warnings.length} module warning(s): ${uniq(warnings.map((w) => w.msg)).join(", ")}`,
    );

  const passed = gates.every((g) => g.pass);
  const outDir = join(dirname(fileURLToPath(import.meta.url)), "results");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `${startedAt.toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(
    outFile,
    `${JSON.stringify(
      {
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        mode: ec.mode,
        model: ec.mode === "anthropic" ? ec.model : "fake-llm",
        promptVersions: { drafting: DRAFTING_PROMPT_VERSION, grounding: GROUNDING_PROMPT_VERSION },
        thresholds: {
          MIN_DETECTION_RATE,
          MIN_SUPPORTED_RATE,
          MIN_GAP_RECALL,
          MAX_FORBIDDEN_CITATIONS,
        },
        passed,
        gates,
        totals,
        cases,
        stubs,
        warnings,
        llmCalls: ec.meter.records.map((r) => ({
          phase: r.phase,
          purpose: r.purpose,
          ...r.usage,
          error: r.error,
        })),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\n${passed ? "PASSED" : "FAILED"} — results: ${outFile}`);
  process.exit(passed ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
