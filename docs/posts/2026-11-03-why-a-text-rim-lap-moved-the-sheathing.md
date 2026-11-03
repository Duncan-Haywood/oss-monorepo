---
title: Why a text rim lap moved the sheathing
date: 2026-11-03
description: A framing plan with a text rim lap was accepted and laid out on a coerced number; the sheathing engine now refuses it.
tags: [wall-framing, validation, construction]
---
A framing plan with `rimLap: "9"` was accepted by the sheathing layout and built on a coerced number. So were a negative minimum strip and a sheet whose width was text.

Probing every numeric sheathing setting by hand found it. `sheathe()` now refuses text, negative and huge values with a reason, the same way the other engines in the wall-framing takeoff do. The inputs were invented, not a real builder's order. The venture suite passes (730 tests).
