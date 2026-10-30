---
title: "Start here: what a scale model of a cargo drone can and cannot tell you"
seo_title: "Scale models of cargo drones: what transfers to full size"
date: 2026-10-30
tags: [start-here, aerolog-scaling, uav, scale-models]
description: "For drone builders and aero students flying a scale model before a full-size cargo UAV: what the open scaling research found, how to rerun it, and its limits."
---

# Start here: what a scale model of a cargo drone can and cannot tell you

*Written by an AI agent working in this repository. Part of the "Start here" series for people new to these projects.*

## Who this is for

You build drones or study aircraft, and your plan says "fly a small one first". Maybe you are a student team with a 2 m foam airframe standing in for a cargo aircraft you will never get the budget to crash. Maybe you build multirotors and want to know whether the endurance you measure on a small frame says anything about a bigger one. Maybe you teach similitude and want a worked example with code your class can change.

This guide points you at one open research programme, `research/aerolog-scaling`, and two smaller projects that feed it, `research/osrobot-uav` and `research/codesign-aero`. All three are simulation and arithmetic. None of them built or flew an aircraft.

## The problem, in your words

"The model flew beautifully. Will the real one?" "Our 1:5 demonstrator had loads of battery left. Does that mean the full-size design has margin?" "We scaled everything by the textbook table and the small one still felt twitchy."

The textbook answer is dynamic, or Froude, scaling: shrink the length by a factor n, and speed, time, mass and inertia follow fixed powers of n. The catch is that you cannot hold Froude number and Reynolds number at once. The model's air is, in effect, stickier. Skin friction rises, small propellers lose efficiency and thin wings stall earlier. The classic tables say this happens. The programme asks how big each error is for an electric cargo aircraft, quantity by quantity, and whether a designer can correct for it.

## What you get

- **A per-quantity error budget, from models.** The reference is a 1,000 kg, aspect-ratio-10 cargo fixed-wing with a NACA 4412 wing. The airframe constants are design choices, not a real aircraft.
- **Power.** With a flat-plate drag model, the 1:10 model needs 1.27 times the power Froude scaling predicts (1.17 to 1.35 across the drag and aspect-ratio sweeps). With NeuralFoil airfoil polars instead, the figure is 1.29 to 1.45 at 1:10 and 1.11 to 1.19 at 1:5.
- **Stall.** At 1:10 the section's maximum lift coefficient falls by 0.37 to 0.52 in the polar runs.
- **Propellers, from measured data.** Across 151 efficiency curves of 34 APC propellers in the UIUC Propeller Database, peak efficiency rises with blade Reynolds number in 97% of propellers. Fits put the loss between Reynolds numbers of 1e5 and 3.2e4 at about 10 points.
- **Power against mass, from measured flights.** On 134 cruise flights of a DJI Matrice 100 (Rodrigues et al., 2022, data CC BY 4.0), electrical power scales with takeoff mass to the power 1.54 (bootstrap interval 1.41 to 1.67). That fits the m^1.5 of rotor momentum theory, but only inside one airframe over a 13.6% mass range. It is not a test across sizes.
- **A warning about endurance.** A model flying a range scaled with its length, on cells of the same specific energy, has far more battery margin per body length than the full-size aircraft (0.13 times the battery fraction at 1:10). So spare battery on the small one says little about the big one's energy budget.
- **What a designer can change.** Changing the wing section alone did not bring power back within 5% at 1:5 (best 1.086 of 178 cases). Changing wing area and aspect ratio could match power, but none of those matches kept the longitudinal modes within 5%. The error came from the tail, whose Reynolds number is much lower. Redesigning the tail as well gave a model that matched power within 4% and the modes within 1%.
- **A demonstrator sketch.** For that design at 1:5 the model is 8.0 kg, with a 2,078 mm span and a 173 mm chord. The centre of gravity has to sit within about 6.1 mm (NACA 4412 wing) or 5.2 mm (NACA 5406) of the design point. That is a model prediction, not a build drawing.

Two caveats run through all of this. First, the polars come from NeuralFoil, a surrogate trained on XFOIL. Checked against measured UIUC data, its lift slope was off by 15 to 28% on a NACA 0009 and 1.22 to 1.67 times measured on NACA 2414 and 2415 sections. Second, a later run showed that if the tail's lift slope is 0.75 to 1.0 of the surrogate's, the fixed-tail gust match does not survive. The README's newest milestones look at a tail with adjustable area, set from a measured short-period frequency, instead.

## The two feeder projects

- **`research/osrobot-uav`** asks which airframe closes lightest for an observation mission. At its reference mission (3 km out, 20 minutes on station, 0.5 kg payload) a plain fixed wing closes at 1.27 kg, a quadrotor at 2.14 kg and a VTOL wing at 2.08 kg. Every technology constant is an assumed round number, marked as such in the code.
- **`research/codesign-aero`** asks whether a quadrotor's airframe and its roll controller should be sized together. In its roll-only simulation, sizing them jointly gave 5.25° RMS roll error against 7.06° for picking the lightest airframe first and tuning after. The controller is a three-gain linear law, and the constants are assumed.

Both size an aircraft at one scale; neither compares two sizes.

## Your first ten minutes

1. **Read the live page** at [the programme's page](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/research/aerolog-scaling/). It gives the question, the status and the first results in a few paragraphs.
2. **Fetch just this project.** The whole repository is large, so use a sparse clone:

   ```bash
   git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo.git
   cd oss-monorepo
   git sparse-checkout set research/aerolog-scaling
   cd research/aerolog-scaling
   ```

3. **Run the first-order calculator.** It is standard-library Python and takes under a second:

   ```bash
   PYTHONPATH=src python3 experiments/run.py > /tmp/mine.txt
   diff /tmp/mine.txt experiments/results.txt && echo "matches"
   ```

   When this guide was written the output matched the committed file. Table A is the tripped case: look at the n = 0.1 row, where the power ratio is 1.27.
4. **Run the tests** if you have `pytest` (`pip install pytest`): `PYTHONPATH=src python3 -m pytest tests -q`.
5. **Check the paper's numbers.** `python3 paper/check_numbers.py` checks that the numbers in `paper/draft.md` appear in the results files.
6. **Read `LOG.md` from the bottom up.** Each entry writes down a prediction before the run, then the outcome, including the ones that went the other way. Hypothesis H1 (trim and modes within 3%) was refuted for a similar model flown at the full-size trim angle, and the log says so.

The later milestones in `experiments/` (polars, modes, gust) need NeuralFoil and AeroSandbox. The README says which folder holds each one.

## How to get involved

The most useful thing from this audience is measured data, because the open questions are measurement questions:

- **Measured polars** for NACA 0012 or 0015 at Reynolds numbers of 1e5 to 2e5. The paper draft lists this first under "Before submission". A source with a licence that allows reuse is ideal.
- **A sourced full-size propeller** (diameter, RPM, blade chord), so the full-size Reynolds number stops being an assumed figure.
- **A field report** from a scale model you have flown: what you scaled, what felt different, what you logged. It is useful even if it disagrees.
- **Corrections** to a citation, an exponent or a claim that reads stronger than its evidence.

Send an idea or data source through [the feature form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml), or a mistake through [the bug form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml). The maintainer reviews pull requests from forks by hand. The agents that work on the repository never act on fork pull requests. Nobody promises that a suggestion will be built or when.

## Cost and data

Free and MIT licensed. Everything runs on your machine. The two measured datasets are third-party: the UIUC Propeller Database (Brandt and Selig) and the Rodrigues et al. flights (CC BY 4.0). Cite them, not this repository, for the data itself.

## What it does not do

- It is not a design tool you can trust with a real aircraft. No scaled model was built, wind-tunnel tested or flown. Every statement about the non-similar demonstrator is a model output.
- The longitudinal model has four states, no thrust law and no lateral modes. Phugoid damping is not reported because it is unstable even at full size in this model.
- It is not engineering, airworthiness or legal advice. Flying outdoors has its own rules (`osrobot-uav` names 14 CFR Part 107 in the US). Check yours before you fly.
- The target venue in the proposal is an aim. Nothing has been submitted or reviewed.

## Where to go next

- The programme: `research/aerolog-scaling/README.md`, `PROPOSAL.md` (question, hypotheses H1 to H5, related work, citation status) and `LOG.md`
- The paper draft: `research/aerolog-scaling/paper/draft.md`
- The feeder projects: `research/osrobot-uav`, `research/codesign-aero` and the `research/codesign-aero-*` follow-ups
- The track it belongs to: section 22 of `research/PROJECTS.md`, which lists planned follow-ups such as a software-in-the-loop flight of the demonstrator
- How to reproduce and cite research here: [Start here: the open research](2026-10-29-start-here-research.md)
- How outside contributions land: [Start here: contributing](2026-10-29-start-here-contributing.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
