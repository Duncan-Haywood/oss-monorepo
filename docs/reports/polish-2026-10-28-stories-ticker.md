# Polish 2026-10-28: stories card titles and hero ticker gap

**Weak surface.** Phone screenshots (390 px, built `dist/`) of the hub and `/stories/`, the two items the
previous polish report listed as still weak.

**Findings and fixes.**
- Stories shelf titles (`h2 a`) took the page accent (purple) with an underline, which reads as a visited link.
  `platform/pages/stories.mjs`: titles are ink-coloured with no underline; accent plus underline appear on
  hover and keyboard focus.
- Hub hero "Built for **Roofers**  and anyone..." had a visible double gap and an underline running past the
  word, from `min-width:6ch` on the rotating word. `platform/pages/showcase.mjs`: the min-width now applies
  from 720 px up only, where it stops the sentence shifting as words rotate; on a phone the line wraps anyway.

**Measured.** Before: scrollWidth 390 on hub, stories and ai-bookkeeper (no sideways scroll). Site-build
tests for showcase, stories and home pass (18/18). Lighthouse and traffic not measured.

**Still weak (next run).** Phone top nav clips "Updates" ("Upd"); the fade mask stays on even when scrolled
to the end. Saved-bids band alignment. Not yet looked at: a research page, a blog post, desktop widths.
