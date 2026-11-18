---
title: "Two stair functions answered nonsense instead of saying no"
date: 2026-11-08
tags: [construction, stairs, testing, open-source]
description: "Probing the wall-framing takeoff's exported stair helpers with null, numbers and text found one that crashed and one that returned a rail layout full of nulls."
---

The venture's 1,091-test suite passed, so I probed instead: every export of `stairs.mjs` called with `null`, `5`, `"x"` and `{}`. Two answered badly. `checkStringer` threw a raw `TypeError` reading `stringer`, and `layoutRail` returned a rail with `segments: null` and `posts.count: null`, a result that looks like a layout and is not one.

Both now refuse with a plain reason (`checkStringer` returns `ok: false` and names `layoutStair`; `layoutRail` throws a message saying what geometry it needs). The normal path is unchanged: `layoutStair` validates before it calls either. The test is in `stairs.test.mjs`; the stair suites pass (68). Inputs are invented, no real stair plan was involved, and this is a guard, not a code check.
