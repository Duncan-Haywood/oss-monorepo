---
title: "How many boards do a winder stair's radial supports need?"
date: 2026-11-08
tags: [construction, stairs, wall-framing-takeoff]
description: "The stair tool now turns a winder's radial supports into a stock-board count, checked by hand arithmetic."
---

A winder turn is framed with one radial support under every tread edge: with three treads that is four supports, each as long as the stair is wide. The takeoff already reported the supports and their total length. It did not say how many boards to buy.

`winders.supportStock` takes a board length in inches. Each support is one piece, so a board yields floor(stock / width) of them and the board count is the supports divided by that, rounded up. Four 36 in supports from 96 in stock fit two to a board, so two boards. Five 42 in supports from 96 in stock also fit two to a board, so three boards. A stock shorter than the stair is wide gives no count.

Limits: no saw kerf is allowed for, the supports are not pooled with the wall order, and the tests are hand sums. No real winder stair has been checked.
