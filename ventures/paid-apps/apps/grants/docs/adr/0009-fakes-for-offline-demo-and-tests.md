# ADR 0009: Deterministic fakes for every external service, for tests and the offline demo

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

About 30 agents built the app in parallel, with no API keys and often no network. The product depends on
services that can't run locally or that cost money on every call: Claude, Workers AI (embeddings,
`toMarkdown`, Whisper), Vectorize, Resend email, the public web (crawling, Grants.gov) and Paddle. Tests
must be deterministic and free, and the owner must be able to demo the whole flow (sign up, upload,
interview, match, draft, verify, review, submit) on a laptop with no keys.

## Decision

- **Every external service is a port** (`src/worker/ports/*.ts`), and `context.ts` picks the real or
  fake adapter. `isFake(env)` is true when `FAKE_EXTERNALS=true` or `APP_ENV=test`. Fakes are used
  only when you ask for them. In real mode, a missing `ANTHROPIC_API_KEY` makes every LLM call fail with
  503 `llm_not_configured`, so a real deployment never quietly returns fake output.
  - `FakeLlm` (`ports/fake-llm.ts`) answers by **`purpose`**. Each module registers its handlers in
    `services/<module>/fake-llm.ts`, and `ports/fake-llm-handlers.ts` combines them. Handler output must
    pass the request's zod schema. Tests override handlers with `fake.on(purpose, fn)`.
  - `ports/fakes.ts`: `FakeEmbedder` (bag-of-words hashing), `InMemoryVectorStore`,
    `FakeDocumentConverter`, `FakeTranscriber`, `FakeEmailSender`, `FakeWebFetcher`.
    `ports/billing/fake.ts`: `SignedFakeBillingProvider`, which verifies HMAC signatures like Paddle.
- **Fake handlers are honest by construction.** The fake drafter copies fact statements word for word,
  and the fake judge flags content words that are missing from the cited facts. Fake mode therefore
  exercises the real anti-fabrication plumbing and deterministic checks. It does not measure model
  quality.
- **Things run inline in tests and the demo.** `enqueue()` runs jobs inline when `APP_ENV=test` or
  `INLINE_JOBS=true`. The pipeline runs its steps inline (`runsInline`) in tests and fake mode, or when
  no Workflow binding is present.
- **Offline content:** in fake mode, discovery loads a labelled sample catalog
  (`discovery/sample-opportunities.ts`) instead of calling Grants.gov, and billing treats an org with no
  subscription as comp.

## Consequences

- `pnpm test:worker` runs in real workerd with local D1, R2, Queues and Workflows and no network.
  `pnpm test:e2e` runs the real app in a browser in offline demo mode (`scripts/e2e-server.sh`).
- Every new LLM purpose needs a fake handler, or fake mode fails loudly (`FakeLlm has no handler for
  purpose …`). This is a rule in CLAUDE.md and CONTRIBUTING.md.
- Fakes can drift from real behaviour. Real-model quality is checked separately by `pnpm eval` and the
  `grants-llm-evals` workflow, which authenticates through Anthropic Workload Identity Federation. It is
  run by hand because it spends tokens.
- Inline jobs hide concurrency and retry behaviour. Code that depends on queue semantics (retries,
  dead-letter queue, batching) needs a targeted test.
- The fake vector store and fake singletons live per isolate, so demo state can reset when the dev
  server restarts. D1 and R2 data persist in `.wrangler/state`.

## Alternatives considered

- **Recorded HTTP fixtures (VCR-style).** Realistic, but brittle when prompts change, unusable without
  first recording against a real key, and they contain real model output.
- **Mocking modules in each test.** Fast, but it doesn't give a runnable demo and it duplicates fakes
  across tests.
- **A shared staging deployment with real keys.** Still useful later for smoke tests, but it costs
  tokens on every run and gives non-deterministic results.
