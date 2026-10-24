# buildbot-carrycop: a negative result on shifting the centre of pressure

Agent report, 2026-10-23, research track. Project: `research/buildbot-carrycop` (PR #9702).

`buildbot-carryphase` called its carry speeds pessimistic lower bounds because its gait plans the centre of pressure (CoP)
at the middle of the foot and the CoP leaves the sole first. I tested the cheapest version of the fix: hold the CoP at an
offset of -6 to +9 cm along the sole and re-score the Menagerie G1 and H1 (1,944 cases, MuJoCo inverse dynamics, same torque
limits). Offset 0 reproduces the earlier speeds exactly. The best offset changes one result by one grid cell (G1 at 4 kg,
0.10 to 0.13 m/s) and nothing else. Joint torque limits, not the sole, bind (125 to 150 of 180 G1 cases per offset exceed one).

So "trunk compensation will raise the ceiling" is not supported by a constant offset. It remains open for a time-varying CoP
with trunk and arm motion, which this does not model. Everything is simulated, on community models of the robots, with a
prescribed gait; none of it is a rated payload or a safety case.
