# Repository prompt

The standing brief for work on this repository.

## Mission
Build a public research portfolio (MIT-licensed) that supports PhD applications in ML/AI, robotics & autonomy, operations research, or industrial engineering in a CS / math / econ / finance department. Produce work a faculty member would take seriously: white papers written to publishable standard, reproducible code, implementations, and benchmarks. Quality beats volume.

## Central theme
Simulating and training with digital clones (digital twins) of physical-world systems, including sim-to-real transfer, simulation fidelity, and learning in simulation for real benefit. Every project should connect to this theme where it reasonably can.

## Research groups to build on
Read their recent papers, code and project pages. Implement, reproduce, extend, and follow up the implications of their work.

Robotics & autonomy (priority):
- ARPG, Christoffer Heckman (CS): https://arpg.colorado.edu/
  Perception, SLAM, radar/lidar, field and subterranean robotics, vision-language navigation, generative 3D occupancy and scene synthesis.
  Directions: generative digital twins of environments, sensor simulation (especially radar), sim-to-real for perception, multi-robot mapping in simulation.
- CAIRO Lab, Bradley Hayes (CS): https://cairo-lab.com/
  Task and motion planning, learning from demonstration, explainable AI, human-robot collaboration.
  Directions: learning from demonstration inside digital twins, explainable planners evaluated in simulation, simulated human models for training collaborative robots.
- HIRO Group, Alessandro Roncone (CS): https://hiro-group.ronc.one/
  Embodied intelligence, social intelligence, robots in chemistry labs.
  Directions: digital twins of lab and manipulation workcells, embodied learning in simulation, sim-to-real for manipulation.
- Autonomous Systems IRT: https://www.colorado.edu/irt/autonomous-systems/
- RECUV (unmanned vehicles): https://www.colorado.edu/recuv/
  Directions: UAV and field-robot simulation, targeted observation of severe weather, safe autonomy with verification.

## Output standards
- Each artifact lives in its own directory with a README covering motivation, which group's work it builds on (with citations), method, how to reproduce, results, limitations, and next steps.
- Never fabricate results. Report only what the code actually produced. Mark anything preliminary or negative as such.
- White papers use proper citations (BibTeX) and credit prior work accurately.
- Tag each artifact with the lab(s) it relates to, so it can be cited when contacting that faculty member.
- Prefer lightweight, runnable simulators (e.g. MuJoCo, PyBullet, Isaac or Gazebo only when needed) and small experiments that finish on modest hardware.

## Licensing & attribution
- Original work is MIT-licensed.
- Third-party code keeps its original license. Check compatibility before vendoring, and prefer dependencies over copying.
- Never imply affiliation with, or endorsement by, any lab, professor or company. Say "builds on" or "reproduces", never "with" or "for".

## Portfolio site
Maintain a GitHub Pages site listing each artifact: a one-line summary, related lab, and links to the paper, code and results. Keep it current as work merges.

## Workflow
Work on feature branches. Before merging, make sure tests and CI pass, READMEs are complete, and citations are checked. Merge changes when done, and merge other branches and PRs that are ready for merge and haven't been merged yet.
