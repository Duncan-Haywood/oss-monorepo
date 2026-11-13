# Research log: society-lanes

Newest first.

## 2026-11-13 · Milestone 1: do people in a real bidirectional corridor keep to their right, and how lane-ordered is the flow? (predictions written before any trajectory was analysed)
- Why: every `society-*` result on robots and passing side so far (`society-robotnorms`, `society-plaza`, `society-twinfidelity`, `society-sidefit`) rests on a side bias that was assumed or read off a figure (17.5% left, Moussaïd et al. 2009, Fig. 4). Before any robot is added, the programme needs the human baseline measured from real trajectories: how strongly people hold their right, and how much lane order forms, in the setting the robot simulations will later be calibrated against.
- Data: the HERMES bidirectional corridor experiments (Düsseldorf, 2009; Forschungszentrum Jülich pedestrian data archive, DOIs 10.34735/ped.2009.12 free choice, .11 symmetric, .10 asymmetric), 24 runs, 50 to 309 participants, trajectories at 16 fps from overhead stereo cameras. The corridor runs along y (walls at x = 0 and x = 3.0 or 3.6 m, measured section y = -4 to 4 m). Data are fetched by script and not redistributed; only derived statistics are committed.
- Coordinates: x, y, z in cm, z is head height (positive, so z points up). Assuming the right-handed frame this implies, a walker heading +y has their right at +x and one heading -y at -x. If the frame were mirrored every side result below would flip sign; this is stated as an assumption and checked against nothing else in this step.
- Primary analysis (fixed before running): the five free-choice runs (`bo-360-*`, no exit assigned). Ordered runs (`bot-*`, `boa-*`) are secondary because participants were told to use the left or right exit, which can sort them laterally for reasons other than convention.
- Measures: per walker, direction from the sign of net displacement in y inside the section; mean signed lateral offset toward the walker's own right, as a fraction of the half-width; "on own right" if that mean is positive. Per run and pooled: share on own right with a 95% bootstrap interval resampling walkers (pooled: resampling runs, then walkers). Lane order: per frame, 30 cm lateral bins; per bin ((N+ - N-)/(N+ + N-))^2 weighted by occupancy, averaged over frames with at least 4 walkers of each direction in the section; compared with the same statistic after shuffling direction labels within each frame (200 shuffles), reported as excess over the shuffled mean.
- **Predictions:**
  - L1: pooled over the five free-choice runs, more than 50% of walkers are on their own right, and the 95% interval excludes 50%. Prior 70%.
  - L2: in the free-choice runs the pooled share on own right is at least 0.65. Prior 35%.
  - L3: lane order exceeds the shuffled-label null in every one of the 24 runs that has enough frames to measure it. Prior 85%.
  - L4: in the free-choice runs the share on own right does not fall as entrance width (and so density) rises: Spearman over the five runs is not negative. Prior 50%.
  - L5: free walking speed (median speed in `boa-300-frei`, 50 participants) lies between 1.1 and 1.5 m/s, as a sanity check on units and frame rate. Prior 85%.
