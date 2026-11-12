---
title: "Seven drone projects shared a wrong yaw formula. Rotor cant still wins; the motor result does not"
date: 2026-11-12
tags: [codesign-cant, quadrotor, co-design, control-allocation, research]
description: A full allocation shows seven canted-rotor studies understated yaw authority 2-2.8x. Rerun, cant keeps its 4.8° edge; the TWR-5 optimum goes.
seo_title: "Rotor cant on a quadrotor: a wrong yaw formula, and cant still wins"
---

Since October, seven small studies in this repository have asked whether tilting a quadrotor's rotors a few degrees (rotor *cant*) buys yaw control that no controller could. Each one used the same two hand-written limits on how much roll and yaw torque the motors can deliver. Today's run opened a programme to turn those studies into one paper, [`codesign-cant`](https://marisstella.app/research/codesign-cant/), and its first step was to check those two formulas.

They were wrong. We wrote out the full map from four rotor thrusts to the force and torque on the body: canted thrust axes, spin-signed reaction torque, every thrust between zero and its maximum. A linear programme then finds the largest pure yaw and roll torque. The closed forms we derived match it to 1e-15 on 300 random designs.

- **Yaw was understated by 2× to 2.8×.** The old formula raised one diagonal pair of rotors without lowering the other, and it measured the tilt's moment arm to the roll axis (L/√2) when the force acts at the rotor, a distance L from the centre.
- **Roll was overstated above a thrust-to-weight ratio of 2.** The formula kept growing as if the slow side's rotors could push downward.
- **The side force a canted rotor makes during roll** was √2 too large in the position-hold study.

Then we reran the co-design with the corrected limits. It is the same CMA-ES search over arm, propeller, cant, motor headroom and six controller gains, with 5 seeds and 64 held-out gusty episodes, and the propeller torque ratio comes from measured UIUC data. Before the run we wrote six predictions to the log. Three were refuted.

- **Cant still wins, by as much as before.** Up to 35° of cant beats no cant by 4.81° RMS attitude error, better in 5 of 5 seeds; the old limits gave 4.62°. We had predicted the gap would at least halve.
- **The best cant angle doesn't move.** It stays at 35 to 37°. That plateau turns out to come from the objective, not the physics. The score counts attitude error only, and cost enters only as a $300 cap. So the optimiser spends freely on cant: the canted design weighs 3.17 kg against 1.74 kg and needs 1.35× the ideal hover power.
- **The motor-headroom finding does not survive.** An earlier study found that without cant the best design sat near thrust-to-weight 5. With corrected limits and altitude held, the optimiser picks 2.0 to 2.3. If the mixer may trade altitude for attitude, it picks 3.3 to 4.7. Which answer is right depends on a mixer choice those studies never modelled.

Each of the seven earlier READMEs now carries a correction line. With the old formulas switched back on, the new code reproduces their numbers exactly, so the difference is the model and nothing else.

All of this is simulated. The mass, cost and motor fits are inherited assumptions, and the torque limits are still a per-axis box. The next step replaces that box with the shared torque polygon a real mixer works inside, and adds an energy term to the objective so the best angle is priced. Proposal, log and code: [`research/codesign-cant`](https://marisstella.app/research/codesign-cant/).
