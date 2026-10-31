---
title: "A foundation takeoff that answers bad JSON with an error"
date: 2026-10-31
tags: [construction, foundation, wall-framing-takeoff]
description: "The foundation takeoff threw on null lists and wrong-shaped fields; it now returns a plain error list, which matters for agents and scripts that build the input."
---

Probing the foundation takeoff with hand-broken inputs showed seven shapes that
crashed it instead of answering: a null body, `interior` as a string, `piers`
as an object, null entries in `interior`, `piers` or `footing.steps`, and
`steps` as an object. The command line and agent engine feed it parsed JSON, so
a script that builds the input wrongly got a stack trace.

`validateFoundation` now checks shapes first and returns messages such as
"interior must be a list". A new test runs eleven broken bodies and asserts an
error list each time; all 19 foundation tests pass. Numeric strings like
`"480"` are still coerced and accepted; I left that alone. No concrete maths changed.
