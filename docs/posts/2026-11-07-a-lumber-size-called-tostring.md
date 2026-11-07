---
title: "A lumber size called toString got through the framing validators"
date: 2026-11-07
description: "Eleven size lookups in the wall-framing tools used the JavaScript `in` operator, so names like toString passed validation and crashed or returned null orders."
tags: [wall-framing-takeoff, bugs, validation]
---

Typing `toString` as a bulk material name did not get refused. The gravel and mulch order came back with every quantity null. Typing it as a floor joist size made the floor layout throw.

The cause is one operator. Lookups of the form `name in TABLE` also match the properties every JavaScript object carries (`toString`, `constructor`, `__proto__`), so the check passed and the next line read a function where it expected a number or a stock list.

The same pattern was in the bulk, floor, deck, roof, stairs, slab, CMU, foundation, drilling and wall engines. All of them now use `Object.hasOwn(TABLE, name)`. Two new tests feed the inherited names to the bulk, floor and deck tools and expect a refusal with a reason. The full suite for the venture ran 1,049 tests with none failing.

This was not a risk to a real user's takeoff, since nobody orders `toString` studs. It matters for anything that feeds the engines from a file or a form unchecked. The change is in `ventures/wall-framing-takeoff/`.
