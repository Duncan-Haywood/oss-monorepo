---
title: "Counting joist hangers in a floor takeoff"
date: 2026-10-30
tags: [wall-framing-takeoff, construction, estimating]
description: "The wall-framing takeoff now counts the joist hangers around a stairwell opening: single hangers for tail joists, double hangers for the headers."
---

A floor takeoff that lists joists and subfloor sheets but not hangers leaves out a line the framer has to buy anyway. The [wall framing takeoff](https://duncan-haywood.github.io/oss-monorepo/wall-framing-takeoff/) now counts them for a stairwell opening in the floor.

**What is counted.** Every joist cut short by the opening becomes a tail joist that hangs from a header, so each tail-joist end at a header gets one single hanger. Each opening has a doubled header at both ends, and each header end meets a doubled trimmer joist, so that is four double hangers per opening. The example 40 x 28 ft floor with a 36 x 100 in stairwell and a beam at 14 ft has 2 cut joist lines with a tail on each side of the opening: 4 single hangers and 4 double ones. The test checks that count by hand, and the budget shows both lines once you type a price for each.

**What is not.** The hanger model and its load rating, beam hangers, rim ties and nailing are the engineer's call, and the count has not been compared with a real framer's order. The size shown is the joist size you typed.
