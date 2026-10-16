# DIRECTION.md: the fleet-parity trap (moved out 2026-10-16)

Verbatim from `portfolio/DIRECTION.md`; the measurements are from 2026-09-06 and are not current. The standing rule is kept in DIRECTION.md.

## The fleet-parity trap, and where new ventures actually stand (added 2026-09-06)

Measured this session: **55 of 185 ventures** now carry a `share.mjs`
shareable-link module, added one venture at a time across dozens of sessions
in the days since distribution was solved — a mechanical feature-parity
pattern, not a response to anything a user asked for. `portfolio/ledger/2026-09.yaml`
already records **274 per-venture entries** in the first six days of the
month. In that same window `portfolio/usage/usage.yaml` has not recorded a
single nonzero visitor count anywhere, and `session_gate.py` still reports
**revenue recorded this month: none (0 of 756 entries)**.

That is not a coincidence of timing — it is what "ship something every
session" turns into once the two intended default candidates fill up first.
The priority order above says step 2 is "read `usage.yaml`, work on what has
a signal" and a product stuck at zero is supposed to fall out of rotation —
but in practice it doesn't, because there is almost always a sibling venture
missing a convenience feature its neighbor already has, and copying it over
is real code, passes CI, and reads as shipped. It genuinely is real code.
It is also not what a stranger who has never visited the product is waiting
on, and every one of the 55 additions had zero usage signal to test it
against — the fleet cannot know these features matter, because it does not
yet know these products have visitors.

**So, effective now: parity-for-its-own-sake is not the default job.** Before
adding a feature to a venture *because a sibling venture already has it* (a
share link, a save slot, an export format — anything copied fleet-wide
rather than requested by that specific product's own users or friction),
check that venture's row in `usage.yaml` first. Zero usage after a fair run
(`PRODUCT_PLAYBOOK.md` §8) means spend the session on one of these instead:

> **Superseded 2026-10-16** ([`docs/reports/2026-10-16-calculator-glut.md`](../docs/reports/2026-10-16-calculator-glut.md)):
> "new ventures first" is how 121 near-identical `*-bid-calculator` ventures and
> 521 other calculators were built while none was ever measured. A new venture
> is welcome when it is a genuinely different product (web or not), never another
> copy of an existing template family; distribution, measurement and the
> router's `Consolidate:` task rank ahead of it.

1. **A new venture.** Graduate a `build-now` pipeline candidate, or a strong
   fresh niche not in `screened-out.md`. This is not the fourth-place, do-it-
   last item the numbered list above might read as — it is where a
   disproportionate share of session time should go, because a 56th share
   link on an unvisited calculator teaches the portfolio nothing new, while a
   new venture is a new shot at finding the business that actually works.
   Score it honestly against the pipeline's liability/ethics gates and ship
   it with the same disclaimers and usage tracking as every other product —
   "new" buys no exception from "Legal guardrails" below — but do not let
   "we already have 185" be a reason to defer one. New ventures compete for
   session time on equal footing with deploy-and-measure work, not behind it.
2. **A real discoverability defect, not a discoverability feature.** Confirm
   a venture's sitemap entry actually resolves, its JSON-LD matches its
   visible copy, and it is reachable from the apex catalogue's own index —
   the kind of break `platform/ci/public_surface.py` and the browser checks
   in `AGENTS.md` catch, which a share-link addition does nothing about and
   which is a more plausible reason a product sits at zero than "it lacked a
   share button."
3. **A real correctness or accessibility defect on an already-live product,
   not a defect on the product you happen to be adding a feature to.**
   Added 2026-09-06: this is not hypothetical. #3530, opened the same day
   this section was last touched, fixes 48 critical axe-detected label
   violations across three tools already serving on the published site —
   introduced during the same fast-build cadence this section describes,
   never caught because nothing routes session time toward *checking* a
   shipped product once its own PR merges. `AGENTS.md`'s browser checks
   (`browser_checks.py`) and `ink.test.mjs`'s WCAG AA contrast check run
   against a single venture when that venture is being edited; nothing
   fleet-wide asks "of the ~193 already live, which ones would fail these
   checks today." With zero traffic to any of them, this is also the one
   quality problem an agent can find and fix *before* it costs a real
   visitor rather than after — pick a handful of already-shipped ventures a
   session isn't otherwise touching, run their own `node --test` suite plus
   the browser/contrast checks, and fix what's red. This is not a call for a
   dedicated audit initiative or a tracking spreadsheet (that is exactly the
   meta-work this file elsewhere warns against) — it is a legitimate answer
   to "what do I do with this session" that ranks above a parity feature,
   the same as the two items above it.
4. **Donation-readiness housekeeping** (next section) — so the day
   `funding-sponsors-live` is decided, every product's footer is already
   correct and nothing needs revisiting. **Corrected 2026-09-06:** the
   `sponsor_link_clicked` counter is no longer a per-venture task to wire —
   see the correction in "Revenue: donations, and keeping customers happy"
   below — it already fires fleet-wide from the published-site build. The
   housekeeping that remains here is the ordinary kind: a venture's footer
   actually has the link, the disclaimer, and nothing that reads as a
   paywall.

This does not forbid fleet-parity work outright — a share link genuinely
requested by, or built for, a product that already has visitors is exactly
the friction-driven improvement §8 asks for. What changes is the default: a
convenience feature copied onto a zero-usage product because a sibling has
one is no longer, by itself, a sufficient reason to call a session's job
done.
