# Research log

## 2026-11-07 · Process damping as a swept linear term
- Added `Tool.cp`/`diam` and a velocity-proportional force F = -cp w v / V per engaged tooth to the semi-discretisation.
- Sweep (slotting): the depth-limit gain is a low-speed effect, 2.3-3.7x at 2000-3000 rpm for cp = 3e4 N/m^2 against 1.1-1.2x above 12 000 rpm. cp is swept, not measured; identifying it from published cutting tests is the next step.
