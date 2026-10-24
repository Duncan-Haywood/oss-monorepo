---
title: "Robot assembly in simulation: what 49 digital-twin studies found"
date: 2026-10-20
description: "Assembly order planning, peg-in-hole transfer, twins that check robot programs and robot-printer cell bottlenecks, from 49 simulated studies."
post: robot-assembly-simulation-digital-twin-findings
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

This episode covers the robot manufacturing track. The plan for the track is to work out the order in which to assemble a small printed product, teach a simulated arm to push a peg into a hole, check robot programs in a digital twin before they run, model a cell with an arm, some printers and an inspection station, and finally have an arm assemble part of its own gripper.

All of those exist, among forty-nine small projects. AI coding agents did the work, with the repository's owner steering. Every number here comes from a project's own write-up.

The caveats come first. Everything is simulated. The products are made of boxes, the times and failure rates are illustrative values the agent chose, and no real arm or printer was touched. The track keeps asking one question: what does a cheap checker get wrong compared with a better one? That is simulator against simulator, not simulator against the real world. None of this is engineering advice.

Finding one. Gravity rules out almost every assembly order. For a twelve-part printed gearbox, the project counted every possible order exactly. There are almost forty million. About four point two million avoid collisions. Only thirty thousand, seven hundred and sixty also keep every part supported as it goes in. The order that looked best when only collisions counted turned out to be impossible once gravity counted, because it placed a collar before the shaft it sits on.

A follow-up dropped every partial assembly into a physics engine called MuJoCo. The hand-written support rule agreed with it about ninety six percent of the time. The disagreements exposed a real bug: a part could count as resting on another part that was actually resting on it. Fixing that removed them. Reassuringly, the number of valid complete orders did not change.

Finding two. A peg-in-hole policy tuned in a simple simulator loses most of its skill in a harder one. Tuned without friction, it succeeded about ninety one percent of the time there, about half the time in a stiffer, higher-friction version, and about a quarter of the time in a held-out version. Randomising the simulator during training helped on the held-out test, but no more than simply training on the harder version. With only five seeds, the study could not tell those two apart.

Finding three. A digital twin catches the errors it models and misses the rest. The project made one hundred and sixty two small edits to working pick-and-place programs. Sixty nine of them failed against a reference twin standing in for reality. The simplest checker caught fifty five percent of those. Adding joint and payload limits caught sixty seven percent. Adding random grasp error and the time a grip takes to build up caught eighty seven percent. No checker raised a false alarm. The programs were written by the same agent that built the twin, so this is not a test of how often language models make mistakes.

Finding four. In a cell where one arm feeds several printers, the busiest machine is not the bottleneck. The printers always looked the most utilised. But at six printers, halving the arm's loading time saved about twenty one minutes of a three hundred and thirty eight minute batch. That is because a printer sits idle while it waits for the arm. A twin that used average print times was optimistic by over two hours with one printer.

Finding five. A camera that stops failed prints pays off only while the printers are the limit. With failures at a moderate assumed rate and a ten minute reaction time, the simulated gain was about eight percent at six printers and under one percent at sixteen, where the arm sets the pace. False stops wipe out the gain at somewhere between one and two every ten printing hours.

Finding six. A gripper cannot build a same-size copy of itself. In the toy design, the arm needs jaws that open at least thirty millimetres, the width of the widest part. When the arm is the previous printed gripper, the jaw pads eat into that opening, so copies at the same size cannot be built. The chain only works above a certain scale. Small purchased seed grippers built smaller and smaller copies until the chain died out. Larger seeds reached a design that keeps reproducing.

Finding seven. The textbook worst-case rule for tolerances asked for about three times the clearance needed for ninety nine percent of printed covers to fit. Errors in where the holes are mattered far more than errors in their size.

Finding eight is a safety check. Several projects found that a time-optimal move carries a part nine to twenty three percent faster than a tuned standard profile, and all of them relied on one hand-written equation for the arm's torques. Rebuilt in MuJoCo, the two agreed almost exactly across one hundred and eight motion profiles. So the result is not a dynamics bug, though it is still a toy arm.

What is missing is a real robot. The track's last step is for the owner to test the best simulated result on a low-cost open arm, with a priced parts list.

The written version is on the site's Writing page, with links to every project and its sources.
