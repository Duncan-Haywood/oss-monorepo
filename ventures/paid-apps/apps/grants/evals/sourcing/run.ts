// Sourcing evals: does matching rank the right grants first and never call an org eligible when
// it is not? For each fixture org x opportunity: prefilter -> near-duplicate collapse -> embedding
// similarity -> LLM "matching.score" -> finalizeScore, using the matching module's own functions.
//   pnpm exec tsx evals/sourcing/run.ts --fake       # deterministic FakeLlm (CI smoke test)
//   pnpm exec tsx evals/sourcing/run.ts              # real Claude when credentials are set
//   pnpm exec tsx evals/sourcing/run.ts --org lrp    # one org (jfta | lrp)
// Writes evals/results/sourcing-<timestamp>.json; exits non-zero when a gate fails. See docs/EVALS.md.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Eligibility } from "@shared/enums";
import type { AppContext } from "@worker/context";
import { FakeEmbedder } from "@worker/ports/fakes";
import { formatFactsForPrompt } from "@worker/services/knowledge/format";
import { AUTODRAFT_MIN_FIT } from "@worker/services/matching/autodraft";
import {
  findNearDuplicates,
  type PrefilterResult,
  prefilter,
} from "@worker/services/matching/prefilter";
import { MAX_LLM_SCORES_PER_RUN } from "@worker/services/matching/score-org";
import {
  buildScoreContext,
  buildScorePrompt,
  type FinalScore,
  finalizeScore,
  MATCH_PROMPT_VERSION,
  MATCH_SCORE_PURPOSE,
  MatchScoreOutput,
  SYSTEM_PROMPT,
} from "@worker/services/matching/scoring";
import {
  cosine,
  opportunityEmbeddingText,
  orgEmbeddingText,
  topSummaryFacts,
} from "@worker/services/matching/similarity";
import { buildPromptProfile } from "@worker/services/orgs/prompt-profile";
import type { EvalFact } from "../fixtures";
import { createEvalContext, type UsageTotals } from "../lib/context";
import { SOURCING_OPPORTUNITIES } from "./fixtures/opportunities";
import { SOURCING_ORGS } from "./fixtures/orgs";
import type { GoldLabel, SourcingOpportunity, SourcingOrg, TrapKind } from "./fixtures/types";
import {
  type CaseOutcome,
  eligibilityCorrect,
  gainOf,
  isFalseEligible,
  MODEL_JUDGED_TRAPS,
  ndcgAt,
  precisionAt,
  realCitationShare,
  trapCaught,
} from "./metrics";

// ---- Gates (exit non-zero when violated) ----------------------------------------------------
/** Cases where the pipeline calls the org (likely) eligible but gold says ineligible / unknown. */
export const MAX_FALSE_ELIGIBLE = 0;
/** Share of trap cases the pipeline must neutralize. */
export const MIN_TRAP_CATCH_RATE = 1.0;

const DAY = 86_400_000;
const LLM_CONCURRENCY = 3; // as score-org.ts

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
      console.log("usage: tsx evals/sourcing/run.ts [--fake] [--org <key>] [--verbose]");
      console.log(`orgs: ${SOURCING_ORGS.map((o) => o.key).join(", ")}`);
      process.exit(0);
    } else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

/** Fixture -> the opportunities-row fields the matcher reads. */
function toRow(o: SourcingOpportunity, now: Date) {
  return {
    ...o,
    id: `opp_${o.key}`,
    closeDate: o.closeInDays == null ? null : new Date(now.getTime() + o.closeInDays * DAY),
  };
}
type OppRow = ReturnType<typeof toRow>;

/** Same contract as deps.factsForMatching: never rejected / superseded / restricted; confirmed first. */
function factsForMatching(facts: readonly EvalFact[]): EvalFact[] {
  const ok = facts.filter(
    (f) => (f.status === "confirmed" || f.status === "proposed") && f.sensitivity !== "restricted",
  );
  return [...ok].sort(
    (a, b) => Number(b.status === "confirmed") - Number(a.status === "confirmed"),
  );
}

/** buildPromptProfile reads only these org_profiles columns. */
function promptProfile(org: SourcingOrg): string {
  const p = org.profile;
  const row = { ...p, dba: null } as unknown as Parameters<typeof buildPromptProfile>[0];
  return buildPromptProfile(row, org.name);
}

async function mapLimit<T, R>(xs: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  const worker = async () => {
    while (next < xs.length) {
      const i = next++;
      out[i] = await fn(xs[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, xs.length) }, worker));
  return out;
}

interface CaseResult {
  opportunity: string;
  source: string;
  gold: GoldLabel;
  prefilter: PrefilterResult;
  duplicateOf: string | null;
  similarity: number | null;
  similarityRank: number | null;
  withinScoreCap: boolean | null;
  score: FinalScore | null;
  rawReasons: MatchScoreOutput["reasons"];
  rank: number | null;
  eligibility: Eligibility;
  eligibilityCorrect: boolean;
  falseEligible: boolean;
  trap: { kind: TrapKind; caught: boolean } | null;
  error?: string;
}

interface OrgResult {
  org: string;
  cases: CaseResult[];
  metrics: {
    opportunities: number;
    passedPrefilter: number;
    duplicates: number;
    scored: number;
    ndcg5: number;
    ndcg10: number;
    precision5: number;
    eligibilityAccuracy: number;
    falseEligible: number;
    falseEligibleRate: number;
    trapsCaught: number;
    traps: number;
    reasonsCiting: number;
    reasonsAllReal: number;
    realCitationRate: number;
    fabricatedFactIds: string[];
    similarityRecallAtCap: number;
    errors: number;
  };
  usage: UsageTotals;
}

async function runOrg(
  ctx: AppContext,
  setPhase: (p: string) => void,
  totals: (phase: string) => UsageTotals,
  org: SourcingOrg,
): Promise<OrgResult> {
  const now = ctx.now();
  const phase = `${org.key}:score`;
  const rows = SOURCING_OPPORTUNITIES.map((o) => toRow(o, now));

  // ---- Stage 1: deterministic prefilter, then near-duplicate collapse ----
  const pf = new Map(rows.map((r) => [r.id, prefilter(r, org.profile, now)]));
  const passed = rows.filter((r) => pf.get(r.id)?.pass);
  const dupes = findNearDuplicates(passed);
  const candidates = passed.filter((r) => !dupes.has(r.id));

  // ---- Stage 2: embedding similarity (decides which candidates fit the per-run LLM cap) ----
  const facts = factsForMatching(org.facts);
  const orgText = orgEmbeddingText({
    focusAreas: org.profile.focusAreas,
    serviceAreas: org.profile.serviceAreas,
    projects: org.projects,
    factStatements: topSummaryFacts(facts),
  });
  const [orgVec] = await ctx.embedder.embed([orgText]);
  const vecs = await ctx.embedder.embed(candidates.map((c) => opportunityEmbeddingText(c)));
  const sims = new Map(
    candidates.map((c, i) => [c.id, orgVec && vecs[i] ? cosine(orgVec, vecs[i]) : 0]),
  );
  const simOrder = [...candidates].sort((a, b) => (sims.get(b.id) ?? 0) - (sims.get(a.id) ?? 0));
  const simRank = new Map(simOrder.map((c, i) => [c.id, i + 1]));

  // ---- Stage 3: LLM scoring of every candidate (later runs pick up what one run's cap skips) ----
  const context = buildScoreContext({
    profileText: promptProfile(org),
    factsText: formatFactsForPrompt(facts),
    projects: org.projects,
  });
  const allowedFactIds = new Set(facts.map((f) => f.id));
  const allowedProjects = new Map(org.projects.map((p) => [p.id, p]));
  setPhase(phase);
  const scored = new Map<
    string,
    { score: FinalScore; raw: MatchScoreOutput["reasons"] } | { error: string }
  >();
  await mapLimit(candidates, LLM_CONCURRENCY, async (opp: OppRow) => {
    const p = pf.get(opp.id) as PrefilterResult;
    try {
      const { data } = await ctx.llm.generateStructured({
        purpose: MATCH_SCORE_PURPOSE,
        orgId: org.orgId,
        system: SYSTEM_PROMPT,
        context,
        prompt: buildScorePrompt(
          { ...opp, prefilterEligibility: p.eligibility, prefilterNotes: p.notes },
          now,
        ),
        schema: MatchScoreOutput,
        effort: "low",
        maxTokens: 4_000,
      });
      const score = finalizeScore({
        output: data,
        allowedFactIds,
        allowedProjects,
        awardFloorCents: opp.awardFloorCents,
        awardCeilingCents: opp.awardCeilingCents,
        totalFundingCents: opp.totalFundingCents,
        funderType: opp.funderType,
      });
      scored.set(opp.id, { score, raw: data.reasons });
    } catch (e) {
      scored.set(opp.id, { error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) });
    }
  });

  // Product ranking (GET /matches and autopilot): expected value desc, then fit desc.
  const ok = [...scored].flatMap(([id, s]) => ("score" in s ? [{ id, s: s.score }] : []));
  ok.sort(
    (a, b) =>
      b.s.expectedValueCents - a.s.expectedValueCents ||
      b.s.fitScore - a.s.fitScore ||
      a.id.localeCompare(b.id),
  );
  const rankOf = new Map(ok.map((x, i) => [x.id, i + 1]));

  const cases: CaseResult[] = rows.map((r) => {
    const gold = r.gold[org.key];
    const p = pf.get(r.id) as PrefilterResult;
    const s = scored.get(r.id);
    const score = s && "score" in s ? s.score : null;
    const eligibility: Eligibility = score?.eligibility ?? p.eligibility;
    const outcome: CaseOutcome = {
      droppedByPrefilter: !p.pass,
      duplicateOf: dupes.get(r.id)?.replace(/^opp_/, "") ?? null,
      eligibility,
      fitScore: score?.fitScore ?? null,
      rank: rankOf.get(r.id) ?? null,
    };
    return {
      opportunity: r.key,
      source: r.source,
      gold,
      prefilter: p,
      duplicateOf: outcome.duplicateOf,
      similarity: sims.get(r.id) ?? null,
      similarityRank: simRank.get(r.id) ?? null,
      withinScoreCap: simRank.has(r.id)
        ? (simRank.get(r.id) as number) <= MAX_LLM_SCORES_PER_RUN
        : null,
      score,
      rawReasons: s && "raw" in s ? s.raw : [],
      rank: outcome.rank,
      eligibility,
      eligibilityCorrect: eligibilityCorrect(gold.eligible, eligibility),
      falseEligible: isFalseEligible(gold.eligible, eligibility),
      trap: gold.trap
        ? { kind: gold.trap, caught: trapCaught(gold.trap, outcome, AUTODRAFT_MIN_FIT) }
        : null,
      ...(s && "error" in s ? { error: s.error } : {}),
    };
  });

  const byRank = cases
    .filter((c) => c.rank !== null)
    .sort((a, b) => (a.rank as number) - (b.rank as number));
  const rankedGains = byRank.map((c) => gainOf(c.gold));
  const allGains = cases.map((c) => gainOf(c.gold));
  const notTrue = cases.filter((c) => c.gold.eligible !== true);
  const traps = cases.filter((c) => c.trap);
  const cites = realCitationShare(
    cases.flatMap((c) => c.rawReasons),
    allowedFactIds,
  );
  const relevantCandidates = cases.filter((c) => c.withinScoreCap !== null && gainOf(c.gold) > 0);
  const ratio = (n: number, d: number) => (d === 0 ? 1 : n / d);

  return {
    org: org.key,
    cases,
    metrics: {
      opportunities: rows.length,
      passedPrefilter: passed.length,
      duplicates: dupes.size,
      scored: ok.length,
      ndcg5: ndcgAt(rankedGains, allGains, 5),
      ndcg10: ndcgAt(rankedGains, allGains, 10),
      precision5: precisionAt(rankedGains, 5),
      eligibilityAccuracy: ratio(cases.filter((c) => c.eligibilityCorrect).length, cases.length),
      falseEligible: cases.filter((c) => c.falseEligible).length,
      falseEligibleRate: ratio(notTrue.filter((c) => c.falseEligible).length, notTrue.length),
      trapsCaught: traps.filter((c) => c.trap?.caught).length,
      traps: traps.length,
      reasonsCiting: cites.citing,
      reasonsAllReal: cites.allReal,
      realCitationRate: ratio(cites.allReal, cites.citing),
      fabricatedFactIds: cites.fabricatedIds,
      similarityRecallAtCap: ratio(
        relevantCandidates.filter((c) => c.withinScoreCap).length,
        relevantCandidates.length,
      ),
      errors: cases.filter((c) => c.error).length,
    },
    usage: totals(phase),
  };
}

// ---- Output ---------------------------------------------------------------------------------
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const usd = (micros: number) => `$${(micros / 1e6).toFixed(4)}`;
const f2 = (x: number) => x.toFixed(2);

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
  const orgs = args.org ? SOURCING_ORGS.filter((o) => o.key === args.org) : SOURCING_ORGS;
  if (orgs.length === 0) {
    console.error(
      `no fixture org "${args.org}" (have: ${SOURCING_ORGS.map((o) => o.key).join(", ")})`,
    );
    process.exit(2);
  }
  const ec = createEvalContext({ fake: args.fake, verbose: args.verbose });
  const startedAt = new Date();
  // Fixed clock for the run; Workers AI is not reachable from Node, so similarity uses the same
  // bag-of-words FakeEmbedder as tests and the offline demo (in every mode).
  const ctx: AppContext = { ...ec.ctx, embedder: new FakeEmbedder(), now: () => startedAt };
  const replaced = [
    "embedder -> FakeEmbedder (bag-of-words hashing; Workers AI bge-m3 unavailable in Node)",
    "deps.factsForMatching -> fixture facts (confirmed+proposed, no restricted/rejected/superseded)",
    "deps.promptProfile -> buildPromptProfile(fixture profile)",
    "org_profiles / projects / funders reads -> fixture profile, projects, funderType",
    "loadCandidates SQL filter (status, deadline >= 7d) -> not applied; the prefilter covers it",
    "opportunity_matches upsert, billing metering, autopilot drafting -> skipped (results in memory)",
  ];

  console.log(
    `Grant Autopilot sourcing evals — mode=${ec.mode}${ec.mode === "anthropic" ? ` model=${ec.model}` : ""} ` +
      `orgs=${orgs.map((o) => o.key).join(",")} opportunities=${SOURCING_OPPORTUNITIES.length} prompt=${MATCH_PROMPT_VERSION}\n`,
  );

  const results: OrgResult[] = [];
  for (const org of orgs) {
    process.stdout.write(`  scoring ${org.key} ... `);
    const t0 = Date.now();
    const r = await runOrg(
      ctx,
      (p) => {
        ec.meter.phase = p;
      },
      (p) => ec.meter.totals((x) => x.phase === p),
      org,
    );
    results.push(r);
    console.log(`${r.metrics.scored} scored in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  console.log("");
  printTable(
    results.map((r) => ({
      org: r.org,
      opps: String(r.metrics.opportunities),
      passed: String(r.metrics.passedPrefilter),
      dupes: String(r.metrics.duplicates),
      scored: String(r.metrics.scored),
      "ndcg@5": f2(r.metrics.ndcg5),
      "ndcg@10": f2(r.metrics.ndcg10),
      "p@5": pct(r.metrics.precision5),
      eligAcc: pct(r.metrics.eligibilityAccuracy),
      falseElig: `${r.metrics.falseEligible} (${pct(r.metrics.falseEligibleRate)})`,
      traps: `${r.metrics.trapsCaught}/${r.metrics.traps}`,
      realCites: `${pct(r.metrics.realCitationRate)} of ${r.metrics.reasonsCiting}`,
      "simRecall@cap": pct(r.metrics.similarityRecallAtCap),
      calls: String(r.usage.calls),
      cost: usd(r.usage.costMicros),
    })),
  );

  for (const r of results) {
    console.log(`\n${r.org} top 10 (rank by expected value, then fit):`);
    printTable(
      r.cases
        .filter((c) => c.rank !== null && (c.rank as number) <= 10)
        .sort((a, b) => (a.rank as number) - (b.rank as number))
        .map((c) => ({
          "#": String(c.rank),
          opportunity: c.opportunity,
          goldRel: String(c.gold.relevance),
          goldElig: String(c.gold.eligible),
          fit: String(c.score?.fitScore ?? ""),
          ev: c.score
            ? `$${Math.round(c.score.expectedValueCents / 100).toLocaleString("en-US")}`
            : "",
          elig: c.eligibility,
        })),
    );
  }

  const all = results.flatMap((r) => r.cases.map((c) => ({ org: r.org, ...c })));
  const traps = all.filter((c) => c.trap);
  // Under --fake only the deterministic layer is gated (see MODEL_JUDGED_TRAPS).
  const gatedTraps = traps.filter(
    (c) => ec.mode !== "fake" || !MODEL_JUDGED_TRAPS.has(c.trap?.kind as TrapKind),
  );
  const rate = (xs: typeof traps) =>
    xs.length ? xs.filter((c) => c.trap?.caught).length / xs.length : 1;
  const totals = {
    falseEligible: all.filter((c) => c.falseEligible).length,
    trapCatchRate: rate(gatedTraps),
    trapCatchRateAll: rate(traps),
    gatedTraps: gatedTraps.length,
    errors: all.filter((c) => c.error).length,
    usage: ec.meter.totals(),
    costPerOrg: Object.fromEntries(results.map((r) => [r.org, r.usage.costMicros])),
  };
  const gates = [
    {
      name: "false-eligible cases",
      pass: totals.falseEligible <= MAX_FALSE_ELIGIBLE,
      shown: `${totals.falseEligible} (max ${MAX_FALSE_ELIGIBLE})`,
    },
    {
      name: `trap catch rate${ec.mode === "fake" ? " (deterministic traps; fake LLM)" : ""}`,
      pass: totals.trapCatchRate >= MIN_TRAP_CATCH_RATE,
      shown: `${pct(totals.trapCatchRate)} of ${gatedTraps.length} (min ${pct(MIN_TRAP_CATCH_RATE)}); all traps ${pct(totals.trapCatchRateAll)} of ${traps.length}`,
    },
    {
      name: "scoring calls completed",
      pass: totals.errors === 0,
      shown: `${totals.errors} errors`,
    },
  ];

  console.log("");
  for (const g of gates) console.log(`${g.pass ? "PASS" : "FAIL"}  ${g.name}: ${g.shown}`);
  for (const c of traps.filter((x) => !x.trap?.caught)) {
    const gated = gatedTraps.includes(c);
    console.log(
      `${gated ? "MISS " : "info "} ${c.org}/${c.opportunity} trap ${c.trap?.kind}: elig=${c.eligibility} fit=${c.score?.fitScore ?? "-"} rank=${c.rank ?? "-"}${gated ? "" : " (model-judged trap, not gated under --fake)"}`,
    );
  }
  for (const c of all.filter((x) => x.falseEligible)) {
    console.log(
      `BAD   ${c.org}/${c.opportunity} called ${c.eligibility}, gold eligible=${String(c.gold.eligible)}: ${c.gold.reason}`,
    );
  }
  for (const c of all.filter((x) => !x.eligibilityCorrect && !x.falseEligible)) {
    console.log(
      `info  ${c.org}/${c.opportunity} eligibility ${c.eligibility} vs gold ${String(c.gold.eligible)}${c.prefilter.pass ? "" : ` (prefilter: ${c.prefilter.rejections.join("; ")})`}`,
    );
  }
  for (const r of results.filter((x) => x.metrics.fabricatedFactIds.length)) {
    console.log(
      `warn  ${r.org} reasons cited unknown fact ids: ${r.metrics.fabricatedFactIds.join(", ")}`,
    );
  }
  for (const c of all.filter((x) => x.error))
    console.log(`ERROR ${c.org}/${c.opportunity}: ${c.error}`);

  const uniq = (xs: string[]) => [...new Set(xs)];
  const stubs = { replaced, db: uniq(ec.access.db), ports: uniq(ec.access.ports) };
  console.log(
    `info  stubbed: ${replaced.length} seams (see JSON) · stub ctx touched — db: [${stubs.db.join("; ")}] ports: [${stubs.ports.join("; ")}]`,
  );
  console.log(
    `info  LLM calls: ${totals.usage.calls} · tokens in/out: ${totals.usage.inputTokens + totals.usage.cacheReadTokens + totals.usage.cacheWriteTokens}/${totals.usage.outputTokens} · cost: ${usd(totals.usage.costMicros)}`,
  );
  const warnings = ec.logs.filter((l) => l.level === "warn" || l.level === "error");

  const passed = gates.every((g) => g.pass);
  const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "results");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `sourcing-${startedAt.toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(
    outFile,
    `${JSON.stringify(
      {
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        mode: ec.mode,
        model: ec.mode === "anthropic" ? ec.model : "fake-llm",
        promptVersion: MATCH_PROMPT_VERSION,
        thresholds: { MAX_FALSE_ELIGIBLE, MIN_TRAP_CATCH_RATE },
        passed,
        gates,
        totals,
        orgs: results,
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
