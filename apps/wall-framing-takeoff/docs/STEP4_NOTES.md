# Move step 4: notes for the first paid release

Prepared 2026-11-24 after step 3 (the paid path, `docs/PRICING.md`) landed dark. The
step names come from oss-monorepo `portfolio/monetization/LICENSING_TRANSITION.md`
("How one product moves"), which this session could not open (access to that
repository was refused), so these notes are built from `PROVENANCE.md`'s "Before the
first paid release" list and the task brief. Map them onto the document's own step 4
wording before acting on them.

## Gate: what has to be true before a checkout link is set

- [ ] **Third-party files.** PROVENANCE.md found no third-party licence files in the
      import. Re-checked 2026-11-24 for the files this run added: `roofoutline.mjs`,
      `materiallist.mjs`, `plans.mjs`, `billing.mjs` and their tests are new code with no
      copied source. `fixtures/` holds CC0 plans (open-house-plans) and the BSI IFC
      samples under `fixtures/BSI-LICENSE.md`; they are test corpora and must stay out of
      any packaged build.
- [ ] **Source history.** Every commit on this app's history is by the owner or agents
      working for them (check `git log --format='%an %ae%n%(trailers:key=Co-Authored-By)' -- apps/wall-framing-takeoff`).
- [ ] **Merchant of record.** No key in this repository; checkout is a hosted link
      (`checkout.mjs`). Steps under "To light it" in `docs/PRICING.md`.
- [ ] **Validate call confirmed live** against a test key (it was written from memory).
- [ ] **Public free edition.** The MIT copy in oss-monorepo `ventures/wall-framing-takeoff`
      stays online with everything that was free; its README should point to the paid
      material list here once it is on sale. That edit belongs to the oss-monorepo
      session (step 1 is a sibling's), not this repository.
- [ ] **What the buyer sees.** The material list states what it does not do (no grades,
      no structural check, no prices unless typed, skipped walls flagged at the top);
      read one real export end to end before the first sale.

## What to measure once it is lit

- Sales of the Job report per week, and refunds (merchant dashboard).
- `material_list_downloaded` against `csv_downloaded` in the browser's own usage counts
  (only visible to that visitor; there is no analytics endpoint).
- Kill or reprice: if fewer than three sales in the first 90 days on sale, the per-job
  model is wrong for this audience; fold the export back into free and let the suite
  carry the paid path.

## Open questions for the owner

1. Lemon Squeezy (fits the static page) or Paddle (what grants and the suite use)? Paddle
   would need a small worker for webhooks; Lemon Squeezy needs none.
2. Should a Job report key also work inside the suite for 30 days after it launches?
   Not promised anywhere yet.
