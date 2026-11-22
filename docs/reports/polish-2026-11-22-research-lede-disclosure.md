---
kind: polish
topics: [design, aeo, research]
date: 2026-11-22
---
# Polish 2026-11-22: research page ledes keep their closing disclosure

Did not take an item from `polish_queue.py`: the last thirteen polish reports all worked on
venture-page folds. I looked at the five surfaces `prompts/polish/prompt-0.md` names, at 390 and
1280 px (full build of main): the hub, Wall Framing Takeoff, `/research/`, `/stories/`, `/writing/`
and one post. None scrolls sideways and all read well. Then a research project page
(`/research/accel-cascade/`). Its header lede, the sentence an answer engine quotes, ran 75 words
and ended with no full stop. A survey of all 1,080 project headers found a worse problem.

## What was wrong

`research/_homepage/build.py` `short_lede` cuts a README bullet longer than 90 words (60 on cards)
at the last clause that fits, and ends it with `…`. This was added on 2026-11-18 for bullets that
had grown to 2,000+ words. 26 headers are cut. On 6 of them the dropped tail **was the honesty
line**, so the header showed a simulated result as if it had been built:

| Project | Dropped from the header |
|---|---|
| homebot | Simulated only, not yet built. |
| osrobot-pairprice | Stylised, nothing built. |
| qual-correction | Simulated, no real model. |
| hanger-insert | Stylised, assumed constants. |
| simdesign-buckleguard | stylised, preliminary. |
| codesign-sar | stylised, and the 1.5 m/s approach-speed bound binds for 93% of designs. |

The full summary further down each page still says it. But the header is what a reader sees
first and what an assistant lifts.

56 headers (and the matching cards) also ended mid-air without a full stop, because README bullets
often omit one.

## What changed

1. `short_lede`: if the lede's last clause starts with a disclosure word (`_DISCLOSURE`: stylised,
   simulated, simulation only, synthetic, preliminary, untested, not yet built, nothing built,
   no real) and is at most 12 words, it is kept after the ellipsis, capitalised, and the cut
   before it is shortened by the same number of words. The cut no longer drops it.
2. A sentence closed inside its own parentheses (`… 0.5 ha.) Stylised …`) now counts as a clause
   end, so osrobot-pairprice's disclosure is found.
3. `_full_stop`: a lede ending in a letter, digit or `%` (after any closing tags) gets a full stop.
   Leaves `?`, `!`, `)` and entities alone.
4. Tests in `platform/ci/test_research_summary_paragraphs.py` (`ShortLedeTest`, 4 new cases; one
   existing expectation now ends with the full stop).

## Measured (1,080 project headers, `research/_homepage/build.py`)

| | before (main) | after |
|---|---:|---:|
| headers cut with `…` | 26 | 26 |
| cut headers that dropped a closing disclosure | 6 | 0 |
| headers ending without a full stop | 56 | 0 |

Screenshots (390 px, 2x): `img/polish-research-lede-disclosure-{before,after}-390.png` (homebot).

## Still weakest, and what I would do next

1. **Disclosures inside parentheses still get cut**: osrobot-mjface "(MuJoCo, simulation only)",
   heavy-hydraulics "earlier milestones are model sweeps…", water-leaks, capture-sentinel
   "(untested)". The fix that keeps them is editorial: put the disclosure first, or as its own
   closing clause, in the project's README bullet or `project.json` `lede`.
2. **The 2,000-word bullets** (buildbot-sheathing 2,381, codesign-cant 1,651, sensing-selfcal 1,400,
   hanger-codesign 1,287, capture-sync 1,135, verified-dse 1,051) are research logs in the
   README's index. Moving each milestone clause into its `LOG.md`, so the bullet states the
   headline, would fix their cards and headers at the source.
3. **The ellipsis offers no next step.** A cut header could end "… (full result below)", with a
   link to an `id` on "What it found". Measure whether it helps before adding chrome to 26 headers.
4. Carried over from the venture work: `venture-fold.mjs --check` in CI (control plane, own PR),
   bank-statement-pdf-to-csv and patreon-fee-calculator folds
   (`polish-2026-11-22-related-links-cards.md`).
