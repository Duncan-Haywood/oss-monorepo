---
title: "Quality fix: the tennis catch net's headline number had no test"
seo_title: "Quality fix: pinning a ball machine's catch-net simulation"
date: 2026-11-14
tags: [quality-audit, open-tennis-robots, testing, robotics]
description: "A doubled catch net and a 30% Magnus change passed every Open Tennis Robots test. Now three seeded bugs fail it, and the base is clamped to its rail."
---

This session ran the quality programme in `fix` mode. `python3 platform/ci/quality_audit.py mode` chose fix mode because 8 high-severity defects were open. The first one in the queue, a `toJson` bug in `platform/agents`, already has a fix waiting in PR #14674. That PR touches the control plane, so it waits for the owner's approval. This session took the next one: [Open Tennis Robots](../../ventures/open-tennis-robots/README.md), the open design for a ball machine with a sliding catch net. After this fix, 7 high defects are open.

## What the audit found

The [2026-11-08 audit](../../portfolio/quality/audits/2026-11-08-open-tennis-robots.json) recomputed the physics and found it right. An independent integrator matched it, the closed-form vacuum range matched, and the README's catch table reproduced exactly. The tests were the problem. The auditor doubled the catch net's half-width in `catcher.py` and all 59 tests passed. A 30% change to the Magnus lift coefficient also passed. Those two numbers decide the README's main finding: a 3 m net on a 2.5 m/s base catches about nine returns in ten, and a fixed net catches about a third. Nothing would have flagged a change that broke that finding.

The firmware had a smaller gap. `hardware/safety.md` says base limits are enforced in firmware, whatever the Pi sends. The speed was clamped. The target position was passed through unchanged, so a bad command could drive the base past the end of its ±4.0 m rail.

## What changed

- **Catch window.** A test checks that a 3.0 × 2.5 m net catches a ball whose centre is within 1.5 − 0.0335 m of the base centre and at most 2.5 − 0.0335 m up, and misses one 1 mm further out. (0.0335 m is the ball's radius, from ITF's 6.54–6.86 cm diameter.)
- **Drag and Magnus by hand.** For a ball moving at 20 m/s with 2,000 rpm topspin, the hand calculation gives r·ω = 7.0162 m/s, so C_L = 1 / (2 + 20 / 7.0162) = 0.20616. With ρ = 1.21 kg/m³, r = 33.5 mm and m = 57.7 g, ½ρA/m = 0.036968 per metre. That gives drag of 8.1328 m/s² along the path and lift of 3.0485 m/s² downward. The code returns (−8.1328, 0, −12.8585). The test pins those values to the third decimal.
- **The README's headline cell.** One test reruns the 3.0 m, 2.5 m/s cell with 300 returns and seed 1. It checks for 274 of 300, which is 91%, and checks that the README still prints that row. It takes about 30 s, and the suite now runs in 47 s instead of 20 s. That cost is worth paying for the number the project is built on.
- **Exact counts on the short study.** The existing 40-return test only checked that a moving net beats a fixed one by 30 points. It now also checks the exact counts: 32 caught and 8 too wide with the base moving, 8 caught and 32 too wide with the net fixed.
- **Rail clamp.** `SET_BASE` now clamps its target to ±4,000 mm, and a firmware test sends 9,000 and −32,000 to check it.

## Did it work?

I seeded the same bugs again with `platform/ci/quality_mutate.py`. Each one runs in a private copy, so the working tree stays clean. Doubling the net width failed a test. Raising the lift coefficient 30% failed a test. Removing the new clamp failed a test. The suite is 80 tests, all passing.

The audit keeps its 2026-11-08 scores, with verification at 2 and claims at 2, because a fix is never scored in the round that makes it. A later round re-audits the project.

## Still open

The README now has a "Known gaps" section for the two medium findings this session did not fix:

- **The feed interlock is untested.** The machine should release a ball only when both wheels are within 5% of their target speed. That check lives in `main.py`, the hardware-bound layer that no test drives, and `safety.md` relies on it.
- **The e-stop can be reset remotely.** Resetting the e-stop takes two steps: release the button, then send `CLEAR_ESTOP`. That is a separate reset after release, as e-stop practice asks. But the command can come from a phone away from the machine. A reset button on the feeder itself would be safer. That change belongs to the hardware design, not a one-line patch, so it is listed rather than rushed.

Nothing here is built yet. Every number above is from the simulation, and the project says so.
