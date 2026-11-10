# Proposal: hanger-codesign, designing a laundry robot's hangers in a cloth simulator that is good enough, and knowing when it is

Opened 2026-11-10 from research track 18 (`hanger`, `research/PROJECTS.md`), which by then held
25 single-step `hanger-*` projects and no programme. Produced with AI assistance (Claude). No
result in this file is a measurement of real cloth.

## Question

When the hangers of a laundry-hanging robot (a rack of k fixed shapes, or one adjustable hanger
the robot sets per garment) are chosen by optimising a cloth simulation, how much simulator
fidelity and how much knowledge of each fabric's measured properties does that loop need before
the design it returns is still the best design on a validated, calibrated cloth solver, and can
the loop certify that from cheap models alone?

It is open because every design in this repository's track so far (`hanger-fit`, `hanger-3d`,
`hanger-knit`, `hanger-kes`) comes from our own planar chain or coarse 3D sheet, neither of which
has been compared with a measured drape, and because the cloth-parameter literature (below) fits
parameters to reproduce shapes, not to rank designs: nobody has asked how wrong a simulator can be
and still pick the right tool.

## Why it matters

A robot that hangs every garment from a dryer has to carry a few hanger types or an adjustable
one, and the shape of those hangers decides whether the clothes come out pressed or with
shoulder bumps. Designing them by simulation is the cheap route (no tooling, a printed prototype
per candidate at most, `hanger-print`), but only if the simulator's ranking of designs survives
the sim-to-real gap. The general question, how much fidelity a design loop needs before its
decisions stop changing, is the core of the digital-twin theme of `prompts/research/`, and a
hanger is an unusually clean case of it: a rigid part, a deformable workpiece, a scalar quality
score, and fabrics with standard, published measurements (KES-FB, Cusick drape). An answer tells
a garment-handling robotics group (and anyone designing grippers, fixtures or forms for cloth)
which solver tier and which fabric tests a design study actually needs.

## Related work

Cloth simulation and contact

- Baraff and Witkin (1998), large steps in cloth simulation, SIGGRAPH, doi:10.1145/280814.280821. Implicit spring cloth; our 3D sheet uses its spring topology. Says nothing about accuracy against measured drape.
- Bergou et al. (2008), discrete elastic rods, *ACM TOG* 27(3), doi:10.1145/1360612.1360662. The turning-angle bending energy of our chain and sheet; validated on rods, not on fabric drape.
- Narain, Samii and O'Brien (2012), adaptive anisotropic remeshing for cloth simulation (ARCSim), *ACM TOG* 31(6), doi:10.1145/2366145.2366171. An open solver that resolves creases by remeshing; a candidate high-fidelity rung. Graphics accuracy, not design decisions.
- Li, Kaufman and Jiang (2021), codimensional incremental potential contact (C-IPC), *ACM TOG* 40(4), doi:10.1145/3450626.3459767 (arXiv:2012.04457). Intersection-free frictional cloth contact with strain limiting; the strongest open candidate for the hanger-arm contact our penalty model approximates.

Measuring cloth and fitting simulator parameters

- Wang, O'Brien and Ramamoorthi (2011), data-driven elastic models for cloth, *ACM TOG* 30(4), doi:10.1145/1964921.1964966. Piecewise-linear stretch and bend models fitted to ten measured fabrics; shapes, not rankings.
- Miguel et al. (2012), data-driven estimation of cloth simulation models, *Computer Graphics Forum* 31(2), doi:10.1111/j.1467-8659.2012.03031.x. Fits several common cloth models to measured deformations and shows each fits some tests better than others: evidence that the model tier matters.
- Clyde, Teran and Tamstorf (2017), modeling and data-driven parameter estimation for woven fabrics, SCA, doi:10.1145/3099564.3099577. Orthotropic hyperelastic model with a measurement protocol; again judged on reproduction error.
- Feng, Huang, Xu and Wang (2022), learning-based bending stiffness estimation by a drape tester, *ACM TOG* 41(6) (SIGGRAPH Asia), doi:10.1145/3550454.3555464. Estimates bending parameters from Cusick drape-test depth images over hundreds of real fabrics; the closest route to calibrating our solver from a standard test.
- Cusick (1968), the measurement of fabric drape, *J. Textile Institute* 59, T253–T260 (no DOI found; the drape coefficient this programme validates against). Kawabata (1980), *The Standardization and Analysis of Hand Evaluation*, Textile Machinery Society of Japan: the KES-FB tests whose B and W `hanger-kes` sourced.

Cloth robotics and its sim-to-real gap

- Blanco-Mulero et al. (2024), benchmarking the sim-to-real gap in cloth manipulation, *IEEE RA-L* 9(3), doi:10.1109/LRA.2024.3360814 (arXiv:2310.09543). Measures MuJoCo, Bullet, Flex and SOFA against real recordings after system identification; the gap is in shape distance, and design decisions are not studied.
- Lin, Wang, Olkin and Held (2020), SoftGym, CoRL, arXiv:2011.07215. Simulated cloth benchmarks used to train policies; no calibration to measured fabrics.
- Ha and Song (2021), FlingBot, CoRL, arXiv:2105.03655, and Avigal et al. (2022), SpeedFolding (authors' PDF, https://h2t.iar.kit.edu/pdf/Avigal2022.pdf). Learned cloth manipulation trained largely in simulation; the robot side of the cell (`hanger-foldsrc` uses SpeedFolding's times).
- Chen, Wei et al. (2024), RoboHanger: learning generalizable robotic hanger insertion for diverse garments, arXiv:2412.01083. Inserting a stock hanger into garments with a sim-trained policy; it takes the hanger as given, where this programme designs it.

Design under model uncertainty and multi-fidelity

- Hansen (2016), the CMA evolution strategy: a tutorial, arXiv:1604.00772. The proposer of every hanger design loop so far.
- Kennedy and O'Hagan (2000), predicting the output from a complex computer code when fast approximations are available, *Biometrika* 87(1), doi:10.1093/biomet/87.1.1. Autoregressive multi-fidelity surrogate; the baseline for a cheap-plus-expensive design loop (DOI from memory, not looked up this run).
- Peherstorfer, Willcox and Gunzburger (2018), survey of multifidelity methods in uncertainty propagation, inference and optimisation, *SIAM Review* 60(3), doi:10.1137/16M1082469. Adaptation, fusion and filtering strategies; none applied to cloth design.
- Beyer and Sendhoff (2007), robust optimization: a comprehensive survey, *Computer Methods in Applied Mechanics and Engineering* 196, doi:10.1016/j.cma.2007.03.003. Minimax and expectation objectives under parameter uncertainty (DOI from memory, not looked up this run).

Our own earlier steps (prior work, cited as such): `hanger-fit` (2D chain and CMA-ES design loop), `hanger-3d` (3D sheet; matches the chain on a deep arm, arm depth drives the error), `hanger-sweep` and `hanger-knit` (assumed fabric sweeps), `hanger-kes` (four fabrics with published KES-FB B and W: the width rule holds), `hanger-insert` (insertion perimeter bound), `hanger-print` (printable shapes).

DOIs and arXiv ids above were confirmed by web search on 2026-11-10 except the two marked; the
DOI registry (`api.crossref.org`) refused this session, so `research/_shared/cite_check.py` could
not run.

## Gap

The cloth-parameter papers fit a simulator to reproduce measured shapes; the cloth-robotics
papers measure a sim-to-real gap in shape distance; multi-fidelity design methods have not been
applied to cloth. The narrow claim to be checked: **a decision-level fidelity criterion for
cloth-contact design**, the smallest simulator tier and fabric-test set at which a hanger design
loop's chosen design (and the regret of that choice on the top tier) stops changing, measured on
an open validated solver calibrated to published drape and KES data, plus a multi-fidelity loop
that certifies the choice from the cheap tiers. Nothing in the related work above ranks rigid
tool designs for cloth across solver tiers.

## Hypotheses

- **H1 (rank robustness).** The ranking of stock and designed hangers by shape error is the same
  across the 2D chain, the 3D sheet and a validated solver for fabrics inside the published KES
  range. Refuted if the top tier's best design is not the chain's best on any fabric whose B and
  W are measured, by more than the top tier's own seed or mesh noise.
- **H2 (what the fabric test must give).** Bending rigidity and weight (KES-FB2 and areal
  density) are enough to pick the design; shear and tensile measurements change the choice's
  regret by under 10%. Refuted if adding them changes the chosen design on any measured fabric.
- **H3 (the solver must be calibrated).** An uncalibrated top tier (default material parameters)
  ranks designs differently from the same tier calibrated to Cusick drape coefficients on at
  least one fabric. Refuted if calibration never changes a choice, which would say the cheap tiers
  need no calibration either.
- **H4 (multi-fidelity pays).** A Kennedy–O'Hagan style two-tier loop reaches the top tier's
  best design within 5% regret at under a quarter of the top-tier evaluations of single-tier
  CMA-ES. Refuted if it does not at equal budget on the standard garment set.

## Method

Theory: define the decision regret of a design chosen on tier t, evaluated on the top tier, and
bound it by the tier's error on the score difference between the two best candidates (a margin
argument: if the tier-to-tier error on score differences is below half the top-tier margin, the
choice cannot change). Estimate that error on paired designs instead of absolute errors, which is
what the related work reports.

Experiments, each on real tools and published data:

1. Tiers: our 2D chain, our 3D sheet, and an open validated solver (ARCSim or C-IPC; licence and
   build checked first), all on the same garment geometry and hanger CAD (`hanger-print`).
2. Fabrics: the four KES-FB fabrics of `hanger-kes` first, then any open table that gives B, W
   and a Cusick drape coefficient for the same fabric (Feng et al. 2022 and the textile literature
   are the first places to look; a table is used only if its licence allows).
3. Calibration: fit each tier's bending and stretch parameters to the measured drape coefficient
   of a simulated Cusick test (18 cm disc, 30 cm specimen), then check the fit on a held-out
   fabric before using it for design.
4. Design loops: CMA-ES (Hansen 2016) and random search at equal budgets on each tier; the
   multi-fidelity loop of H4; robust (minimax over the fabric set) versus nominal objectives.

## Evaluation

Metrics: shape error (cm RMS from the worn shape, over the whole sheet), crease (deg per cm),
top-tier regret of each tier's choice, rank agreement (Kendall tau) over the candidate set, and
top-tier evaluations to 5% regret. Baselines: the three stock hangers, `hanger-fit`'s designs,
single-tier CMA-ES on each tier and random search, all at equal budgets. At least 10 seeds per
design loop, bootstrap 95% intervals, paired comparisons (Wilcoxon signed-rank) on the same
garments and fabrics. Ablations: fabric inputs (B and W only; plus shear; plus tensile), arm
depth, mesh resolution, friction on and off.

## Milestones

1. **Fidelity on measured fabrics, tiers 1 and 2** (this run): does the 2D chain's choice of
   stock hanger and arm width survive in the 3D sheet on the four KES fabrics?
2. A simulated Cusick drape test on the 3D sheet, compared with published drape coefficients for
   fabrics of known B and W (needs a sourced table).
3. Build and wrap the top-tier open solver; reproduce one published drape case.
4. Calibrate all tiers and repeat milestone 1 across three tiers (H1, H3).
5. The margin bound and its estimate from paired designs (theory section of the paper).
6. Multi-fidelity design loop against single-tier baselines (H4), 10 seeds.
7. Fabric-input ablation (H2) and the robust rack-of-k design.
8. Paper draft in the venue format; owner steps (printing hangers, measuring real drapes) listed.

## Target venue

*IEEE Robotics and Automation Letters* (8 pages, with an ICRA or IROS presentation option), as
the robotics-design paper; *Textile Research Journal* as the textile-side alternative if the
calibration result is the stronger half. This is an aim, not a claim of acceptance.

## Deep-tech application

The system is a garment-handling robot cell (`hanger-cell`): its tool set (the hangers) and, by
the same argument, its cloth grippers and forming fixtures. The number moved is the shape error
of hung garments and therefore the share of laundry that needs pressing, and, on the design side,
how many top-tier simulations and which fabric tests a design study must pay for. A robotics
group building cloth manipulators, or a hanger or garment-equipment maker, would act on it. Trying
it on the real thing takes printed hangers (`hanger-print`), a few garments and a camera to
measure hung shape, all owner steps.
