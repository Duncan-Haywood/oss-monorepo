---
title: "Shed Designer, driven like a first-time visitor: six editor bugs a unit test could not see"
date: 2026-10-29
tags: [shed-designer, accessibility, testing]
description: "We drove the free shed designer in a headless browser on a laptop and a phone. What broke, what we fixed, and the tests that keep it fixed."
---

[Shed Designer](https://duncan-haywood.github.io/oss-monorepo/shed-designer/) lets you draw a gable shed by dragging handles on a plan and an end view. Its unit tests check the framing, the cut sheet and the structure maths. None of them opens the page. So we drove it in headless Chromium the way a first-time visitor would, at laptop size and at Pixel 7 size, and wrote down what went wrong.

What we found:

- **The end view showed the wrong roof.** With the automatic pitch and overhang ticked (the default), the end view drew the numbers stored in the form, 5/12 and 12", while the 3D view and the summary showed what was actually built, 4/12 and 7". The end view now draws the built design.
- **Dragging the eave did nothing** while the automatic overhang was ticked: the drag set a new overhang and the automatic choice put the old one straight back. Dragging the peak or the wall top already turned their automatic boxes off; the eave now does too.
- **The handles said "button" to a screen reader but ignored the keyboard.** They now take the arrow keys: 6" steps on the footprint (24" with Shift), 1" on a door or window along its wall, a whole pitch step on the peak, 1" on the wall height and the overhang. Focus stays on the handle after the drawing is rebuilt, so you can hold an arrow key down. The 3D view can be focused too: the arrows turn it and + and - zoom.
- **Ctrl+Shift+Z did not redo.** With Shift held, the browser reports the key as a capital "Z", and the code compared it with a lower-case "z". Ctrl+Y worked.
- **Typing a number built every half-typed value.** Typing 16 into the length box built a shed for the empty box, then for "1" (both clamped to the 4 ft minimum), then for 16, and left three undo steps behind. On a 40 x 20 ft design each rebuild blocked the page for about 175 ms in our headless run (median of six). Now the page waits for a pause in typing, skips values the field itself calls invalid, and keeps one undo step per field you type in.
- **On a phone the handles were 12 to 19 pixels across.** Common guidance is about 44. Each handle now has a transparent target at least 44 px across. It sits under the doors and windows, so a window close to a handle can still be dragged. The visible dot is a little bigger on small screens. The 3D view also gained two-finger pinch zoom, and its dimension labels no longer pile on top of each other or spill out of the picture on a narrow screen. A label that would cover another one, or stick out of the picture, is skipped.

- **Every edit redrew everything, including what you could not see.** The store comparison re-prices every swap, and five result tabs plus the design cards were redrawn on each change. They now draw just after the next frame, so the plan, the 3D view and the total answer first. The median time an edit blocks the page fell from 85 ms to 26 ms on the default 8x12 and from 175 ms to 50 ms on a 40 x 20, measured the same way before and after.
- **Screen readers heard every frame of a drag.** The size line under the end view was a live region and changed on every frame. Each finished change is now announced once, with the new size, pitch and overhang. An axe-core pass with each results tab open found headings that skipped a level; they are fixed, and axe now reports nothing.
- **A broken share link was silently ignored.** The page opened your last design with no word. It now says the link is broken or cut short.

The new `browser.test.mjs` checks each of these in a real browser and fails on any console error. A new `shed-designer-browser` workflow installs Playwright and axe-core outside the checkout and runs that file on every pull request that touches the tool, so the product itself stays dependency-free. Before the fixes, the same script showed the arrow keys doing nothing, Ctrl+Shift+Z doing nothing and the 4 ft intermediate builds.

Shed Designer is not engineered or code-checked. The drawings and checks are a starting point to take to your building department, not a stamped plan.
