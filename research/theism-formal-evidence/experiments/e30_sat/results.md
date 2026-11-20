# E30: a linear-size SAT encoding decides separability on K and KT frames with thousands of worlds

Prediction H34 is in `../../LOG.md`, committed before `run.py`. `results.json` is written by
`run.py` (299 s, PySAT 1.9.dev24 with CaDiCaL 1.5.3); this file is written by hand from it.

**Question.** E27 and E28 proved that deciding separability (E24's exact frame condition for
GodIsEssential without A4a over complement-closed property collections) is NP-complete on serial
and reflexive frames. The existing deciders (exhaustive search over (A, S), E27's backtracking)
stop at a few dozen worlds. Can a SAT encoding decide it on frames of realistic size, and where do
the hard instances sit?

**Encoding** (`encode` in `run.py`). For w R v and T = R*(v): variables a_x, s_x for x &isin; T, and
two per world t &isin; T with R(t) &ne; &empty;, P_t ("R(t) inside A and inside S") and Q_t ("R(t)
misses A and misses S"). Units a_v, &not;s_v and a_x for x &isin; R(w) &cap; T; for each y &isin; R(t) the
binary clauses (&not;P_t &or; a_y), (&not;P_t &or; s_y), (&not;Q_t &or; &not;a_y), (&not;Q_t &or; &not;s_y); and four long
clauses (P_t &or; &or;&not;a_y), (P_t &or; &or;&not;s_y), (Q_t &or; &or;a_y), (Q_t &or; &or;s_y). A model forces P_t to equal
both "all in A" and "all in S", and Q_t both "none in A" and "none in S", which is exactly
conditions (i) and (ii). At most 4|T| variables and 4&Sigma;|R(t)| + 5|T| + 2 clauses: linear in the
frame.

**Results.** H34 held in all five parts.

| Part | Instances | Result |
|---|---|---|
| (a) every relation on 1 to 4 worlds, every (w, v) with w R v | 526,625 triples (44,140 separable) | 0 disagreements with exhaustive search over (A, S); 0 failed witnesses; 0 over the size bound; 65 s |
| (b) E27 K and E28 KT reduction frames of random 3-uniform hypergraphs, n = 10 to 200 points, r = m/n = 0.5 to 3.5, 20 seeds per cell | 2,520 frames, up to 3,704 worlds | SAT verdict = 2-colourability by a separate NAE encoding on all 2,520; = brute-force 2-colouring on all 720 with n &le; 14; every witness checks |
| (c) speed | same | slowest SAT call 0.44 s (n = 200, r = 2.25, KT); E27's backtracking with a 5 s limit timed out on 34 of 60 runs at n = 20 and 40 |
| (d) transition at n = 200 | 20 per r | separable 20/20 at r &le; 1.75, 19/20 at r = 2.0, 0/20 at r = 2.25 and above |
| (e) random serial and reflexive frames, 300 worlds, c = 0.5 to 8 | 5,600 (w, v) pairs | E28's two sufficient tests never contradicted (0 violations) |

**Backtracking against SAT** (part 3, 5 instances at each of r = 1.5, 2.0, 2.5):

| n points | frame | runs | backtracking timed out (5 s) | slowest SAT |
|---|---|---|---|---|
| 20 | K (E27) | 15 | 0 | 1.1 ms |
| 20 | KT (E28) | 15 | 15 | 3.4 ms |
| 40 | K (E27) | 15 | 4 | 4.7 ms |
| 40 | KT (E28) | 15 | 15 | 15 ms |

Not predicted: the KT reduction defeats the backtracking decider already at 20 points (124 to 274
worlds), including colourable instances, while the K reduction of the same hypergraphs does not.
The reflexive gadget worlds come before the point worlds in the decider's order, so it branches on
gadget labels the lemma of E28 would fix by propagation; a CDCL solver propagates them at once.

**Easy-hard-easy.** Median SAT time at n = 200 (KT frame): 19 ms at r = 1.5, 61 ms at r = 2.0,
181 ms at r = 2.25, 100 ms at r = 2.5, 59 ms at r = 3.5. The peak sits where the separable fraction
crosses 1/2, the pattern known from random constraint problems (Mitchell, Selman &amp; Levesque 1992;
Achlioptas &amp; Moore 2002 for hypergraph 2-colourability). We measured the crossing (between
r = 2.0 and 2.25 at 200 points) and did not compare it to a published threshold value.

**Random frames** (part 4: 40 frames per cell, 10 sampled (w, v) pairs each; columns are counts of
400 pairs):

| class | c | v reaches w (never separable) | v on no cycle (always separable) | open | open and separable |
|---|---|---|---|---|---|
| serial | 0.5 | 54 | 288 | 58 | 9 |
| serial | 1.0 | 158 | 124 | 118 | 27 |
| serial | 1.5 | 277 | 48 | 75 | 38 |
| serial | 2.0 | 318 | 12 | 70 | 31 |
| serial | 3.0 | 374 | 1 | 25 | 19 |
| serial | 5.0 | 397 | 0 | 3 | 2 |
| serial | 8.0 | 400 | 0 | 0 | 0 |
| reflexive | 0.5 | 260 | 0 | 140 | 26 |
| reflexive | 1.0 | 195 | 0 | 205 | 74 |
| reflexive | 1.5 | 229 | 0 | 171 | 88 |
| reflexive | 2.0 | 300 | 0 | 100 | 55 |
| reflexive | 3.0 | 369 | 0 | 31 | 15 |
| reflexive | 5.0 | 394 | 0 | 6 | 4 |
| reflexive | 8.0 | 398 | 0 | 2 | 0 |

In random frames the two cheap tests settle most pairs once the mean degree passes 3, because v
then almost always reaches w (one strongly connected giant component); the open pairs, where SAT
is needed, are commonest near c = 1 (30% serial, 51% reflexive) and roughly half of them are
separable. No SAT call on these frames took over 13 ms. (No reflexive v is on no cycle, since
v R v is a cycle.)

**Reading.** Separability is NP-complete in K and KT, but that is a worst-case statement: with a
linear-size encoding a stock solver decides it on frames of several thousand worlds in well under a
second, including the reductions built to be hard, at their hardest density. For anyone who wants
to check the essence step on a concrete finite frame, the test is now practical; E27's hardness
says only that no closed-form graph condition will replace it.

**Limits.** One solver (CaDiCaL via PySAT); times are wall-clock on the session container and
include building the formula in Python. Random hypergraphs and random digraphs are not the
frames an ontological-argument author writes down; they test scale, not relevance. The encoding's
correctness is checked by exhaustion up to 4 worlds and against an independent NAE encoding at
scale, not proved in Lean.

**Citations.** D. Mitchell, B. Selman, H. Levesque, "Hard and easy distributions of SAT problems",
AAAI 1992, pp. 459&ndash;465. D. Achlioptas, C. Moore, "On the 2-colorability of random hypergraphs",
RANDOM 2002, LNCS 2483, pp. 78&ndash;90, doi:10.1007/3-540-45726-7_7, preprint arXiv:2011.04809. A. Ignatiev, A. Morgado,
J. Marques-Silva, "PySAT: A Python toolkit for prototyping with SAT oracles", SAT 2018, LNCS 10929,
pp. 428&ndash;437, doi:10.1007/978-3-319-94144-8_26. CaDiCaL (A. Biere), version 1.5.3 as bundled with PySAT.

**Not done.** A Lean proof that the encoding is correct; a structured instance family (frames
from published modal arguments) to time; Hájek's variants; Martin (2005) read directly.
