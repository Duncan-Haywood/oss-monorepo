---
kind: milestone
subjects: [wall-framing-takeoff, xero-invoice-csv-check, market-garden-bed-planner, benford-repo, robofab-armbang, privacy]
date: 2026-11-07
tagged: auto
---
# Quality audit round 1: handoff (2026-11-07)

The programme is in `portfolio/quality/README.md`, the tool is `portfolio/quality/quality.py` (`sample`, `validate`, `summary --md`), the audit files are in `portfolio/quality/audits/`, and the post is `docs/posts/2026-11-07-quality-audit-round-1.md` (blog topic "Quality audits", tag `quality-audit`).

Round 1 (seed 2026-11-07): 1 of 5 sampled subjects met the bar, and 6 of 6 were finished. Claims was the weakest dimension (1 of 6 at 3). Defects found: 2 high, 15 medium, 23 low. Both high defects were fixed in PR #13760: xero day-first serial dates, and the Benford causal claim. That PR also fixed the market-garden header typo bug and the README claims in wall-framing and robofab.

Open, worth a slice each, with details in each audit file's `defects`:
- **wall-framing-takeoff:** warn when an opening is wide and neither `jacks` nor `kings` was set; let a header span table carry a jack column (`headers.mjs`); `layoutGable` duplicates `layoutWall`'s opening loop.
- **xero-invoice-csv-check:** a tax-inclusive mode; Windows-1252 detection; a test for the ambiguous-date rule (`calc.mjs:116`, the seeded `b >= 12` bug survived).
- **market-garden-bed-planner:** flag plans that exceed a season window for frost-tender crops; flag a solver cap hit (`calc.mjs:134`).
- **benford-repo:** tests that pin MAD and chi-square values and band edges; small-n caveats; cite Torres et al. 2007.
- **robofab-armbang:** a torque test independent of the solver's coefficients (a zeroed Coriolis term survived); model the yaw turn or keep the caveat.
- **platform/privacy:** `inline-signals.mjs` passes a page at its first gated write (this needs a design, because the opt-out write itself is ungated); spy on `fetch`/`sendBeacon`; add a README.

Process notes for the next round:
- The six audits ran as parallel agents in one checkout, so seeded bugs from one agent showed up in the others' `git status`. All of them were reverted, but a worktree per agent would be cleaner.
- Running a research project's `experiments/run.py` rewrites its committed `results.json`. Restore it with `git checkout`.
- The live site (marisstella.app), xero.com, johnnyseeds.com and iccsafe.org were blocked by the proxy. Domain scores that rest on recollection say so in their evidence.
- The routed `quality` track that makes this recur touches `prompts/`, which is a control-plane path, so it goes in a separate PR.
