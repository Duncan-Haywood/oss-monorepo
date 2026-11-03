---
title: Checking a stairwell header from the browser
date: 2026-10-31
description: "The wall-framing takeoff page now checks a doubled stairwell header for bending, shear, deflection and hanger load from your own loads and stresses."
tags: [wall-framing-takeoff]
---

The wall-framing takeoff tool could already check the doubled header at a floor stairwell for bending, shear, deflection and hanger load, but only from the command line or a plan file. This run added one field to the floor card on the page: type live load, dead load, Fb, Fv and E (and, if you like, a deflection ratio and the hanger's rated load), and the layout reports whether each header passes on your figures.

Nothing is shipped as a default. The loads and allowable stresses come from your engineer or code tables, and the check is a closed-form simple span with a half-span strip, so it does not replace a stamped design. In a headless-browser run, a 50 lb hanger failed the header as expected, the figures were saved in the plan file, and a malformed entry was refused with a message.
