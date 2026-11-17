# Hearth & Horizon: "The Weight in the Belfry" (agent notes, 2026-11-17)

Story: `ventures/hearth-and-horizon/stories/the-weight-in-the-belfry.md`
(text only, audio cap). Post:
`docs/posts/2026-11-17-hearth-and-horizon-the-weight-in-the-belfry.md`.

## What the next run should know

- **The BIBLE proposal's physics was wrong in two places**, and a story
  written straight from it would have been wrong:
  1. "A pendulum's horizontal force has components at the swing rate and
     twice it." No: the sideways force m g k sin θ (3 cos θ − 2 cos Θ) is odd
     in θ, so it has the odd harmonics (1, 3, 5 × the swing rate); the
     vertical force has the even ones. The resonance that rocks a bell
     tower is usually the third harmonic.
  2. "Den Hartog tuning is the fix; tuning exactly to the tower is the
     failed try." For a force at one known frequency (a bell held at a fixed
     swing by its drive), an absorber tuned to the forcing frequency with
     light damping beats Den Hartog's settings, which optimise for unknown
     frequency. Den Hartog became the failed first try. An undamped absorber
     tuned to the bell then fails on ring-up and ring-down, when the bell's
     third harmonic sweeps across the absorber's split peaks; light damping
     (2%) and more mass (2%) fix that.
  Proposals are written before the numbers are worked; check every
  mechanism with a model before drafting, not only the arithmetic.
- **The model** (scratch scripts, not committed; easy to rebuild): bell as a
  rigid pendulum (3,300 kg, r 0.55 m, L_eq 1.18 m), solved for one swing
  and Fourier-analysed; tower as one mode (484 t at the bell chamber,
  1.2475 Hz, 1.5%); damper as a second degree of freedom whose mass counts
  (φ_top/φ_bell)² = 2.02 times. Steady-state harmonic response is enough for
  a held bell; ring-up and ring-down need a time-domain run (fixed-step RK4
  at 4 ms, 400 s, runs in about a second per case in plain Python). The
  results table is in the story's closing note.
- **numpy/scipy**: the system `python3` had neither, and `pip install` went
  to a different interpreter; `python3 platform/ci/pyenv.py numpy scipy`
  printed `/usr/bin/python3.13`, which had both.
- **Next up**: the Hearth & Horizon shelf was empty after this story, so the
  run added one proposal (*Four times the wait*, Stokes settling in a
  flood-water tank) with its numbers worked.
