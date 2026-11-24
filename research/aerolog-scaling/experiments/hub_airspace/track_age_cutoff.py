"""Milestone 11bk: is a maximum track age a better transit-hold procedure than a bigger fixed radius? 11bj found the
mean burst length of Remote ID message loss, not the mean loss, sets the cost of the fixed-radius hold rule (FR), and
read that as "the procedure should bound the time since the last received message (a maximum track age)". This step
prices that procedure against FR on 11bi's stored holds, and asks what each rule's collision guarantee rests on when
the burst-length law, which no source measured, has a heavier tail than 11bj's geometric one.

Why: 11bj's "Next" list ("a track-age cut-off rule (treat a track older than A_max as unknown and hold) priced
against FR") and its limit "a geometric burst law (measured blockage is often heavier-tailed, which would move the
thresholds down)".

Model (stated before any radius or hold under this step's rules was computed).
 * Channel: 11bj's receiver-wide two-state channel at one step per broadcast period T = 1 s (a blockage shadows the
   receiver from every intruder at once; every message in a bad run lost), mean loss q = bad share, bad runs of
   length D (messages) with mean B, good runs geometric. Burst laws: geometric (11bj: P(D >= k) = (1 - 1/B)^(k-1)),
   and a discrete Pareto (Lomax) tail P(D >= k) = (s / (s + k - 1))^alpha with s set so that E[D] = B, alpha in 2.5
   and 4 (finite variance; at alpha <= 2 the expected outage wait below is infinite).
 * Age: K, the number of lost periods since the newest received message at a decision time, is a backward
   recurrence time of the alternating renewal channel: P(K = 0) = 1 - q, P(K = k) = q P(D >= k) / B for k >= 1
   (geometric D gives 11bj's law). A = L + U T + K T, U uniform (8 midpoints) as 11bi and 11bj. Exact k up to
   20 000, then log-spaced bins to 1e12 with each bin's weight put on its largest age (conservative).
 * FR (oracle): one radius sized for the true age law (11bj's rule; 11bi's sigma(A, r), P_h, c, P_v, T_tr, V).
 * FR (geometric assumed): the radius 11bj would write down, sized for a geometric law with the same q and B; its
   residual is then evaluated under the true law and reported as a multiple of the target.
 * Cut-off rule OC(A_max), distribution-free: the receiver declares surveillance lost when its newest message is
   older than A_max = L + (k + 1) T (more than k consecutive messages lost) and the transit waits until a message is
   received; otherwise every intruder is checked at one radius r(A_max) sized for the worst admissible age (P_h at
   A = A_max meets the miss budget b = Tg / c - P_v). No transit starts on a track older than A_max, and P_h grows
   with A, so the residual meets the target under any channel, burst law or age law: the guarantee needs no
   measured burst length. A_max in 3, 5, 10, 30, 60, 120 s, and the best A_max per layout on a grid of 1 to 600
   lost messages.
 * Cut-off hold per flight = FR hold at r(A_max) (11bi's stored grid, log-linear, as 11bj) + n_rule E[W 1{K > k}].
   The wait until the next received message, given K = j, is (E[D - j | D >= j] + 1/2) T, so
   E[W 1{K > k}] = T (q / B sum_{j > k} S(j + 1) + P(K > k) / 2), S(j) = sum_{i >= j} P(D >= i) (geometric:
   P(K > k) (B - 1/2) T). n_rule = 4 x the flight share of operators with a lower band (11bg: two transits at the
   hub and two at the destination, the rule only where a lower band is crossed), from the layout's own shares.
   The post-outage gap check is the unconditional FR hold (intruders independent of the channel); a second outage
   during that hold is ignored (second order).
Parameters and sources: 11bj's (L = 1 s, T = 1 s from 14 CFR 89.310 / 89.320; speed accuracy bands 0.3, 1, 3 m/s
from ASTM F3411; q 0.12, 0.5, 0.75, 0.9 about the National Taiwan University thesis's coded and uncoded urban
reception, search excerpts), sigma0 12.54 m, target 1e-7, traffic 1 and 10 times. B in 10, 30, 100 s, swept (no
measured Remote ID burst lengths were found, 11bj); alpha 2.5 and 4 swept for the same reason (no source).

Predictions (written and pushed before any radius or hold under this step's rules was computed; only 11bj's results
had been read, and a pencil estimate made of the outage term at q = 0.5, B = 10 s: about 3.6 x 0.36 x 9.5 = 12 s per
flight at A_max = 5 s):
 C1 (prior 75%) Geometric bursts, 1 m/s, q = 0.5, B = 10 s: the best OC median hold per flight (best A_max per
    layout) is above FR's (oracle) at today's traffic (both M): at the measured loss rates, waiting out an outage
    costs more than the larger radius.
 C2 (prior 30%) Geometric, coded reception (q = 0.12), B = 10 s, 1 m/s: the best OC is within twice FR's median
    hold (both M).
 C3 (prior 70%) Pareto alpha = 2.5, q = 0.5, B = 10 s, 1 m/s: FR sized for a geometric law has a residual above 3
    times the target in the median layout (both M): FR's guarantee rests on the unmeasured burst tail.
 C4 (prior 45%) Same cell: the best OC median hold is below FR's (oracle) (both M): under a heavy tail the
    distribution-free rule is also the cheaper one.
 C5 (prior 80%) Geometric, 1 m/s, q = 0.5, B = 10 s: the median best A_max is no longer at ten times today's traffic
    than at today's (both M): a dearer radius makes the outage wait relatively cheaper.
 C6 (prior 55%) Same cell, today's traffic: the median best A_max is over 30 s (both M).
Reported without a prediction: every cell's FR (oracle and geometric-assumed) radius, hold and residual multiple,
OC holds at each A_max and at its best, both traffic levels, and 3 m/s and 0.3 m/s.
Reading fixed in advance: C1 held says 11bj's "bound the time since the last message" is the wrong instrument as a
hold-and-wait rule at the measured loss rates, and the requirement to write is receiver coverage (short bursts) or
a measured burst law for FR; C3 held says FR cannot be certified without a measured burst-length tail; C4 held says
where the tail is heavy, the cut-off rule is both the guaranteed and the cheaper procedure.

    python3 track_age_cutoff.py --summarise > track_age_cutoff_results.txt   # reads stale_track.json.gz

Limits: 11bi's and 11bj's (one city, synthetic operators, straight legs, Poisson launches, no wind, the plan fixed as
traffic grows, no unseen launches, no track filter, 95% accuracy bounds, FR holds from 11bi's 300-point sample);
a receiver-wide channel (per-intruder blockage would stale tracks one at a time, and a cut-off would then hold only
for stale tracks near the transit point, which this step does not price); burst laws swept, not measured; the
wait is spent on the ground or hovering in the own band, and the hover exposure of that wait is not added (11bh
prices the hover term). Preliminary.
"""
