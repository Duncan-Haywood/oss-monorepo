# buildbot-sheathing: can a robot nail wall sheathing to code tolerance, and what decides it?

**Live page:** https://marisstella.app/research/buildbot-sheathing/

A research programme (proposal: [`PROPOSAL.md`](PROPOSAL.md); log: [`LOG.md`](LOG.md)) on
**robotic sheathing of a wood-frame wall**: whether a stock humanoid, a mobile manipulator with a
lift or a purpose-built gantry can hang a 4x8 sheet and land all 62 nails where the panel maker
and the code want them, which error source decides it, and what a clean sheet costs. It pulls
together track 20's 26 `buildbot-*` projects, which priced reach, push, recoil, stud sensing and
cost one at a time, into one question aimed at *Automation in Construction*. Produced with AI
assistance (Claude); simulation and analysis only, nothing tested on hardware.

**Milestone 1 headline: the panel gap and the sheet's own pose set the budget.** Earlier
projects put each sheet edge exactly on its joint stud. Panels are actually hung with a 1/8 in
gap (APA's recommendation), so each edge sits 1/16 in past the stud centre, and the nail must
still be 3/8 in in from that edge and on the stud. That shrinks the 34 joint nails' window from
±3.93 to **±3.14 mm**, and the stud reading a robot needs for 95% clean sheets from 0.90 mm to
**0.41 mm** (1σ, single read, 0.9 mm tool scatter). A sheet must also hang **plumb to about
0.03° (1σ)** and in place to about 0.4–0.6 mm, even when the robot measures the sheet edge and
aims from it; aiming at the design window instead leaves no tolerance at all at a 0.5 mm stud
reading. Along a wall, sheets butted against each other with a 1/8 in gap **leave their studs by
the third sheet** with full 48 in panels and by the fifth with panels trimmed 1/16 in; setting
each sheet from its own studs keeps every sheet at 98% clean.

![Joint budget against the gap, clean sheets against sheet rotation, and clean sheets along a butted row](experiments/m1_gap_placement/figure.png)

**Milestone 2 headline: a bowed stud closes the joint, and wider joint framing fixes it where
sensing cannot.** Real studs are not straight. A Stud-grade 8 ft 2x4 may bow 3/4 in and twist
3/8 in, and published kiln-dried studs average 0.11 to 0.21 in of bow and 0.08 to 0.16 in of
twist. Bow moves the 1.5 in nailing face sideways under a sheet edge that is straight, so the
joint window shrinks by the bow whatever the robot knows: a joint stud on a single 2x closes for
any bow over **0.53 in** (8 ft equivalent; 12.5 mm on the stud). At the lower published warp a
robot that reads each stud once gets **55% clean sheets**; reading it at three heights and
fitting the curve gets **80%**, and even perfect stud and edge reads only 87%. To reach 95% on single 2x joints a framer
would have to reject about **two thirds of the studs** for bow (over 1/16 in). Framing the
joints with a **3x or two 2x fastened together**, which the shear-wall standard (SDPWS 4.3.7.1)
already calls for at adjoining panel edges in some shear walls, makes the window 1/2 in wider on each side, and three
reads per stud then give **100% clean sheets** at both published warp levels (20,000 sheets a
cell). Twist costs 1–2 points; plate layout lean of 1.6 mm costs 8.

![Clean sheets by stud sensing and joint framing, culling bowed studs, and plate lean](experiments/m2_asbuilt_studs/figure.png)

**Milestone 4 headline: how coarsely may a robot hang the sheet? On doubled joints, about 18
times coarser.** A robot can tack the sheet with two nails in the field studs, measure where its
edge actually landed, and aim the joint nails from that, or re-hang the sheet if the window looks
too tight. On **single-2x** joints this does not rescue a coarse hang: the sheet must still hang
to about **0.03° and 0.4 mm (1σ)** for 95% clean sheets, re-hanging a 1 mm / 0.1° hang tops out at
**87%** (2.1 hangs a sheet), and a held sheet may sway only 0.19 mm under the nail. On **two 2x
fastened at the joint**, tack-then-measure allows **0.54° and 10 mm** (11 mm at the top nail) at
the lower published stud warp, and a held sheet may sway 4.1 mm. That is the placement target
for the humanoid and lift experiments of milestone 3.

![Hang allowed by joint framing and aim, clean sheets against sway of a held sheet, and re-hanging on single 2x joints](experiments/m4_tack_measure/figure.png)

**Milestone 3 (first part) headline: does a ledger board square the sheet? Yes, if the robot
lets go and presses lightly; then the panel's own squareness is what is left.** In MuJoCo, a
21.8 kg 4x8 sheet lowered from 0.25–2° off plumb onto a level ledger and released ends parallel
to the ledger within **0.0001°** for any press up to 100 N and wall friction 0.2–0.7. Press harder
and wall friction holds the error: the sheet keeps its full tilt above **115–380 N** (μ 0.7 to
0.2; 189 N at μ 0.4), 0.87–0.99 of the closed form μF_n r̄ = m g W/2. A wrist that keeps its
rotational stiffness also keeps part of its own error once stiffer than about **7,500 N·m/rad**
at 1° (gravity moment 130 N·m over the error). With the ledger seated, what is left is the panel
and the ledger: PS 2 lets a panel be out of square by 0.083° and its bottom edge bow 1/16 in
(a rock of up to 0.149°), and a laser line rated 1/8 in at 30 ft adds 0.020°. A ledger hang then
gives **100% clean sheets on doubled joints** across every ledger and panel setting tried, but at
most **95% on single 2x** joints even with perfect panels and ledger, and **84–86%** with panels
drawn uniformly up to the PS 2 limits; 95% there needs panels within about a quarter of the limits
(0.02° out of square).

![Seating against press and friction, a held wrist against the closed form, and clean sheets with a ledger hang](experiments/m3_ledger/figure.png)

**Milestone 3 (second part) headline: can a stock Unitree G1 or H1 be the holder a ledger
needs? It can press and let the ledger seat the sheet, but it cannot carry the sheet there.** In
the static whole-body model (MuJoCo Menagerie models, torque limits, both soles loaded, no foot
slip), the heaviest load a **G1** holds in both hands at 0.6–1.3 m is **2.8–8.7 kg** and an
**H1** **12.4–18.8 kg**, against 21.8 kg for a 4x8 sheet of 7/16 in OSB: neither can hang it
alone, so a lift or a person must stand it on the ledger. Once it sits there, a G1 presses
**66–110 N** into the wall and an H1 **128–281 N**, both over part one's light press. Sliding
the seated sheet sideways to its stud line takes μ_l m g + μ_w F_n (84 N at a ledger friction of
0.3 and a 50 N press); a G1 manages that at μ_l 0.3 but not at 0.5, and it cannot do it through
palm friction (that would need 107 N to 1.5 kN of press), so it must push the sheet's edge. Push
below **h\* = W / (2 μ_l)** (2.03 m at 0.3, 0.87 m at 0.7) or the trailing corner lifts: MuJoCo
agrees within 1.6% in 14 cases. At Unitree's own joint gains (arms kp 60 N·m/rad) a G1 holding
the sheet is **3 to 31 times softer** about the landing corner than the stiffness at which part
one's held wrist keeps its error, so the ledger seats the sheet; the same softness would let the
sheet's own weight turn the hold 10–14° if nothing carried it. An H1 is soft enough through palm
contacts (2–6 times under) but **not with a rigid clamp**: its 4-joint arms keep 0.46–0.99° of a
1° error. Releasing a G1's wrist roll barely matters.

![Push height that tips a sliding sheet, whole-body press limits on the ledger, and stock-gain stiffness against the seating limit](experiments/m3b_humanoid/figure.png)

**Milestone 5 headline: what does a clean sheet cost in seconds once every stage is charged?
On doubled joint studs, 76–216 s with one read a stud; on single 2x, 18–65 s more, all of it
rework.** One steady-state cycle along a row: a lift stands the sheet on a laser-set ledger, the
robot slides and presses it so it seats, tacks it, reads the three new studs and both edges, and
nails the 62 nails with edge aim (timed by [`buildbot-mobilebase`](../buildbot-mobilebase));
every missed nail is found and re-driven. With **two 2x at the joint**, a **single read** a stud
gives **0.9994** first-pass clean sheets at the lower published stud warp (three reads 1.0000),
and it is the fastest choice in all 108 swept time cells. On **single 2x** joints no sensing
policy passes 0.59 (single read 0.42, three 0.56, dense 0.58; 0.7–2.2 nails missed a sheet),
three reads are fastest everywhere, and the best single-2x sheet is **17.9–65.5 s slower**
before the extra stud is charged: at 30 s of rework a nail, framing the extra joint stud may
take **30–42 s a sheet** and still win. Firing the next nail without waiting out a 4 N s recoil
costs **up to 7.4 points** of clean sheets on single 2x (a conservative model) and nothing on
doubled joints. On doubled joints even a lift that hangs and tacks the sheet to 0.25° and 5 mm
without a ledger gives 0.978. Every stage time except the nailing is swept, not measured.

![Clean sheets by sensing, framing and recoil; seconds a sheet by stage; the framing time the extra joint stud may take](experiments/m5_cycle/figure.png)

**Milestone 7 headline: what does a clean sheet cost in dollars, by robot class? A G1 on a
drive-and-lift base is the cheapest robot below about 500 houses a year, it beats the hand crew
in only 37% of draws at 100 houses a year (74% at 300), and doubled joint studs never pay in
dollars.** Milestone 5's seconds, priced: ownership (price, life, interest and upkeep spread over
the wall sheets of V houses a year, capped at 2,000 machine hours), people (supervision, an
operator, and the person who still carries the sheet) at a loaded carpenter wage, and the extra
joint stud ($3.41–5.56 for a 92 5/8 in precut, retail listings, plus a framer's minute or two).
Over 4,000 draws with common random numbers, the **hand crew** costs **$5.21 a sheet** (median;
$1.93–14.46 over the taskbook's own sweep of its minutes). The **base** costs $54, $19, $7.03,
$3.48 and $2.20 at 10, 30, 100, 300 and 1,000 houses a year; the **walking H1** about 2.5 times
that, and it beats the base in **no draw** at any volume or sensing policy. The **gantry**
($40k–600k, unsourced) is cheaper than the base in the median draw only from **about 500 houses
a year**. Every robot picks **single 2x joints with three reads**: the extra stud costs
**$5.42 a sheet**, and the rework it saves (0.79 missed nails) is worth well under a dollar of
robot time, so doubling pays only if a missed nail costs **about $6.50 more than its re-drive**
(about ten loaded person-minutes: an inspection callback would; a robot re-driving its own miss
would not). Where a shear wall already requires 3x or doubled joints the stud is sunk and the
milestone 5 result stands. The base's cost is moved most by its life and its base price (rank
correlation ±0.58), both unsourced.

![Dollars per clean sheet by robot class and house volume; which way is cheapest](experiments/m7_cost/figure.png)

**Milestone 6 headline: do the MuJoCo results survive a second physics engine? Yes for clean
sheets: Drake moves no ledger pipeline by more than 0.05 points.** Every simulated number above
came from one contact model, MuJoCo's soft contact. Milestone 6 rebuilt the ledger seat and the
ledger slide in **Drake** (Toyota Research Institute's `MultibodyPlant`, point contact, the SAP
solver of Castro et al. 2022) with the same sheet, contacts and holder law. A sheet released
under a light press seats in both: Drake leaves **0.0014° (1σ, 0.0047° at most)** over 2,000
random seats, a hundred times MuJoCo's 0.00001° but twenty times under the 0.03° a sheet may hang
on single 2x joints, so all 24 of milestone 5's ledger pipelines keep their clean-sheet rates
within **0.05 points** (the bar was 10). The press at which wall friction stops the ledger working
is **97–100%** of the closed form m g W / (2 μ r̄) in Drake and **87–99%** in MuJoCo: in MuJoCo wall
friction starts holding the sheet at up to 13% less press, the cautious side for a press limit. The
push height that tips a sliding sheet matches W / (2 μ_l) within 0.7% in Drake (1.6% in MuJoCo). Two things do depend on
the contact model: a soft held wrist (300–3,000 N·m/rad) keeps up to **0.016°** in Drake where
MuJoCo and the closed form give zero, and a bottom edge bowed 1/16 in rocks the sheet **0.107–0.123°**
in Drake and **0.139–0.145°** in MuJoCo, both under the 0.149° milestone 3 charged. A sheet on its
bowed middle is balanced, so how far it rocks is set by friction and approach, not by statics:
milestone 3's full rock is the conservative side.

![Press threshold by wall friction in MuJoCo, Drake and the closed form; clean sheets with each simulator's seated residual; push height that tips a sliding sheet](experiments/m6_drake/figure.png)

**Milestone 6b: does a bowed sheet edge rock the sheet off plumb? Not if the bow is a curve.**
Milestones 3 to 6 modelled PS 2's 1/16 in bottom-edge bow as three feet, so the sheet balanced on
its middle foot and fell onto a corner: a rock of 2 s / W = 0.149°, on which MuJoCo and Drake
disagreed by 0.02–0.03°. A real bow is a curve. A parabolic 1/16 in bow over 48 in has a radius of
**117 m**, against a centre of mass 1.22 m above it, so the sheet is a stable rocker: gravity rolls
it back to level and only wall friction keeps a tilt, at most θ_s = μ F_n r̄ / (m g (R − h0)).
Modelled as 25 to 401 feet on the curve, both engines seat inside that band in all 48 cells
(0.007° at most at a 5 N press, 0.058° at 50 N), and over 2,000 random seats the 99th percentile
is **0.06°** in both. Charged to milestone 5's pipelines, the best single-2x pipeline goes from
**0.560 to 0.625** clean sheets (doubled joints move by 0.45 points at most) and the engines now
agree within 0.11 points. A kink, a chipped edge or **1 mm of grit on the ledger** keeps a rock
(0.05–0.09° for grit, up to 0.15° for a kink at a light press), set by how the sheet lands rather
than by statics, which is why the engines disagreed before. Placement rules: back the press off
once the sheet is down, and keep the ledger clean.

![Seated tilt on a smooth bow against the press and the friction band; tilt by edge shape; clean sheets on single-2x pipelines with the three-foot and the smooth-bow rock](experiments/m6b_bowed_edge/figure.png)

**Milestone 8: the paper draft.** [`paper/draft.md`](paper/draft.md) writes milestones 1 to 7
up as one article for *Automation in Construction* (highlights, abstract, methods, results by
hypothesis, discussion, limitations, references in [`paper/references.bib`](paper/references.bib)).
[`paper/check_numbers.py`](paper/check_numbers.py) ties its 70 quoted figures to the results
files they came from. Scored against the proposal's five hypotheses: H-B (a humanoid needs a
guide), H-C (rows need stud referencing) and H-E (two contact models agree) held; H-D held in its
first half (base beats walker) and was refuted as registered in its second (the gantry crosses
at about 500 houses a year, not 30–300); H-A (aim from the edge) held only at a 0.5 mm stud read
and is not what decides an as-built wall: the joint framing is.

**Milestone 9: straighten the bowed joint stud instead of doubling it? It removes the bow, not
the cap.** Carpenters push a bowed stud onto the line and nail it there; once the first sheet's
joint nails hold it, it stays straight for the next sheet. Treating the stud as a Stud-grade 2x4
bending flatwise between pinned plates (E from the NDS Stud-grade values, 1.2–1.4 million psi,
COV 0.25), one push at mid-height takes **48 E I b / L³**: a median of **28 N** and a 99th
percentile of **126 N** at the lower published warp (53 and 232 N at the higher), 376 N for a
grade-limit stud, and it leaves at most 7.4% of the bow (0.296 b if the plates held the ends
fixed). A G1 can push about **81–88 N** sideways at stud mid-height (ankle roll), enough for 93% of
low-warp studs and 69% of high-warp ones; an H1 about 120 N (99%, 86%). Order matters: pushing
each point onto the line just before its nail, after the nails below it are in, needs up to
1,258 N at the 99th percentile on high-warp studs, so push first and then nail. Straightened,
single-2x joints score within three points of straight studs: the best single-2x pipeline goes
from **0.56 to 0.71** clean sheets at the lower warp and from **0.31 to 0.68** at the higher
(0.63→0.78 and 0.34→0.75 with milestone 6b's smooth-bow rock). It does not reach 95%: even on
straight studs single 2x stops at **0.74–0.81**, because the sheet's own pose on the ledger is
then what closes the window. Doubled joints stay the only route to 95% first-pass clean sheets.
In dollars (G1 on a lift base, 100 houses a year) straightening costs about what it saves at the
lower warp (cheaper than not pushing in 10% of draws) and pays at the higher (92%), and it is
always cheaper than the doubled stud.

![Shape a push leaves along the stud; push force against what a G1 and H1 can push sideways; clean sheets with and without straightening against doubled joints](experiments/m9_straighten/figure.png)

**Milestone 10: what caps single-2x joints once the studs are straight? The nail gun as much as
the sheet, and the two only hurt together.** Milestone 9 left single-2x joints at **0.74–0.81**
clean sheets on straight studs and read the gap as the sheet's pose. Switching each of the six
remaining error sources on and off (all 64 subsets, 20,000 sheets each) says otherwise: by
Shapley share of −ln(clean), the tool's 0.9 mm scatter carries **45–47%**, the stud and edge reads
**12–15%**, and the pose (slide, ledger slope, panel geometry) **39–44%**. Neither group misses on
its own: a perfect tool on the real pose gives 0.995–1.000, a perfect pose with the real tool and
reads 0.957. The joint window is ±3.14 mm and every millimetre the sheet sits off shrinks one
side's half by half a millimetre, so the tool's tail and the pose's offset fail *together*. Two
placement fixes before tacking, sliding the sheet along the ledger to centre its gap on the read
studs and shimming the low corner until the edge reads plumb, lift straight studs from 0.74–0.81
to **0.92** (0.5 mm residuals) and **0.94** (0.25 mm), and pushed low-warp studs to **0.89–0.92**.
That is still short of 95%. Reaching it needs both fixes *and* a tool held to **0.79–0.84 mm**
(1σ) instead of `buildbot-fasten`'s 0.9 mm; without them the tool would need 0.41–0.66 mm.
Doubled joints remain the simple route; for single 2x the order of work is slide, shim, push,
then a tighter tool.

![Shapley shares of the straight-stud ceiling by error source; clean sheets under the slide and shim remedies](experiments/m10_ceiling/figure.png)

**Milestone 11: what do real installed studs look like, and does the parabola every milestone
assumed hold up? Bow sizes match the books; the shape does not, and it costs single 2x 11–15
points.** The first measured studs in the programme come from a public laser scan (Adel et al.
2024 data set, CC BY 4.0; 1.8 million points, 0.019 mm depth resolution) of a full-scale 2x4
wall two industrial robots built: six vertical studs, five inclined members, scanned on the face
sheathing is nailed to. Sliced every 10 mm, the six studs bow a median **0.106 in** scaled to
8 ft (largest 0.283 in), right on the published kiln-dried mean of 0.11 in. Their shape is not a
parabola: after the best-fit parabola each stud keeps **0.6–0.9 mm RMS** of waviness (a
synthetic face on the scan's 2 mm profile grid leaves 0.27 mm), and on the three most bowed the
parabola explains only 64–79% of the shape. About half of that waviness is common to every
member at the same height, which points to the scan's stitched passes rather than the wood, so
the post hoc check removes it and keeps the rest (0.3–0.6 mm). Put back into milestone 9's best
single-2x pipeline, the measured studs give **0.43–0.47** clean sheets against **0.58** for
parabolas at the same studs' own bows and 0.625 for the model's low-warp draw: the parabola
flattered single 2x by 11–15 points, and a nail window of ±3 mm cannot absorb a millimetre of
waviness a three-read fit does not see. Doubled joints give **1.000** on the measured studs in
every variant, so the programme's recommendation gets stronger. One wall and six studs: enough
to refute the shape assumption, not to estimate a population.

![Six installed studs' face centrelines against their parabolas; bow amplitude against the published means; clean sheets on measured studs against parabolas](experiments/m11_measured/figure.png)

**Milestone 14: what does a missed nail that nobody finds do to a shear wall? About 2% of its
sheet's racking capacity each, more where misses cluster, and 4 in joint nailing covers them.** A
rigid-plastic model of a fully anchored sheathed wall (Källsner and Girhammar 2009), which tracks
SDPWS's spacing table to within 6%, scores the miss patterns of milestone 12's robot. One joint-edge
nail missed costs **2.0–2.2%** of the sheet. With three stud reads on the measured studs, every miss
left in, the mean sheet keeps **97.7%**, but the 99th-percentile sheet only **88.5%**: a stud the
robot misjudges is misjudged for a run of heights, so 13% of sheets miss three or more nails. Nailing
the two joint edges at **4 in instead of 6 in** keeps **99.98%** of sheets at or above the intact 6 in
sheet with every miss left in, and costs less than re-driving the misses ($6.98 against $7.10 a sheet,
against $12.17 for a doubled joint stud). The model is optimistic about clustered misses: with the
bottom foot unnailed it loses 20% where tested walls lost about half (Weiss 2017), so its losses are
lower bounds; at 2.45 times the loss, 97.6% of 4 in sheets still clear the bar.

![Sheet capacity with every miss left in, by pipeline, and the capacity each nail carries](experiments/m14_escaped/figure.png)

**Milestone 15: do weak stud-to-plate joints explain why the shear-wall model was too optimistic? No,
not at code strength.** Milestone 14's model pinned the studs to the plates with joints of unlimited
strength. Rebuilt as a limit analysis of the whole framed sheet (a linear programme over the top plate,
four studs and the sheet), with each stud held by two 16d end nails at the NDS yield-limit strength
(**2.55** sheathing nails' worth), the bottom foot unnailed still costs only **20–21%** of the sheet,
not the "close to or more than half" Weiss (2017) measured. Reaching 40–50% takes joints at
**0.46–0.56** of the NDS ratio, or a sheet **without hold-downs** (64–100%), so the gap lies in
anchorage or in ultimate strengths the design equations do not give. One thing the rigid model hid: a
lone sheet whose top plate can tilt loses **7%** intact and **16.7%** at the 99th-percentile
escaped-miss sheet (11.5% before); a top plate that only slides, as a continuous wall line holds it,
restores milestone 14's figures, and **4 in joint edges** carry the misses under every joint model
(99.89–99.98% of sheets at or above the intact 6 in sheet).

![Capacity lost with the bottom foot unnailed against stud-joint strength; escaped-miss capacity with finite and rigid joints](experiments/m15_frame_joints/figure.png)

**Milestone 16: do softening nails explain the gap instead? No: in a racking sheet the perimeter nails
all slip about the same.** With every nail a spring on the tested backbone of an 8d common nail through
7/16 in OSB (Shameli Derakshan et al. 2019: 0.97 kN peak, 0.5 kN/mm, 0.8 Fp at 29 mm) and the sheet
pushed over, the intact sheet peaks at **9.8 kN (551 plf) at 2.3% drift**, and omitting every nail below
12 in still costs **20.1–20.4%** at every slip-at-peak from 6 to 15 mm, monotonic or cyclic, and 20.4% for a
nail that drops to 0.8 Fp a millimetre past its peak; rigid-plastic gave 20.4%. At the sheet's peak the
perimeter nails slip 11–12 mm and only the field nails near the centre of rotation lag (3–4 mm), so no
nail is far past its peak while others are short of theirs. The escaped-miss figures stand (mean loss
2.39%, 99th percentile 11.8%, against 2.34% and 11.5%), and 4 in joint edges still carry the misses in
99.98% of sheets. Of milestone 15's three candidates for Weiss's 50% loss, softening nails are now ruled
out alongside code-strength framing joints; the anchorage is what is left.

![Pushover of the intact and bottom-foot-unnailed sheet with softening nails; loss against the slip at peak](experiments/m16_soft_nails/figure.png)

**Milestone 17: why do shear walls with a decayed, unnailed bottom foot lose half their strength? In
Weiss's own walls, because the whole wall slides on its sill nails.** Weiss's thesis (WSU 2017, read in
full for the first time this step) gives the test set-up: 8 by 8 ft walls of two OSB sheets on a shared
middle stud, hold-downs only at the wall's ends, and every nail below 12 in omitted. The decayed walls kept
**57%** (6 in edges) and **34%** (3 in edges) of the controls. Built that way in the limit analysis,
the model reproduces the controls' spacing ratio (**1.93** against 1.87 tested). At code-strength (NDS)
stud-to-plate joints, though, the decayed walls keep **80% and 63%**, so the anchorage as tested is not
the explanation (3 of 6 registered predictions refuted). Post hoc, end nails at **0.47 of the NDS
ratio** fit both groups (58% and 30%). The decayed wall's least-work mechanism is then the whole wall
sliding on its 18 stud-to-sill end nails, so its capacity no longer depends on the sheathing schedule,
as Weiss found. That fit is one parameter against two tested numbers, and a tested end-nail ultimate
is what would confirm it. For the robot, an escaped miss costs about the same on the two-sheet wall
(mean **2.7%**, 99th percentile **10.4%**) under every joint strength tried.

![Share of capacity a decayed wall keeps against stud-to-plate joint strength; tested, MCASHEW2 and model shares](experiments/m17_weiss_wall/figure.png)

**Milestone 18: does the hold-down's anchor rod stop a decayed shear wall from sliding on its sill? Yes, and
then the model no longer explains Weiss's 3 in wall.** In Weiss's tests the end studs are nailed to HTT4
hold-downs whose 5/8 in anchor rods run through the sill into the test beam, a shear path milestone 17 left
out. The rod path's NDS design value is **617–1,137 lb**. At milestone 17's fitted end nails the slide stops
once each rod carries about **420 lb**. With the end studs held, no end-nail strength fits: the decayed 3 in wall
keeps **64–74%** against 34% tested (best rms 22.8 points; 4 of 6 registered predictions held, including the
two that tested the slide's sensitivity). A fit within 5 points needs each rod below about **970 lb**, and the
end nails get weaker as the rod gets stronger. At the rod's design value they would carry about 78 lb each,
below their own design value. So with code-level fastener strengths, a rigid-plastic model of the
tested wall cannot reproduce the 34%. What remains is slack in the rod's hole, the middle stud
splitting and cyclic tear-out. For the robot nothing moves: an escaped miss costs 2–3% of a wall on
average and 9–11% at the 99th percentile under every anchorage model.

![Decayed walls' share kept against end-nail strength with and without the rods' shear path; best-fit end-nail strength against the rod's shear capacity](experiments/m18_holddown_shear/figure.png)

**Milestone 19: does slack in the anchor rod's hole, or a stud joint that peaks early, explain why a decayed
shear wall loses two thirds of its strength? No.** Milestones 17 and 18 were rigid-plastic. Here the same
8 by 8 ft wall is a displacement model pushed to 150 mm: each sheathing nail follows a tested load-slip curve,
the 16d stud-to-plate joints soften too, and each anchor rod bears only after a gap (NDS stiffness, capped at
its design value). It reproduces the rigid-plastic limit to **0.04%** and milestone 16's sheet exactly with the
pins on the nail lines. Softening alone moves the decayed walls by under a point (79.5% and 72.8% kept at
code-strength joints). Opening the gap to 1/16 in moves them by **0.1 point**, and even 1/4 in with joints that
peak at a quarter of the nails' slip leaves the 3 in wall at **52–63%** kept against 34% tested. Across 960
pushovers no joint strength at 0.75 of the NDS ratio or above comes within 10 points of both tested groups.
The 30 fits within 5 points all have the end nails at **a quarter of the NDS ratio**, which is milestone 18's
rigid-plastic answer found again by a different model. So the remaining explanations are weak end-nail joints
or what a monotonic model leaves out (cyclic tear-out, the middle stud splitting), and a tested end-nail ultimate
is the input that would decide it.

![Decayed 3-12 wall's share kept against slack at the rods for four end-nail strengths; both decayed walls' shares against end-nail strength](experiments/m19_wall_pushover/figure.png)

**Milestone 20: does cyclic loading explain why a decayed shear wall loses two thirds of its strength? No.**
Weiss tested her walls cyclically (ASTM E2126, the CUREE protocol), and every model so far pushed them over once.
Here the same 8 by 8 ft wall goes through the CUREE basic history (Krawinkler et al. 2001) with each nail on the
ten-parameter SAWS hysteresis (Folz and Filiatrault 2001), its pinching and stiffness loss fitted to cyclic tests
of nails through 7/16 in OSB into Douglas fir-larch, Weiss's own materials (Anderson et al. 2007). The hysteresis
matches OpenSees' implementation to **2e-13** of a nail's peak. Cyclic loading moves the intact walls' peaks by
**0.1%** and the decayed 3 in wall's share kept by **0.1 point** (70.6% against 70.5%; tested 34%). Across 96
combinations of end-nail strength, joint slip and rod slack the median change is 0.2 point and the largest 3.0. In the
decayed 3 in wall the anchor rods yield and their holes crush to 25–28 mm, but only after the peak. The only fits
within 2 points again need end nails at a quarter of their code (NDS) ratio. So with the model class Weiss's own
MCASHEW2 belongs to, cycles are not the answer. What is left is weak end-nailed joints, or damage such models
have no term for (nail fatigue and tear-out at the unsupported bottom edge, the middle stud splitting).

![Hysteresis loops of the intact and decayed 3 in walls under the CUREE history beside their monotonic pushes; decayed walls' share kept, cyclic against monotonic, over end-nail strength](experiments/m20_cyclic/figure.png)

**Milestone 21: can nail damage that builds up over cycles explain the decayed wall? No: it lowers intact and
decayed walls together.** Each nail now loses strength in proportion to the energy it has dissipated, the
cumulative-damage rule of Rahnama and Krawinkler (1993) used in the Ibarra–Medina–Krawinkler model, at rates swept
from none to one that costs a lone nail 39% of its peak over the CUREE history (no calibrated rate for nails in OSB
was found). The intact walls' cyclic peaks fall to 63–97% of their one-way pushes, but the decayed walls' shares
kept go **up**, by 0.3 to 2.9 points at code-strength joints (the 3 in wall from 70.6% to 73.5%; tested 34%),
because an intact wall works its sheathing nails harder and so loses more of them. The best fit is still end nails
at a quarter of their NDS ratio with no degradation (rms 2.1 points; 8.7 at the fastest rate). So whatever took
Weiss's 3 in wall to 34% has to single out the decayed wall: tear-out of the nails left along its unnailed bottom
edge, the middle stud splitting, or genuinely weak end nails.

![Decayed walls' share kept against the degradation rate for three end-nail strengths; intact walls' cyclic peak over monotonic peak against the same rate](experiments/m21_degrading/figure.png)

**Milestone 27: what does sliding the sheet along the ledger actually leave? About 0.26 mm if the robot lets go
within 20 ms of the sheet moving, 4 mm at 100 ms.** Milestones 10–13 credited the slide with a 0.5 mm residual. A
seated sheet breaks away on static friction and runs on kinetic friction, and a hand that can only push its edge
stops it by letting go. Along the wall the stock G1 hand is a 63 N/m spring (one hand, Unitree's gains, MuJoCo
Menagerie model), soft enough to act as a force source, so how far the sheet runs is set by the time from slip to
release and by the gap between static and kinetic friction. Tapping from either edge until the sheet sits within
half a tap leaves 0.05–0.64 mm rms at 2–20 ms and 0.66–10 mm at 50–100 ms (μ_s 0.4, μ_k/μ_s 0.5–0.9). The best
single-2x stack on measured studs (0.771 with 0.5 mm) gives 0.79 at 20 ms and 0.32 at 100 ms (μ_k/μ_s 0.8). The
slide is a 20 ms control requirement, not a free 0.5 mm. The OSB friction pair is swept, not measured.

![Slide residual against the reaction time for four friction ratios; the best single-2x stack's clean sheets against the same](experiments/m27_slide_mech/figure.png)

**Milestone 28: and the shim? A stack of 1/16 in shims is as good as assumed, and a stock G1 cannot drive a
wedge.** Milestones 10–13 also credited the shim (lift the sheet's low bottom corner until its edge is plumb) with
0.5 mm. The lift needed is a median 0.95 mm, a 99th percentile 3.0 mm. Stacking 1/16 in plastic horseshoe shims
rounds it to a step: 0.458 mm rms, and the best single-2x stack gives 0.796 against 0.791 with 0.5 mm (20 ms slide).
A tapered composite shim (1:32) driven under the corner carries half the sheet plus wall friction: at μ 0.4 it needs
a 118.5 N push, and the stock G1 gives 65.6 N into the wall at a 0.5 m ledger (waist pitch limits it), enough only
for faces at μ ≤ 0.25; the H1 gives 132 N. A hand weighs under 1 kg along the push, so stick-slip throws the wedge
12.7 mm a tap at 20 ms, and the taper leaves 0.13 mm rms, not the hoped-for under 0.1 mm.

![Push to drive a 1:32 wedge against the friction on its faces, with the stock G1 and H1 pushes; the corner height a wedge leaves against the reaction time, with the 1/16 in shim stack's](experiments/m28_shim_mech/figure.png)

**Milestone 29: the nailer's length decides more than any remedy.** Every figure above takes the tool error as 0.9 mm:
the G1's 11-bit joint sensors carried to the *hand*. A nailer's nose sits ahead of the grip, so the hand's 0.1° of
rotation error moves it, and the nail must stay in the stud 44 mm below the surface, where a leaning nail has moved
again. With the nose 0.3 m ahead, the G1's scatter along the wall is 1.31 mm at the surface and 1.38 mm at depth, and
the best single-2x stack falls from **0.796 to 0.264** (H1: 0.571). The stack is a knife-edge on tool scatter: 0.96 at
0.6 mm, 0.69 at 1.0, 0.32 at 1.3. A **12-bit** joint sensor at the same nose gives 0.934, so the spec is accuracy at
the tool point. An independent nail lean of 0.43° (1σ) costs 2 points more; doubled joint studs stay at 1.000 at every
length and at a 2° lean.

![Clean sheets of the best single-2x stack against the nailer's length for the stock G1 and H1; against an independent nail lean, single and doubled joints](experiments/m29_tool_lean/figure.png)

**Milestone 30: gear backlash matters only where nothing holds the joint.** No G1 backlash figure is published, so it is
swept (0–25 arcmin; catalogue precision planetaries are 1–7). A joint that gravity, the 3.4 kg nailer and the press into the
wall load one way at every nail sits at the same side of its gap each time, a bias that calibration removes. At the stud
pose (MuJoCo, feet planted) 16–19 of the G1's 22 joints that move the nose are held; the two **ankle rolls** carry no torque
under an even ground reaction. 5 arcmin on every joint takes the 12-bit G1's best single-2x stack from **0.934 to 0.765**;
counting the held joints, 0.913; with the ankle rolls biased one way by the balance controller (a case added after the first run, not a registered hypothesis), 0.934 at every gap up to 25
arcmin. The nailer's 12-11/16 in height (Metabo HPT) puts the grip 0.29–0.32 m behind the nose, so milestone 29's 0.3 m stands;
a handle 0.15 m above the drive axis costs the 11-bit G1 8 points, below it gains 4.

![Clean sheets of the 12-bit G1's best single-2x stack against gear backlash, unpreloaded, preloaded and with the ankle rolls biased; against the handle's offset from the drive axis, G1 and H1](experiments/m30_backlash/figure.png)

**Milestone 31: one calibration does not cover the wall.** Milestone 30's backlash bias was removed by a calibration at one
pose. Over the 15 poses a stock G1 reaches from one stance (hand heights 0.4–1.2 m, shifted 0.15 m either way along the wall;
MuJoCo, 25–50 N press, 3.4 kg nailer), 13–20 of the 22 joints that move the nose stay held, fewest at the top of the reach.
Calibrated at every pose, 5 arcmin costs the 12-bit G1 **0.3 to 9.9 points** (H115 refuted; worst at 1.2 m, 0.913 to 0.814).
Both **hip yaws and the waist roll** are held everywhere but **change the sign of their torque** across the grid (H116 held), so
they rest on the other side of their gaps: one tool-frame calibration at the 1.0 m pose leaves every nail offset along the
wall by up to **3.4 mm** (H117 held), and the single-2x stack falls to 0 at the worst pose. To stay within 2 points of each
pose's own stack, 12-bit joints tolerate **2.5 arcmin calibrated per pose but 0.44 arcmin calibrated once** (13 bits: 4.1 and
0.8). The H1 loses at most 1.4 points per pose, and up to 75 points with one calibration. The remedy is a bias predicted
from the static torques at every pose (they give the side of each gap), not one tool offset. Swept, not measured: the
backlash, the holding threshold (0.05–0.5 N m: worst losses 9.9–10.0 points, offsets 3.4–3.7 mm), and the least-norm
ground-reaction split, which sets the hip-yaw and waist torques.

![Clean sheets of the 12-bit G1 and H1 best single-2x stack with 5 arcmin backlash against hand height, three shifts along the wall, calibrated per pose and once](experiments/m31_pose_range/figure.png)

**Milestone 32: through real soles, the robot must lean into the wall.** Milestones 30–31 let each foot apply any wrench
at one point. With each sole pushing only through its contact points (the Menagerie model's collision spheres and capsules,
friction cones at mu 0.5), the upright poses balance a press of at most **39 N at 0.8 m, 31 N at 1.0 m and 26 N at 1.2 m**
(G1; H1 25 N at 1.6 m): above chest height the 50 N press tips the robot onto its heels. Leaning the centre of mass
0.04–0.12 m towards the wall restores the 25–50 N range at all 36 poses. On those leaned poses **neither hip yaw nor the
waist roll flips** under any ground-reaction model (H118 refuted); waist and arm torques are the same under every model,
since no foot is in their subtree, and the only G1 joint that flips is the right wrist pitch. Holding all 12 leg joints one
way is infeasible everywhere (H119 refuted, so H120 is not testable). Holding only the hip rolls, hip yaws and ankle rolls
(added after the first run) is feasible at every pose and cuts the worst per-pose 5-arcmin loss from 8.6 to **3.7 points**,
but one calibration still leaves **1.4 mm** (1.1 mm at the best calibration pose; least-norm 2.0, torque-minimising 2.6).
A controller makes the press possible; it does not replace compensating backlash pose by pose. Statics only, contact points
from the model's geoms, mu swept 0.3–0.8.

![Press the G1 and H1 soles can balance, upright and leaned into the wall, against hand height; the G1's nail offset along the wall after one calibration under four ground-reaction models](experiments/m32_grf_qp/figure.png)

**Milestone 33: compensate backlash with the robot's own controller model.** The remedy milestones 31–32 named, predicting
each held joint's side from the static torques at every pose and subtracting its bias, leaves **nothing** when the
compensator runs the robot's own balance controller. A compensator that assumes a different ground-reaction split leaves
**1.16–1.92 mm** on the G1, little better than one calibration (1.40–2.63 mm; H121 held). With the controller modelled, a
full 64-nail magazine left out of the model (0.30–0.41 kg of nails, computed) costs **0.017 mm** and +1 kg 0.057 mm when the
controller holds the light leg joints, but 0.41–0.84 mm under a torque-minimising controller; H122 is refuted on its
strict count (2 joint-pose cases mispredicted at +0.4 kg). Compensating only joints with |tau| above a guard band does not
help: each joint left out costs half a gap (H123 refuted). The rule: pair a sign-holding controller with compensation
computed from it. Statics only; the robot is still the model.

![Worst G1 nail offset along the wall after model-based backlash compensation against unmodelled tool mass, for each compensator model and two balance controllers, and against a guard band](experiments/m33_compensate/figure.png)

**Milestone 34: how stiff must a nailing robot's joints be under the press?** Between the nose touching the sheet and
the shot, the press grows (anywhere in 25–50 N) and every joint winds up elastically. No torsional stiffness is
published for the G1 or H1, so it is swept. If the nose can slide on the sheet, the windup lands in the nail's entry
point: **3.2 mm** at the worst G1 pose at k_t 1e4 N m/rad, **5.5 points** of clean sheets lost (H125 held), and staying
within 2 points needs **k_t ≥ 1.8e4 N m/rad** on every joint. If friction holds the nose, the windup only tilts the
tool about it, 0.02 mm at the nail's tip (H126 held). Whether it holds is a property of the pose, not of the stiffness:
the G1 needs a friction coefficient of 0.07–0.79, so at mu 0.4 it sticks at **10 of 15 poses** (H124 refuted), and
friction-limited sliding brings the requirement down to about 1e4. The windup's mean is a pose bias a model computes
(12 mm vertically after one calibration at 1e4). The servo is far softer: a full magazine left out of the feedforward
droops the G1's nose by **32–51 mm** under Unitree's PD gains (H127 held), which the joint encoders see and a re-targeting
loop removes. The rules: grip the sheet with the nose, ask for joints stiffer than about 1e4 N m/rad behind the encoder,
and close the loop on the encoders. Statics only; stiffness and friction swept.

![Clean sheets lost to the press window against joint stiffness, the friction each leaned pose needs for the nose to stick, and the windup at the nose and the nail's tip](experiments/m34_windup/figure.png)

**Milestone 35: does a nail gun's air hose throw a robot off the stud?** Earlier milestones counted the hose as mass, if
at all. A 3/8 in × 50 ft hose (listed at 5.1 lb hybrid, 9.21 lb rubber) hangs from the tool to the floor and, once the
robot has walked along the wall, drags behind it: a downward pull of 0.6–4.3 N from the hanging length plus a horizontal
tension of up to 1–22 N that floor friction holds (friction and dragged length swept), in whatever direction the hose
runs. Neither the balance controller nor milestone 33's compensator knows it. At a joint stiffness of 1e4 N m/rad a
**5 N** pull winds the G1's nose up **1.25 mm** (H130 held), worst when it pulls towards the wall, where it acts like a
change of press (H131 refuted). It leaves the matched backlash compensator **1.0 mm** along the wall (H129 held); even
the hanging hose leaves 0.47 mm, because its weight changes with grip height (H128 refuted). With the tension anywhere
in 0–5 N the worst G1 pose loses **2.2 points** of clean sheets; in 0–10 N, **21 points**. Under Unitree's PD gains the
same 5 N droops the servo by 175–205 mm, which the encoders see. The rule: take the hose off the tool (a boom or balancer
from above), measure the tool's wrench, or keep the drag to a few newtons. Statics only; hose weights from listings,
floor friction swept.

![Nose windup and the matched compensator's residual against the hose's horizontal tension, and the stack points lost when the tension is unknown](experiments/m35_hose/figure.png)

**Milestone 36: does a wrist force-torque sensor fix the hose?** The compensator now predicts each joint's load from the
measured wrench instead of a no-hose model. With a Robotiq FT 300's listed noise (0.1 N, so 0.2 N at 2σ) the G1's worst
residual along the wall at a 20 N drag falls from **2.34 to 0.29 mm**, and with the drag anywhere in 0–20 N the worst
pose loses **1.6 points** instead of 91.6 (H135 held). Misjudging the joints' stiffness by 25% costs little (0.06–0.10 mm
at 5 N; H134 refuted). But the residual does not fall below about **0.3–0.5 mm** whatever the sensor: at a 5 N drag a
0.01 N error already leaves 0.27 mm and 0.2 N leaves **0.82 mm** (H132 refuted), because a held joint sitting within
0.0014–0.05 N m of the 0.2 N m holding threshold gets predicted on the wrong side of its gap. The pre-2017 FT 300
(1.2 N noise) is worse than no sensor (H133 held). The rule: measure the wrench for the windup, and keep held joints away
from the threshold (a preload) before trusting model-based backlash compensation. The sharp threshold is milestone 30's
model, not a measurement; statics only.

![Residual along the wall with and without a wrist F/T sensor, the floor set by joints at the friction threshold, and the stack points lost](experiments/m36_wrist_ft/figure.png)

**Milestone 37: does a held-joint preload remove the sensor's floor?** Here the controller plans once from the measured
wrench and the robot then settles under the true load, a stricter error model than milestone 36's. Without a preload
that leaves the G1 **1.38 mm** at a 5 N drag and costs **56.5 points** over 0–20 N, because the balance controller holds
its chosen leg joints exactly at the friction threshold: 92% of the mispredicted joints are those (H136 held).
Commanding every leg joint at least **0.1 N m** clear of the threshold removes every one of them and gives back milestone
36's figures: **0.83 mm** at 5 N and **1.64 points** over 0–20 N, for 1.7% more leg torque and one of 15 G1 poses lost
(H138 refuted). It does not reach the target of 0.1 mm (H137 refuted): what is left comes from waist and arm joints at the
threshold, which no choice of ground reaction can move. A hedged compensator (a quarter gap near the threshold) does not
halve the error (H140 refuted), and the pre-2017 FT 300 still leaves 1.35 mm (H139 held). The rule: hold leg joints a
margin clear of the threshold; the arms need a different preload (a two-handed squeeze) or less backlash. The settle
model and the 0.2 N m threshold are modelled, not measured; statics only.

![Worst residual along the wall against the preload margin for two sensors, and the hedged compensator](experiments/m37_preload/figure.png)

**Milestone 38: can a two-hand squeeze preload the arms?** A force pair along the line between the two grip points
pushes the hands together (or apart) without changing the tool's wrench, so it moves only the arm joints: the base,
legs and waist see at most 1e-16 N m per newton (H141 held). Chosen by the controller from its plan, a squeeze of up to
**10 N** clears all 14 arm flips (H143 held). With milestone 37's leg preload and the FT 300, the G1's worst residual at a
5 N drag falls from 0.83 to **0.49 mm** (H144 held) and at 20 N from 0.29 to 0.01 mm, and the 0–20 N stack loss from
**1.64 to 0.05 points** (H1: 2.19 to 0.02). The G1's arm margin at 20 N is 0.07 N m at its worst pose, not the 0.1
registered (H142 refuted). What is left, up to **0.50 mm**, is in the waist (the H1's torso), which no squeeze or ground
reaction can move (H145 held). With the pre-2017 sensor the squeeze makes some cells worse. Side finding: holding the
3.4 kg nailer, the G1's right wrist pitch already exceeds its 5 N m model rating at 7 of 14 poses, so the squeeze is
not allowed to push any joint further past its limit. Grip force is swept (no hand publishes one), the squeeze is an
ideal force pair, statics only.

![Worst residual along the wall against the squeeze bound for two sensors, and which joints still flip](experiments/m38_squeeze/figure.png)

**Milestone 39: what does the waist's backlash cost, and does a brake fix it?** Milestone 38 left up to 0.50 mm in the
waist joints, whose torque only the tool's load sets. With its 10 N squeeze, milestone 37's leg preload and the FT 300,
a **braked waist** (no gap) takes the G1's worst residual at a 5 N hose drag from 0.485 to **0.012 mm** (H146 held) and
its 0–10 N stack loss from 5.80 to **0.04 points**; the H1 at 5 N goes from 0.501 to 0.019 mm. A **1 arcmin** waist
gearbox gives 0.106 mm and 0.11 points (H148 held). Locking waist roll and pitch, as on the base G1 (one waist joint,
unitree.com/g1), **changes nothing**: the joint that flips is the yaw (H147 held). With the pre-2017 sensor a braked
waist still leaves 0.87 mm (H150 held). All five registered hypotheses held. The brake is ideal and locks at the posed
angle (poses not re-solved); waist backlash is swept, not published; statics only.

![Worst residual along the wall for each waist case and two sensors, and the clean-sheet loss over a drag range](experiments/m39_waist/figure.png)

**Milestone 40: does the nailer's recoil undo the spec?** No figure for a framing nailer's recoil had been found, so
it is bracketed from published measurements: an 8d nail at chronograph speeds (29.8–36.9 m/s, Buchalter et al. 2002)
carries 0.13–0.16 N s, a floor, and Lowe et al. (2014)'s force-plate data give at most about 8.7 N s per nail. That
straddles the 0.25–1 N s at which [`buildbot-recoil`](../buildbot-recoil)'s nose leaves the wall, so each nail
starts from a lifted nose and a press that rises again. That rise **sets none** of the joints milestones 30–39 scored
as loose (H151 refuted): of 56 loose nose-moving joints, 36 change sign and 7 rise through the holding threshold
inside the 25–50 N window, so where they sit depends on the firing force, and the 11 below it peak at 0.16 N m on the
rise against a 0.2 N m threshold. With the spec (FT 300, leg preload, 10 N squeeze, braked waist) the G1's worst
residual at a 5 N drag stays **0.012 mm** (H152 refuted, H153 held); only at a 20 N drag does the rise set one wrist
joint, leaving 0.203 mm unless the compensator plans the rise. The finding with consequences is the stance: at
**12 of 35 poses** (the G1 at 1.0–1.2 m, milestone 30's calibration pose among them; the H1 at 1.4–1.6 m) the leaned
stance balances only above 3.7–11.8 N of press, so a recoil that lifts the nose leaves the robot leaning on nothing.
Quasi-static rise, no recoil transient simulated; the holding threshold is unsourced.

![Lowest press each leaned stance balances at, and how close the loose joints come to the holding threshold on the re-press](experiments/m40_liftoff/figure.png)

**Milestone 41: can every stance stand when the nose lifts?** Yes, by leaning less, but near the top of the wall
only just. Each of milestone 40's 12 press-dependent poses was re-leaned to the furthest-forward lean that still stands
at zero press: the centre of mass moves back 10–39 mm and every one then balances over the whole 0–50 N (H156 held;
H157, "at most 20 mm", refuted). The window's width is exactly (m + m_tool) g × sole length / grip height, so the
ceiling is a formula: a zero-press stance that still takes a 50 N press exists only below a **1.225 m** grip on the
G1 and **1.883 m** on the H1, and the G1 at 1.2 m keeps **1.6 N** to spare. With milestone 38's setup rebuilt on the
new poses, the braked spec holds (G1 **0.011 mm**, H1 0.019 mm at a 5 N drag; H159 held), one H1 pose loses its
controller (H158 refuted), and the G1's worst no-hose stack falls **1.3 points**, 0.9160 to 0.9030 (H160 refuted).
Statics; the lean's and the controller's side choice's shares of that loss are not separated.

![Press range each stance balances, before and after re-leaning to stand at zero press, against the rigid-body width](experiments/m41_stance0/figure.png)

**Milestone 42: is that 1.3-point loss the stance or the controller?** The stance. Re-leaning flipped four of the
G1's six held leg-joint sides (both hip rolls, both ankle rolls), so a 2 × 2 (leans × sides) separates them: at the
G1's worst pose the lean costs **1.30 points** and the sides **0.00**, with no interaction (H161–H163 held), and at
every pose where both side choices solve they give the same stack to the printed digit, because a side says which way
a joint is held, not whether. The flip still matters: with the old sides one re-leaned G1 pose has no controller
solution (H164 refuted). A post hoc check also corrects milestone 41's per-pose figures, which compared stacks from
two torque conventions: like for like, the re-lean costs the H1 **0.09–0.29 points** per pose (not 0.1–0.9), and the
G1 loses 0.31–1.30 at four poses and gains 0.60–0.79 at two. Statics, 'hold-min' torques without the leg preload.

![The no-hose clean-sheet stack at each re-leaned pose in the four lean × sides cells: the sides never move a bar](experiments/m42_sides/figure.png)

**Milestone 43: what does the zero-press stance cost in the spec's own plan?** On the G1, nothing: it gains. Milestones
41 and 42 used the controller's 'hold-min' torques; the spec re-plans its 0.1 N m leg preload and 10 N squeeze for each
stance, and with those the G1's worst no-hose stack rises from 0.9160 to **0.9257** with the braked waist (+0.97
points) and from 0.9081 to 0.9257 with the stock one, over the same poses plus one the old lean could not plan. At the
worst pose the two conventions now differ by 2.70 points (0.9300 against 0.9030). The cost moves to the H1 near the top
of its reach: two re-leaned poses keep a controller but cannot carry the 0.1 N m leg preload at a 50 N press (the
stance allows 0.033 and 0.095 N m), so only 3 of its 6 re-leaned poses have a spec plan; those lose 0.09–0.22 points.
H166–H168 held, H165 and H169 refuted. Statics, zero hose force, exact sensor.

![The no-hose clean-sheet stack at each re-leaned pose, spec plan against 'hold-min' torques, before and after the re-lean](experiments/m43_specstack/figure.png)

**Milestone 44: can a smaller leg preload rescue the H1's two dropped poses?** One of them. Preloading each leg to 0.9
of what the stance allows (0.030 and 0.085 N m instead of 0.1) gives both poses a spec plan, and the clean-sheet stack
does not move at all between 0 and 0.085 N m (0.9715 and 0.9668, 0.08 and 0.27 points under the old lean). But with a
0.2 N sensor error the worst residual along the wall becomes **0.172 mm** (0.241 mm at 20 N of hose drag), against
0.019 mm on the other poses. Post hoc, all of it is at (1.4 m, −0.15 m), where a joint in the controller's hold set
flips under the sensor error and the leg preload cannot reach it; at (1.6 m, 0) the residual is 0.003 mm. So the
zero-press stance keeps a spec-grade plan at 4 of the H1's 6 re-leaned poses. H170, H172 and H173 held, H171 and H174
refuted. Statics.

![The H1's worst residual along the wall: 0.010 to 0.032 mm on the other poses, 0.17 to 0.24 mm on the re-planned ones](experiments/m44_legpreload/figure.png)

**Milestone 45: can a hold-first preload rescue (1.4 m, −0.15 m)?** No; the pose needs a better wrist sensor instead.
The joint that flips there is the right hip roll, a joint the controller holds and one the leg preload already
reached (milestone 44's post hoc was wrong to say otherwise): planned 0.030 N m above its friction threshold, a 0.2 N
sensor error moves it 0.033. Giving the hold set its own margin first, with every other leg allowed down to its
threshold, raises it only to **0.0339 N m** (from 0.0333): the stance itself caps that joint, while the other legs
had 0.19 N m to spare. So the residual stays **0.172 mm** at 0, 5 and 20 N of hose drag (20 N falls from 0.241), at
no stack cost. Post hoc, the joint moves 0.163 N m per newton of sensor z error, so the pose meets the spec only
with a z error under about 0.19 N: 0.001–0.004 mm at 0.05–0.15 N (an ATI Mini45-class sensor), 0.172 mm at an FT
300's 0.2 N. H176, H179 and H180 held, H175, H177 and H178 refuted. Statics.

![Where the margin is at H1 (1.4 m, −0.15 m), and the worst residual along the wall with the hold-first tiers](experiments/m45_tiered/figure.png)

**Milestone 46: was the right hip roll held on the wrong side?** Yes, and with it on the other side the pose meets the
spec with an FT 300. Milestones 32 to 45 chose each held joint's side once per robot. At (1.4 m, −0.15 m) that side
pins the right hip roll at exactly its friction threshold, while the torque-minimising controller wants −3.8 N m.
Held on the other side, the stance allows a common leg margin of **2.29 N m** at 50 N (from 0.033), the pose takes the
spec's full 0.1 N m preload, and its worst residual along the wall falls from 0.172 to **0.005 mm** at 0, 5 and 20 N
of hose drag with a 0.2 N sensor error. The H1's worst over all 19 poses returns to 0.010 / 0.019 / 0.032 mm, at no
stack cost (0.9716). Milestone 45's sensor bound belonged to the wrong side. The per-robot side is also wrong at both
window ends at four other H1 poses, which still meet the spec, so per-pose sides are the next step. H181 to H185
held, H186 refuted. Statics.

![The right hip roll's hold side at H1 (1.4 m, −0.15 m): the margin the stance allows and the worst residual along the wall](experiments/m46_holdside/figure.png)

**Milestone 47: should each pose choose its own hold sides?** For the H1 yes, for the G1 not by this score. Each pose
took the hold-side combination with the largest common leg margin at zero hose force. Every pose of both robots then
clears the spec preload's goal (smallest margin 0.886 N m, from 0.033), the two H1 poses that had no plan on the
per-robot sides get one (margins 12.8 and 6.6 N m), and the H1's worst residual along the wall with a 0.2 N sensor
error falls to 0.010 / 0.014 / **0.010 mm** at 0 / 5 / 20 N of hose drag (from 0.010 / 0.019 / 0.032), at no stack
cost. The G1 goes the other way: 0.011 / 0.025 / **0.037 mm** (from 0.016 / 0.011 / 0.011), over the 0.03 mm spec at
20 N, because at three poses a leg joint the zero-drag score never looked at flips under drag. Sides should be scored
at the loads the robot meets. H187 to H189, H191 and H192 held, H190 refuted. Statics.

![Common leg margin at every pose on one side per robot against per-pose sides, and each robot's worst residual along the wall](experiments/m47_poseside/figure.png)

**Milestone 48: what if hold sides are scored under hose drag?** The G1 is back in spec and the H1 keeps its gain.
Each pose took the side combination whose smallest common leg margin over 17 hose loads (0, 5 and 20 N, eight
directions) and both press ends is largest. The G1's worst residual along the wall with a 0.2 N sensor error is
0.016 / 0.011 / **0.011 mm** at 0 / 5 / 20 N of drag (milestone 47: 0.037 at 20 N), the H1's 0.010 / 0.014 /
0.010 mm, and no pose's stack moves. Two limits: at 8 of 34 poses (the G1's 1.0 and 1.2 m grips, the H1's 1.6 m) no
side has a plan with 20 N pulling backward at the 50 N press, so those poses keep the old sides; and a post hoc finds
the G1's worst residuals since milestone 41 are worst over the 83% of swept cases that have a plan (258 of 1530
pose-cases have none), so coverage belongs beside every worst case. H193 to H195 and H197 held, H196 and H198
refuted. Statics.

![Worst common leg margin over the hose sweep per pose on three side rules, and each robot's worst residual along the wall](experiments/m48_loadside/figure.png)

**Milestone 49: why do 8 poses have no plan under a backward hose?** The robot tips back; the solver is not wrong.
At the 50 N press end of all 24 failing (pose, hose load) cells, no contact force balances the base inside the
μ 0.5 friction cones (best cone slack &minus;23.77 to &minus;0.10 N), while the 25 N end balances at every cell and
the preload margin LP solves at all 984 hold solutions there. Milestone 48's post hoc had misread its own table as a
disagreement between two solvers. The soles' net horizontal load is at most 0.19 of the vertical, so it is not
sliding: 13 of the G1's 18 cells do not balance even with unlimited friction. 20 N of backward drag lowers the top
of the press window by about 15 N (G1 51.6 to 36.4 N, H1 58.7 to 42.8 N), below the 50 N firing press. Those poses
need a forward lean that covers the drag, or a hose routed so it does not pull back. H199 and H200 refuted, H201 to
H203 not tested (they were conditional on a solver fault). Statics.

![Largest press the soles balance with and without each cell's hose drag, and the best friction-cone slack at a 50 N press](experiments/m49_backload/figure.png)

**Milestone 50: can a forward lean fix it, and how much hose drag can a humanoid nailing a wall take?** No lean
fixes it; the hose has to be managed. On a 5 mm grid of forward lean (0 to 150 mm, then refined), the worst
friction-cone slack over 17 hose loads at a 25 and a 50 N press stays below zero at all 8 poses (best &minus;0.69 N
for the G1 at 1.0 m grips, &minus;10.12 N at 1.2 m): leaning forward buys headroom against a hose pulling back and
spends it against one pulling forward. At its current lean the G1 at 1.2 m grips tolerates only 4.0 to 4.2 N of hose
tension pulling straight back, about 3 m of rubber air hose dragging on the floor at μ_f 0.5 (unsourced); at its
best lean 11.4 to 13.4 N in every direction. The tolerated drag is linear in the press headroom, (top &minus; 50 N) / 0.78,
to within 9% (H206 held); H204 and H205 refuted, H207 not tested. Statics.

![Worst friction-cone slack over 17 hose loads against forward lean, and the hose tension each pose tolerates per direction](experiments/m50_relean/figure.png)

**Milestone 51: does keeping the hose inside each pose's drag limit give every case a plan?** Not quite. Every swept
case whose drag exceeds milestone 50's limit (at the pose or at the calibration pose) has no plan: 162 of 162 on the
G1, 36 of 36 on the H1. Inside that envelope the G1 plans 93.0% of its cases (83.1% overall) and the H1 99.7%, and the
worst residuals stay in spec (G1 0.016 / 0.011 / 0.011 mm, H1 0.010 / 0.014 / 0.010 mm at 0 / 5 / 20 N; H209 held).
But 101 cases inside it still have no plan (H208 refuted): 75 of the G1's 96 come from its one calibration pose, 45 of
them under 20 N pulling sideways, at 35% of the drag it balances, and with an exact sensor too. The rest are plan
limits at the 1.0 to 1.6 m grips and sensor error (H210 held). So the G1 needs the calibration taken with the hose
slack, as well as the per-pose drag limits. Statics.

![Why the sweep drops cases (outside the drag envelope, or a plan limit inside it) and the worst residual inside the envelope](experiments/m51_envelope/figure.png)

**Milestone 52: does calibrating with the hose slack fix the G1's coverage?** Yes. With the one calibration move made
under the hanging hose's weight alone (each press keeps its hose load), the calibration plans at every sensor-error
axis on both robots (H213 held), and inside milestone 51's drag envelope the G1 plans 1342 of 1368 cases, **98.1%
(from 93.0%)**; the H1 stays at 99.7% (H211 held). No residual changes by as much as 5e-5 mm (H212 held: worst G1 0.016 mm,
H1 0.014 mm): the compensator subtracts the hose load the wrist sensor measures, so the error the calibration absorbs
is the sensor's bias alone, the same under any load. A practical rule: calibrate with the hose slack, then keep each
pose inside its drag limit. What is left are plan limits at the poses themselves (21 G1 cases at the 1.0 and 1.2 m
grips, 5 H1 at 1.6 m) and 5 G1 sensor-error cases. Statics; the sensor error is a constant bias (a gain error would
make the calibration load-dependent and is not modelled).

![Coverage inside the drag envelope with the calibration under load and with the hose slack, and the dropped cases that remain](experiments/m52_slackcal/figure.png)

**Milestone 53: what fails at the last plan limits, and does choosing the hold sides per hose load fix them?** It
does. At 20 of the 26 remaining plan limits the failing step is the leg preload, not the hold QP (H214 refuted): the
pose's hold sides leave a common leg margin of only 0.004 to 0.092 N m on the G1 (0.019 to 0.062 N m on the H1)
against the 0.1 N m asked, bound at an ankle roll or hip joint. Re-choosing the hold sides at each press from the
measured load (keep the pose's sides when they plan, else the combination with the largest leg margin) gives a plan
at 31 of the 33 dropped cases with 1.8 to 5.2 N m of margin, and inside milestone 51's drag envelope **both robots
now plan every case: G1 1368 of 1368, H1 1902 of 1902**, with no worst residual changed (largest recovered 0.0106 mm;
H216 held). The two left (H215 refuted) are G1 sensor-error cases outside milestone 51's envelope, where no side
combination has a hold solution. The rule set: calibrate with the hose slack, keep each press inside its pose's drag
limit, and pick the hold sides per measured load. Statics; the time and wear of switching sides between presses are
not modelled.

![Common leg margin on the pose's hold sides and on the sides chosen per load at each dropped case, and coverage inside the drag envelope for milestones 51 to 53](experiments/m53_loadside/figure.png)

**Milestone 54: do the hose rules hold off the 8-direction grid?** Coverage does; accuracy, not quite. At 48
Latin-hypercube hose loads (0 to 20 N, any direction; seed 54), with each pose's drag limit bisected at the sampled
direction (the same test reproduces milestone 50's grid limits exactly), **both robots plan every case inside the
drag limits: G1 4002 of 4002, H1 5436 of 5436** (H217 held; 116 of them by per-load sides). But **4 of those 9438
cases leave the 0.03 mm spec, the worst 0.284 mm** (G1, 0.4 m grip, 13.2 N at 290 degrees; H1 0.032 to 0.042 mm at
its 1.2 m grip; H218 refuted). Post hoc, each is one joint whose torque sits at the 0.2 N m friction threshold, so the
plan (from the measured load) and the robot (under the true load) disagree on whether it is held: half a backlash gap
of error on that joint, inside direction spans 2.75 to 4.75 degrees wide that a 45 degree grid steps over. Milestone
53's per-load sides clear the 3 H1 cases but not the G1's, an arm joint. The grid's drag limits are also up to 2.17 N
optimistic between directions (21 G1 pose-directions at the 0.4 to 0.8 m grips; H219 refuted), but only at limits
above 23 N; the binding limits (G1 1.2 m, H1 1.6 m) sit straight back, on the grid. Next: a held-or-free margin
that covers the sensor error on every joint. Statics; constant sensor bias.

![Drag limit at each sampled direction against the grid's smaller neighbour, and the worst in-envelope residual at each Latin-hypercube hose load](experiments/m54_lhs/figure.png)

**Milestone 55: does a held-or-free margin that covers the sensor error fix milestone 54's misses?** For the
spec, yes; for coverage, at a cost. Planned-to-settled torque is linear in the load error (checked to 2e-13 N m), so
each joint's worst change under a 0.2 N sensor error is r<sub>j</sub> = 0.2 N &times; ||G<sub>j</sub>||, up to
0.27 N m. The robust rule plans only when every joint's torque at both press ends is more than r<sub>j</sub> from the
0.2 N m friction torque, re-choosing the squeeze and, failing that, the hold sides. On milestone 54's 48 loads
**every planned in-envelope case is inside spec, worst 0.011 mm** (from 0.284 mm; H220 held), with no held or side
flip between plan and robot in 18 119 planned cases, and all 4 old misses plan in spec. But **coverage falls to
96.4% (G1) and 96.6% (H1)** (H221 refuted), and on 48 fresh loads with off-axis sensor errors to 95.9% and 96.8%
(H222 refuted; milestone 54's rule had no miss on that seed). Most drops bind on the G1's waist or the H1's torso,
which neither the leg preload, the squeeze nor the hold sides can move, and every case the rule dropped on the
fresh loads was in spec under the old rule (post hoc). Next: weight the margin by what a flip costs at the nose, or
preload the waist. Statics; constant sensor bias.

![Worst in-envelope residual per fresh hose load under milestone 54's rule and the robust rule, and coverage by section and robot](experiments/m55_robust/figure.png)

**Milestone 56: can the margin be spent only where a flip costs accuracy?** Yes. The residual along the wall is
linear in the joint error, so each joint's worst flip shifts the nose by c<sub>j</sub> = |w<sub>j</sub>| times the
largest backlash-term change its torque band can reach (`preload.flip_cost`, 6 tests), and Y = &Sigma; c<sub>j</sub>
bounds the backlash part of the residual. Planning when Y is at most half the 0.03 mm spec, **every planned
in-envelope case stays in spec across three load sets (worst 0.0178 mm; H223 held), and coverage returns to 100% on
the G1 and 99.6 to 99.9% on the H1** (H224 held; from 95.9 to 96.8%): paired with milestone 55, the rule plans every
case it planned and wins back 637 of its 667 drops. Over 28 158 planned cases the flip shift never beats Y (H225
held), and on single-joint flips it equals Y, so the bound is tight. The G1 waist and H1 torso that bound milestone
55 cost nothing here; what is left is 42 H1 cases on the left knee (one flip costs 0.017 to 0.025 mm) or the right
elbow (0.167 mm). Next: sweep the budget share on a held-out seed and give the z residual a budget too (milestone 57). Statics;
constant sensor bias.

![The flip bound Y against the flip shift the robot showed, and coverage under milestone 55's and 56's rules](experiments/m56_weighted/figure.png)

**Milestone 57: how much of the spec should the flips get?** On 48 held-out loads (seed 57), the half-spec rule
replicates (worst 0.0178 mm, coverage G1 99.93% and H1 99.54%; H226 held), but **the budget buys no coverage until
&beta; = 0.75**: &beta; = 0, 0.25 and 0.5 plan exactly the same presses (H228 held), and &beta; = 0.75 wins back only
the H1's 25 left-knee cases. At &beta; = 1 one H1 press leaves 0.0315 mm (H227 refuted): the bound held, but it used
the whole spec and windup adds on top. **Every flip the budget lets through is a knee or ankle pitch joint that moves
the nose 0.27 to 0.29 mm across the wall (z)**, a direction the rule never budgets; at &beta; = 0 the worst z is
0.026 mm. On this seed &beta; = 0 dominates. Next: bound the y and z rows together. One seed; statics; constant
sensor bias.

![Coverage against the worst residual for each budget share, and the worst residual along and across the wall](experiments/m57_beta/figure.png)

**Milestone 58: price each flip across the wall too.** Each joint's flip cost now goes through both in-plane rows of
the nose Jacobian, along the wall (Y<sub>y</sub>) and across it (Y<sub>z</sub>), each with half of a 0.03 mm spec,
and the squeeze and hold sides minimise the larger of the two. On 48 more held-out loads (seed 58), the y-only rule
again leaves 4 G1 and 5 H1 presses over 0.03 mm across the wall (worst 0.27 and 0.29 mm; H231 held). **With both rows,
every planned press is inside 0.03 mm in both directions (worst z 0.022 mm on the G1, 0.018 mm on the H1; H229
held), and coverage does not move: 100% on the G1, 99.63% on the H1 (H230 held).** The z row moves plans to other
hold sides rather than dropping them, and a looser 0.3 mm z spec gives the same plans. One seed; statics; constant
sensor bias; the z spec is carried over from y, not sourced.

![Worst residual along and across the wall, and coverage, under the y-only and two-row bounds](experiments/m58_tworow/figure.png)

**Milestone 59: does the nail's angle need its own bound?** No, at these poses. The same flip cost was taken through
the rows of the depth point, 44.4 mm along the nail (sheathing plus required penetration, where the stud bound is
checked), as well as the nose's. On 48 more held-out loads (seed 59), **milestone 58's two-row bound already keeps the
depth point inside 0.03 mm (worst 0.022 mm on the G1, 0.018 mm on the H1; H232 refuted), the nail axis tilts at most
0.034 mrad, and the four-row bound plans exactly the same presses: 100% on the G1, 99.65% on the H1 (H233, H234
held).** The flips the bound admits are leg joints whose lever arm is the whole body, so the extra 44.4 mm against a lever arm near a
metre should change their rows by a few percent (an estimate, not computed row by row). One seed; statics; the depth spec is carried over from the nose, not sourced.

![Worst residual at the nose and the depth point, and coverage, under the two-row and four-row bounds](experiments/m59_depth/figure.png)

**Milestone 60: can a stronger leg preload plan the presses the bound refuses?** Mostly. Those presses fail because
one leg joint's torque sits so close to its gearbox's holding threshold that the 0.2 N sensor error can flip it. For
each such case the leg preload margin was raised from 0.1 N m up a ladder. On 48 more held-out loads (seed 60),
**raising it to 0.12 to 0.18 N m plans 17 of the H1's 18 unplanned presses (all binding on the left knee), inside
0.03 mm at the nose and the depth point with no flip, and lifts H1 coverage from 99.67% to 99.98% (H237 held)**. The
controller's leg effort rises by a median 0.1% (at most 13.5%, at the 1.6 m pose). Four cases stay unplanned: one
binding on an H1 elbow, which no leg preload reaches, and three G1 cases at one load with no plan on any side, so
H235 is refuted; preloading only the binding joint plans the same 17 (H236 refuted; the right-ankle cases of the
development seed did not recur). One seed; statics; the ladder's steps are chosen, not tuned.

![Smallest raised preload that plans each unplanned press, and the residuals of those plans](experiments/m60_jointpreload/figure.png)

**Milestone 61: what is left after the leg preload raise?** On seed 60 four presses stayed unplanned: one H1 press
binding on an elbow and three G1 presses at one load with no force plan on any hold side. A development probe on those
four found the elbow press planned by a squeeze of 12.5 N (milestone 38's 10 N bound is a choice, not a hardware
limit), and the G1 presses at or past the planner's own hold limit, which can be much tighter than the balance test
that decides whether a load is "in the envelope". On 48 more held-out loads (seed 61), **the rule plus the leg raise
plans every in-envelope press on both robots, 4050 of 4050 on the G1 and 5436 of 5436 on the H1, all inside 0.03 mm
with no flip (H240 held)**. Neither leftover mechanism recurred, so the squeeze and envelope-band hypotheses (H238,
H239) could not be tested. The balance gate is looser than the planner's limit on its own hold sides in 314 of 720 G1
and 115 of 912 H1 pose-direction pairs, by up to 31 N and 44 N; other hold sides recover those loads. One seed;
statics; the squeeze ladder and the 0.5 N band are chosen, not derived.

![Balance limit minus the planner's own limit for every pose and hose direction](experiments/m61_lastfour/figure.png)

**Milestone 62: is the robot's balance check the right "can this press be planned?" test?** Milestone 61 found the
quick balance test up to 44 N more generous than the planner's own hold limit. Here the planner's limit is bisected
over **every** hold-side combination (64 on the G1, 16 on the H1) at every pose and hose direction of 48 new held-out
loads (seed 62). **Choosing hold sides per load closes the gap: the planner's limit equals the balance limit to
0.01 N in 712 of 720 G1 and 904 of 912 H1 pose-direction pairs** (H241 held); the 7 G1 pairs short by more than
0.5 N are all at 46 to 60 N, far above any working hose load. The chain plans every press inside the exact gate,
9384 of 9384, and every press inside the balance gate, G1 3996 of 3996 and H1 5400 of 5400, all inside 0.03 mm
(worst 0.024 mm; H242 held), the second held-out seed in a row with full coverage. The 0.5 N safety band costs 12 G1 presses (0.30%,
H243 refuted at its 0.3% ceiling) that the chain plans anyway. One seed; statics; monotone feasibility assumed in the
bisection.

![Balance limit minus the planner's limit, on the pose's own hold sides and on the best hold-side combination](experiments/m62_exactgate/figure.png)

**Milestone 63: does the 0.03 mm guarantee survive a sensor bias aimed at the robot's weakest joint?** Every check
since milestone 55 drew the 0.2 N wrist-sensor bias in 6 random directions per seed. A real sensor's offset is not
random, so here, for each pose and load, the bias is aimed (both signs) along the settle gradient of the joint the plan
leaves nearest its friction threshold, on 48 new held-out loads (seed 63). **No planned press leaves 0.03 mm under
the aimed bias: worst G1 0.0180 mm, H1 0.0203 mm** (H244 held), and the chain plans G1 1359 of 1360 and H1 1812 of
1812 balance-envelope cases (H245 held); the one refused load sits 0.06 N under its balance limit, inside milestone
62's 0.5 N band. The aimed bias sets a new worst on the H1 (0.0203 against 0.0182 mm for random directions) but not on
the G1 (0.0180 against 0.0238; H246 refuted): the rule keeps the weakest joint from flipping, and what is left comes
from flips the budget admits on other joints. One seed; statics; a first-order adversary aimed at the margin, not a
search for the largest residual.

![Worst residual under the aimed 0.2 N bias against the worst of 6 random biases, per pose and load](experiments/m63_worstbias/figure.png)

**Milestone 64: how much bigger can the sensor bias get before the 0.03 mm guarantee fails?** None. The planner's
margins are sized to a 0.2 N wrist-sensor bias; here the true bias is 0.3, 0.4, 0.6 or 1.0 N along milestone 63's
worst direction, on 48 new held-out loads (seed 64). **At 0.3 N, 22.6% of planned G1 presses and 12.0% of planned H1
presses leave 0.03 mm (worst 0.29 and 0.47 mm)**, against a worst of 0.02 mm at 0.2 N (H247 refuted); at 1.0 N, 82%
and 75% (H248 held). The planner still plans at least 99.85% of balance-envelope cases at every bias, so coverage
gives no warning. At 0.3 N every failure is a backlash flip at the press pose; from 0.4 N on, a flip in the
reference calibration and the bias's direct effect add failures with no flip at the press (H249 refuted). The bias
bound is a sensor specification that must hold (a known-load check before each wall), not a figure with slack behind
it. One seed; statics; the worst direction, not random ones; the planner re-sized to a larger bias not yet run.

![Worst residual and share of planned presses over 0.03 mm against the true sensor bias, planner sized to 0.2 N](experiments/m64_overbias/figure.png)

**Milestone 65: does sizing the planner to a larger sensor bias restore the 0.03 mm guarantee, and what coverage does
it cost?** Up to 0.3 N, yes, and almost nothing. Every margin is sized to the bias bound B and the true bias is B along
the worst direction, on 12 new held-out loads (seed 65; 48 were registered, cut for run time). **Sized to 0.3 N, no
planned press leaves 0.03 mm (worst 0.027 G1, 0.029 mm H1) and coverage is 100% G1, 99.1% H1** (H251 held), where the
0.2 N planner left 12 to 23% of presses over spec. From 0.4 N on presses fail again (H1 2.5% at 0.4 N, both robots
about 48% at 1.0 N; H250 refuted), but not by flips: 465 of the 485 failures have none. The worst residual grows about
0.075 to 0.097 mm per newton of bias, the bias's direct effect through the robot's compliance, and the four-row
budget prices only flips. Coverage stays at least 85.6% at 1.0 N (H252 refuted), so coverage is not the cost. The
next step is to budget that direct term. 12 loads, one seed; statics.

![Coverage and worst residual against the bias bound the planner is sized to, against keeping the 0.2 N planner](experiments/m65_resized/figure.png)

**Milestone 66: if the planner prices the sensor bias's direct effect beside the backlash flips, does the 0.03 mm
guarantee come back at 0.4 to 1.0 N?** No: the price is too high to plan anything. For the plan milestone 65's chain
picks, the planner computes D, the largest first-order no-flip residual any bias within B could cause in each row, from
the measured load alone, and accepts a press only if the flip budget plus D stays inside 0.03 mm. **D is a true bound
(no row of 2,238 planned presses exceeds it; H254 held) but the gate passes none of them at 0.4, 0.6 or 1.0 N**
(H255 refuted), on 12 new held-out loads (seed 66). D is linear in the bias at **0.16 to 0.18 mm per newton per press**,
six to eight times what the margin-aimed bias of milestones 63 to 65 actually produced, so the gate certifies a press only
up to a median 0.17 N (0.15 N at the 10th percentile). The earlier 0.2 N guarantee held against every bias tested but is
not a certificate over every bias direction: whether a bias aimed at the direct term breaks it, once the same bias also
enters the reference calibration, is the next test. One seed; statics.

![Coverage with and without the direct-term gate, and the largest bias the gate certifies per press](experiments/m66_directterm/figure.png)

**Milestone 67: does the 0.2 N guarantee survive a sensor bias aimed at the direct term, with the reference
calibration taken under the same bias?** Yes, and it is now certified rather than only tested. Per press the
adversary measures J, how the no-flip residual of each of the four rows moves per newton of bias when the whole chain
re-plans and the reference calibration is re-made under that bias, and aims the bias where J is largest (almost always
the nail's depth point, across the wall). On 8 new held-out loads (seed 67), **no planned press leaves 0.03 mm at
0.15 or 0.2 N** (worst 0.0282 mm on the G1, 0.0215 mm on the H1; H257 and H259 held), while **at 0.3 N 34% of G1 and
10% of H1 presses do, every one with no backlash flip** (H260 held), where milestone 65's margin-aimed bias left none.
The calibration cancels about half of milestone 66's fixed-calibration term (median 0.46; H258 held). Checked after
the run: the no-flip residual is **exactly linear in the bias** (to 1e-14 mm, whatever plan the chain picks), so
B||J|| is its exact worst case over every bias direction, and it certifies every press to at least **0.213 N (G1) and
0.279 N (H1)**. J depends only on the pose, not the hose load, so that certificate is a table computed once per
pose. One seed; statics.

![Measured through-calibration sensitivity against milestone 66's direct term, and the worst row against the aimed bias](experiments/m67_aimeddirect/figure.png)

**Milestone 68: can a planner certify a press against a sensor bias of 0.3 to 1.0 N before making it?** Yes, from a
table of one sensitivity per pose. Milestone 67's per-pose ||J|| was frozen and used as a gate after the planner:
accept a press only if its flip budget plus B||J|| stays inside 0.03 mm in all four rows. On 12 new held-out loads
(seed 68), under both the direct-aimed bias and the joint-margin bias, **no press the gate passed left 0.03 mm (0 of
3,219; H261 held)**, and the table matched the sensitivity measured afresh on every new press to 4e-14 mm/N (H262
held). Without the gate, the direct-aimed bias breaks 144 G1 and 68 H1 presses at 0.4 N (H265 held). **Coverage is
the price: 64% of G1 and 90% of H1 cases at 0.3 N, 57% and 85% at 0.4 N, 21% and 52% at 0.6 N, 20% and 10% at
1.0 N** (H263, H264 held). Checked after the run: against the direct-aimed bias the realised error equals the bound
exactly, and the flip budget never decides a refusal, so the gate reduces to a **bias rating per pose**,
0.03 mm / max||J||: 0.213 to 1.06 N on the G1 and 0.279 to 1.31 N on the H1. One seed; statics.

![Gate coverage against the bias bound, and the worst row of gate-passed and refused presses under the direct-aimed bias](experiments/m68_jgate/figure.png)

**Milestone 69: does a second calibration pose raise the weakest pose's bias rating?** Yes, by more than double. The
compensated error is the press pose's error minus the calibration pose's, so the sensitivity under any calibration
pose is a subtraction of milestone 67's table, **exact to 4e-14 mm/N on 8 new held-out loads (seed 69; H266 held)**.
From that table alone, before the run, the best pair of calibration poses was chosen (G1 at 0.6 m and 1.0 m grip
height, H1 at 0.8 m and 1.4 m), each pose compensated against the nearer one. Measured afresh, **the weakest bias
rating rises from 0.213 to 0.530 N on the G1 and from 0.279 to 0.564 N on the H1** (H268 held), no press the gate
passed left 0.03 mm (H267 held), and gate coverage is **100% (G1) and 99.3% (H1) at 0.4 N, from 58% and 85%**
(H270 held), and 63% and 84% at 0.6 N, from 21% and 52% (H269 held). Up to 0.4 N, with two calibration poses, the
planner's chain leaves no press over spec at all. One seed; statics; a bias that drifts between calibration and press
is untested.

![Each pose's bias rating with one and two calibration poses, and gate coverage against the bias bound](experiments/m69_tworef/figure.png)

**Milestone 70: what if the force sensor's bias drifts between calibration and press?** The certificate breaks
unless it carries the drift. With bias e<sub>r</sub> at the calibration and e<sub>r</sub> + d at the press, the
no-flip error is **exactly J e<sub>r</sub> + S d, to 1e-14 mm on 8 new held-out loads (seed 70; H271 held)**, where
S is the press pose's sensitivity with the calibration fixed, again one matrix per pose (H272 held). The calibration
cancels the steady part and none of the drift, and **S is 3 to 3.5 times larger than J** (median 0.149 against
0.043 mm/N on the G1, 0.112 against 0.039 on the H1). So a drift of only 0.1 N at a 0.4 N bias bound breaks
**99 G1 and 32 H1 presses that milestone 69's gate certified** (worst 0.040 mm; H273 held). Adding the drift term,
Y + B||J|| + &delta;||S|| &le; 0.03 mm, restores the guarantee: **no gate-passed press over spec at any bias
(0.3, 0.4 N) or drift (0.05 to 0.2 N) bound** (H274 held). Coverage at a 0.4 N bias: 78% (G1) and 99% (H1) with
0.05 N drift, 56% and 88% with 0.1 N, 14% and 25% with 0.2 N. The weakest pose tolerates only **0.162 N (G1) and
0.189 N (H1) of drift**, against 0.53 and 0.56 N of steady bias (H275 held). In practice: bound how far the sensor
wanders between calibration and press, and re-zero or track the bias (for example with a running estimator such as
arXiv:2403.01068's) often enough to keep that under about 0.05 N. One seed; statics; drift swept, not sourced.

![Each pose's bias rating against its drift rating, and drift-gate coverage against the drift bound](experiments/m70_drift/figure.png)

**Milestone 71: how long may a press wait after the force sensor is re-zeroed?** Each press gets an **exact drift
allowance**, a = min<sub>k</sub>(0.03 &minus; Y<sub>k</sub> &minus; B||J<sub>k</sub>||)/||S<sub>k</sub>||, computed from two
frozen per-pose tables (milestone 69's J and milestone 70's S) with no measurement at press time. On 8 new held-out
loads (seed 71) at a 0.4 N bias bound, the frozen tables predict every planned press to 1.3e-14 mm (H276 held) and the
frozen drift gate passes no press over spec (H277 held). The allowance is tight both ways: **at 0.9 a none of 504
presses leaves 0.03 mm; at 1.1 a all 503 do** (H278, H279 held). It is one number per pose: median 0.102 N (G1) and
0.147 N (H1), **weakest 0.041 N (G1, top-height poses) and 0.091 N (H1, lowest poses)** (H280 held). Divided by a
drift rate it is a re-zero interval: at 0.1 N/h, every **25 minutes (G1) and 55 minutes (H1)** for the weakest pose,
5 and 11 minutes at 0.5 N/h (rates swept; no drift figure for this sensor class was found). Because J(p | r) =
S<sub>p</sub> &minus; S<sub>r</sub> while the drift term is S<sub>p</sub> d, the calibration pose cannot change the
drift term: only re-zeroing (or a running bias estimate) acts on it. One seed; statics; B = 0.4 N only.

![Each press's drift allowance, and the worst row just under and just over it](experiments/m71_allowance/figure.png)

**Not a rated accuracy or a safety case.** Gaussian errors, mostly swept rather than measured;
a single nail outside its window counts as a failed sheet, though a person could pull and
re-drive it. Nailing near people needs a risk assessment (ISO 10218, ISO/TS 15066).

## Milestone 1 method (`src/buildbot_sheathing/budget.py`)
- **Windows.** The 62-nail schedule of [`buildbot-fasten`](../buildbot-fasten): 17 joint nails
  on each vertical edge (6 in), 7 field nails on each intermediate stud (12 in), 14 plate nails.
  A joint nail must land at least 3/8 in from the sheet's actual edge and with its shank on the
  stud face. Field and plate nails keep [`buildbot-studfind`](../buildbot-studfind)'s windows.
- **Sheet.** Its left edge sits at gap/2 + offset + x + θ (z − H/2) from the joint stud's
  centre, its right edge one sheet width further. x and θ are the hanging error, the width is
  48 in minus a trim plus a manufacturing error.
- **Aim.** *Nominal*: the centre of the design window from the robot's estimate of the stud.
  *Edge*: the centre of the window between the measured edge (+3/8 in) and the estimated far
  stud face.
- **Rows.** *Butt*: each sheet set against the last with a gauge gap (offsets accumulate).
  *Stud*: each sheet set from its own studs (the gap absorbs the width error).
- **Checks** (`tests/`, 6 tests): with no gap the model reproduces `buildbot-studfind`'s
  quadrature within 0.01 at three error settings; translation-only and rotation-only results
  match closed forms (|x| ≤ h, |θ| ≤ h/(H/2 − 3/8 in)) within 0.01; edge aim with perfect
  sensing passes exactly while the shifted window is non-empty; a row of exactly trimmed panels
  does not drift.

| Input | Value | Source |
|---|---|---|
| Nail, stud face, edge distance, schedule | 8d common (0.131 in), 1.5 in, 3/8 in, 6/12 in | [`buildbot-fasten`](../buildbot-fasten); edge distance also APA builder tips and West Fraser's install guide, via search |
| Panel gap | 1/8 in at edges, centred on the stud; swept 0 to 3/16 in | APA builder tips (a recommendation, not a requirement), via search, not opened |
| Panel trim ("sized for spacing") | 0, 1/16, 1/8 in | APA TT-055 (up to 1/8 in at the maker's option); "typically 1/16 in" from a JLC Q&A answer; via search |
| Tool-tip scatter | 0.9 mm per nail | `buildbot-fasten` model result (G1, 11-bit joint sensors) |
| Stud estimate scatter | 0.5 mm (0.3 mm sensitivity); swept in table A | **not measured**; inside `buildbot-studfind`'s budget |
| Edge-line error | 0.25, 0.5, 1 mm | **not sourced**: swept |
| Gauge-gap scatter, panel width scatter | 0.5 mm; 0.5 and 1 mm | **not sourced**: one product sheet lists ±1/16 in on width (seen in search); swept |

## Milestone 2 method (`src/buildbot_sheathing/asbuilt.py`)
- **Studs.** Each stud's face line is a parabola of bow b (zero at the plates, sign random) plus
  a straight lean from independent plate-layout errors at its ends; its section twists linearly,
  φ(z) = φ<sub>T</sub>(z/H − 1/2), with φ<sub>T</sub> = (twist rise)/3.5 in. 8 ft warp figures
  are scaled to the 92 5/8 in precut stud (bow by length², twist by length). Magnitudes are
  half-normal or exponential with a published mean, truncated at the grade limit. Crook moves the
  face out of the wall plane and is not modelled.
- **Twist.** A nail must keep its whole shank in wood for at least 10 nail diameters (1.31 in;
  6D swept) within the 2 1/16 in an 8d nail has past 7/16 in sheathing, through the rotated
  section with the sheathing bearing on its high corner. The band of good positions is computed
  by clipping the nail line against the rotated rectangle (`_band_one`, `Band`).
- **Sheets** are straight and plumb; on each joint stud the gap is centred on the middle of the
  robot's estimate of the stud's range (minimax), and panels are cut to fit (milestone 1's width
  drift is left aside).
- **Sensing.** *single*: one read at mid-height (studfind). *ends*: two reads, a line. *three*:
  bottom, middle, top, a parabola. *dense*: a read at each of the 17 joint heights, a fitted
  parabola. Reads 0.5 mm (1σ, independent), measured edge 0.5 mm, tool 0.9 mm.
- **Checks** (`tests/test_asbuilt.py`, 8 tests): the untwisted band is the stud face less the
  shank; the band is mirror-symmetric in twist and shrinks with it, by no more than the
  small-angle bound; straight studs and perfect sensing reduce to the closed-form erf product of
  the 62 half-windows (within 0.01); three or dense reads recover a noiseless parabolic bow
  exactly while a single read passes exactly a quarter of sheets; the bow feasibility edge
  matches the arithmetic (4h on the stud's range, 2h on the plate line) within 3%; truncated
  draws keep their mean and limit; a 3x joint widens the window by 1/2 in a side.

| Milestone 2 input | Value | Source |
|---|---|---|
| Stud-grade warp limits, 8 ft 2x4 | crook 1/4 in, bow 3/4 in, twist 3/8 in | USDA Forest Service reports quoting the 1978 NHPMA grading rules, and Shelly, Arganbright and Birnbach (1979), *Wood and Fiber* 11(1):50–56 (0.64, 1.90, 0.95 cm); seen in search results, not opened. One USDA report gives bow 1/2 in |
| Published mean warp, kiln-dried 2x4 studs | bow 0.11, twist 0.08 in ("low"); bow 0.21, twist 0.16 in ("high") | Koch, *Forest Products Journal* technical note (crook, bow, twist 0.06, 0.11, 0.08 in; drying treatment unclear from the snippet); Koch (1974), southern pine studs between serrated kiln sticks (0.13, 0.21, 0.16 in); both southern pine, seen in search results, not opened |
| Shape of the warp distribution | half-normal and exponential, truncated at the limit | **not sourced**: only means were visible; both shapes are reported |
| Required penetration | 10 D = 1.31 in (6 D swept) | NDS full-design-value penetration, **from memory**, not checked this session |
| Nail length, sheathing | 2.5 in 8d common; 7/16 in OSB | standard sizes |
| Joint framing alternatives | 3x (2.5 in face), two 2x fastened (3.0 in) | SDPWS 4.3.7.1 (3 in nominal or two 2x at adjoining panel edges, for some shear walls), via AWC errata and code-table snippets in search results |
| Plate layout error at each stud end | 0, 0.8, 1.6, 3.2 mm | **not sourced**: swept |
| Stud read, edge line, tool | 0.5, 0.5, 0.9 mm | as milestone 1 (read and edge swept there; read swept in table E here) |

## Milestone 3 method, first part (`src/buildbot_sheathing/ledger.py`)
- **Scene (MuJoCo 3).** A rigid sheet, 1.219 x 2.438 x 0.011 m and 21.8 kg (7/16 in OSB,
  `buildbot-payload`), pressed against a wall box through explicit contact points on its back
  face (the four corners, or 20 points on four stud lines at 16 in) and lowered onto a level
  ledger box through two corner feet. Elliptic friction cone, impratio 10, 20 no-slip
  iterations, stiff contacts (solref 0.002), 0.5 ms step.
- **Holder.** An in-plane impedance on (y, z, θ) at the sheet's centre, aimed at a pose off plumb
  by θ0, plus a press F_n into the wall and a weak torque keeping the sheet flat. At first ledger
  contact the vertical support and translation gains ramp to zero over 0.5 s. *Released*: the
  rotational stiffness ramps out too. *Held*: it ramps to k (swept 300 to 30,000 N·m/rad) and
  stays. The tilt is read 2 s after release.
- **Closed forms** checked against it: the press at which wall friction holds the gravity moment
  about the landing corner, μ F_n r̄ = m g W/2 with r̄ the mean distance from that corner to the
  wall contacts (1.596 m for the corners), and a held wrist's residual
  max(0, θ0 − (m g W/2 − μ F_n r̄)/k).
- **Panel and ledger** (Monte Carlo through milestone 4's model, 20,000 sheets a cell, seed 5).
  The tilt of the vertical edges is the ledger's slope (a laser line uniform within 1/8 in at
  30 ft, plus a Gaussian height error at each of the sheet's bottom corners, swept 0–2 mm) plus the
  panel's corner angle (uniform within ± a fraction of PS 2's limit) plus the rock of an
  outward-bowed bottom edge (bow uniform within ± the same fraction of 1/16 in; bowed out, the
  sheet rests on its middle and a random corner, tilt 2s/W). Translation σx = 3 mm on doubled
  joints, 0 on single 2x; three reads, edge aim, tacked.

| Input | Value | Source |
|---|---|---|
| Sheet | 1.219 x 2.438 x 0.011 m, 21.8 kg | 4x8 7/16 in OSB; mass from `buildbot-payload` (1.5 lb/ft², retail listings) |
| Squareness | diagonals within 1/64 in per ft of the longest edge (1/8 in, 0.083°) | PS 2-18 §5.2.1.3, opened 2026-11-12 |
| Edge straightness | within 1/16 in of the corner-to-corner line | PS 2-18 §5.2.1.3 |
| Laser line | 1/8 in at 30 ft (0.020°) | maker listings (Fluke PLS 180, Stabila LAX 320, DeWalt, Makita), seen in search |
| Wall friction μ | 0.2–0.7 swept | wood on wood 0.25–0.5 in a secondary table (Engineering Toolbox); Wood Handbook figure not found |
| Ledger height error | 0–2 mm a corner, swept | not sourced |
| Press, wrist stiffness, θ0 | swept | robot-dependent; no figure found |

## Milestone 3 method, second part (`src/buildbot_sheathing/humanoid.py`)
- **Robots.** Unitree G1 (29 joints) and H1 (19) from MuJoCo Menagerie at the commit pinned in
  `buildbot-payload`, standing square to the wall, centred on the sheet, hands 0.36 m (G1) or
  0.44 m (H1) apart at reach x and height z. `buildbot-payload`'s static model solves the pose
  (feet fixed, combined CoM over the feet, leaning by F_n z / weight for a press as in
  `buildbot-fasten`) and the joint torques with the ground wrench split between the soles. A
  pose passes if every joint is inside its torque limit, both soles carry load and the ground
  force stays inside a friction cone (rubber on concrete, μ 0.3 and 0.6 swept, as in
  `buildbot-fasten`).
- **Jobs.** *Carry*: heaviest load in both hands with no press (`max_payload`). *Press*: largest
  F_n into the seated sheet. *Slide*: largest F_n while also pushing the sheet sideways with
  P = μ_l m g + μ_w F_n, μ_l 0.3 and 0.5, μ_w 0.4. Forces are split equally between the hands.
- **Tipping while sliding** (MuJoCo, part one's sheet, wall and ledger with separate friction on
  the wall and ledger contacts). A hand at height h above the bottom edge pushes through a spring
  (20 kN/m) moving at 5 cm/s while the press is applied at h_press; the threshold is the least h
  whose slide tilts the sheet past 0.5° (bisection to 1 cm). Closed form, moments about the
  leading bottom corner: h* = (m g W/2 + μ_w F_n h_press) / (μ_l m g + μ_w F_n), which is W/(2μ_l)
  when the press is at the push height, because the wall friction then acts at that height too.
- **Stiffness.** Joint PD gains as published by Unitree: G1 arms and waist kp 60 N·m/rad
  (`unitree_sdk2`, `g1_arm7_sdk_dds_example.cpp`), G1 legs 100/150/40 (hips/knee/ankles,
  `unitree_rl_gym` G1 deploy config); H1 150/200/40 legs, 300 torso, 150 shoulder, 100 elbow
  (`unitree_rl_gym` `h1_config.py`); read 2026-11-12. With the feet planted (the base follows by
  least squares through the foot Jacobian), the hands' compliance is C = J K⁻¹ Jᵀ and the sheet's
  stiffness for a rotation about the wall normal through the landing corner is tᵀ C⁻¹ t, t the
  hands' motion per radian: point velocity and, for a rigid clamp, rotation; for palm (point)
  contacts, point velocity only. The lower bound lets the sheet translate freely in the wall
  plane (a Schur complement). Compared with part one's limit (m g W/2 − μ F_n r̄)/θ0.

| Input | Value | Source |
|---|---|---|
| Robots | G1 29-dof, H1 | MuJoCo Menagerie, commit in `buildbot-payload/src/buildbot_payload/fetch.py` (BSD-3-Clause, Unitree) |
| G1 arm and waist gains | kp 60 N·m/rad, kd 1.5 | `unitreerobotics/unitree_sdk2`, `example/g1/high_level/g1_arm7_sdk_dds_example.cpp`, main, read 2026-11-12 |
| G1 leg gains | hips 100, knee 150, ankles 40 | `unitreerobotics/unitree_rl_gym`, `deploy/deploy_mujoco/configs/g1.yaml` |
| H1 gains | hips 150, knee 200, ankle 40, torso 300, shoulder 150, elbow 100 | `unitree_rl_gym`, `legged_gym/envs/h1/h1_config.py` |
| Foot friction | 0.3, 0.6 swept | `buildbot-fasten` (rubber on concrete spans about this range) |
| Ledger friction μ_l | 0.3–0.7 swept | wood on wood 0.25–0.5 (secondary table, part one); not measured |
| Palm friction μ_h | 0.5–1.0 swept | not sourced |

## Milestone 4 method (`src/buildbot_sheathing/tack.py`)
- **Hang.** On milestone 2's as-built studs (three reads at 0.5 mm, edge line 0.5 mm, tool
  0.9 mm, gap centred on each joint stud's estimated range), the sheet hangs off by a translation
  x and a rotation θ about its centre, both Gaussian and swept.
- **Aim.** *Edge*: each joint nail at the middle of the window between the measured edge line
  (+3/8 in) and the estimated far side of the stud. *Nominal*: as if the sheet hung where intended.
- **Hold or tack.** *Tacked*: the pose is frozen before the edge is measured (a shift while
  tacking folds into the hang). *Held*: each nail also sees an independent sway of the sheet
  along the wall, after the edge was measured.
- **Re-hang.** After measuring, the robot predicts each joint nail's half-window from its measured
  edge and stud estimate; below a threshold (swept 1–2.5 mm) it re-hangs, at most five hangs a
  sheet, the last nailed whatever it predicts. A re-hang is a fresh, independent hang.
- **Checks** (`tests/test_tack.py`, 6 tests): with no hang error it reproduces milestone 2 within
  0.012; translation-only and rotation-only results match closed forms for edge aim (|x| ≤ 2h,
  |θ| ≤ 2h/(H/2 − 3/8 in)) and nominal aim (|x| ≤ h); re-hanging matches the geometric hang count
  and the 1 − (1 − p)<sup>5</sup> clean rate; sway on straight studs matches a numerical
  integral (it moves only the edge side of the window); wider joints allow a coarser hang.

## Milestone 5 method (`src/buildbot_sheathing/cycle.py`)
- **Cycle** (steady state along a row): *place* (a lift stands the sheet on the ledger, the robot
  slides and presses it; milestone 3's tilt draw with the laser rating, 0.5 mm a corner and PS 2
  panels uniform within the limits; 1 or 3 mm left along the wall after the slide), two tacks,
  *sense* (three new studs a sheet, the left joint stud is shared, plus both edges: 5, 11 or 53
  reads for single, three and dense), *nail* (edge aim, `tack.simulate`), *rework* (each missed
  nail found and re-driven). *Lift-tack*: no ledger, the lift hangs to 0.25° and 5 mm (1σ).
- **Recoil.** *Wait*: `buildbot-nailseq`'s 2.4 s a sheet at 4 N s on a fast arm, 0 on a slow one.
  *Fire at once*: its largest left-over tip error at the next nail, 0.37 mm, added to the 0.9 mm
  tool scatter in quadrature as a Gaussian (conservative: the real residual is a bounded
  transient).
- **Seconds** (all swept, 108 cells): nailing with moves and settles 54 or 121 s
  (`buildbot-mobilebase`, fast and slow, 2 s settle); place 15/30/60 s; ledger 0/10/20 s a
  sheet; 1 or 3 s a read; rework 15/30/60 s a missed nail. The extra joint stud is reported as a
  break-even time, not charged.
- **Checks** (`tests/test_cycle.py`, 6 tests): read counts and stage sums; with straight studs
  and a perfect hang only the tool scatter is left (> 0.97 clean); the two-2x three-read ledger
  cell reproduces milestone 3's 1.0000.

## Milestone 6 method (`src/buildbot_sheathing/drake_seat.py`)
- **Second contact model.** Drake 1.51.1 `MultibodyPlant`, discrete at 1 ms, point contact
  (stiffness 10^6 N/m, Hunt-Crossley dissipation 5 s/m) solved by SAP (Castro et al. 2022,
  arXiv:2110.10107), a convex formulation whose stiction is near-rigid. MuJoCo
  (milestone 3) solves soft contact with an elliptic cone, `impratio` 10 and no-slip iterations.
- **Same scene, line for line.** The sheet's only collision geometry is 2 mm spheres at the wall
  contacts and feet, filtered as in the MuJoCo model (wall contacts touch only the wall, feet only
  the ledger); the holder impedance, its release over 0.5 s, the press and the slide's pushing
  spring are copied from `ledger.seat` and `humanoid.slide_sim` and applied as one external wrench
  a step.
- **Checks.** Milestone 3's grids (200 released seats, ten press thresholds by bisection, 30
  held-wrist cells, the bowed edge, creep under a stuck press) and milestone 3b's ten tip heights,
  against the closed forms and the stored MuJoCo results. **H-E:** 2,000 seats on the same random
  draws in both simulators (holder error U(−1°, 1°), wall friction U(0.3, 0.5), press U(5, 50 N),
  seed 13); each simulator's seated residuals are resampled into milestone 5's ledger tilt draw
  (`cycle.clean_cell(residual=...)`) and the 24 ledger pipelines rerun (20,000 sheets, seed 7).
- **Drake's own settings.** Contact stiffness 10^5 and 10^7 N/m, dissipation 0.5 and 50 s/m,
  time step 0.5 and 2 ms, and Drake's TAMSI (Castro et al. 2020, arXiv:1909.05700; deprecated in
  Drake) and lagged solvers, on one seat and the μ 0.4 threshold.

## Milestone 7 method (`src/buildbot_sheathing/cost.py`)
- **Classes.** *Hand crew*: `buildbot-taskbook` S1 carry 0.8, S2 hold and square 1.5 and S4 nail
  62 x 0.1 person-minutes a sheet, times its one-third-to-three-times sweep (log-uniform); its own
  missed nails are not modelled. *Walking H1*: nailing 84.7–264.7 s (the walking-G1 range of
  `buildbot-mobilebase`, 5–20 s a step), a ledger, a person carries the sheet (milestone 3b).
  *G1 on a drive-and-lift base*: nailing 54–121 s (`buildbot-mobilebase`), ledger or lift-tack, a
  person carries the sheet. *Gantry* in a plant: nailing 20–115 s, scan 10–60 s, load 30–180 s
  (`buildbot-custom`), the table fence as the ledger. Where in its range each robot nails is one
  shared draw.
- **Pipelines.** Per draw, each class takes its cheapest of single or two 2x joints by single or
  three reads (and ledger or lift-tack on the base), with missed nails from milestone 5
  (`experiments/m5_cycle/results.json`, lower warp, recoil waited out). Every missed nail is
  re-driven, so the cost of a sheet is the cost of a clean sheet.
- **Dollars.** Ownership = price x (capital recovery factor + upkeep) / sheets a year, sheets =
  min(32 V, 2,000 h / seconds a sheet). People = loaded wage x (supervision x machine seconds +
  carry seconds). Doubled joints add the stud and 60–120 s of a framer.

| input | range | source |
|---|---|---|
| Carpenter wage, burden | $29.12/h, x1.0–1.6 | BLS, via [`buildbot-cost`](../buildbot-cost) |
| Hand minutes a sheet | 8.5 at mid, x1/3–3 | [`buildbot-taskbook`](../buildbot-taskbook) (its author's estimate) |
| 2x4 92 5/8 in stud | $3.41–5.56 | retail listings (McCoy's, Saber Sales, Foxgal) seen through search, 2026-11-12, not opened |
| G1 | $13,500–21,600 | Unitree's page ("from $13.5K") and 2026 retailer listings, seen through search |
| H1 | $90,000–150,000 | press reports of the launch ([`buildbot-cost`](../buildbot-cost)) |
| Drive-and-lift base | $10,000–40,000 | **not sourced** |
| Gantry | $40,000–600,000, log-uniform | **not sourced** ([`buildbot-custom`](../buildbot-custom)'s sweep) |
| Life, interest, upkeep | site 2–7 y, gantry 7–20 y; 4–10%; site 5–20%, gantry 3–12% a year | **not sourced** |
| Supervision, operator | 0.1–1.0 and 0–0.5 person-h a machine-h | [`buildbot-cost`](../buildbot-cost), [`buildbot-custom`](../buildbot-custom) sweeps |
| Stage times | place 15–60 s, ledger 0–20 s, read 1–3 s, re-drive 15–60 s; framer 60–120 s a stud | **not sourced**, milestone 5's sweep |

## Milestone 9 method (`src/buildbot_sheathing/straighten.py`)
- **Beam.** The stud bends flatwise about its weak axis (I = 3.5 x 1.5³ / 12 = 0.984 in⁴) over
  the 92 5/8 in clear span, its stress-free shape milestone 2's parabolic bow, its ends held by
  the plates either pinned (end-nailed; the realistic case) or fixed (the bound). A push is a
  displacement imposed at a point; the force follows from a cubic-Hermite finite-element beam
  (192 elements) and, for a mid push, the closed form c E I b / L³ with c = 48 or 192 and a
  shape left of b u (1 − 2u)² or 4 b u (1 − 2u)².
- **Policies.** *mid*: one push at mid-height onto the line through the stud's estimated ends;
  *nails* (registered): mid first, then bottom up, each joint nail's point pushed to within 0.5 mm
  of the line and held by its nail; *three* (post hoc): a simultaneous push at u = 1/6, 1/2 and
  5/6, a straightedge held at three points. The push is set from a read, so the stud is
  straightened as if its bow were b + N(0, 0.5 mm); the robot believes the shape the policy leaves
  for its own three-read estimate of the bow. Field studs are not pushed.
- **Clean sheets** are milestone 5's ledger pipeline (`tack.simulate` through `cycle.clean_cell`,
  s_x 1 mm, recoil none, 20,000 sheets, seed 7) with both joint studs replaced by their
  straightened shape, under milestone 3's three-foot bow rock and milestone 6b's smooth-bow seats.
- **Capacity.** `humanoid.max_side_push`: milestone 3b's static whole-body check (torque limits,
  both soles loaded, no foot slip) for a push along the wall with both hands at 1.0–1.3 m.
- **Dollars** are milestone 7's model for the G1 on a lift base, with 10–40 s a sheet added for
  the push (unsourced) and missed nails from the clean-sheet run.

| input | value | source |
|---|---|---|
| Stud-grade E (reference) | DF-L 1.4, Hem-Fir 1.2, S-P-F 1.2 million psi | NDS Supplement Table 4A (WCLIB/WWPA, NLGA rules) as tabulated by [Engineers Edge](https://engineersedge.com/civil_engineering/engineering_properties_structural_lumber__15400.htm), read 2026-11-13 (the AWC PDF was not reachable) |
| Southern Pine 2x4 "No.3 and Stud" E | 1.3 million psi (E_min 470,000) | [SFPA/SPIB design values, Table 1](https://www.southernpine.com/wp-content/uploads/2023/09/TABLE01_L1.pdf), read 2026-11-13 |
| COV of E | 0.25, lognormal | NDS Appendix F for visually graded lumber; consistent with the table: 1.3e6 (1 − 1.645 x 0.25) x 1.03 / 1.66 = 475,000 ≈ E_min 470,000 |
| Bow, twist | low and high published warp, grade limit 3/4 in | milestone 2 |
| Push tolerance | 0.5 mm (0.25 and 1 mm reported) | **not sourced**: about one read's scatter |
| Push time | 10–40 s a sheet | **not sourced** |

## Milestone 10 method (`src/buildbot_sheathing/ceiling.py`)
- **Sources.** Milestone 5's ledger pipeline (single 2x, three stud reads, edge aim, recoil none,
  20,000 sheets, seed 7) on straight studs, with six switches: *tool* (0.9 mm a nail,
  `buildbot-fasten`), *stud* (0.5 mm a read), *edge* (0.5 mm), *slide* (1 mm translation left
  after the slide), *ledger* (laser rating and 0.5 mm at each corner) and *panel* (PS 2 squareness
  and the bottom-edge rock, three-foot or milestone 6b's smooth-bow seats). All sources on
  reproduces milestone 9's 0.7370 exactly.
- **Shapley shares** of −ln(clean) over all 64 subsets (exact, not sampled). −ln(clean) is close to
  the expected number of misses when misses are rare, so the shares split the misses, with each
  interaction shared equally between the sources in it.
- **Slide** (after seating, before tacking): the robot reads both edges against its stud estimates
  and slides the sheet to centre the gap; translation left = √((0.5 mm)²/2 + s_slide²).
  **Shim**: it reads the left edge at the end joint-nail heights (2.39 m apart) and lifts the low
  corner until plumb; tilt left = √2 × 0.5 mm / 2.39 m plus s_shim / 1.22 m. s_slide and s_shim
  are swept 0.25–1 mm (not sourced: no shim or slide accuracy was found).
- **Tool scatter needed** for 95%: bisection on s_robot (12 steps, fixed seed).

## Milestone 11 method (`src/buildbot_sheathing/measured.py`)
- **Data.** Adel, Ruan, McGee and Mozaffari (2024, *Automation in Construction* 164, 105444,
  doi:10.1016/j.autcon.2024.105444), wall module experiment: a 2.05 m by 2.32 m
  2x4 frame (two plates, six vertical studs at about 402 mm, five members inclined 6°), butt
  jointed by two industrial robots with a topology-based feedback loop, scanned from one side by a
  laser profiler on the robot (0.150 mm profile resolution, 0.019 mm depth resolution, a profile
  every 2 mm, passes stitched on the robot's calibration). Data set doi:10.34770/0w80-p436, CC BY
  4.0; `experiments/m11_measured/extract.py` downloads it, checks its SHA-256 and writes
  `profiles.json` (the extracted profiles; the raw scan is not committed).
- **Extraction.** A plane fitted to the front surface (inlier sd 1.41 mm) gives u along the wall,
  v up, w out. Each member is sliced every 10 mm of height; per slice the face's two edges (0.5
  and 99.5 percentiles of the points within 1.5 mm of its top), its centre, mean w and slope dw/du
  (the section's rotation, i.e. twist). Bow is the parabola coefficient of the centreline about a
  least-squares chord; lean and layout come from the chords' ends against a uniform grid.
- **Calibration.** Synthetic faces (38.1 mm, 3.2 mm eased corners) on a 2 mm profile grid at 8
  phases: bows of 0–6 mm come back to 0.25 mm RMS, and a perfect parabola leaves 0.27 mm RMS of
  quantisation, the floor any measured residual is read against.
- **Pipeline.** Milestone 9's best single-2x ledger pipeline (`tack.simulate`, three or dense
  reads, s_x 1 mm, edge aim, 0.9 mm tool, Drake smooth-rock seats, 20,000 sheets, seed 7) with a
  new `profiles` argument: each of a sheet's four studs is one of the six measured shapes, with
  random left-right and top-bottom flips, its deviation scaled to the 92 5/8 in stud by length
  squared and its measured twist in place of the linear one. Variants: raw slices, a 110 mm
  running mean, the 110 mm mean less the part common to all eleven members (post hoc, see
  results), twist off, and each stud's own fitted parabola with a linear twist.

## Milestone 12 method (`tack.simulate`, `local` policy and the push on any shape)
- **Question.** Do milestones 9 and 10's single-2x remedies (a mid push, a slide and a shim) still
  work on milestone 11's measured studs, and is their loss the robot's estimate (a fitted
  parabola) or the geometry (a straight edge on a wavy face)?
- **Per-nail reads (`policy="local"`).** The robot reads each stud at every nail height (17 on a
  joint stud, 7 on a field stud, 0.5 mm each) and aims each nail at its own read, with no fitted
  shape.
- **Mid push on any shape.** By superposition on the scanned shape: the stud's mid-height point
  moves by its offset from the chord through its ends plus N(0, 0.5 mm), times the pinned
  point-load shape; the robot believes its estimate moved by its own estimated offset times the
  same shape. On a parabola this is milestone 9's push.
- **Grid.** Single 2x, Drake smooth-rock seats, 0.9 mm tool, 20,000 sheets, seed 7; studs
  measured (110 mm mean), measured less the common part, each stud's own parabola, and straight;
  three, dense or per-nail reads; push or not; milestone 9's ledger or milestone 10's slide and
  shim (0.5 mm). Doubled joints on measured studs; the tool scatter that gives 95% (bisection).

## Milestone 13 method (`src/buildbot_sheathing/price.py`)
- **Question.** Which single-2x pipeline is cheapest per clean sheet on milestone 11's measured
  studs once each remedy's seconds are charged, and does the doubled joint stud now pay?
- **Model.** Milestone 7's G1 on a drive-and-lift base and its 4,000 draws (seed 11), at 100, 300
  and 1,000 houses a year; every missed nail is found and re-driven. Clean sheets and missed nails
  from milestone 12's 12 single-2x cells on measured studs (and the common-removed bracket); a new
  20,000-sheet cell for doubled joints with a single read.
- **Seconds charged.** Point reads at t_read U(1, 3) s each: three reads 9 a sheet, dense 51, per-nail
  31 (17 on the new joint stud, 7 on each new field stud), plus 2 edge reads. Or, for dense and
  per-nail reads, a line laser swept along the three new studs, 3 × 2.353 m / v, v log-uniform
  0.05–0.5 m/s (unsourced; ISO 10218-1's 250 mm/s reduced speed sits inside it). Mid push U(10, 40) s
  (milestone 9); slide and shim U(5, 30) s plus 2 edge reads (unsourced). Seed 29.
- **Break-even.** The extra dollars a missed nail must carry, beyond its re-drive, for doubled joints
  to tie the per-draw cheapest single-2x pipeline: (cost doubled − cost single) / (missed single −
  missed doubled).

## Milestone 14 method (`src/buildbot_sheathing/racking.py`)
- **Question.** If a missed nail is never found, how much racking capacity does the sheet lose, given
  where a robot's misses actually fall?
- **Model.** Källsner and Girhammar's plastic model of a fully anchored wall (2009, *Engineering
  Structures* 31(9), 2171–2181, [doi:10.1016/j.engstruct.2009.03.023](https://doi.org/10.1016/j.engstruct.2009.03.023);
  the full text was not opened, so this is the model as we understand it from its abstract-level descriptions):
  framing pinned at its joints (a stud nail at height z moves γz, a top-plate nail γH, the bottom plate
  none), a rigid sheet, every fastener rigid-plastic with one capacity F along its slip. Capacity is the
  least plastic work over the sheet's rigid motions, H·γ·H_wall = F·min Σ|slip_i|, a convex problem
  solved by reweighted least squares (checked against Nelder–Mead). Only ratios are reported, so F is
  not needed. A missed nail carries nothing. Sheets in a wall share γ, so a wall is the sum of its sheets.
- **Checks.** SDPWS Table 4.3A's ratios across edge spacing (H60), read from secondary copies (the
  Massachusetts reprint of IBC Table 2306.3, [780 CMR 2306.3](https://regulations.justia.com/states/massachusetts/780-cmr/chapter-23/section-2306/subsection-2306-3),
  and a [Huber tech tip](https://www.huberwood.com/uploads/documents/technical/Shear-Capacity-and-Wood-Structural-Panels-Tech-Tip-Wall-ZIP-System.pdf)
  quoting SDPWS 2021); Weiss's walls tested with the bottom 12 in unnailed (H61; B. D. Weiss, *Structural
  performance of light-frame shear walls with simulated decay and a repair design*, MS thesis,
  Washington State University, 2017, [record](https://rex.libraries.wsu.edu/esploro/outputs/graduate/Structural-performance-of-light-frame-shear-walls/99900525291401842);
  only its abstract was read).
- **Misses.** `tack.simulate(return_hits=True)` on milestone 12's measured-stud cells (20,000 sheets,
  seed 7); a 4 in joint-edge schedule via `u_joint` (25 heights a side). Wall lines: 100,000 random
  draws of four sheets. Cost: milestone 7's model with 16 more nails at t_nail / 62 seconds each.

## Milestone 15 method (`src/buildbot_sheathing/frame_lp.py`)
- **Question.** Does finite strength in the stud-to-plate joints explain why milestone 14's model lost
  20% with the bottom foot unnailed where Weiss's walls lost about half, and does it change an escaped
  miss's cost?
- **Model.** Upper-bound (kinematic) limit analysis over small rigid motions of the top plate, each of
  four studs (centrelines at 0, 16, 32 and 48 in) and the sheet, the bottom plate fixed and the top
  plate's mid-point moved one unit along the wall; the least total dissipation is the capacity, solved
  as a linear programme (SciPy's HiGHS). Sheathing nails: rigid-plastic, F along the slip (a 64-sided
  polygon, at most 0.12% low), on the member milestone 14 assigns them. Stud-to-plate joints: lateral
  ρF, bearing in compression, opening against ωF; hold-downs fix the end studs' bottoms vertically.
- **ρ from the NDS yield-limit equations** (single shear, R_d = 2.2; dowel bearing 16,600 G^1.84 psi;
  F_yb 100 ksi for 0.131 in and 90 ksi for 0.162 in nails): an 8d common through 15/32 in OSB (G 0.50)
  into G 0.50 framing, against two 16d common end nails through a 1.5 in plate (IRC Table R602.3(1))
  with the end-grain factor 0.67. ω = 0 (NDS allows no end-grain withdrawal), swept to 2.
- **Checks.** Rigid joints against milestone 14 over 200 three-read miss patterns (H65); the NDS 16d
  value against Table 12N's 141 lb (`tests/test_frame_lp.py`).

## Milestone 16 method (`src/buildbot_sheathing/softnail.py`)
- **Question.** Milestones 14 and 15 gave every nail a rigid-plastic capacity. Real nails peak at some
  millimetres of slip and then soften, so the nails that slip most may be past their peak before the
  rest reach theirs. Does that explain the gap to Weiss's walls, and does it change an escaped miss's cost?
- **Model.** Milestone 14's kinematics (pinned framing, rigid sheet, full anchorage) with each nail a
  nonlinear spring along its slip (the oriented-spring idealisation behind CASHEW; Folz and Filiatrault
  2001, [doi:10.1061/(ASCE)0733-9445(2001)127:4(433)](https://doi.org/10.1061/(ASCE)0733-9445(2001)127:4(433))):
  P = Fp(1 − (1 − δ/δp)^n) up to the slip at peak δp, then a straight fall through 0.8 Fp at Δu to zero at
  δp + 5(Δu − δp). The top plate is pushed to 150 mm in 0.25 mm steps; at each step the sheet's (u, v, θ)
  minimises the springs' energy (damped Newton from the last step; residual under 1e-9 Fp), and the load
  is dE/dΔ. Loading is taken as path-independent; no nail's slip fell before the sheet's peak in any case.
- **Backbone, sourced.** 8d common nails through 7/16 in OSB into SPF, Table 2 of Shameli Derakshan, Zhou
  and Ni (2019, [MOC Summit](https://journalofindustrializedconstruction.com/index.php/mocs/article/download/127/125/125);
  six replicates a group): Fp the mean of the monotonic groups (0.972 kN); the secant stiffness at 0.4 Fp
  the mean of the cyclic groups (0.496 kN/mm; the authors call the monotonic values unreliable), which sets
  n; Δu 28.7 mm (monotonic) or 20.6 mm (cyclic). δp is not tabulated: swept 6–15 mm.
- **Checks.** An elastic-perfectly-plastic backbone yielding at 0.01 mm against milestone 14's capacity
  on 202 patterns (H70); SDPWS's spacing ratios (H71); energy derivative, symmetry and backbone points in
  `tests/test_softnail.py`.

## Milestone 17 method (`src/buildbot_sheathing/wall_lp.py`)
- **Question.** Does Weiss's own wall, built as she tested it, explain why her decayed walls lost about
  half where the lone-sheet models lost 20%?
- **Test set-up, from the thesis** (B. D. Weiss, MS thesis, Washington State University, 2017,
  [open access](https://rex.libraries.wsu.edu/esploro/outputs/graduate/Structural-performance-of-light-frame-shear-walls/99900525291401842),
  Ch. 4–5): 8 by 8 ft, two vertical 4 by 8 ft 7/16 in OSB sheets on a single middle stud, DF-L No. 2 studs
  at 16 in, double end studs, a single sill bolted to a steel beam, a double top plate; two 16d common end
  nails per stud end, four at each double-stud corner; 8d common sheathing nails at 3/8 in; Simpson HTT4
  hold-downs on the double end studs only; ASTM E2126 cyclic tests (CUREE). Decay: every nail below 12 in
  omitted. Peak loads from Table 5-2, MCASHEW2's shares from Table 5-3.
- **Model.** Milestone 15's rigid-body upper-bound limit analysis (an LP, SciPy's HiGHS) for a wall: the sill
  fixed; the top plate, seven studs (each double end stud one body) and two sheets as bodies. Sheathing
  nails: milestone 14's layout per sheet (the right sheet shifted 48 in; 3 in edges via `layout_spacing`),
  rigid-plastic F along the slip (64-gon). Stud-to-plate joints: lateral 1.297 F per end nail (the NDS
  yield-limit 16d end nail at C_eg 0.67 over the 8d nail through 7/16 in OSB, G 0.50), bearing in
  compression, opening against ω = 0; rigid hold-downs; a top plate that translates but does not rotate
  (MCASHEW2's boundary condition in Weiss Ch. 3.2). Variants: hold-downs absent or finite, ω, sheet
  bearing, top-plate modes, the decay pattern's readings, joint strength 0.2–1.0 of the NDS ratio.
- **Checks.** One sheet against milestone 15's `Frame` (H75, exact); two pinned sheets equal twice one;
  a decayed wall never above the frame's sliding capacity (`tests/test_wall_lp.py`).

## Milestone 18 method (`wall_lp.Wall.capacity(hd_shear=...)`)
- **Question.** Milestone 17's fit has the decayed wall slide on its sill, but Weiss's end studs are nailed to
  HTT4 hold-downs whose 5/8 in anchor rods pass through the sill into the steel beam (Weiss Ch. 4.3.3–4.3.4).
  Does that shear path stop the slide, and what joint strength fits then?
- **Model.** Milestone 17's wall LP. Each held-down stud bottom also resists sliding along the sill with
  s F, rigid-plastic (s = 0: milestone 17; s = inf: no slide). Grid: s 0–16 F and rigid, end-nail strength
  0.05–1.50 of the NDS ratio (0.01 steps with a rigid path).
- **Scale for s.** NDS yield-limit equations (D > 1/4 in, R_d 4/3.6/3.2) for a 5/8 in rod (F_yb 45,000 psi)
  bearing parallel to grain in a 1.5 in DF-L sill (F_e 5,600 psi) with an A36 steel side member
  (F_e 87,000 psi) 1/8–1/2 in thick: 617–1,137 lb, or 2.55–4.7 F at the 242 lb per sheathing nail the
  controls imply.
- **Checks.** s = 0 equals milestone 17 exactly; capacity is monotone in s; a rigid path blocks the whole-wall
  slide (`tests/test_wall_lp.py`).

## Milestone 19 method (`src/buildbot_sheathing/wall_push.py`)
- **Question.** Milestones 17 and 18 are rigid-plastic, so every fastener carries its capacity at once and nothing
  has slack. Does slack in the anchor rods' holes, or stud-to-plate joints that peak at a different slip from the
  sheathing nails, explain Weiss's decayed walls?
- **Model.** Milestone 17's bodies (sill fixed; top plate pushed along the wall without rotating; seven studs,
  two sheets; small rigid motions) joined by springs: milestone 16's sourced 8d backbone along each sheathing
  nail's slip; each 16d end-nail joint a 1-D backbone along the wall, peak m × 1.297 Fp a nail and slip scale λ
  (same shape as the sheathing nail, since no tested end-nail curve was found); stiff one-sided bearing and
  stiff ties at the held-down end-stud bottoms (10⁵ times a nail's initial stiffness); at each held-down
  bottom an anchor rod that carries nothing over a gap g, then the NDS load/slip modulus for a dowel with a
  steel side member (2 × 270,000 D^1.5 lb/in = 46.7 kN/mm at D = 5/8 in) up to a cap c Fp. Pushed to 150 mm in
  0.5 mm steps; at each step a damped Newton finds the least-energy state from the last one; the load is dE/dD.
- **Grid.** m 0.25, 0.47, 0.75, 1.0; λ 0.25, 0.5, 1; g 0, 1/32, 1/16, 1/8, 1/4 in; c 2.55 and 5.1 F (the rod's
  design value and twice it); δp 6 and 12 mm; both schedules, intact and decayed: 960 pushovers.
- **Checks.** Elastic-perfectly-plastic springs reach the wall LP's capacity (H87, 16 cases); with pins on the
  edge-nail lines one sheet reproduces milestone 16's pushover exactly; energy gradient against finite
  differences; the rod's gap carries nothing; more slack never adds strength (`tests/test_wall_push.py`).

## Milestone 20 method (`src/buildbot_sheathing/wall_cyclic.py`)
- **Question.** Weiss's tests were cyclic. Does the CUREE loading history, with fasteners that pinch and lose
  stiffness as real nails do, take the decayed walls down to their tested shares where a monotonic push could not?
- **Hysteresis.** The ten-parameter SAWS model (Folz and Filiatrault 2001): a Foschi envelope, unloading at r3 K0,
  pinching lines through ±FI at r4 K0, reloading towards β times the last excursion at K0 (F0/(K0 δmax))^α, no
  capacity past the point where the pinching line meets the falling branch. Written as bounds on the force
  (vectorised over every spring) and checked against OpenSees' `SAWSMaterial` to 2e-13 FU (`ops_check.py`).
- **Parameters, sourced.** Anderson et al. (2007), Table 4: cyclic single-nail tests of 0.113 in nails through
  7/16 in OSB into DF-L, fyb 115 ksi row (K0 0.499 kN/mm, F0 1.11 kN, FI 0.14 kN, Δu 10.8 mm, r3 3.91, r4 0.028,
  α 0.265, β 1.15); their 87, 145 and 241 ksi rows and Folz and Filiatrault's own set as sensitivity.
- **Wall.** Milestone 19's bodies and penalties. Each sheathing nail an oriented spring pair (Judd and Fonseca
  2005): two SAWS springs along and across the nail's slip in the linear wall. Each stud-to-plate joint a SAWS
  spring scaled to m × 1.297 nails in force and λ in slip. Each anchor rod bears after a gap g at the NDS modulus up
  to 2.55 nail peaks, and past that the hole crushes, so later cycles start with more slack. Newton on the
  out-of-balance force at each 0.5 mm step from the committed states, with a line search on the step's
  incremental potential.
- **History.** The CUREE basic history exactly as W-02 Sec. 1.1 gives it (initiation cycles at 0.05Δ; primaries at
  0.075 to 1.0Δ, then +0.5Δ, each with trailing cycles at 75%), Δ = 0.6 Δm from the intact wall's own monotonic
  push, the decayed wall on its intact wall's Δ; stopped after the first primary past 1.0Δ that carries under 0.8
  of the largest load so far, or after 3.0Δ. Peak = mean of the largest positive and negative loads.
- **Grid.** m 0.25, 0.47, 0.75, 1.0; λ 0.25, 1; g 0, 1/16, 1/4 in; both schedules, intact and decayed, cyclic and
  monotonic.
- **Checks.** `tests/test_wall_cyclic.py`: the history's cycle counts and amplitudes; the envelope under monotonic
  load; elastic response below the pinching intercept and the r3 K0 unloading slope; an OpenSees trace; the
  envelope's energy; the pair against the radial spring while elastic; the rod hole's crushing.


## Milestone 21 method (`Saws(gamma=...)` in `src/buildbot_sheathing/wall_cyclic.py`)
- **Question.** SAWS has no term for damage that grows with cycles. Does the standard cumulative-damage rule,
  strength lost in proportion to dissipated energy, take the decayed walls to their tested shares?
- **Rule.** Every spring's envelope and pinching lines are scaled by s = 1 − E/E_t, never rising; E is the work done
  on the spring from its first reversal after yielding, E_t = γ FU Δu of that spring (the c = 1 continuous form of
  Rahnama and Krawinkler 1993, Blume Center report 108, as in Ibarra, Medina and Krawinkler 2005,
  doi:10.1002/eqe.495; both checked against catalogue records on 2026-11-15, as `cite_check.py` could not reach
  doi.org). Unloading and reloading stiffness are not
  degraded. γ ∈ {∞, 100, 50, 20, 10, 5}: one Anderson nail through the CUREE history at Δ = 2Δu keeps 1.00, 0.96,
  0.91, 0.81, 0.73 and 0.61 of its peak.
- **Runs.** Milestone 20's wall, nail (fyb 115), rods (1/16 in gap, cap 2.55 FU) and Δ, λ 1, end nails at m 0.25,
  0.47 and 1 of the NDS ratio; four walls, 72 CUREE runs. H98–H102 registered in `LOG.md` first.
- **Checks.** γ = ∞ equals milestone 20 exactly; on the envelope the force is s × E(d) to 4e-16 FU; lower γ always
  degrades more; γ survives scaling and stacking (`tests/test_wall_degrading.py`).

## Milestone 27 method (`src/buildbot_sheathing/slide_mech.py`)
- **Friction.** Breakaway F_s = μ_s (m g + F_n) and sliding F_k = (μ_k/μ_s) F_s, the ledger and wall at the same
  coefficients (milestone 3b's P = μ_l m g + μ_w F_n), F_n 50 N. μ_s 0.3–0.7 and μ_k/μ_s 0.5–0.9 are swept: a review
  of timber friction gives static 0.25–0.7 and kinetic 0.15–0.4 (Preprints 202404.0050, seen in a search excerpt),
  and an EPFL study of OSB on OSB and on glulam (Materials and Structures 51, 2, 2018, doi:10.1617/s11527-017-1124-5)
  finds static above kinetic and more variable; its full text (link.springer.com, infoscience.epfl.ch) was not
  reachable from this session, so neither gives the OSB-on-lumber pair used here. Breakaway varies 10% tap to tap
  (0 and 20% shown), not sourced.
- **Hand.** The pushing hand's stiffness along the wall is 1 / C_yy of the hands' compliance J K⁻¹ Jᵀ at milestone
  3b's press pose (feet planted, point grip, Unitree's published kp); damping is kd/kp = 1.5/60 s times that,
  with and without a velocity command. The force ramps at 200 N/s (100–500 swept) while the sheet sticks.
- **Control.** The sheet's motion is seen at 0.1 mm (0.05–0.2 swept); τ later the push is gone (instantly: no arm
  inertia, no force-rate limit). Kinetic friction then stops the sheet. Force-source closed form: with
  dF = F_s − F_k, x(t) = (dF t²/2 + Ḟ t³/6)/m to release at T = t_det + τ, then v(T)² m / (2 F_k).
- **Loop.** 2,000 sheets start U(−3, 3) mm off; each tap pushes from the edge that moves the sheet toward the
  target, and the robot stops once the error is within max(0.1 mm, half the last tap). Section E puts the loop's
  rms residual into milestone 12's grid as the slide's Gaussian residual (`ceiling.slide_sx`, edge reads added
  as before).
- **Checks.** The time-stepped tap matches the closed form to within 0.3% (tests: 5).

## Reproduce
One command per experiment, and a check that a re-run gives the committed numbers (milestone 25):

```bash
python3 reproduce.py --list                 # every experiment, what it needs, how long it takes
python3 reproduce.py m5_cycle               # re-run one in place: run.py > results.txt, then figure.py
python3 reproduce.py --check --quick        # re-run the ten numpy-only experiments in a temporary copy
                                            # (~6 min) and diff each results.txt against the committed one
```

`--check` copies this project and its sibling `buildbot-*` projects to a temporary directory, so
nothing committed is overwritten; it leaves out only wall-clock timings, and exits 1 if any other
character of a results file differs. As of milestone 26 all 22 experiments have been through it: every results
file reproduces character for character under numpy 2.5.3, scipy 1.18.1 and MuJoCo 4.0.1, except
that m6 needs Drake 1.51.1 (`pip install drake==1.51.1`; Drake 1.58 no longer has the TAMSI solver
its section D compares). m6b and the Drake tests also pass on Drake 1.58. The per-experiment commands it wraps:

```bash
pip install numpy matplotlib pytest
cd research/buildbot-sheathing
python -m pytest -q tests                                    # 142 test functions; one uses ../buildbot-studfind, seven need mujoco, two the Menagerie models, four drake, eight scipy
python experiments/m1_gap_placement/run.py > experiments/m1_gap_placement/results.txt   # ~12 s, writes results.json
python experiments/m1_gap_placement/figure.py
python experiments/m2_asbuilt_studs/run.py > experiments/m2_asbuilt_studs/results.txt   # ~40 s, seed 3
python experiments/m2_asbuilt_studs/figure.py
python experiments/m4_tack_measure/run.py > experiments/m4_tack_measure/results.txt     # ~100 s, seed 4
python experiments/m4_tack_measure/figure.py
python experiments/m5_cycle/run.py > experiments/m5_cycle/results.txt                   # under a minute, seed 7
python experiments/m5_cycle/figure.py
python experiments/m7_cost/run.py > experiments/m7_cost/results.txt                     # under a second, seed 11; reads m5's results.json
python experiments/m7_cost/figure.py
pip install mujoco                                           # milestone 3; results made with mujoco 4.0.1
python experiments/m3_ledger/run.py > experiments/m3_ledger/results.txt                 # ~95 s, seed 5
python experiments/m3_ledger/figure.py
python experiments/m3b_humanoid/run.py > experiments/m3b_humanoid/results.txt          # ~6 min; clones Menagerie G1/H1 once
python experiments/m3b_humanoid/figure.py
pip install drake                                            # milestone 6; results made with drake 1.51.1 (Python 3.11)
python experiments/m6_drake/run.py > experiments/m6_drake/results.txt                   # ~7 min on 4 CPUs; seeds 13 and 7
python experiments/m6_drake/figure.py
python experiments/m6b_bowed_edge/run.py > experiments/m6b_bowed_edge/results.txt       # ~5 min on 4 CPUs (MuJoCo 4.0.1, Drake 1.51.1); seeds 5, 13, 7
python experiments/m6b_bowed_edge/envelope.py > experiments/m6b_bowed_edge/envelope.txt # ~3 min, post hoc, seed 21
python experiments/m6b_bowed_edge/figure.py
python experiments/m9_straighten/run.py > experiments/m9_straighten/results.txt       # ~1 min (MuJoCo for section C); seeds 5, 7, 11, 23
python experiments/m9_straighten/figure.py
python experiments/m10_ceiling/run.py > experiments/m10_ceiling/results.txt           # ~1 min, seed 7; reads m6b's results.json
python experiments/m10_ceiling/figure.py
python experiments/m11_measured/extract.py                   # downloads the 54 MB data set once (CC BY 4.0), writes profiles.json
python experiments/m11_measured/run.py > experiments/m11_measured/results.txt         # ~15 s, seed 7; reads profiles.json and m6b's results.json
python experiments/m11_measured/figure.py
python experiments/m12_remedies/run.py > experiments/m12_remedies/results.txt         # ~40 s, seed 7; reads m11 profiles.json and m6b's results.json
python experiments/m12_remedies/figure.py
python experiments/m13_price/run.py > experiments/m13_price/results.txt               # ~5 s; reads m12's results.json, m11 profiles.json, m6b's results.json
python experiments/m13_price/figure.py
python experiments/m14_escaped/run.py > experiments/m14_escaped/results.txt         # ~10 s, seed 7
python experiments/m14_escaped/figure.py
pip install scipy                                            # milestone 15; results made with scipy's HiGHS
python experiments/m15_frame_joints/run.py > experiments/m15_frame_joints/results.txt # ~11 min (about 4,000 LPs), seed 7
python experiments/m15_frame_joints/figure.py
python experiments/m16_soft_nails/run.py > experiments/m16_soft_nails/results.txt   # ~25 min (about 7,000 pushovers), seed 7
python experiments/m16_soft_nails/figure.py
python experiments/m17_weiss_wall/run.py > experiments/m17_weiss_wall/results.txt     # ~5 min on 4 CPUs (about 9,300 LPs)
python experiments/m17_weiss_wall/figure.py
python experiments/m18_holddown_shear/run.py > experiments/m18_holddown_shear/results.txt # ~5 min on 4 CPUs
python experiments/m18_holddown_shear/figure.py
python experiments/m19_wall_pushover/run.py > experiments/m19_wall_pushover/results.txt # ~10 min on 4 CPUs
python experiments/m19_wall_pushover/figure.py
ops/bin/python experiments/m20_cyclic/ops_check.py          # H93: needs a venv with openseespy (pip install openseespy numpy)
python experiments/m20_cyclic/run.py > experiments/m20_cyclic/results.txt         # ~70 min on 4 CPUs
python experiments/m20_cyclic/figure.py
python experiments/m21_degrading/run.py > experiments/m21_degrading/results.txt   # ~35 min on 4 CPUs
python experiments/m21_degrading/check_diag.py --walls > experiments/m21_degrading/check_diag.txt
python experiments/m21_degrading/figure.py
python experiments/m27_slide_mech/run.py > experiments/m27_slide_mech/results.txt # ~1 min; mujoco, Menagerie G1/H1
python experiments/m27_slide_mech/figure.py
python experiments/m28_shim_mech/run.py > experiments/m28_shim_mech/results.txt   # ~30 s; mujoco, Menagerie G1/H1
python experiments/m28_shim_mech/figure.py
python experiments/m29_tool_lean/run.py > experiments/m29_tool_lean/results.txt   # ~30 s; mujoco, Menagerie G1/H1
python experiments/m29_tool_lean/figure.py
python paper/check_numbers.py                                # every number the paper quotes, against its results file
python paper/build_latex.py --pdf                            # the elsarticle manuscript in paper/latex/ (pandoc, pdflatex, bibtex, texlive-publishers)
```

## Milestone 1 results (`experiments/m1_gap_placement/results.txt`)
- **A. Gap.** Joint half-window 3.93, 3.73, 3.53, 3.34, 3.14, 2.74 mm at gaps 0, 1/32, 1/16, 3/32,
  1/8, 3/16 in; stud scatter allowed for 95%: 0.90, 0.79, 0.68, 0.56, 0.41, 0 mm; tip scatter
  allowed with perfect studs: 1.23, 1.17, 1.11, 1.05, 0.98, 0.86 mm. At `buildbot-studfind`'s
  0.89 mm: 0.95 clean without the gap, 0.75 with it planned for, 0.56 (1.1 nails missed) if the
  robot aims for no gap.
- **B. Pose** (gap 1/8 in, tip 0.9 mm). At stud 0.5 mm, nominal aim is at 0.93 clean with a
  perfect sheet, so no pose error is allowed; edge aim allows 0.62 / 0.44 / 0 mm of translation
  and 0.044° / 0.031° / 0° of rotation with the edge measured to 0.25 / 0.5 / 1 mm. At stud
  0.3 mm: nominal 0.38 mm and 0.028°, edge (0.5 mm) 0.61 mm and 0.042°. Edge aim also halves the
  stud error's weight (the aim point sits midway between edge and stud face): 0.93 to 0.96 clean
  with a perfect sheet.
- **C. Rows of 10 sheets** (gauge and width scatter 0.5 mm, edge aim). Butted full panels: clean
  0.98, 0.22, then 0; butted 1/16 in trimmed panels: 0.98, 0.73, 0.25, 0.05, 0.01, then 0;
  butted 1/8 in trimmed panels: 0.95 falling to 0.66 by sheet 10 (the gauge error accumulates);
  set from the studs: 0.98 at every sheet. With 1 mm of width scatter, stud-referenced 1/16 in
  panels would need a negative gap at 5.6% of joints.
- **Pre-registered hypotheses** ([`LOG.md`](LOG.md)): H1 held; H2 held trivially; H3 held at
  the planned setting and fell short (ratio 1.6) at a tighter one; H4 partly refuted (the third
  butted sheet's window exists in 46% of trials, but none is clean); H5 refuted.

## Milestone 2 results (`experiments/m2_asbuilt_studs/results.txt`)
- **A. Geometry.** Half-window 3.14 mm. The largest wall bow that leaves a window on both sides
  of a single-2x joint is 12.5 mm with the gap centred on the stud's range (0.53 in over 8 ft) and
  6.3 mm centred on the plate line (0.27 in). Stud-grade's limit is 17.7 mm on the stud. Studs
  whose bow closes a joint: 0.01% and 0.7% (low warp, half-normal and exponential), 4.0% and 5.4%
  (high warp) with minimax centring; 5–31% with the plate line. Twist shrinks the side of the band
  the nail runs toward: the half-band falls from 17.38 to 16.94, 16.03 and 14.64 mm at 1°, 3° and
  6° (10D); the grade limit is 5.9° end to end.
- **B. H6.** Every stud at the bow limit: no feasible sheet under three or dense reads (minimax);
  single and ends pass 25%, the sheets whose own sides of both joints happen to open, which
  closes the neighbouring sheet's side.
- **C. Main table** (clean sheets; single / ends / three / dense). Straight studs 0.94 / 0.96 /
  0.96 / 0.97. Low warp, half-normal 0.55 / 0.55 / 0.80 / 0.83 (1.7, 2.2, 0.26, 0.21 nails missed
  a sheet); exponential 0.58 / 0.59 / 0.77 / 0.79. High warp, half-normal 0.39 / 0.35 / 0.47 /
  0.50; exponential 0.45 / 0.40 / 0.52 / 0.55.
- **D. Ablation (low warp).** Twist alone costs 1 point (three: 0.959 to 0.949); bow alone 14
  (0.818); 6D instead of 10D penetration gains 2 points; perfect reads lift three to 0.85 and
  perfect reads and edge to 0.87: the ceiling is the window the bow leaves against 0.9 mm of tool
  scatter, not sensing.
- **E.** Read scatter allowed for 95% on straight studs: 0.44 / 0.55 / 0.60 / 1.19 mm; with the
  low published warp no policy reaches 95% at any read scatter.
- **F. Culling (low warp).** Rejecting studs bowed over 1/4, 1/8 and 1/16 in (7%, 36%, 65% of
  studs) gives three-read 0.85, 0.92, 0.94 and dense 0.88, 0.94, 0.96.
- **G. Lean.** Plate layout error of 0.8 / 1.6 / 3.2 mm at each end takes three-read from 0.80 to
  0.78 / 0.72 / 0.55.
- **H. Joint framing** (added after C–F). A 3x joint (2.5 in face) or two 2x fastened (3.0 in):
  largest bow 37.9 and 50.6 mm, above the grade limit. Three or dense reads: **1.0000** at both
  warp levels and both shapes. Single read: 0.99 and 0.85 (3x, low and high warp), 1.00 and 0.95
  (two 2x).
- **Pre-registered hypotheses** ([`LOG.md`](LOG.md)): H6 held; H7 held (0.55 < 0.80); **H8
  refuted** (three reads give 0.80, not ≥ 0.95, on single-2x joints); H9 held (twist costs 1.4
  points, under 3).

## Milestone 3 results, first part (`experiments/m3_ledger/results.txt`)
- **A. Released seat** (corners, 200 runs). At F_n ≤ 100 N every cell (μ 0.2–0.7, θ0 0.25–2°)
  ends within 0.0001° of the ledger; above the threshold the sheet keeps 99.6–100% of θ0, with
  one partial cell (μ 0.3, 250 N: 0.97 of 1°).
- **B. Press threshold** (least press leaving over half of a 1° error). Corners: 380, 253, 189,
  143, 115 N at μ 0.2, 0.3, 0.4, 0.5, 0.7, against 408, 272, 204, 163, 117 N predicted (ratio
  0.87–0.99). Stud-line contacts: 430, 278, 199, 156, 125 N (ratio 0.90–1.00).
- **C. Held wrist** (μ 0.4). The closed form matches 29 of 30 cells within 0.005° or 10%; the
  outlier is 0.089° simulated against 0.119° predicted (100 N, 0.5°, 10,000 N·m/rad), where the
  wrist and friction share the moment and friction is not fully mobilised.
- **D. Sensitivity.** Descent speed 0.01–0.2 m/s, release over 0.1–2 s, half the time step, stud
  contacts and the sign of θ0 change the seated tilt by under 0.0001°; a contact five times
  softer leaves 0.00035°.
- **E. Bowed bottom edge** (1/16 in out). The sheet rocks onto its middle and the corner on the
  side it was tilted to: 0.139–0.145°, against 0.149° for a rigid edge (contact compliance
  under the loaded middle foot). Friction creep with the sheet stuck at 400 N: 4×10⁻⁸ °/s.
- **F. Clean sheets.** Ledger-hang tilt σ: 0.012° (laser only) to 0.154° (2 mm a corner, full PS 2
  panels); 0.085° at 0.5 mm with full PS 2 panels. Two 2x, low warp, σx 3 mm: **1.0000** in every
  cell. Single 2x, straight, σx 0: 0.953 perfect panel and ledger, 0.934 / 0.857 at half / full
  PS 2 limits; 0.844 at a 0.5 mm ledger with full limits, 0.636 at 2 mm. 95% needs panels within
  0.244 of the PS 2 limits with a perfect ledger.
- **Pre-registered hypotheses** ([`LOG.md`](LOG.md)): H13 held (0.00003°); H14 held (ratios
  0.87–0.99); **H15 refuted** narrowly (29 of 30 cells); H16 held (1.0000 against 0.844); H17
  held (0.857 < 0.90).

## Milestone 3 results, second part (`experiments/m3b_humanoid/results.txt`)
- **A. Tipping while sliding.** MuJoCo threshold over closed form 0.984–1.007 in 14 cases (μ_l
  0.3–0.7, F_n 50 and 100 N, press at the push height or fixed at 0.6 or 1.2 m); h* = 2.03, 1.52,
  1.22, 1.02, 0.87 m at μ_l 0.3 to 0.7. Pushed at 0.8 h*, the sheet slides 9 cm in 2 s with a peak
  tilt of 0.004–0.011° and a mean push within 1% of μ_l m g + μ_w F_n.
- **A2. Palm friction.** Sliding by friction at the palms needs F_n ≥ μ_l m g / (μ_h − μ_w): 107 N
  at μ_l 0.3 and μ_h 1.0, 535 N at 0.5 and 0.6, impossible for μ_h ≤ μ_w.
- **B. Whole body** (reach 0.3 and 0.4 m, hands 0.6–1.3 m). G1: carry 2.8–8.7 kg (waist pitch
  or wrist pitch); press 66–110 N at foot friction 0.6, 66–98 N at 0.3 (slip at 98 N); press while
  sliding at μ_l 0.3, 42–96 N (0.6) and 42–50 N (0.3, slip); at μ_l 0.5, at most 41 N, nothing above
  1.0 m (ankle roll). H1: carry 12.4–18.8 kg (elbow); press 128–281 N (0.6), 128–151 N (0.3);
  sliding at μ_l 0.3, 105–206 N; at 0.5, 34–141 N.
- **C. Stiffness about the landing corner at stock gains** (F_n 50 N, x 0.35 m; limit 11,281 /
  5,641 / 2,820 N·m/rad at θ0 0.5 / 1 / 2°). G1 rigid clamp 778–1,946, palm contacts 182–1,101
  (gains could rise 2.9–31 times before the limit at 1°); releasing the wrist roll changes it by
  0.1–19%, all three wrist joints by up to 99%. H1 palm contacts 876–2,740 (2.1–6.4 times under);
  H1 rigid clamp 10,423–613,376, which keeps 0.46–0.99° of a 1° error. With free translation the
  stiffness drops to 0–305 N·m/rad: the pivot, not the joints, sets most of it.
- **C2.** At 1.0 m the sheet's gravity moment (130 N·m) on a stock-gain hold with no weight
  feedforward turns a G1's grip 9.6° (clamp) or 14.2° (palms), an H1's palms 4.8°.
- **Pre-registered hypotheses** ([`LOG.md`](LOG.md)): **H18 refuted in part** (the G1 cannot carry
  and can press, as predicted; the H1 cannot carry either, 18.8 kg at best); H19 held (within
  1.6%); H20 held (G1 slides with ≥ 50 N press at μ_l 0.3 at foot friction 0.6, never at 0.5; the
  H1 at both); **H21 refuted** (stock gains are soft enough except an H1 clamp).

## Milestone 4 results (`experiments/m4_tack_measure/results.txt`)
- **A. Hang allowed for 95% clean sheets** (tacked, 1σ; translation alone, rotation alone).
  Single 2x, straight studs: nominal aim 0.44 mm / 0.032°, edge aim 0.37 mm / 0.029°; at the
  lower published warp nothing (0.83 and 0.81 clean with a perfect hang). 3x, low warp: nominal
  3.8 mm / 0.21°, edge 7.2 mm / 0.38°. Two 2x, low warp: nominal 5.4 mm / 0.29°, edge
  **10.4 mm / 0.54°**; straight studs 10.8 mm / 0.56°. With three reads per stud, aiming from the
  edge loses a little on single 2x joints (its 0.5 mm reading adds noise a near-perfect hang does
  not) and nearly doubles the hang allowed on wide ones.
- **B. Grid** (low warp, edge aim). Single 2x: 0.81 clean with a perfect hang, 0.52 at
  1 mm / 0.1°, 0.23 at 2 mm / 0.2°. Two 2x: ≥ 0.9999 up to 4 mm / 0.2°, 0.983 at 6 mm / 0.3°.
- **C. Sway of a held sheet** allowed for 95%: 0.19 mm (single 2x, straight), none (single 2x,
  low warp), 3.1 / 3.0 mm (3x), 4.2 / 4.1 mm (two 2x).
- **D. Re-hang** (max 5). Single 2x, straight, hang 1 mm / 0.1°: 0.70 without, 0.77 / 0.82 /
  **0.87** / 0.81 at thresholds 1.0 / 1.5 / 2.0 / 2.5 mm, with 1.2 / 1.4 / 2.1 / 3.6 hangs a
  sheet; low warp best 0.66 (1.5 mm, 2.2 hangs). Coarser hangs do worse (best 0.66 at 2 mm /
  0.2°, 0.47 at 3 mm / 0.3°). 3x at 3 mm / 0.3°: 0.967 without, 0.9996 at 2.5 mm with 1.1 hangs.
- **Pre-registered hypotheses** ([`LOG.md`](LOG.md)): **H10 refuted** (re-hanging peaks at 0.87,
  not ≥ 0.95, on single 2x); H11 held (0.54°, 10.4 mm against ≥ 0.2°, ≥ 4 mm); H12 held (sway
  0.19 mm against 4.1 mm).

## Milestone 5 results (`experiments/m5_cycle/results.txt`)
- **A. First-pass clean sheets** (lower warp, ledger, 1 mm after the slide; single / three /
  dense reads). Single 2x: 0.417 / 0.560 / 0.581 (2.17 / 0.79 / 0.71 nails missed); 3 mm after
  the slide 0.243 / 0.299 / 0.311; higher warp 0.312 / 0.307 / 0.322. Two 2x: 0.9994 / 1.0000 /
  1.0000; higher warp 0.940 / 1.0000 / 1.0000. Lift-tack (0.25°, 5 mm): single 2x 0.079–0.092,
  two 2x 0.978 / 0.996 / 0.997. Wilson intervals are in the file.
- **B. Fastest policy** by seconds a sheet including rework: single read on two 2x and three
  reads on single 2x in all 108 cells. At nailing 54 s, place 30 s, ledger 10 s, 1 s reads and
  30 s rework: two 2x single 101 s, single 2x three 131 s (of which 24 s rework), single 2x
  single 166 s (65 s rework).
- **C. Break-even framing time** for the extra joint stud: 17.9–29.9 s at 15 s rework,
  29.7–41.7 s at 30 s, 53.5–65.5 s at 60 s (the lower figure at 1 s reads, the higher at 3 s);
  higher warp 33.8–129.3 s.
- **D. Stages** (two 2x, single read): place 10–57%, sensing 2–17%, nailing 37–86% of the sheet;
  76–216 s a sheet (median 146) against 94–282 s (median 184) for the best single-2x pipeline.
- **Pre-registered hypotheses** ([`LOG.md`](LOG.md)): H22, H23, H24, H25 held; **H26 refuted**
  (fire-at-once recoil costs up to 7.4 points on single 2x, at most 0.12 on two 2x); **H27
  refuted** (placing the sheet outweighs fast nailing in 18 of 108 cells).

## Milestone 6 results (`experiments/m6_drake/results.txt`)
- **A. Released seats** (200 cells): Drake seats every cell MuJoCo seats except where the press is
  within a few percent of the threshold (6 of 200 cells differ, all at the boundary, all in the
  direction of Drake's higher threshold). Below the threshold Drake leaves up to 0.016° (at
  100–300 N; 0.0056° at 50 N or less), MuJoCo 0.0001°.
- **B. Press threshold** (N, Drake / MuJoCo / closed form): corners μ 0.2 394 / 380 / 408, μ 0.4
  199 / 189 / 204, μ 0.7 117 / 115 / 117; Drake/closed 0.965–0.998 on corners, 0.964–1.030 on stud
  contacts; Drake/MuJoCo 1.011–1.127.
- **C. Held wrist:** where the closed form keeps an error (k ≥ 10,000 N·m/rad, or 3,000 at
  100 N and 2°) Drake and MuJoCo agree within 0.07°; where it predicts none, Drake keeps
  0.001–0.016°.
- **D. Drake settings:** the μ 0.4 threshold stays at 187.5–199.7 N across stiffness, dissipation,
  time step and solver; the released seat stays within 0.003° except at the softest contact
  (10^5 N/m, 0.023°).
- **E. Bowed edge** (1/16 in): Drake 0.107–0.123°, MuJoCo 0.139–0.145°, bound 0.149°. **Tilted
  ledger** (1–3 mm over the sheet): the sheet follows it within 0.004° (Drake) and 0.0000°
  (MuJoCo). **Creep** under a stuck 400 N press: 4×10⁻⁵ °/s in Drake, 4×10⁻⁸ in MuJoCo.
- **F. H-E:** seated residual sd 0.00142° (Drake) against 0.00001° (MuJoCo); the 24 ledger
  pipelines' first-pass clean sheets differ by at most **0.05 points** (0.06 before milestone 26's re-run). Cost: 0.080 s a Drake
  seat, 0.020 s a MuJoCo seat (four processes).
- **G. Tip height:** Drake/closed form 0.995–1.007, MuJoCo 0.984–1.007.
- **Pre-registered hypotheses** ([`LOG.md`](LOG.md)): H32 held (worst Drake/MuJoCo 12.7% at
  μ 0.5); H33 held (0.0025° at most, bar 0.005°); **H34 refuted** (70% of held-wrist cells within
  max(0.005°, 10%), bar 90%: the misses are Drake's 0.005–0.016° where the closed form says
  zero); H35 held (0.05 points, bar 10); H36 held.

## Milestone 7 results (`experiments/m7_cost/results.txt`)
- **A. Dollars per clean sheet** (median [5%, 95%]) at 10 / 30 / 100 / 300 / 1,000 houses a year.
  Walking H1: 151.73 / 52.07 / 17.23 / 7.26 / 4.02. Base: 54.43 / 19.28 / 7.03 [4.52, 11.03] /
  3.48 / 2.20. Gantry: 99.24 / 33.49 / 10.51 [3.33, 34.17] / 3.93 / 1.78. Hand crew 5.21
  [1.93, 14.46] at every volume.
- **Cheapest way** (share of draws): hand 1.00 at 10 houses, 0.96 at 30, 0.56 at 100, 0.19 at 300,
  0.03 at 1,000; the base 0.25 at 100 and 0.42 at 300; the gantry 0.58 at 1,000; the H1 never.
- **Pipeline.** All three robots choose single 2x with three reads (ledger on the base) in every
  draw at 100 houses a year.
- **B. Where the dollars go** (two 2x, single read, 100 houses a year): ownership 44% of the base's
  sheet, 62% of the gantry's, 67% of the H1's; the stud 24–44%; people 3–11%.
- **C. Sensitivity** of the base at 100 houses a year: life −0.58, base price +0.58, upkeep
  +0.29, supervision +0.26, hand minutes +0.19 (Spearman).
- **D. Higher warp** raises the medians by $0.14–0.53 a sheet (100 and 1,000 houses a year).
- **E. Break-even** for doubled joints on the base: a missed nail must cost $6.47 [5.17, 7.83]
  more than its re-drive.
- **Pre-registered hypotheses** ([`LOG.md`](LOG.md)): H28 held (the base beats the H1 in every
  draw); **H29 refuted** (the median crossing is at about 500 houses a year, outside 30–300;
  62% of draws cross inside 10–1,000, at a median of 54 houses); **H30 refuted** for every class
  (doubled joints win in 0% of draws, median $5.1–5.3 a sheet dearer); H31 held.

## Milestone 9 results (`experiments/m9_straighten/results.txt`)
- **A. Closed form.** The FE beam gives c = 48.000 (pinned) and 192.000 (fixed) and leaves
  0.07407 b and 0.29630 b at u = 1/6, matching the closed forms. A three-point push needs 64.8,
  14.4 and 64.8 E I b / L³ (pinned) and leaves 0.0117 b.
- **B. Force** (N; median / 95th / 99th percentile over 200,000 studs, pinned). Low warp: mid
  28 / 89 / 126, nail by nail 28 / 95 / 355, three-point 38 / 121 / 170. High warp: mid 53 / 168 /
  232, nail by nail 53 / 780 / 1,258, three-point 71 / 227 / 314. Fixed ends: four times the mid
  push and far more for nail by nail (p99 7,182 N low). Grade-limit stud (17.7 mm at the wall) at
  DF-L's 95th-percentile E (2.04 million psi): mid 376 N, three-point 508 N, nail by nail 2,821 N.
  Nail by nail at a 1 mm tolerance: p99 126 N (low); at 0.25 mm, 791 N.
- **C. Sideways capacity** at 1.2–1.3 m: G1 81–88 N (right ankle roll), H1 120–123 N (shoulder
  yaw), at foot friction 0.3 or 0.6 and reach 0.3 or 0.4 m. Share of studs whose mid push fits:
  G1 0.928 (low warp) and 0.688 (high); H1 0.987 and 0.858.
- **D. Clean sheets** (single 2x, three reads; no push → mid push, pinned). Three-foot rock:
  low 0.560 → 0.710, high 0.307 → 0.677; straight studs 0.737. Smooth-bow rock: low 0.625 → 0.782,
  high 0.344 → 0.750; straight studs 0.811. Nail by nail and three-point push within 0.4 points of
  the mid push; fixed ends lose up to 5 points at high warp. Doubled joints, single read: 0.9994
  and 0.940; three reads 1.000.
- **E. Dollars** (base, median $/clean sheet at 100 houses a year, low / high warp): doubled
  12.17 / 12.20, single 2x no push 7.03 / 7.29, single 2x straightened 7.10 / 7.12. Straightening
  is cheaper than doubling in every draw (at 100 and 300 houses, both rocks) until about 925 s of
  pushing a sheet, and cheaper than not pushing in 7.5–10% of draws at low warp and 92% at high.
- **Pre-registered hypotheses** ([`LOG.md`](LOG.md)): H41 held; H42 held (126 N, bar 200; 376 N,
  bar 400; nail by nail equals the mid push for the median stud); **H43 refuted** (0.71 and 0.68,
  bar 0.95: straightening stops at the straight-stud ceiling); H44 held (100% of draws, bar 90%),
  though milestone 7 had already found doubled joints never pay in dollars, so the bar was low.

## Milestone 10 results (`experiments/m10_ceiling/results.txt`)
- **A. Closed form.** Tool scatter alone, perfect pose and reads: 0.9838 in Monte Carlo against
  0.9833 for the product of the 62 nails' normal probabilities.
- **B. Shapley shares** of −ln(clean) on straight studs (three-foot rock, clean 0.737 / smooth
  rock, 0.811): tool 44.6% / 46.9%, stud read 7.0 / 8.4, edge read 5.0 / 6.1, slide 17.5 / 21.7,
  ledger 4.1 / 5.9, panel 21.9 / 11.0; pose together 43.5% / 38.6%. Alone, every source but the
  tool gives 1.000 clean and the tool 0.984; pose alone 0.995 / 1.000; tool and reads alone 0.957;
  tool and pose 0.805 / 0.874.
- **C. Remedies** (clean, three-foot / smooth rock). Straight studs: none 0.737 / 0.811; slide
  0.5 mm 0.798 / 0.869; shim 0.5 mm 0.865 (both); slide and shim 0.5 mm 0.918, 0.25 mm 0.938, 1 mm
  0.822; slide and shim 0.5 mm with dense reads 0.937. Pushed studs (mid, pinned), slide and shim
  0.5 mm: low warp 0.893, high 0.866 (0.25 mm: 0.916, 0.888; dense reads: 0.922, 0.901). A slide
  that leaves 1 mm is no better than none. With the shim the rock model no longer matters.
- **D. Tool scatter for 95%** (1σ): straight studs 0.48 mm (three-foot) and 0.66 mm (smooth)
  without remedies, 0.84 mm with slide and shim 0.5 mm; low-warp pushed studs 0.41 / 0.60 mm
  without, 0.79 mm with.
- **Pre-registered hypotheses** ([`LOG.md`](LOG.md)): H45 held (|diff| 0.0005, bar 0.003);
  **H46 refuted** (pose 43.5% and 38.6%, bar 50%: milestone 9's reading was half right); H47 held
  (+6.1 and +5.8 points, bar 5); **H48 refuted** (0.893, bar 0.95).

## Milestone 11 results (`experiments/m11_measured/results.txt`)
- **A. Calibration.** True bows 0 / 1 / 3 / 6 mm read back as −0.08 / 0.89 / 2.88 / 5.95 mm (sd
  0.12–0.34); parabola R² 0.06 / 0.60 / 0.90 / 0.97 and 0.23–0.30 mm RMS residual from the 2 mm
  grid alone; a 38.1 mm face reads 36.0 mm wide.
- **B. Resolution.** The six faces read 35.6–36.0 mm wide (all front points), as the synthetic
  38.1 mm face does; centrelines jump 1.2–2.6 mm between some neighbouring slices, the size of
  the profile pitch.
- **C. Six vertical studs.** Bow −1.55, −0.44, −2.92, −3.25, −5.95, +0.83 mm over 2,220 mm
  (0.074, 0.021, 0.139, 0.154, 0.283, 0.039 in at 8 ft; median 0.106 in); parabola R² 0.21, 0.03,
  0.64, 0.74, 0.79, 0.11; RMS residual 0.59–0.94 mm (0.39–0.76 mm after a 110 mm mean). Twist
  end to end −0.3 to 3.5°. Out of plane, the two left studs run 20.5 and 10.9 mm across their
  height (the frame is not flat), the others 2–3.5 mm. Layout about a 402 mm grid: sd 2.0 mm at
  the bottom plate, 5.1 mm at the top; the end studs lean 14.6 and 6.5 mm, the inner four within
  1.7 mm (the paper reports the top plate sagging toward one end).
- **Post hoc: wood or scan?** Residuals after each member's parabola correlate across the
  eleven members (median pairwise r 0.47); their mean carries 48% of the residual variance, against
  9% if independent. Removing it leaves 0.31–0.60 mm RMS on the studs.
- **D. Inclined members.** Bows −1.38, −1.99, +0.54, −5.07, −0.59 mm (0.025–0.238 in at 8 ft);
  all eleven members: median 0.074 in, mean 0.105 in.
- **E. Clean sheets, single 2x, three reads:** measured raw 0.311, 110 mm mean 0.425, common part
  removed 0.471, twist off 0.461, each stud's parabola 0.579; model low warp 0.625, straight 0.811.
  Dense reads: 0.388, 0.474, 0.503, 0.529, 0.600 (model 0.650). Doubled joints: 1.0000 in every
  variant.
- **F. Robot placement in the same data set.** The nail-laminated panel's benchmark poses
  reproduce the paper's Table 1 exactly (mean 1.282 mm in plane; per robot y sd 0.25 and 0.44 mm);
  the adaptive file does not (mean 1.956 mm against 0.401 in Table 1), so it was not used.
- **Pre-registered hypotheses** ([`LOG.md`](LOG.md)): **H49 refuted** (35.6–36.0 mm wide against
  38.1 ± 2, and jumps of 1.2–2.6 mm: the 2 mm profile pitch, which the synthetic face shows as
  well); H50 held (median 0.106 in, largest 0.283 in); **H51 refuted** (R² 0.21–0.79, residual
  0.59–0.94 mm); **H52 refuted** (measured 0.425 against parabola 0.579, 15 points; doubled
  joints 1.000).

## Milestone 12 results (`experiments/m12_remedies/results.txt`)

![Clean sheets on single 2x joints for straight, parabolic and measured studs, by remedy](experiments/m12_remedies/figure.png)

- **Per-nail reads close most of the waviness gap.** Measured studs, ledger, no push: three reads
  0.425, dense parabola 0.474, per-nail reads 0.530 (each stud's own parabola 0.579). The waviness
  cost falls from 15.4 points to 4.7. On parabolic and straight studs per-nail reads gain nothing.
- **The push still pays.** Three reads: 0.425 to 0.552 with a mid push (+12.6 points; +16.3 on
  parabolas). Per-nail reads and the push: 0.650. Forces 10–72 N; four of six studs straighten,
  the most leaning end stud does not (its shape is not a bow).
- **Stacked.** Per-nail reads, push, and slide plus shim: **0.771** (0.796 with the common part
  removed), against 0.860 on parabolas and 0.889–0.937 on straight studs. 95% then needs a tool
  held to 0.61 mm (1σ), against 0.84 mm on straight studs.
- **Doubled joints:** 1.0000 in every cell.
- **Pre-registered hypotheses** ([`LOG.md`](LOG.md)): H53 held (0.530 against a 0.502 bar);
  H54 held (+12.6 points against +10); **H55 refuted** (0.771 against 0.90); H56 held.
- **A bug caught before use.** The first run measured the push from each profile's
  least-squares line instead of its end chord; fixed and tested, and only the fixed run is reported
  ([`LOG.md`](LOG.md)).

## Milestone 13 results (`experiments/m13_price/results.txt`)

![Median dollars per clean sheet against first-pass clean sheets for every single-2x pipeline and doubled joints, measured studs](experiments/m13_price/figure.png)

- **First-pass quality is cheap up to 0.77.** At 100 houses a year, three reads on the ledger cost
  a median **$7.10** per clean sheet (0.425 first-pass clean, 198 s); the full stack (per-nail reads
  by line laser, mid push, slide and shim) **$7.42** (0.771, 248 s). Below the machine's capacity,
  extra seconds cost only supervision, so 35 points of first-pass quality cost 32 cents.
- **The doubled joint stud still does not pay.** Doubled joints give 1.000 in 145 s but cost
  **$12.17**: the stud and a framer's time are 44% of it. The per-draw cheapest single-2x pipeline is
  cheaper in **every** draw at 100, 300 and 1,000 houses a year (median saving $5.13).
- **Break-even.** Doubling pays only if a missed nail costs a median **$5.51** more than its re-drive
  [5–95%: $3.91, $8.55], 8.8 loaded person-minutes ($5.83 with the common part removed). Measured
  studs lower milestone 7's $6.47 (the three-read pipeline now misses 1.095 nails a sheet, not
  0.79), but less than that rise suggests: in about half the draws the cheapest pipeline is one that
  misses fewer nails.
- **Line laser or point reads.** Per-nail reads by point (31 + 2 a sheet) cost 15 cents more than
  three reads; by line laser they tie three reads at about **0.23 m/s** sweep speed and win above it.
- **Pre-registered hypotheses** ([`LOG.md`](LOG.md)): H57 held (1.000 of draws against a 0.90 bar);
  H58 held (the full stack is never the cheapest pipeline); **H59 refuted** ($5.51 against a $5.00 bar).
- **Reading it.** The dollar case for doubling rests entirely on what an escaped or late-found missed
  nail costs, which this model does not price: every miss is assumed found. A shear-wall nailing
  defect found at inspection, or not found, is the number a builder would supply.

## Milestone 14 results (`experiments/m14_escaped/results.txt`)

- **The model against the code table.** 4, 3 and 2 in edge spacing give 1.442, 1.884 and 2.769 times
  the 6 in sheet against SDPWS's 1.536, 1.964 and 2.607 (H60 held).
- **The model against a test: unconservative.** The bottom 12 in unnailed loses 20.4% (11 of 62 nails)
  against "close to or more than half" in Weiss's (2017) tests (**H61 refuted**). Every loss here is a
  lower bound.
- **One nail.** A joint-edge nail is worth 2.00–2.21% of the sheet, a plate nail 1.05–1.83%, a field
  nail 0.70–1.02% (H62 held).
- **Misses left in, three reads.** Mean sheet 0.977, 1st percentile 0.885, 13.4% of sheets below 0.95,
  a 16 ft wall's 1st percentile 0.934 (**H63 refuted** on the tail). Full stack: mean 0.994, 1st
  percentile 0.937. Doubled joints: 1.000.
- **4 in joint edges.** Intact 1.318; with 1.572 misses a sheet left in, mean 1.286, 1st percentile
  1.160, 99.98% of sheets at or above the intact 6 in sheet (H64 held); 97.6% at 2.45 times the loss.
  Median $6.98 a sheet at 100 houses a year, against $7.10 for 6 in with re-drives and $12.17 for doubled
  joints.

## Milestone 15 results (`experiments/m15_frame_joints/results.txt`)

- **The joint.** Z = 74.0 lb for the sheathing nail (mode IIIs), 140.7 lb for a 16d end nail (mode IV),
  ρ = 2.55 (2.34 in SPF).
- **Reproduces milestone 14 with rigid joints** (H65 held): ratios within 0.09%; the absolute capacity is
  1.2% higher because the joint-edge nails sit 3/8 in off the stud centreline.
- **Intact sheet at NDS joints** (H66 refuted): −7.2% at 6 in, the spacing check fails at 2 in (2.87 against
  2.61). The cause is a lone sheet's top plate tilting while an interior stud lifts (zero withdrawal); a
  withdrawal of 2 F, or a top plate that only slides (post hoc), removes it.
- **Weiss's pattern** (H67 refuted): 21.1% lost at NDS joints, 19.7–21.1% for any withdrawal; 40% needs
  ρ ≤ 1.42, 50% needs ρ ≤ 1.18; without hold-downs 64% (withdrawal 1 F) to 100% (none).
- **Escaped misses, three reads** (H68 refuted as registered): mean loss 2.73%, 99th percentile 16.7%
  (milestone 14: 2.34%, 11.5%); with a sliding top plate 2.34% and 11.51%. Full stack: 0.73% and 6.5%.
- **4 in joint edges** (H69 held): 99.89% of sheets at or above the intact 6 in sheet (99.98% with a
  sliding top plate).

## Milestone 16 results (`experiments/m16_soft_nails/results.txt`)

- **Reduces to milestone 14** (H70 held): an elastic-perfectly-plastic nail yielding at 0.01 mm gives
  milestone 14's capacity to 0.000% on the intact sheet, the Weiss pattern and 200 miss patterns.
- **Spacing table** (H71 held): 4, 3 and 2 in edge spacing at 1.444, 1.888 and 2.775 of 6 in, against
  SDPWS's 1.536, 1.964 and 2.607 (−6%, −4%, +6%; milestone 14: 1.442, 1.884, 2.769). Peak drift
  55–56 mm (2.3%) at every spacing. Absolute: 9.80 kN a sheet, 8.04 kN/m (551 plf) at the tested Fp,
  beside 560 plf nominal for the heavier 15/32 in Structural I panel (not like for like).
- **Weiss's pattern** (H72 refuted): 20.1–20.4% lost over δp 6–15 mm and both Δu (23.4–23.8% with
  z ≤ 12 in); a near-brittle nail (0.8 Fp 1 mm past its peak) 20.4%. At the peak the perimeter nails slip
  11–12 mm (median 11.0, max 12.3) and only field nails near the centre of rotation lag (min 3.7 mm);
  0–61% of nails are past δp at the sheet's peak, and no nail unloads before it. Omitting the bottom foot
  moves the centre of rotation from 11.8 to 24.9 in below the sheet's bottom edge.
- **One nail alone:** joint edge 2.12% (milestone 14: 2.08%), field 0.85%, plates 1.43%; sum 1.040.
- **Escaped misses, three reads** (H73 held): mean loss 2.39%, 99th percentile 11.80%, 4-sheet wall 1st
  percentile 0.932 (milestone 14: 2.34%, 11.49%, 0.934); the cyclic Δu gives 2.40% and 11.81%.
- **4 in joint edges** (H74 held): intact 1.320 of the 6 in sheet; with 1.572 misses a sheet left in, 99.98%
  at or above the intact 6 in sheet (minimum 0.854).

## Milestone 17 results (`experiments/m17_weiss_wall/results.txt`)

- **Code check** (H75 held): one sheet matches milestone 15's `Frame` to 0.0 in 8 cases.
- **Controls** (H76 held): 19.07 F (6-12) and 36.83 F (3-12), a ratio of 1.931 against 1.872 tested
  (+3.2%). At the tested 8d-in-OSB peak (0.972 kN, SPF) 4,168 and 8,049 lb against 4,688 and 8,775 lb
  (0.89, 0.92); the tests imply 238–246 lb a sheathing nail in DF-L.
- **Decay at NDS joints** (H77–H79 refuted): 79.5% kept (6-12) and 63.4% (3-12), against 57% and 34%
  tested and MCASHEW2's 53% and 46%; decay 3-12 over 6-12 1.54 (tested 1.12). Without hold-downs:
  50–51% kept, but the intact walls fall to 13.6 and 28.3 F. Every other variant keeps 60–80%.
- **Mechanism.** Intact and decayed 6-12: the interior studs lift off the sill (0.13 per unit slide) while
  the sheets rotate. Decayed 3-12, and both decayed walls below 0.6 of the NDS ratio: every stud slides on
  the sill by the top plate's slide and nothing else moves, so the capacity is 18 end nails' worth.
- **Joint strength, post hoc:** a least-squares fit gives 0.47 of the NDS ratio, keeping 58.2% and 30.2%
  (rms 2.9 points), decay ratio 1.00, intact walls 18.9 and 36.3 F. The decayed walls carried 147–165 lb per
  end nail, about the nail's NDS Z of 141 lb before the end-grain factor.
- **Escaped misses** (H80 held): two sheets a wall, three reads on measured studs, every miss left in:
  mean loss 2.73%, 99th percentile 10.41% (milestone 14: 2.34%, 11.49% a sheet); 2.67% and 10.19% at the
  fitted joints.

## Milestone 18 results (`experiments/m18_holddown_shear/results.txt`)

- **Code check** (H81 held): s = 0 reproduces milestone 17's capacities exactly.
- **Rigid path at NDS joints** (H82 refuted, as expected): 79.5% and 73.5% kept, decay ratio 1.78.
- **Refit with a rigid path** (H83, H84 refuted): best end-nail multiple 0.17, keeping 68.9% and 63.6%
  (rms 22.8 points), decay ratio 1.77 against 1.12 tested; no multiple from 0.05 to 1.50 within 5 points.
- **Where it fails** (H85 held): 69% (6-12) and 85% (3-12) of the sheathing-nail work is on the double end
  studs, Weiss's reported failure line.
- **Threshold** (H86 held): at 0.47 of the NDS ratio the slide stops at s = 1.75 F (about 420 lb a rod), below
  the rod path's 617 lb design value.
- **Trade-off, post hoc:** fits within 5 points exist for s up to 4 F (about 970 lb a rod), with end nails at
  0.45 (s = 0), 0.25 (s = 2.55 F, the rod's design value) and 0.05 (s = 4 F) of the NDS ratio.
- **Escaped misses** (first 2,000 walls): 2.74% mean, 10.77% p99 in milestone 17's model; 2.13% and 9.02%
  with a rigid path at the 0.17 fit.

## Milestone 19 results (`experiments/m19_wall_pushover/results.txt`)

- **Code checks.** H87 held: elastic-perfectly-plastic springs reach the LP capacity within 0.044% in all 16
  cases. H88 refuted as registered: on milestone 15's studs the pushover is 1.2–1.3% stiffer than milestone 16,
  because a rigid stud pinned on its centre line also moves the edge nails 3/8 in off that line vertically; with
  the pins on the nail lines the two agree to 1e-7.
- **Softening alone** (H89 held): at code-strength joints and the rod's design value, 79.5% and 72.8% kept,
  against the LP's 79.5% and 73.5%.
- **Slack** (H90 held): 1/16 in moves the decayed shares by 0.1 point at the 0.47 joints. The most any gap up to
  1/4 in moves the 3 in wall is about 9 points, and only with joints that peak early.
- **Joints that peak at a quarter of the nails' slip** (H91 refuted): the decayed 3 in wall keeps 71.3% (6 in: 79.6%).
- **Near-code fit** (H92 refuted): no grid point with m ≥ 0.75 is within 10 points of both tested shares; the
  closest keeps 78.0% and 52.0% (rms 19.9 points).
- **Post hoc fit.** 30 grid points are within 5 points rms, all at m = 0.25. The best: 57.8% and 32.5% kept
  (tested 56.5% and 33.9%), decay ratio 1.05 (tested 1.12), intact 3-12 over 6-12 1.87 (tested 1.87); there 56% of
  the sheathing nails' energy is on the double end studs and 26% on the middle stud.
- **Numerics.** Every pushover settled to 1e-7 Fp up to its peak; after the peak some walls snap and Newton
  cannot settle every step (largest residual 3.6e2 Fp), which does not affect the peaks. The median share of nails
  whose slip fell before the peak is 0% (90th percentile 5.2%; in a few runs the peak came after a snap).

## Milestone 20 results (`experiments/m20_cyclic/results.txt`)

- **Code checks.** H93 held: the SAWS springs match OpenSees to 2e-13 FU rms on the CUREE history for all five
  parameter sets. H94 refuted as registered: pushed once, the oriented pair carries 3.1–5.2% more than milestone
  19's radial spring with the same envelope, the bias Judd and Fonseca report for uncoupled pairs; the shares kept
  agree to 0.2 point (78.6%|70.2% against 78.4%|70.1%).
- **Intact walls** (H95 held): cyclic peaks −0.1% and −0.0% of monotonic (Δ 37.2 and 39.9 mm).
- **Decayed walls** (H96 held): at code-strength joints, the rods' design value and a 1/16 in gap, 77.8% and
  **70.6%** kept cyclic against 78.3% and 70.5% monotonic (tested 56.5% and 33.9%).
- **No near-code fit** (H97 held): no point with m ≥ 0.75 within 10 points of both; the closest keeps 76.3% and
  43.3% (rms 15.5 points).
- **Grid.** Cyclic loading moves a decayed share by a median 0.2 point, at most 3.0. Best cyclic fit: m 0.25, λ 1,
  no gap, 57.6% and 31.4% (rms 1.9 points), decay ratio 1.04 (tested 1.12). With this envelope one point at
  m 0.47 (λ 0.25, 1/4 in gap) also fits (rms 2.9), from the nail's envelope rather than the cycles: its monotonic
  push gives 54.8% and 30.8%.
- **Sensitivity.** Anderson's other rows move the registered shares by under a point; Folz and Filiatrault's set
  keeps 74.3% and 66.2% cyclic (75.4%, 66.9% monotonic); Δ from the radial push and 1 mm steps change nothing to
  0.1 point. In the decayed 3-12 wall the rods yield and their holes crush to 25–28 mm on one side, after the peak.


## Milestone 21 results (`experiments/m21_degrading/results.txt`)

- **Code checks.** H98 refuted as registered: γ = ∞ reproduces milestone 20 exactly, but a monotonic push at γ 5
  moves the wall peaks by 1.6e-5 FU (registered: 1e-9), because most springs in a wall reverse slightly during a
  one-way push and start counting; that happens after the peak (`check_diag.txt`). H99 refuted as scripted: the
  hand check omitted the never-rises clamp; with it the rule holds to 4e-16 FU.
- **Code-strength joints** (H100, H101 held): the decayed walls keep 77.8%|70.6% at γ ∞ and 79.3%|73.5% at γ 5;
  every share moves +0.3 to +2.9 points.
- **Intact walls:** cyclic peaks about 97, 94, 85, 75 and 63% of monotonic at γ 100, 50, 20, 10, 5; intact ratio
  1.90–1.94 (tested 1.87).
- **Fits** (H102 held): no m ≥ 0.75 point within 10 points of both; the best point at every γ is m 0.25, rms 2.1
  (γ ∞), 2.5, 3.1, 4.3, 6.4, 8.7 points. At m 0.25, γ 5 the 6-12 share rises from 57.9% to 68.1%, because the
  intact walls' sheathing nails keep 71–77% of their strength and the decayed walls' 86–96%.
## Milestone 25 results (`reproduce.py`)
- **What was checked.** Every numpy-only experiment of two minutes or less (m1, m2, m4, m5, m7,
  m10–m14) and two scipy ones (m17, m18), each re-run from the committed code in a
  temporary copy and compared character for character with its committed `results.txt`, timings
  masked. The m6/m6b/m9/m3 runs need MuJoCo or Drake and m16/m20/m21 take 25–70 min; they were not
  re-run, and m15 and m19 were started but stopped at this session's 30-minute limit for a
  background job.
- **Two experiments had drifted, both from later edits to shared code, neither from a bug.**
  (1) Milestone 9 rewrote `cycle.ledger_draw` and in doing so drew the panel tilt from the random
  stream before the ledger tilt (milestone 5 drew the ledger first). Same distributions, different
  draws: re-running milestone 5's own commit gives its committed 0.5833 exactly; every commit from
  milestone 9 on gives 0.5814 (bisected over the five commits that touched `tack.py`). (2) Milestone
  14 changed the mean missed-nail count from (1 − mean hit rate) × 62 to a per-sheet sum: the same
  quantity, which moves three of milestone 12's values in the third decimal (0.549 to 0.548). m7
  and m13 read those files, so they moved with them.
- **What moved.** m5: H22's best single-2x pipeline 0.5833 to **0.5814** [0.574, 0.588]; two 2x
  with one read 0.9997 to **0.9994**; H26's largest recoil loss 7.64 to **7.39** points (now at three
  reads, not dense); the single-2x penalty 17.8–65.2 to **17.9–65.5 s**. m7: the break-even
  $6.51 [5.21, 7.88] to **$6.47 [5.17, 7.83]**. Each is well inside the Monte Carlo interval it was
  quoted with, and every hypothesis verdict is unchanged. The four results files, the paper
  (every moved number, among them the abstract's and a highlight's 99.97%, now 99.94%), this README and
  the homepage card are updated.
- **What the number check missed.** `paper/check_numbers.py` tied "0.9997" to its results line
  but not the same number written as a percentage, so a stale 99.97% sat in the abstract, a
  highlight and the conclusion. Four checks now bind it (194 of 194).
- **After the refresh,** all ten quick experiments reproduce, and m17 and m18 reproduce as committed.
- **Checks** (`tests/test_reproduce.py`, 4 tests): every experiment directory is listed, only
  timings are masked, a changed number is reported, and milestone 7 reproduces from its committed
  inputs.

## Milestone 27 results (`experiments/m27_slide_mech/results.txt`)

- **The stock hands are soft along the wall.** One hand: G1 35–102 N/m, H1 286–590 N/m; both together: G1 128–134,
  H1 596–1,394 N/m. Against a force source a tap travels at most 1.9% less with a G1 hand and up to 17.4% less with both H1
  hands at 100 ms, so **H103 is refuted** (bar 10%), only by the stiffest H1 pose at the slowest reactions.
- **One tap** (μ_s 0.4, μ_k/μ_s 0.8): 0.17 mm at 2 ms, 0.81 mm at 20 ms, 3.2 mm at 50 ms, 12.3 mm at 100 ms. Across
  the friction grid at 20 ms: 0.51–3.2 mm. A coarser motion threshold (0.2 mm) and a faster ramp (500 N/s) together add
  0.54 mm at 20 ms (1.35 against 0.81 mm).
- **The loop** leaves 0.054–0.090 mm rms at 2 ms (5–10 taps, 3–6 s), 0.19–0.64 mm at 20 ms (1.5–3 taps, about 1–2 s),
  0.66–2.9 mm at 50 ms and 2.5–10 mm at 100 ms. **H104 held**: 3.855 mm at 100 ms (bar 0.5 mm).
- **Back in milestone 12's best stack** (0.7707 with 0.5 mm, reproduced): 0.79–0.80 at 2–10 ms, 0.754–0.795 at
  20 ms, 0.40–0.75 at 50 ms, 0.13–0.45 at 100 ms. **H105 held**: 0.7912 at 20 ms, ratio 0.8 (+2.04 points).
- **What it means.** The pose fix of milestones 10–13 stands if the slide is a closed loop that drops the push within
  about 20 ms of the sheet moving (or 50 ms if kinetic friction is within 10% of static); a robot that reacts at
  human-like 100 ms loses most of what the slide was for. A grasp that can also brake, or a slower creep with
  vibration, is not modelled.

## Milestone 29 results (`experiments/m29_tool_lean/results.txt`)

Module `src/buildbot_sheathing/tool_lean.py`; tests `tests/test_tool_lean.py` (6); `tack.simulate(tool=...)` and
`ceiling.clean(tool=...)` take a (surface, depth) error pair per nail (the old path is unchanged and reproduces 0.7964).
H109–H111 were registered in `LOG.md` before the run; a probe of section A's G1 row ran first and is disclosed there.

- **Model.** The panel-edge bound is checked where the nail enters the sheathing; the stud (or plate) bound 44.4 mm
  deeper (7/16 in OSB plus the 10 shank diameters milestone 2's band requires inside the member). A joint error moves
  the nose by the hand's translation plus its rotation times the tool length L, and the depth point by the rotation
  times L + 44.4 mm, so the pair is bivariate normal and correlated (ρ ≥ 0.998 here). An independent lean adds
  44.4 mm × tan(lean) at depth only.
- **Checks.** At L 0 the G1's surface scatter is 0.931/0.873 mm (y/z), `buildbot-fasten`'s 0.93/0.87. One-nail Monte
  Carlo against the bivariate normal: 0.8632/0.8633, 0.6387/0.6393, 0.7069/0.7085 (the last at ρ ≈ 1, where scipy's
  integration is least accurate). The old 0.9 mm model through the new path gives 0.7969 (old path 0.7964, interval
  0.7908–0.8019).
- **The robots** (11-bit, stud-height pose, feet planted): hand rotation 0.10/0.12/0.10° (G1) and 0.07/0.09/0.08° (H1)
  about x/y/z. Along-wall scatter at the surface: G1 0.93, 1.11, 1.31, 1.53 mm at L 0, 0.15, 0.3, 0.45 m; H1 0.70,
  0.88, 1.06, 1.26.
- **Best single-2x stack** (milestone 28's: measured studs, per-nail reads, mid push, 20 ms slide, 1/16 in shims):
  G1 0.7346, 0.5118, **0.2637**, 0.0993 at those lengths; H1 0.9117, 0.7830, 0.5706, 0.3247. At twice the quantisation
  the G1 gives 0.0119 even at L 0. Doubled joints: 1.0000 at 11 bits, 0.9997 at twice, 0.9570/0.3952 at four times
  (L 0/0.3). **H109 held** (−53.3 points).
- **Resolution at L 0.3 m (G1):** 11 bits 0.2637 (1.43 missed nails a sheet), 12 bits 0.9344 (0.08), 13 bits 0.9910,
  14 bits 0.9966.
- **Independent lean** on top of the G1 at L 0.3: 0.25° −0.6, 0.5° −2.6, 1° −9.3, 2° −22.1 points; the stack
  tolerates **0.434°** (1σ) for 2 points. **H110 held** (1°: −9.28). Doubled joints 1.0000 up to 2°, 0.9998 at 3°.
  **H111 held.**
- **What it means.** The paper's single-2x numbers hold only if the tool point, not the hand, is held to about
  0.9 mm along the wall at the stud's depth: a stock G1 with a 0.3 m nailer misses it by half, a 12-bit G1 meets it.
  Doubled joints carry any tool the programme has modelled.

## Milestone 28 results (`experiments/m28_shim_mech/results.txt`)

Module `src/buildbot_sheathing/shim_mech.py`; tests `tests/test_shim_mech.py` (6). Shim sizes from supplier listings:
composite taper shims 8 in long, 1/16 to 5/16 in thick (slope 1:32); plastic horseshoe shims 1/16, 1/8 and 1/4 in.
H106–H108 were registered in `LOG.md` before the run.

- **The lift needed** (|ledger + panel tilt| × 48 in): median 0.946 mm, p99 3.018 mm, max 4.7 mm on milestone 6b's rock
  draws (1.215 and 4.709 mm with the PS 2 bow draw); 43% of sheets need less than half a 1/16 in step.
- **Shim stack.** Rounding to whole steps leaves 0.229 mm rms at 1/32 in shim stock, 0.458 at 1/16 in, 0.934 at 1/8 in
  (step/√12 to within 2%). In milestone 12's best stack with milestone 27's 20 ms slide (0.262 mm): 0.8042, 0.7964 and
  0.7653 against 0.7912 with a Gaussian 0.5 mm and 0.8059 with a perfect shim. **H106 held** (+0.52 points).
- **Wedge statics.** The wedge carries 112–223 N (half the sheet plus the wall friction that resists its turn) and needs
  49–53 N at μ 0.2, 108–129 N at μ 0.4 and 217–277 N at μ 0.6 on every face; it self-locks at every μ swept, and backing
  it out takes a 36–124 N pull. A slick ledger face (μ 0.15, others 0.4) cuts the push to 83 N.
- **The robots** (both hands into the wall, MuJoCo Menagerie, milestone 3b's whole-body check): G1 40.6 N at 0.35 m,
  65.6 N at 0.5 m (waist pitch), 118.0 N at 0.7 m (wrist pitch); H1 130–135 N (elbow). The largest common friction the G1
  can drive is 0.16, 0.25 and 0.40 at those heights; the H1's 0.43–0.44. **H107 refuted**: 118.5 N needed at μ 0.4, the
  G1 gives 65.6 N at the model's 0.5 m ledger.
- **Stick-slip on a light mass.** One hand's effective mass along the push is 0.78–1.17 kg (G1) and 0.80–0.97 kg (H1);
  the sheet adds 35 g. A tap therefore runs far: at μ_s 0.4, μ_k/μ_s 0.8, 0.46 mm at 2 ms, 12.7 mm at 20 ms, 76 mm at
  50 ms, and 337 mm at 100 ms, past the wedge's 8 in. The loop leaves 0.013 mm rms at 2 ms (70 taps), 0.041 at 10 ms,
  **0.132 at 20 ms** and 0.578 at 50 ms; across ratios 0.5–0.9 at 20 ms 0.08–0.35 mm, and across μ_s 0.2–0.6 0.06–0.29 mm.
  **H108 refuted** (bar 0.1 mm). In the stack, a 20 ms wedge gives 0.8023, a 50 ms one 0.7872, a 100 ms one 0.6208.
- **What it means.** The shim the paper credited is a 1/16 in stack: a pick-and-place job with no force or timing
  requirement, which a G1 can do, and it is as good as the 0.5 mm assumed. A wedge buys about one point more only for a
  robot that can push 120 N low on the wall (an H1) or slick shims, and with a 10–20 ms release.

## Limitations
- **The tool point (milestone 29).** Only joint quantisation is carried to the nose; backlash, link and mount
  deflection under the push, and calibration would add to it, so the robot rows are best cases. The 0.3 m nose is
  `buildbot-fasten`'s figure, not a maker's; the 44.4 mm depth uses milestone 2's 10-diameter penetration rule, not a
  code clause. One pose (stud height) stands for every nail.
- **The shim (milestone 28).** Face frictions of the composite shim on OSB and lumber are swept (0.2–0.6), not
  measured; the stack is placed at exactly its rounded height (no shim crush, no debris); the wedge's stroke is a flag,
  not a simulated end stop; backing a wedge out pulls the sheet's foot off the wall (36–124 N), which the press is
  assumed to resist; the 0.5 m ledger height that sets the G1's push is the model's, and lower ledgers make it weaker.
- **The cyclic wall (milestone 20).** SAWS has no cumulative damage: the envelope a spring reaches under cycles is
  its monotonic envelope, so nail fatigue and tear-out, which Anderson et al. and Weiss saw, are outside it.
  Anderson's nails are 0.113 in, Weiss's 8d common 0.131 in (only shares are compared); the oriented pair
  overstates the monotonic peak by 3–5% against a radial spring; the end-nail joint's curve is borrowed, with
  strength and slip swept; Δ comes from this model's own push; rigid studs and sheets.
- **The wall pushover (milestone 19).** Monotonic and path-independent (unloading reads back down the backbone),
  against cyclic tests; the end-nail joint's curve borrows the sheathing nail's shape, with its strength and slip
  scale swept, not measured; rigid studs and sheets; the rod stiffness is a design modulus; ties and bearing are
  stiff penalties, not the HTT4's measured stiffness.
- **The rods' shear path (milestone 18).** A design equation, not a tested ultimate, engaged with no slack;
  the steel side member's thickness is swept, not read; the same rigid-plastic, monotonic model as
  milestone 17, so slip in an oversized rod hole and cyclic tear-out are outside it.
- **Weiss's wall (milestone 17).** Rigid-plastic, monotonic and small-displacement against cyclic tests of
  two or three walls a group; studs are rigid bodies, though Weiss's middle studs split; joint strengths are
  NDS design ratios, and the 0.47 that fits the tests is fitted, not measured; shear through the hold-downs
  and anchor bolts is ignored, which makes the fitted joints an upper bound on how weak they must be.
- **Softening nails (milestone 16).** Monotonic loading only (no cyclic strength degradation, pinching
  or unloading branch; most shear-wall tests are cyclic); one nail-joint study, SPF framing; the slip at
  peak is swept, not measured; milestone 14's kinematics (pinned framing, rigid sheet, full anchorage).
- **Framed-sheet model (milestone 15).** Joint strengths are NDS design-level (yield-limit) ratios, not
  tested ultimates; joints and nails are rigid-plastic, with no softening; bearing friction and hold-down
  shear are ignored. One sheet with its own four studs; Weiss's set-up was not read.
- **Racking model (milestone 14).** Rigid-plastic, equal fasteners, full anchorage, a rigid sheet and
  sheets acting independently; no stiffness, edge-distance, tear-out or cyclic effects. It understates
  clustered missing nails against one test series (about 2.5 times there). Whether a code official
  accepts a schedule that knowingly includes shiners is outside it.
- **Measured studs (milestone 11).** One wall of six studs, of unstated grade and species, built
  by robots that shorten members to fit, scanned from one side with a profile every 2 mm along
  the wall, so a face edge is known to about ±1 mm per slice and passes are stitched on the
  robot's calibration; the part of the waviness common to every member is treated as scan
  artefact, which may also remove some real shape. Length-squared scaling to the 92 5/8 in stud
  assumes constant curvature, which the measured shapes do not have.
- **Gaussian, independent, swept.** Stud, edge, gauge and width errors are swept, not measured;
  real errors have bias and heavy tails. The stud estimate includes the layout scatter
  (studfind's single-read policy).
- **Studs (milestone 2).** Warp means come from two southern pine studies seen as search
  snippets; the distribution shapes are guesses (two are reported); bow is a parabola fixed at
  the plates and twist is linear, both as the free piece warped, though nailing, blocking and
  the sheathing itself pull a stud partly straight (which would help) and studs keep moving as
  they dry in place (which would not). Crook, sheet bow and wall racking are not modelled.
- **Hang and sway (milestone 4).** Gaussian and swept, not measured on any robot; sway is an
  independent translation per nail, with no rotation and no recoil coupling; a re-hang is a
  fresh draw, which understates a robot that corrects from its measurement; the measured edge
  line is taken to have the true slope.
- **Ledger (milestone 3).** A rigid sheet on point contacts; a real OSB sheet flexes, its back
  face touches studs and plates unevenly, and the ledger board itself bows between fasteners. The
  holder is a lumped impedance at the sheet's centre, not a humanoid's arm; the press,
  wrist stiffness and wall friction are swept, not measured. PS 2 gives limits, not distributions:
  the uniform shapes are assumptions, and real panels are probably far inside the limits, which
  is what decides the single-2x case. The bowed edge is modelled at the bottom only; a bowed
  vertical edge would also bend the measured edge line.
- **Second model (milestone 6).** Drake and MuJoCo are both compliant, regularised contact
  models run on the same rigid point-contact sheet; agreeing with each other does not make
  either a real sheet on real framing. A real check needs a framed mock-up.
- **Humanoid (milestone 3, second part).** Static only: no walking, no balance controller, no
  dynamics of the press or slide, and a 50/50 force split between the hands, where pushing the
  sheet's edge would load one hand. The PD stiffness takes the joint gains at face value (no
  motor or gearbox compliance, no grip compliance), with the feet rigidly planted; the published
  gains are examples and training defaults, not a holding controller. The sheet bottom is at
  floor level and the robot centred on it; rigid clamp and palm point contacts bracket a real
  hand. Ledger and palm friction are swept, not measured.
- **Cycle (milestone 5).** Every stage time but the nailing is swept, not measured; each missed
  nail is assumed found and re-driven at one cost, though a joint a bowed stud has closed may need
  a block or a sister stud; stages run in series, with no overlap between the lift and the robot.
- **Cost (milestone 7).** Every machine price but the humanoids', every life and upkeep, and
  every stage time are swept, not sourced. The hand crew's minutes are the taskbook author's,
  and its own missed nails are not charged (which favours it). A site robot is dedicated to wall
  sheathing; moving it between sites, setting it up, insurance and idle days are not priced, and
  neither are a plant's floor space, the walls a plant must ship, or a missed nail found late.
- **Straightening (milestone 9).** A linear Euler-Bernoulli beam with ideal pinned or fixed
  ends; real end nails sit between and can slip, the stud's own bow may relax as it dries or
  creep back before the second sheet, and a stud with a knot near the push point may crack.
  The sheet is taken as rigid in its plane, so a driven nail holds its point; nail slip under
  the stud's spring-back is not modelled. E is a design reference value with an assumed
  lognormal spread, not measured studs. The humanoid capacity is milestone 3b's static check
  with both hands on the stud; a one-hand push while the other hand nails would have less.
- **Ceiling split (milestone 10).** Shapley shares depend on the scale (−ln clean) and share
  interactions equally; "alone" and "all but" values are reported beside them. The slide and shim
  are modelled by their residuals, not as mechanisms: whether a robot can shim a 22 kg sheet on a
  ledger, and to what, is not known; the shim residual's effect on the ledger seat is not
  simulated. The tool scatter is one Gaussian, so the 0.79–0.84 mm target is a 1σ figure.
- **Plate nails** see only the tool scatter: the sheet's vertical placement is not modelled.
- **Strict pass/fail.** One nail outside its window fails the sheet; the nails missed are
  reported beside it, and real practice may accept a near miss or re-drive it.
- **Windows from secondary sources.** The gap, edge distance and trim were read in search
  results (APA pages, a manufacturer's guide, a trade Q&A), not in APA E30 or the code.

## Next steps
Milestone 27 turned the slide into a reaction-time requirement (release within about 20 ms of the sheet moving).
What would pin it: the static and kinetic friction of OSB on a lumber ledger and on framing (the EPFL OSB data
set, or a tilt-table test), a G1's measured latency from hand displacement to zero push, and the same model for
the shim (a wedge driven under the low corner), which still carries an assumed 0.5 mm.
Milestone 2 left two checks: measured stud profiles (the Adel et al. 2024 data set, or a scan of
real studs in a wall) in place of means and assumed shapes, and how far sheathing nails pull a
bowed stud straight. Milestone 3 is done for a static robot; what is left is dynamic: a
G1 or H1 walking a sheet the last metre with a person or a lift, the edge push and its one-hand
load, and a controller that feeds the weight forward and drops it at ledger contact, in MuJoCo
with a balance policy. Milestone 5 timed the cycle with swept stage times; a measured time for
each stage (a lift cycle, a stud read, a re-drive) would pin it, and milestone 7 priced the extra
joint stud against the 18–65 s it saves (it does not pay unless a missed nail costs about $6.50 more
than its re-drive). A time study of a crew's sheathing, a quote for a drive-and-lift base and a
nailing bridge, and the cost of a missed nail found at inspection would replace milestone 7's
widest sweeps. Milestone 6 found the ledger results hold on Drake; how far a bowed bottom edge
rocks the sheet depends on the contact model (0.11–0.15°), so a flexible sheet and a measured rock
on a mock-up would pin it. Milestone 8, the paper draft, is done ([`paper/`](paper/)); before submission it needs the Elsevier LaTeX template, the unconfirmed citations checked and authorship decided. Milestone 9 found that pushing a bowed joint stud onto its line
removes the bow's cost at 28–232 N but leaves single 2x at the straight-stud ceiling of 0.74–0.81,
and milestone 10 split that ceiling: the tool's scatter carries about half of it, the pose the
rest, and a slide and a shim before tacking lift it to 0.92–0.94, still short of 95% without a
tool held to about 0.8 mm. Next for single 2x: a measured scatter for a nailer on an arm (the
0.9 mm is one source), a mock-up of the slide and shim, and a mock-up push on real studs to pin
the end restraint. A measured sample of
real panels' squareness and edge bow would settle the single-2x case. Milestone 11 measured six installed studs from a public
scan and found the parabola flatters single 2x by 11–15 points; the next measured check is a
scan with finer profile pitch (or a scan along the studs) of framer-built walls, to separate
the wood's waviness from the scanner's and to give a population, not one wall. Milestone 12
found that reading each stud at every nail height recovers most of that loss, and that per-nail
reads, a mid push and a slide and shim together reach 0.77 on the measured studs (95% needs a
0.6 mm tool); a line-laser stud read on a real robot, and its time, is the next measured input. Milestone 13
priced those remedies: they cost 32 cents a clean sheet for 35 points of first-pass quality, while
the doubled joint stud costs $5.13 more and pays only if a missed nail costs about $5.51 beyond its
re-drive; the cost and detection rate of a missed nail at inspection is now the input that decides
the framing. Milestone 14 sized an escaped miss in capacity (about 2% of its sheet,
clustered) and found 4 in joint nailing carries them; a racking test of sheets with shiners at the
simulated positions would check the model where it is weakest, clustered misses. Milestone 15 found that
stud-to-plate joints at code strength do not close the gap to Weiss's tests; the next inputs are
Weiss's anchorage and wall size (the thesis full text), and tested ultimate strengths of end-nailed
joints and sheathing nails in place of design ratios, or a softening fastener model. Milestone 16 ran the softening fastener on a tested backbone and found
it changes nothing (20.1–20.4% against 20.4%), because a racking sheet slips its perimeter nails almost
equally; what is left is the anchorage, so the next step is a model with hold-down and sill-plate
stiffness and uplift (or Weiss's full text, to read her set-up). Milestone 17 read the full text and built
her wall: its anchorage does not explain the loss at code-strength joints, but end nails at 0.47 of the
NDS ratio fit both tested groups, because the decayed wall slides on its sill. The next inputs are a tested
ultimate for 16d end-nailed stud-to-plate joints (to check the 0.47 independently) and the shear the
hold-downs and anchor bolts carry. Milestone 18 added the rods' shear path: it stops the slide below the
rod's design value, and then no end-nail strength fits the 3 in wall, so the next model is a displacement-based
wall with slack at the rods (milestone 16's nail springs), checked against a tested end-nail ultimate.
Milestone 19 built that wall: neither slack nor early-peaking joints explain the 3 in wall, and every fit needs
end nails at about a quarter of the NDS ratio. Next: a tested ultimate and load-slip curve for 16d end-nailed
stud-to-plate joints (the one input every fit now hinges on), and a cyclic loading protocol (CUREE) with
pinching and strength degradation, since Weiss's tests were cyclic. Milestone 20 ran the CUREE history with
SAWS pinching nails fitted to Weiss's materials: cycles move the decayed 3 in wall by 0.1 point. Next: a
tested 16d end-nail ultimate, and a degrading (cumulative-damage) nail model or tested curves of nails at an
unsupported panel edge, to test fatigue and tear-out. Milestone 21 added energy-based strength degradation to every nail: it lowers intact
and decayed walls together and lifts the decayed shares by up to 2.9 points, so spread damage is ruled out. Next:
a local failure model for the nails left along the unnailed bottom edge (edge distance and cycle count, from
tested curves of nails at an unsupported panel edge), the middle stud splitting, and a tested 16d end-nail ultimate. Milestone 22 wrote milestones 14 to 21 into the paper draft (sections 4.9–4.10, 5.13–5.14). Milestone 23 builds the draft into Elsevier's `elsarticle` template (`paper/build_latex.py`, a 27-page PDF with every citation resolved), completes two references and cuts the highlights to Elsevier's five bullets of 85 characters. Milestone 24 cuts the abstract from 469 words to the journal's 150 (26 pages, 24 works cited) and makes the build fail on a longer abstract, a single-author citation left as plain text and an unused reference. Milestone 25 re-runs the committed experiments (`reproduce.py --check`): milestones 5 and 12 had drifted from later edits to shared code (a reordered random draw, a rounding change), now refreshed, with the paper's numbers updated and no verdict changed.
The full plan is in [`PROPOSAL.md`](PROPOSAL.md),
"Milestones".

## Owner steps
None needed. A hardware check needs a framed mock-up wall, a nailer on an arm, a measured stud
grid and a risk assessment.

## Outside dependencies (vitamins)
NumPy, Matplotlib (figure), pytest, MuJoCo (Apache-2.0, milestone 3), Drake (BSD-3-Clause, milestone 6). Reads `../buildbot-studfind` in one test, and `../buildbot-payload` and `../buildbot-fasten` (the whole-body model) in milestone 3's second part, which clones the Unitree G1 and H1 models (BSD-3-Clause) from MuJoCo Menagerie at a pinned commit. No group in
`prompt.md` covers construction, and none is claimed.
