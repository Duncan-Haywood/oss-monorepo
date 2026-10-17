# Arm torque versus jaw friction in carrying a printed part: a stylised two-link model

*Produced with AI assistance (Claude). Preliminary, simulation only.*

## Abstract
`robofab-graspmove` gave the jaw force needed to hold a printed part under a given acceleration, and `robofab-reach` the smallest arm that reaches every point of a toy gripper's assembly. This note joins them: a planar two-link arm with assumed masses carries each of six parts on a min-jerk joint move, as fast as an assumed joint torque limit allows, and the jaw force that move demands is computed from the bound m sqrt((g+a_z)^2 + a_r^2)/(2 mu). With 0.12 m links and 5 N m the carries take 0.06 to 0.10 s and the 5.95 g cover needs 1.25 N per jaw, 21 times its static force. Grip rather than torque binds for the cover below about 0.5 N. The jaw bound was simulated only up to 40 m/s^2 earlier, and most cases here exceed it. Results are stylised and say nothing about physical arms.

## 1. Setting
Self-replicating shops (Zykov et al., 2005) hand parts between machines; the cycle time of a hand-off is limited by the arm or by the grip. See `../README.md` for the model and `../experiments/results.txt` for all numbers.

## References
Zykov, Mytilinaios, Adams, Lipson (2005), Self-reproducing machines, Nature 435. Flash and Hogan (1985), The coordination of arm movements, J. Neurosci. 5(7) (not re-verified). See `refs.bib`.
