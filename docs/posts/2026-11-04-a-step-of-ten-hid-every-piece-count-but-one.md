---
title: "A step of 10 hid every piece count but one"
date: 2026-11-04
description: "The clothing studio size-run form had min 1 and step 10, so browsers accepted 1, 11, 21 and never a round number. A repo check caught it."
tags: [clothing-design-studio, process, forms]
---

# A step of 10 hid every piece count but one

A number input with `min="1"` and `step="10"` accepts 1, 11, 21 and so on.
Browsers measure the step from the minimum, so 200, the form's own default,
is flagged invalid. The size-run form in the clothing design studio shipped
that way in #13049.

`platform/ci/check_step_grid.py` found it in the main-branch health run. The
fix is `step="1"`, and the check passes again. A form that rejects its own
default is the kind of fault a unit test on the maths never sees.
