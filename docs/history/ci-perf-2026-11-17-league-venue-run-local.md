# Perf, 2026-11-17: league-schedule-generator, the venue search's run move priced locally, and two leads that didn't pay

Perf track, `perf/0`. Both open perf backlog items (P063, P064) touch
`.github/`, which CODEOWNERS holds for the owner, so this run took the
slowest venture suite in `platform/ci/venture_suite_times.json`
again: league-schedule-generator (626.8 s under the four-suite pool). The
last pass (`ci-perf-2026-11-16-league-serial-once.md`) found the suite close
to CPU-bound, with the tests no longer repeating searches. Further gains need
the search itself to cost less CPU, and that also helps the people using the
page.

## Reading

`node --cpu-prof`, self time per function, this 4-core container:

- Three 12-team carry-over tries (`carryOverTry(12, i)`, the shape most tests
  use): `coeOf` inlined into the annealer's two cost closures is 45%,
  `teamSwapRounds` 9%, `anneal` 9%, `assignVenuesOnce` 7%.
- One 30-team weighted search (`lowCarryOverRounds(30, { breakWeight: 10 })`,
  5.3 s): `assignVenuesOnce` 34.5% self, plus `assignVenues`, `local`, `imb`
  and `teamBreaks`, about 48% in the venue search. The carry-over costs are 32%.

## Lead 1, not taken: an incremental carry-over value in the annealer

Each annealing move recounts `coeOf` over every team's whole season (N x R
cells) although a move changes two rounds, or a few teams. A tracker that
drops the steps next to the changed rounds before a move and adds them back
after it produced **byte-identical** results (367 searches, n = 3 to 22, cyclic
and weighted, one SHA-256 over the outputs, same before and after). But it was
**slower**: 12 teams 1.32 s -> 3.29 s (first version), 2.19 s (leaner second
version). Why:

- Dropping and re-adding each step costs twice what counting it once does, and
  twice again when the move is rejected (most moves are rejected).
- A round swap touches every team: about 6 steps x N teams x 2 against
  `coeOf`'s N x R. At 12 teams that's 144 against 132.
- A team swap over many rounds touches most teams and most rounds. The
  second version falls back to a full recount there, and that recount, built
  from the tracker's per-step function, was slower than `coeOf`'s tight loop.

`coeOf` at these sizes is already a few hundred integer operations with a
stamped scratch table (`ci-perf-2026-11-11-league-schedule-coe-scratch.md`).
An incremental scheme pays only at 20+ teams, and the tests run 10 to 12. The
code is not kept. Its outline is above if a later run targets 30+ team
leagues.

## Lead 2, not taken: `coeOf` round by round

The same count walked round-major (each row read once, every team's last
opponent kept in a scratch array): equal values on every table checked, and in
a micro-benchmark 25 to 30% faster at 20 and 32 teams but 10 to 15% slower at
10. Gated at N >= 16, whole searches moved 0 to 7% (16 to 32 teams, two
alternating runs each), inside run-to-run noise. Not kept.

## Change: the venue search's run move priced from the flipped rounds

`assignVenuesOnce` has two moves. A single flip is already priced locally
(`local(r, t)`, the breaks next to round r). The run move flips team t's
matches over rounds a..b and was priced by recounting `teamBreaks` over the
whole season for t and each opponent in a..b: (b - a + 2) x R work for a change
that sits next to the flipped rounds.

Now each touched team's breaks after the flip are `tb[x]` (its current breaks,
already kept exact by both moves) plus the change in `local()` summed over the
rounds where its venue flipped: a..b for t, and for an opponent the rounds in
a..b where it meets t. If two flipped rounds are next to each other, the pair
between them is counted from both sides, before and after alike, so it cancels.
A pair with both rounds flipped keeps its break status anyway. The `touched` list, its order,
duplicates (counted twice, as before) and every integer in `d` are unchanged,
so the same random draws make the same accept/reject decisions.

## Verification

- `node eval/search-hash.mjs` (the venture's own guard for search speed-ups:
  142 seeded searches, single and double, weighted, capped, cyclic, both venue
  searches): `0e128af3...7404` for the old file and for the new.
- The 367-search hash above (n = 3 to 22, cyclic, break weights 0 / 3 / 20,
  tries single and double): `70114586...070b` before and after.
- `python3 platform/ci/run_venture_tests.py league-schedule-generator`: see
  the run record's notes for the pass line and wall time.

## Numbers (this container, 4 cores, nothing else running, two alternating runs)

`assignVenues` alone, three seeds on a shuffled circle timetable, ms:

| teams | before | after |
|---|---:|---:|
| 10 / 9 | 161, 143 / 50, 52 | 161, 150 / 50, 52 |
| 12 / 11 | 106, 103 / 78, 97 | 125, 110 / 95, 83 |
| 20 / 19 | 407, 447 / 319, 336 | 394, 359 / 292, 272 |
| 30 / 29 | 1228, 1202 / 952, 911 | 910, 874 / 632, 660 |

Whole searches (`lowCarryOverRounds`), ms: 30 teams weighted 5318, 5019 ->
4764, 4651 (about -9%); 32 teams 791, 697 -> 664, 596 (about -15%); 24 teams
1065, 1023 -> 1005, 993; 16 to 21 teams within noise.

So the gain is for **big leagues** (20 teams and up). At 10 to 12 teams, where
most of the test suite runs, the venue search is a small share and run
lengths are short, so the suite's wall time doesn't move in a way this
container can measure.

## Not changed, ranked for the next run

1. The suite's CPU is in carry-over annealing at 10 to 12 teams, where
   `coeOf` is about 45% of the time and already tight. More test speed needs
   fewer annealing iterations in the tests (a test-design change: the
   iteration budget is part of what many tests assert), or committed fixtures
   for tries that are only inputs (floor-priced's twelve 12-team tries, the
   last note's item 2).
2. Incremental carry-over (lead 1) for 30+ teams only, where N x R dwarfs
   the per-step overhead; measure at 30 and 40 teams before writing it.
3. `assignVenuesOnce` still copies every round's venues on each new best
   (`venues.map(slice)`); lazy copying would save allocations, GC was under 2%.
4. P063 and P064 remain owner-gated.
