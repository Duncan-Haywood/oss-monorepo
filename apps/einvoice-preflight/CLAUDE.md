# apps/einvoice-preflight: E-invoice fix-and-explain (bet #3)

Zero-dependency Node. Moved here from the private repository on 2026-11-27, under the
all-rights-reserved notice in `LICENSE`; `ventures/einvoice-preflight` is the free edition and
gets only lead-magnet maintenance. Read `pro/README.md` (the paid layer) and `ROADMAP.md` first.

- Tests: `node --test pro/*.test.mjs`, `node --test worker/*.test.mjs` and
  `node --test --test-concurrency=4 *.test.mjs` (the last outlasts the 120 s tool timeout: run it
  in the background). `pro/` imports `../../packages/billing` and `../../packages/admin-metrics`
  as TypeScript through Node 22's type stripping, so those packages must be in the tree.
- Validity is decided only by deterministic code (`report.mjs` + `pro/rules.mjs`); the model only
  explains, through `pro/llm.mjs`, with a `FakeLlm` handler per purpose.
- Auto-fixes stay on the whitelist in `pro/fixes.mjs` and must re-validate.
- Every store method takes `accountId` first; invoice contents are never stored.
- Fixture and test emails use `*.example` domains. The third-party corpora under `eval/` and
  `fixtures/` keep their own licences (`PROVENANCE.md`) and stay byte-for-byte as published.
