# quick-pick-survey: simulations in the blocking test gate (2026-11-02, perf)

Reading: `python3 platform/ci/ci_profile.py --runs 600 --top 25`. After Pages and
Portfolio validate (both worked on in recent passes), the largest
unworked consumer is **quick-pick-survey CI**: 5 jobs, 39.2 job-min, median
582 s, heaviest step Test (21.2 min).

Profile: `npx vitest run --reporter=verbose` in `ventures/quick-pick-survey`
(4 cores). The default `include` picks up every `*.simulation.test.ts`, which
are measurement experiments for `docs/INFORMATION-GAIN-SELECTOR.md`:

- `poolCap.simulation.test.ts` "500 items, 2000 answers": 177.9 s.
- `hybridDip` 30 items at 120/300/600 answers: 25.9 s.
- The "information-gain selector vs shipped, 220 items, 300 answers" cell is
  recomputed in four files (14.6 to 15.9 s each), the 41-item cell too (7.5 to 8.2 s).
- The complete run did not finish in 500 s locally; the 500/4000 and
  600/1000-item cells were still pending.

Not changed in this run: I stopped at the reading. A speed-up must keep every
assertion, so the fix (own config + parallel or scheduled job, and memoising
the duplicated cells) needs care and a before/after on CI. Filed as backlog
item P061 with the numbers. Ranked next steps: 1) memoise duplicated cells
(same answers, about 1 min saved per run); 2) split simulations into a
parallel job; 3) decide with the owner whether the 500/4000 cell belongs in
a blocking gate at all.

## Follow-up (2026-11-02): config split landed, workflow change still needed

`ventures/quick-pick-survey` now has `npm run test:fast` (all but
`*.simulation.test.ts`; 246 tests in about 10 s locally) and
`npm run test:simulations` (the 9 simulation files, 1 h timeout). `npm test` is
unchanged, so CI loses no coverage. The remaining step is a `.github/` edit
(control plane, owner approval): run the two scripts as parallel steps or jobs
in `quick-pick-survey-ci.yml`, with simulations path-scoped or scheduled.
