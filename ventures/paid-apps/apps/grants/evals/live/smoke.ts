// Live smoke suite: ONE real model call per LLM purpose, on tiny fictional fixtures, built with the
// modules' own prompt builders and zod schemas and sent with the effort / maxTokens of the module's
// own call site (evals/prompt-contracts). Each output must parse into the schema and pass the
// module's deterministic post-checks (verbatim quotes, known ids, numbers traceable to the input).
//
//   pnpm exec tsx evals/live/smoke.ts --dry-run          # estimate only, no network, no credentials
//   pnpm exec tsx evals/live/smoke.ts                    # real calls (ANTHROPIC_API_KEY or WIF env)
//   pnpm exec tsx evals/live/smoke.ts --only=drafting.section,grounding.verify_claims
//   pnpm exec tsx evals/live/smoke.ts --max-usd=3 --markdown
//
// Spend is capped: the run aborts before any call when the worst case (every call using its full
// maxTokens) exceeds --max-usd (default 3), and a call is skipped if its worst case could push the
// actual spend past the cap. Results go to evals/results/smoke-<timestamp>.json (gitignored).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AnthropicLlm } from "@worker/ports/anthropic-llm";
import { LlmOutputError, LlmRefusalError, type LlmUsage } from "@worker/ports/llm";
import { costMicros } from "@worker/ports/llm-pricing";
import { z } from "zod";
import { anthropicApiKey, hasAnthropicCredentials } from "../lib/credentials";
import { APP_ROOT, effectiveOptions } from "../prompt-contracts/call-site";
import { type Effort, PURPOSE_SPECS, type PurposeSpec } from "../prompt-contracts/registry";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k ?? "", v ?? "true"] as const;
  }),
);
const DRY_RUN = args.has("dry-run");
const MARKDOWN = args.has("markdown");
const MAX_USD = Number(args.get("max-usd") ?? 3);
const ONLY = args.get("only")?.split(",").filter(Boolean) ?? null;
const MODEL = process.env.LLM_MODEL || "claude-haiku-5-5";

const identity = (s: string) => s;
const usd = (micros: number) => `$${(micros / 1e6).toFixed(micros < 10_000 ? 4 : 3)}`;
/** Rough token count (chars / 4), as in docs/PROMPTS.md. */
const tokens = (s: string) => Math.ceil(s.length / 4);

/** Typical thinking + JSON per call, by effort (an estimate for planning, not the cap). */
const EXPECTED_OUT: Record<Effort, number> = {
  low: 1_200,
  medium: 2_500,
  high: 5_000,
  xhigh: 8_000,
  max: 12_000,
};

interface Plan {
  spec: PurposeSpec;
  effort: Effort;
  maxTokens: number;
  inputTokens: number;
  expectedMicros: number;
  worstMicros: number;
}

function plan(spec: PurposeSpec): Plan {
  const { effort, maxTokens } = effectiveOptions(spec.purpose);
  const r = spec.build(identity, 0);
  const schemaJson = JSON.stringify(z.toJSONSchema(r.schema, { unrepresentable: "any" }));
  // System + context are written to the cache on this first call (1.25x input price).
  const cached = tokens(r.system) + tokens(r.context ?? "");
  const uncached = tokens(r.prompt) + tokens(schemaJson) + 300; // + structured-output framing
  const cost = (outputTokens: number) =>
    costMicros(MODEL, {
      inputTokens: uncached,
      outputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: cached,
    });
  const expected = Math.min(maxTokens, EXPECTED_OUT[effort] + (spec.longOutput ? 1_500 : 300));
  return {
    spec,
    effort,
    maxTokens,
    inputTokens: cached + uncached,
    expectedMicros: cost(expected),
    worstMicros: cost(maxTokens),
  };
}

type Status = "pass" | "fail" | "error" | "skipped";
interface Result {
  purpose: string;
  status: Status;
  effort: Effort;
  maxTokens: number;
  latencyMs: number | null;
  usage: LlmUsage | null;
  costMicros: number;
  /** outputTokens / maxTokens: near 1.0 means truncation risk. */
  budgetUsed: number | null;
  problems: string[];
  output?: unknown;
}

function table(results: Result[], md: boolean): string {
  const head = [
    "purpose",
    "status",
    "effort",
    "maxTok",
    "latency",
    "in",
    "out",
    "used",
    "stop",
    "cost",
  ];
  const rows = results.map((r) => [
    r.purpose,
    r.status.toUpperCase(),
    r.effort,
    String(r.maxTokens),
    r.latencyMs == null ? "-" : `${(r.latencyMs / 1000).toFixed(1)}s`,
    r.usage
      ? String(r.usage.inputTokens + r.usage.cacheReadTokens + r.usage.cacheWriteTokens)
      : "-",
    r.usage ? String(r.usage.outputTokens) : "-",
    r.budgetUsed == null ? "-" : `${Math.round(r.budgetUsed * 100)}%`,
    r.usage?.stopReason ?? "-",
    usd(r.costMicros),
  ]);
  if (md) {
    return [
      `| ${head.join(" | ")} |`,
      `| ${head.map(() => "---").join(" | ")} |`,
      ...rows.map((c) => `| ${c.join(" | ")} |`),
    ].join("\n");
  }
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((c) => (c[i] ?? "").length)));
  const line = (c: string[]) => c.map((x, i) => x.padEnd(w[i] ?? 0)).join("  ");
  return [line(head), line(w.map((n) => "-".repeat(n))), ...rows.map(line)].join("\n");
}

/** A function boundary, so TS doesn't narrow the field to its pre-call `null`. */
const billedUsage = (h: { usage: LlmUsage | null }): LlmUsage | null => h.usage;

async function main() {
  const specs = PURPOSE_SPECS.filter((s) => !ONLY || ONLY.includes(s.purpose));
  if (ONLY) {
    const unknown = ONLY.filter((p) => !PURPOSE_SPECS.some((s) => s.purpose === p));
    if (unknown.length) throw new Error(`unknown purpose(s): ${unknown.join(", ")}`);
  }
  const plans = specs.map(plan);
  const expected = plans.reduce((n, p) => n + p.expectedMicros, 0);
  const worst = plans.reduce((n, p) => n + p.worstMicros, 0);
  const cap = Math.round(MAX_USD * 1e6);

  console.log(`Live smoke suite: ${plans.length} purposes, model ${MODEL}`);
  console.log(
    `Estimate: ${usd(expected)} expected, ${usd(worst)} worst case (every call at maxTokens); cap ${usd(cap)}`,
  );
  if (DRY_RUN) {
    const rows = plans.map((p) => ({
      purpose: p.spec.purpose,
      effort: p.effort,
      maxTokens: p.maxTokens,
      inputTokens: p.inputTokens,
      expected: usd(p.expectedMicros),
      worst: usd(p.worstMicros),
    }));
    console.table(rows);
    console.log(
      worst > cap ? "Worst case exceeds the cap: a live run would abort." : "Within the cap.",
    );
    return worst > cap ? 2 : 0;
  }
  if (worst > cap) {
    console.error(
      `Aborting: the worst case ${usd(worst)} exceeds the cap ${usd(cap)}. Use --only=… or --max-usd=…`,
    );
    return 2;
  }
  if (!hasAnthropicCredentials()) {
    console.error("No Anthropic credentials (ANTHROPIC_API_KEY or WIF env vars). Use --dry-run.");
    return 2;
  }

  let spent = 0;
  // Usage of the call in flight (set by onUsage; kept for calls that throw after billing).
  const inFlight: { usage: LlmUsage | null } = { usage: null };
  const llm = new AnthropicLlm({
    apiKey: anthropicApiKey(),
    defaultModel: MODEL,
    // Called before refusal / truncation errors are thrown, so failed calls are billed here too.
    onUsage: (_purpose, usage) => {
      inFlight.usage = usage;
      spent += usage.costMicros;
    },
  });

  const results: Result[] = [];
  for (const p of plans) {
    const base = { purpose: p.spec.purpose, effort: p.effort, maxTokens: p.maxTokens };
    if (spent + p.worstMicros > cap) {
      results.push({
        ...base,
        status: "skipped",
        latencyMs: null,
        usage: null,
        costMicros: 0,
        budgetUsed: null,
        problems: [`budget: ${usd(spent)} spent, worst case of this call ${usd(p.worstMicros)}`],
      });
      continue;
    }
    inFlight.usage = null;
    const r = p.spec.build(identity, 0);
    const started = Date.now();
    try {
      const { data, usage } = await llm.generateStructured({
        purpose: p.spec.purpose,
        system: r.system,
        context: r.context,
        prompt: r.prompt,
        schema: r.schema,
        effort: p.effort,
        maxTokens: p.maxTokens,
      });
      const parsed = r.schema.safeParse(data);
      const problems = parsed.success
        ? p.spec.postCheck(parsed.data, 0)
        : [`schema: ${parsed.error.issues[0]?.message ?? "invalid"}`];
      results.push({
        ...base,
        status: problems.length ? "fail" : "pass",
        latencyMs: usage.latencyMs,
        usage,
        costMicros: usage.costMicros,
        budgetUsed: usage.outputTokens / p.maxTokens,
        problems,
        output: data,
      });
    } catch (e) {
      const usage = billedUsage(inFlight);
      const kind =
        e instanceof LlmRefusalError
          ? `refusal (${e.category ?? "no category"})`
          : e instanceof LlmOutputError
            ? "output error"
            : "request error";
      results.push({
        ...base,
        status: "error",
        latencyMs: usage?.latencyMs ?? Date.now() - started,
        usage,
        costMicros: usage?.costMicros ?? 0,
        budgetUsed: usage ? usage.outputTokens / p.maxTokens : null,
        problems: [`${kind}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 400)],
      });
    }
    const last = results.at(-1);
    if (last) console.error(`${last.status.padEnd(7)} ${last.purpose} ${usd(last.costMicros)}`);
  }

  console.log("");
  console.log(table(results, MARKDOWN));
  console.log("");
  for (const r of results) {
    for (const prob of r.problems) console.log(`${MARKDOWN ? "- " : ""}${r.purpose}: ${prob}`);
    if (r.budgetUsed != null && r.budgetUsed > 0.75)
      console.log(
        `${MARKDOWN ? "- " : ""}${r.purpose}: used ${Math.round(r.budgetUsed * 100)}% of maxTokens (truncation risk)`,
      );
  }
  const passed = results.filter((r) => r.status === "pass").length;
  console.log(`\n${passed}/${results.length} passed; spent ${usd(spent)} of the ${usd(cap)} cap.`);

  const dir = join(APP_ROOT, "evals/results");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `smoke-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      { model: MODEL, capMicros: cap, spentMicros: spent, expected, worst, results },
      null,
      2,
    ),
  );
  console.error(`Results: ${file}`);
  return passed === results.length ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(2);
  },
);
