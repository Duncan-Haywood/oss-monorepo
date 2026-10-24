# society-urgentdoor: should a robot yield only to people in a hurry, or to everyone?

`society-doorcost` and `society-learnrobots` treated every person at the door alike and named a mixed
population with urgent people, and a robot rule that reads urgency, as the next step. This project adds
it. **With 30% robots, 20% of people urgent (waiting costs 3× the usual), collision cost `k = 3` and
dithering cost 1, a fleet that yields only to urgent people and goes first against everyone else cuts
urgent people's cost per encounter from 1.130 to 0.676 (−40%) while normal people's cost moves from
1.051 to 1.087 (+3%). The reading fleet is individually stable (no single robot gains by deviating);
the price falls on the robots themselves, whose cost rises from 1.00 to 1.29.** Against the plain
"yield to everyone" fleet the crowd as a whole is slightly worse off (1.091 against 1.047) unless
urgent people are 40% or more of the people. Produced with AI assistance (Claude). Track 17 (`society`,
`PROJECTS.md`). Every result is about simulated agents following a stated rule, not real people or robots.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/society-urgentdoor/

## Builds on

`society-doorway` (go-or-yield game, logit people with memory of `m = 9` partners, `beta = 8`, mean field;
imported unchanged), `society-doorcost` (the threshold analysis; its individual-stability test is reused
per partner type) and, through them, Smith and Price (1973), *Nature* 246:15–18 (Hawk–Dove), McKelvey and
Palfrey (1995), *Games and Economic Behavior* 10:6–38 (logit response) and Young (1993), *Econometrica*
61(1):57–84 (memory of recent partners). Nothing is reproduced; the rules are standard.
**Lab tags:** HIRO and CAIRO only loosely; no method of theirs is used.

## Method

- Costs per encounter as in `society-doorway`: both go `k`, both yield `d`, a yielder to a goer waits. The
  waiting cost is the yielder's own: `w = 1`, or `wu·w` for an urgent person (`wu = 3` unless varied).
- A share `u` of people is urgent. People do not see a partner's urgency; they play the logit response to the
  share of their last `m` partners who went. Robots read their partner's urgency and go with probability `gU`
  (partner urgent) or `gN` (otherwise). Robot–robot meetings use `gN`.
- Mean field: the share of partners who go is `q_X = r g_X + (1 − r) h`, with `h` the share of human partners
  who go, the fixed point (by bisection) of `h = u·pU(q_U) + (1 − u)·pN(q_N)`.
- Fleet rules: `yield-all` (0, 0), `reader` (`gU = 0`, `gN = 1`: yield to urgent people, go against the rest),
  `reader-half` (0, 0.5), `go-all` (1, 1) and `reverse` (1, 0). Best rules are searched on an 11 × 11 grid.
- Stability: one extra robot's gain from going rather than yielding is computed separately against urgent and
  against normal people; a rule is stable if neither type tempts a deviation.
- An agent-based simulation (400 agents, 500 rounds, 5 seeds) checks the mean field.

## Results (`experiments/results.txt`, seeded and deterministic)

**A. Fleet rules** (30% robots, 20% urgent, `wu = 3`, `d = 1`). Cost per encounter, lower is better; S = individually stable.

| k | rule | urgent | normal | robots | everyone | S |
|---|---|---|---|---|---|---|
| 3 | yield-all | 1.130 | 1.051 | 1.000 | 1.047 | yes |
| 3 | reader | **0.676** | 1.087 | 1.294 | 1.091 | yes |
| 3 | reader-half | 0.887 | 1.092 | 1.028 | 1.044 | no |
| 3 | go-all | 1.584 | 1.087 | 1.563 | 1.300 | no |
| 1.5 | yield-all | 0.810 | 0.864 | 1.000 | 0.898 | yes |
| 1.5 | reader | 0.586 | 1.016 | 0.966 | 0.941 | yes |
| 5 | yield-all | 1.432 | 1.120 | 1.000 | 1.128 | yes |
| 5 | reader | 0.859 | 1.083 | 1.820 | 1.273 | yes |

The reader is the best rule for urgent people at all three `k`, and for people overall (urgent and normal
together) at `k = 3` and 5. Counting robots too, `yield-all` is best at `k = 1.5` and 5; at `k = 3` the grid
best is a mixed `gN = 0.3` (1.044 against 1.047 for `yield-all`), which is not individually stable. Of the
stable rules at `k = 3`, `yield-all` is cheapest for the crowd and `reader` for urgent people.

**B. How much urgency is needed** (`k = 3`, 30% robots; change from `yield-all` to `reader`). Urgent people
gain 0.19 to 0.52 per encounter in every row; normal people lose at most 0.08 and gain slightly once urgent
people are 40% and `wu ≥ 3`. The crowd as a whole (robots included) only gains in that corner (−0.024). Rows with
`wu = 1` are a control: the "urgent" group is no different, and the reader merely moves cost from one group to the other.

**C. Stability.** In the reader fleet, one robot loses 1.96 to 2.00 by going against an urgent person (they nearly
always go) and gains 0.25 to 0.98 by going against a normal person, at 10% to 70% robots. The rule is self-enforcing.

**D. Simulation vs mean field** (`k = 3`): urgent 0.661 ± 0.007 (mean field 0.676), normal 1.086 (1.087), robots 1.287 (1.294)
under the reader; yield-all and go-all agree within 0.01.

## Limitations

- Robots read urgency perfectly. A wrong or spoofable reading (people pretending to hurry) is not modelled, and
  is the obvious weakness of the rule; so is the cost of reading itself.
- Urgent people are a fixed type; urgency does not change over time, and people do not see partners' urgency.
- The robots' own waiting cost is `w = 1` and is counted equally with people's in "everyone"; an owner who
  weights robot delay less will favour the reader more.
- Random pairing, fixed costs, no geometry. Costs are chosen round figures (`k`, `d`, `wu`) swept over a range,
  not measured at any real door.

## Next steps

1. Noisy urgency readings and strategic faking: how much faking tips the reader back to yield-all?
2. Robots that learn `gU` and `gN` from their payoffs (as `society-learnrobots` did for one `g`).
3. A door with geometry, joining `society-plaza`.

## Reproduce

`python3 experiments/run.py` (about a minute); tests: `python3 -m unittest tests/test_model.py`.

## Owner steps

None.

## Outside dependencies

None: Python standard library only.
