# ADR 0005: An independent grounding verifier that fails closed

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

Citations (ADR 0004) make claims checkable, but a model can still cite a real fact and state it wrongly:
a different number, an inflated outcome, a wrong year or an invented partner. A drafter that checks its
own work shares its own blind spots. Before any draft reaches a reviewer or the autopilot, something
other than the drafter has to check every factual claim against what it cites.

## Decision

`services/grounding` (`verifyDraft`) runs after every draft and after every edit or regeneration
(`stepVerify` in the pipeline). It has its own prompt (`VERIFY_SYSTEM`), its own `PROMPT_VERSION`, and
makes separate LLM calls (purpose `grounding.verify_claims`) that never see the drafter's reasoning.

1. **Deterministic checks first** (`checks.ts`, `numbers.ts`):
   - every number, date, dollar amount and percentage in a claim must appear in its cited facts'
     statements, values or quotes (`checkClaimNumbers`); misses become `numeric_mismatch` blockers;
   - `framing` claims must not contain numbers, proper nouns, outcome verbs or superlatives
     (`checkFramingClaim`);
   - citations to unknown, rejected or superseded facts are `unsupported_claim`/`stale_fact`
     blockers; citations to restricted facts are `restricted_data` blockers;
   - `factual` claims with no citation are `unsupported_claim` blockers;
   - required sections that are missing or empty, and drafter gaps, are `missing_info` blockers;
     going over a word or character limit is a `length_limit` warning.
2. **An LLM entailment judge** checks each factual claim against the statements and quotes of the
   facts it cites, and returns `supported`, `partially_supported`, `unsupported` or `not_checkable`.
   `unsupported` is always a blocker. `partially_supported` and `not_checkable` are blockers when the org
   has autopilot on and warnings otherwise.
3. **Citations to proposed facts** become `unconfirmed_fact` flags, escalated the same way: blockers with
   autopilot on, warnings otherwise.
4. **It fails closed.** If the judge returns no verdict for a claim, that claim is an
   `unsupported_claim` blocker. If a judge call fails, its claims become `not_checkable` and the section
   gets a blocker. Nothing unverified ever passes.
5. The output is a `GroundingReport`, stored on the `application_version`, plus `application_flags`
   rows. `passed` is true only when there are zero unsupported claims, zero numeric mismatches and zero
   gaps.

## Consequences

- Verification is about 40% of the model cost of an application: about $0.51 of about $1.30 (PRICING.md).
  We accept that cost as the price of the liability control.
- The deterministic checks catch the most dangerous mistakes (numbers and dates) without relying on a
  model, and they run the same way in fake mode.
- False positives: some correct paraphrases get flagged. That costs a reviewer a click, and is the
  safer way to be wrong.
- `pnpm eval` (`docs/EVALS.md`) adds five known fabrications to every draft and requires every one to be
  flagged (`MIN_DETECTION_RATE = 1.0`), and requires at least 90% of honest claims to be `supported`.
  Changes to the verifier's prompt or checks have to pass this.

## Alternatives considered

- **Self-check inside the drafting prompt.** Cheaper, but the drafter grades its own work with the same
  context and the same biases. It doesn't catch confident errors.
- **Only deterministic checks.** They catch numbers but not meaning: an inflated outcome stated without
  a number, or "partnered with" when the fact only says "met with".
- **A small NLI or entailment model on Workers AI.** Cheaper per claim, but weaker on long, domain-heavy
  claims, and it would add a second model to evaluate. We can revisit this for a first pass that sends
  only uncertain claims to Claude.
- **Human review only.** Doesn't scale to autopilot, and reviewers miss subtle numeric errors in long
  narratives.
