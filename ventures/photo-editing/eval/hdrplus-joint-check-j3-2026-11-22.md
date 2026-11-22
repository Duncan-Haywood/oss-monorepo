# `mpcws` with the shipped luma ramp: a third blind draw from the full HDR+ set (J3, 2026-11-22)

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "next mpcws, colour ramp only, h4 vs the oracle").
J1 and J2 (`eval/hdrplus-joint-check-2026-11-22.md`) found `mpcws` on its refit ramps gains about +0.08 dB colour
and +0.10 dB luma over what ships across 247 fresh bursts with no new loser to directional, but fails "no burst
over 0.1 dB worse" (h4) on both draws. J2's three losses were all luma and all came from the candidate's luma
ramp (1.0, 2.0); `mpcws` on the shipped ramps lost under 0.1 dB on each. And the oracle (the true noise on its own
ramps) also failed h4 on J2's draw, so the absolute h4 is partly the score's own noise.

## The rule (committed before the third draw was fetched)

**Arm `j3`:** the `mpcws` noise read, colour ramp (0.3, 1.0), the shipped luma ramp (0.8, 1.5), all lifted by
`NEAR_DETAIL` 12; on a frame where the `mpcws` read's sigma at 18% grey is under 0.25 x the shipped read's
(`COLLAPSE`, fixed in J2), exactly `ship` (read and ramps). Reported beside it, deciding nothing: `colour_only`
(the same with no fallback) and every J1/J2 arm.

**Draw:** 240 bursts, `random.Random(20261124)`, from the full set (`storage.googleapis.com/hdrplusdata/20171106`)
less the 153-burst subset, J1's 240 and J2's 240 (`hdrplus-joint-check-bursts3-2026-11-22.txt`). Same prep, same
skips (no NoiseProfile, size mismatch, over 25% masked). No burst is added or dropped after scoring starts.

**Tests, `j3` against `ship`:** J1's h1, h2 and h3 unchanged, and

- **h4o** (decides): no burst more than 0.1 dB under `ship` on luma or colour *where the oracle on its own ramps
  (`true_pick`, (0.2, 0.8) / (0.8, 1.5)) is not also more than 0.1 dB under `ship`*. A loss the truth itself takes
  is the scene's or the score's, not the read's.
- **h4** (absolute, the J1/J2 bar): reported beside it.

**A pass** of h1, h2, h3 and h4o adds the pair as a named option (`--noise-read mpcws` with these ramps and the
fallback) and opens the drawn-noise check on Bayer files no ramp fit has used; it does not change the default
(every burst is a 10-bit Google phone). **A fail** keeps `mpcw` and the shipped ramps, and the failing bursts say
what the next read must handle. Code: `tools/hdrplus_joint_check.py` (arms `colour_only`, `j3`; test `h4o`).

## Result

(pending)
