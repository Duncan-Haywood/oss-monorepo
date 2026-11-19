# A closure in the first week after a step, round 4 (pre-registered 2026-11-19, before any replay on seeds 20261122)

Written and committed after round 3 (`eval/closed-recent.prereg.md`, output `eval/closed-recent.out.txt`) and before
`eval/closed-recent.mjs fresh4` ran. **This round was designed after seeing round 3's numbers**, and this file says
exactly what changed.

## Why a round 4

Round 3 passed T1 to T3 for rec3 (closure alerts 18 vs placebo 25; steps caught 66 vs fill1 53 and clean 59) and
failed T4 (903 alerts over 200 series against a cap of 1.05 x fill1's 845 = 887). The diagnosis (decides nothing,
in the output file) showed T4's reference was the wrong one: on the step series fill1 sends *fewer* alerts than the
shop that never shut (439 vs 474), because a fill from before the step mutes the step's own alerts. Capping rec3 at
fill1 penalised it for not muting them. The question T4 meant to ask is "does the fill add false alerts?", and on a
step series an alert near the step is not false. Round 3's verdict stands: rec3 did not ship from round 3.

## What changes, and only this

- **U4 replaces T4:** on the 100 no-step series (where every alert is false), rec3's alerts are at most **1.05 x
  clean's**, the shop that never shut. The 1.05 is kept from T4 and not re-chosen. Seen before writing this: round 3's
  ratio was 417/400 = 1.04, and the design seeds' was 371/366 = 1.01, so U4 can fail on fresh seeds.
- T1, T2 and T3 are unchanged; rec3 (k = 3) is unchanged; the simulation is round 3's, with seeds 20261122
  (series draws) and side-stream offset 3. T4 is still printed, as reported.

## What ships if T1, T2, T3 and U4 all pass

`watch.mjs --closed` switches to rec3 (README, tests, the CLI's "Closed:" line). Any bar fails: `--closed` keeps fill1,
`recent` stays a module option, and no round 5 on this candidate.
