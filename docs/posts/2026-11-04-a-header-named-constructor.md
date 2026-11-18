---
title: "A header named constructor passed the span table check"
date: 2026-11-04
description: "Probing the wall framing header span table with hostile rows found five ways a bad table or plan got through, and one that crashed."
tags: [wall-framing-takeoff, construction, testing]
---

# A header named constructor passed the span table check

The wall framing takeoff lets a builder bring their own header span table: for
each clear span, which lumber to use. A table that quietly accepts nonsense
puts the wrong header on a drawing, so I fed it hostile rows by hand.

What got through:

- a span of `"48"` as text, `Infinity`, and `1e9` inches;
- a header called `constructor` or `toString`, because the check asked
  `header in DEPTH`, and `in` also reads inherited object keys;
- an opening whose width was the text `"36"`, resolved on coercion;
- a `null` plan, wall or opening, which threw a raw TypeError.

Each is now refused with a reason (`headers.mjs`), with tests in
`headers.test.mjs`. The 12,000 inch cap is a guard limit, not a code value.
Everything here used invented tables; no engineer's real span table was
tested.
