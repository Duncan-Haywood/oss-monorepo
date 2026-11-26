# Grounding evals

`evals/run.ts` checks the anti-fabrication pipeline from start to finish. For each fixture org × opportunity it:

1. drafts the application with `draftApplication` (drafting module),
2. verifies the draft with `verifyDraft` (grounding module),
3. **adversarial check:** copies the draft, injects 5 known fabrications and verifies the copy again. The verifier has to flag every fabrication.

All fixtures are **fictional** (`evals/fixtures/`). Nothing comes from real tenant data.

## Running

```bash
cd apps/grants
pnpm exec tsx evals/run.ts --fake        # deterministic FakeLlm, no network: the CI smoke test (~3 s)
pnpm exec tsx evals/run.ts               # real Claude if ANTHROPIC_API_KEY is set, otherwise the fake
pnpm exec tsx evals/run.ts --org evtc    # one org (evtc | mlc)
pnpm exec tsx evals/run.ts --verbose     # echo module log lines
```

- **With a key:** uses `AnthropicLlm` with `LLM_MODEL` (default `claude-haiku-5-5`; run it with `LLM_MODEL=claude-opus-5-5` too to compare). A full run is 4 cases. Each case makes about 6 drafting calls and 2 verification passes of up to 5 calls each. Use `--org` to keep runs small.
- **Without a key / `--fake`:** uses `FakeLlm(allFakeHandlers)`, the same handlers the offline demo and tests use. Fake drafts copy fact statements verbatim. The fake judge marks a claim unsupported when it contains a content word missing from its cited facts. So the fake run tests the plumbing, the deterministic checks and the fixture design. It does **not** measure model quality.

The table goes to stdout. Full results (every metric, each detection verdict, every LLM call's usage, the stub accesses and module warnings) go to `evals/results/<iso-timestamp>.json`, which is gitignored.

## What's measured (per case)

| Column | Meaning |
|---|---|
| `cited` | % of `factual` claims that cite ≥ 1 fact id |
| `supported` | % of factual claims the verifier marked `supported` |
| `partial` / `unsup` | verifier `partially_supported` / `unsupported` counts |
| `numMis` | claims with numbers/dates/amounts that are not in their cited facts (deterministic check) |
| `framingBad` | `framing` claims that contain numbers, proper nouns, outcome verbs or superlatives (independent `checkFramingClaim` pass) |
| `forbidden` | citations of restricted, rejected, superseded or unknown facts. Each fixture includes a restricted fact and a rejected fact with an inflated number as traps |
| `gapRecall` | % of sections the facts **cannot** answer where the drafter emitted a gap. Each opportunity has one such section (IP rights, climate benefits, SOC 2 audit, hospital readmissions) |
| `wordLimit` | % of word-limited sections within the funder's limit |
| `detect` | injected fabrications flagged / injected. "Flagged" means the verdict is `unsupported`/`partially_supported`, there are unmatched numbers, or the claim has an `unsupported_claim`/`numeric_mismatch` flag |
| `tokensIn/Out`, `cost` | summed `LlmUsage` over draft + verify + adversarial verify (cost is `costMicros`, so $0 in fake mode) |

The five injected fabrications per org are: a **wrong number**, an **invented partner name**, an **inflated outcome**, a **wrong year** (each falsely cites a real confirmed fact) and an **uncited factual claim**.

## Gates (constants at the top of `evals/run.ts`)

| Constant | Value | Fails when |
|---|---|---|
| `MIN_DETECTION_RATE` | 1.0 | any injected fabrication goes unflagged |
| `MIN_SUPPORTED_RATE` | 0.9 | fewer than 90% of drafted factual claims (pooled over cases) are `supported` |
| `MIN_GAP_RECALL` | 1.0 | an unanswerable section gets prose instead of a gap |
| `MAX_FORBIDDEN_CITATIONS` | 0 | a draft cites a restricted, rejected or superseded fact |

A case that throws also fails the run. The exit code is 0 only when every gate passes.

## Adding cases

- **New opportunity:** add an `EvalOpportunity` to an org's `opportunities` in `evals/fixtures/<org>.ts`. Build the sections with `requirements([...])` and give a `wordLimit` and a funder-style `prompt`. List the keys of sections the facts cannot answer in `expectGapSections`. Avoid wording that keyword-matches the facts, because the fake drafter ranks facts by keyword overlap (`drafting/relevance.ts`). Then run `--fake` to confirm the gap shows up.
- **New org:** create `evals/fixtures/<org>.ts` exporting an `EvalOrg` (about 20–25 `fact(...)` rows mixing `confirmed`/`proposed`, at least one `restricted` and one `rejected` trap, 2 opportunities, 5 `fabrications`) and register it in `evals/fixtures/index.ts`. Use clearly fictional names.
- **New fabrication kind:** add it to `FabricationKind` (`fixtures/types.ts`) and to each org's `fabrications`. Cite **confirmed** facts so that detection never rests on an unconfirmed-fact flag alone.

## How the harness runs outside workerd

`evals/lib/context.ts` builds an `AppContext` for plain Node:

- `db`: a recording stub, so every drizzle chain resolves to `[]` / `undefined`
- unused ports (`embedder`, `vectors`, `converter`, `transcriber`, `email`, `web`): throw on access and are recorded
- `logger`: records log entries
- `llm`: wrapped in a `UsageMeter`

`run.ts` replaces `draftingDeps.orgProfile` (uses the fixture's `profile`) and `draftingDeps.styleExamples` (returns `[]`). The run prints, and stores in the JSON as `stubs`, what the modules touched. Today that is only `select feedback` from `drafting/org-context.ts#loadFeedbackNotes`.

# Sourcing evals

`evals/sourcing/run.ts` checks whether matching puts the right grants in front of people, and whether it ever calls an org eligible when it is not. Bad ranking wastes reviewer time and misses good grants. For each fixture org × opportunity it runs the matching module's own functions in the same order as `scoreOrgMatches`:

1. `prefilter` (deterministic: status, deadline, ceiling, applicant types, geography, SAM/UEI),
2. `findNearDuplicates` (collapses re-posts of the same program),
3. embedding similarity (`orgEmbeddingText` / `opportunityEmbeddingText` / `cosine`),
4. the `matching.score` LLM call (`SYSTEM_PROMPT`, `buildScoreContext`, `buildScorePrompt`), then `finalizeScore`.

It scores every candidate. In production, each run scores the top `MAX_LLM_SCORES_PER_RUN` by similarity and leaves the rest for later runs. Candidates are then ranked the way `GET /matches` and autopilot rank them: expected value first, then fit.

```bash
cd apps/grants
pnpm exec tsx evals/sourcing/run.ts --fake       # FakeLlm, no network (~1 s): CI smoke test
pnpm exec tsx evals/sourcing/run.ts              # real Claude when credentials are set
pnpm exec tsx evals/sourcing/run.ts --org lrp    # one org (jfta | lrp)
```

The table goes to stdout, followed by each org's top 10. The JSON goes to `evals/results/sourcing-<iso-timestamp>.json` (gitignored). It records each case's prefilter verdict, duplicate link, similarity rank, final score, raw model reasons, rank, and trap outcome.

## Fixtures (`evals/sourcing/fixtures/`, all fictional)

- **Orgs:** Juniper Flats Trades Alliance (`jfta`) is a construction-trades workforce nonprofit in rural Cholla County, NM, serving Native American communities. It has a UEI on file. Lakeshore Readers Project (`lrp`) is an urban adult-literacy nonprofit in Port Calder, OH. It has **no UEI** in its profile or facts. Each org has 21 facts, including one rejected, one restricted and one proposed fact, plus one project.
- **31 opportunities** modeled on Grants.gov / Simpler Grants, state and foundation listings. Each has a gold label per org: `relevance` 0/1/2, `eligible` (`true` / `false` / `"unknown"`) and a `reason`.
- **Traps** (`gold.<org>.trap`):

| Trap | Example | Caught when |
|---|---|---|
| `tribal_gov_only` | tribal housing workforce program, federally recognized tribes only | dropped, or the verdict is `ineligible` |
| `for_profit_only` | apprenticeship employer incentive for small businesses / for-profits | dropped, or the verdict is `ineligible` |
| `wrong_state` | Ohio-only trades grant for `jfta`; NM-only literacy grant for `lrp` | dropped, or the verdict is `ineligible` |
| `deadline_passed` | deadline 12 days ago | dropped by the prefilter |
| `ceiling_below_min` | $2,000 micro-awards | dropped by the prefilter |
| `near_duplicate` | a watchlist re-post of a Grants.gov listing (no opportunity number, reworded title) | collapsed by `findNearDuplicates` |
| `keyword_stuffed` | shellfish-hatchery grant whose tags list workforce/literacy/tribal terms | fit < `AUTODRAFT_MIN_FIT` **and** ranked below #5 |
| `sam_no_uei` | federal adult-ed grant requiring SAM.gov/UEI, for `lrp` | the verdict is not `eligible` / `likely_eligible` |

## Metrics

| Column | Meaning |
|---|---|
| `ndcg@5`, `ndcg@10` | NDCG of the surfaced ranking (gain `2^rel − 1`). Dropped items are absent from the ranking, and gold-ineligible items have gain 0 |
| `p@5` | share of the top 5 slots holding a gain ≥ 1 item. Empty slots count as misses |
| `eligAcc` | verdict on the gold scale (`eligible`/`likely_eligible` → true, `ineligible` → false, `unknown` → unknown) equals gold. Dropped cases use the prefilter's verdict, which is `ineligible` for every drop, so the below-minimum micro-award counts as a miss |
| `falseElig` | **the safety metric:** cases called `eligible` or `likely_eligible` when gold is `false` or `"unknown"`. The rate is over those gold cases |
| `traps` | traps caught / traps (rules above) |
| `realCites` | of the model's **raw** reasons that cite a fact id, the share citing only ids from the fact list it was given. Measured before `finalizeScore` strips unknown ids |
| `simRecall@cap` | share of gain ≥ 1 candidates that fall inside the per-run LLM cap by similarity |
| `calls`, `cost` | `matching.score` calls and `costMicros` per org ($0 in fake mode) |

## Gates (constants at the top of `evals/sourcing/run.ts`)

| Constant | Value | Fails when |
|---|---|---|
| `MAX_FALSE_ELIGIBLE` | 0 | any case is called (likely) eligible against a gold `false`/`"unknown"` |
| `MIN_TRAP_CATCH_RATE` | 1.0 | a trap is missed |

The run also fails if any scoring call errors. Under `--fake`, the trap gate covers only deterministic traps. `MODEL_JUDGED_TRAPS` (`keyword_stuffed`) is still reported, but FakeLlm scores by keyword overlap and cannot judge it. With a real model, every trap is gated. Fake-mode NDCG and precision exercise the plumbing only.

## Stubs

The run reuses `evals/lib/context.ts`, with a recording stub db and recording ports. It replaces the seams that would hit D1 or Workers AI, and lists them in the JSON as `stubs.replaced`:

- **embedder:** `FakeEmbedder` in every mode, because `bge-m3` is not reachable from Node. `simRecall@cap` is therefore a bag-of-words proxy.
- **`deps.factsForMatching` / `deps.promptProfile`:** fixture facts filtered as `getFactsForDrafting` does, and `buildPromptProfile` applied to the fixture profile.
- **The rest:** profile, project and funder reads come from the fixture. The `loadCandidates` SQL filter is not applied (the prefilter repeats it). Match upserts, metering and autopilot drafting are skipped. The stub db and ports were not touched (`db: []`, `ports: []`).

## From real use to gold labels (shortlist / dismiss)

Every `PATCH /matches/:id { status }` writes an audit-log row: `action = "match.status_changed"`, with `metadata { from, to, opportunityId }`. Applications and outcomes add stronger signals. Once SWIF and later tenants use the product, these can replace hand labels:

| Signal | Implied label |
|---|---|
| `applied` / an application submitted, or `awarded` | relevance 2, eligible true |
| `shortlisted` (kept for ≥ 7 days, not later dismissed) | relevance ≥ 1 |
| `dismissed` | relevance 0. If the dismissal reason (to add: a one-tap "not eligible / not our mission / too small / duplicate" picker) says "not eligible", eligible false |
| shown in the top 10 for ≥ 14 days and never opened | weak relevance 0. Use only to break ties |
| an eligibility check answered by staff (missing-info questions) | eligible true/false for that opportunity |

Export procedure:

1. Per org, join `opportunity_matches` (the score, rank and eligibility at the time; snapshot them when the status changes) with the latest `match.status_changed` per opportunity and with `applications`.
2. Freeze the opportunity row (title, text, applicant types, scope, dates relative to the action time) and the org's facts as of that date.
3. Write them as `SourcingOpportunity` + `GoldLabel` fixtures.

Rules:

- **Fictional fixtures stay in the repo.** Exports of real tenant data must not be committed; keep them in the tenant's own storage under `orgs/{orgId}/evals/` with consent (`DATA_POLICY.md`).
- **Correct for position bias.** Users only act on what they were shown. Weight labels by inverse rank-propensity, or sample a few random lower-ranked matches into the list for exploration.
- **Re-check label drift.** When a dismissal later turns into an application, the later action wins.

# Prompt contracts and the live smoke suite

Two layers check every LLM purpose before and during the first real-model runs. Both build requests with
`evals/prompt-contracts/registry.ts`: one `PurposeSpec` per purpose that calls the module's own system
prompt, context and prompt builders and zod schema on tiny fictional fixtures (Quillfeather Literacy
Collective, Riverbend Community Foundation). Effort and `maxTokens` are read from the module's own
`ctx.llm` call site (`call-site.ts`), so neither layer can drift from production.

## Prompt contracts (offline, in `pnpm test:unit`)

`evals/prompt-contracts/contracts.test.ts` checks each purpose for:

| Check | Fails when |
|---|---|
| `system-stable` | `system` differs between calls, or holds a date, an id, or org/funder names (it is the cache prefix) |
| `context-stable` | `context` differs between two calls for the same org/application |
| `untrusted-structure` | an injection payload in any untrusted input opens or closes a delimiting tag, adds a `<system>` tag or keeps a chat-template token |
| `untrusted-wrapped` | outside text (documents, pages, funder text, answers) reaches the model outside `<untrusted_content>` (escaped JSON counts) |
| `data-rule` | the request wraps content but `system` lacks `UNTRUSTED_CONTENT_POLICY`, or has no data-not-instructions rule at all |
| `schema-semantics` | a number, id, quote or limit field has no `.describe()` and is not named in the instructions |
| `effort` | effort is not set at the call site, or is outside the spec's range |
| `max-tokens` | `maxTokens` < 4000 (adaptive thinking shares the budget), or < 8000 for long outputs |
| `no-visible-reasoning` | the instructions or schema ask the model to write out its reasoning |

Accepted exceptions are listed, with a reason, in `KNOWN_GAPS`. A gap that stops reproducing fails the
test, so the list only shrinks. A new purpose without a spec fails the coverage test. Add a
`PurposeSpec` to `registry.ts`, mark its untrusted inputs with `u(text)` (outside text) or
`u(text, "record")` (the org's own records and metadata), and give it a `postCheck`.
`PENDING_CONTRACTS` lists purposes that were added while this suite was written and still need a spec.

## Live smoke suite (`evals/live/smoke.ts`)

This suite makes one real call per purpose (17 today) with variant 0 of each fixture. A purpose passes
when the output parses into its schema and passes the module's own deterministic post-checks. Examples:
verbatim quotes (`acceptExtractedFacts`, `quoteInText`, `verifyCandidate`), known fact, project and
criterion ids, numbers traceable to the input, `validateSearchPlans`, `validateProjectFields`,
`verifyAgainstSource`, and `postProcessSection` plus the framing check. The grounding judge must also
catch the fixture's two fabricated claims.

```bash
cd apps/grants
pnpm exec tsx evals/live/smoke.ts --dry-run                 # estimate only: no network, no credentials
pnpm exec tsx evals/live/smoke.ts                           # real calls (ANTHROPIC_API_KEY or WIF env)
pnpm exec tsx evals/live/smoke.ts --only=drafting.section,grounding.verify_claims
```

- **Spend cap.** `--max-usd` defaults to 3. The run aborts before any call when the worst case (every
  call using its full `maxTokens`) exceeds the cap. It skips a call whose worst case could push the
  actual spend over the cap. Today the expected cost is about $1.25 and the worst case about $2.95.
- **In CI.** Run the `grants-llm-evals` workflow with `suite: smoke` (Actions → grants-llm-evals → Run
  workflow). It uses the same Workload Identity Federation setup as the other suites. It first runs the
  offline prompt contracts, then the smoke suite. The table goes to the job summary, and
  `evals/results/smoke-<timestamp>.json` (every output, usage record and problem) is uploaded as the
  `llm-eval-results` artifact. A failing purpose fails the job.

### After the first deploy

Run `suite: smoke` once before turning on autopilot or inviting the first tenant, then `suite: evals`.
In the results, look at:

1. **`status`.** `error` with `output error: output truncated at max_tokens` means the purpose needs a
   larger `maxTokens` or a smaller batch. `refusal (<category>)` means a safety classifier declined the
   fictional fixture; production inputs will hit the same thing, so look at the prompt wording first.
   `fail` lists the post-check that failed, such as a non-verbatim quote, an unknown id or an untraceable
   number. Those are the failures the deterministic filters silently drop in production.
2. **`used` (output tokens / `maxTokens`).** Above about 75%, a larger real input will truncate. The
   purposes most at risk are the low-effort ones that produce long verbatim output
   (`discovery.parse_requirements`, `imports.extract_opportunity`, `eligibility.extract_criteria`,
   `watchlist.detect_opportunities`) and the two `high`-effort judges (`grounding.verify_claims`,
   `quality.rubric_review`).
3. **`latency`.** User-facing purposes are `interview.next_question` (the respondent waits on it) and
   `drafting.section`. On a tiny fixture these should take a few seconds. If one takes much longer,
   check effort before changing anything else.
4. **`cost` vs. `docs/PRICING.md`.** With `in`/`out` on tiny inputs, `out` is mostly thinking. Compare it
   with the cost model's `STAGE_TOKENS`.
5. **The grounding verdicts in the JSON.** `k2` (a wrong number) and `k3` (an invented credential) must
   not come back `supported`. If either does, stop: the anti-fabrication gate rests on this judge.

Then run `suite: evals` for the full faithfulness gates, and `suite: cost-benchmark` before you change any
price.
