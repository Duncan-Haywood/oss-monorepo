# AI Engineering Academy

An AI-mentored, project-first engineering education platform. The goal:
help motivated learners become world-class engineers by building real
products, not by sitting through lectures and exams.

See [PROJECT_BRIEF.md](PROJECT_BRIEF.md) for the founding vision and
philosophy — the seed document every future contributor (human or AI)
should build toward.

## The Constitution

[docs/00-overview.md](docs/00-overview.md) is the entry point to the full
constitution: first-principles philosophy, product vision, learning science
and mastery model, AI mentor architecture, knowledge graph design,
curriculum progression, assessment philosophy, portfolio system, simulation
architecture, hardware integration, technical architecture, industry
partnerships, credentialing strategy, business model, go-to-market
strategy, competitive analysis, and a 10-year roadmap.

## Status

Early-stage / pre-product. Vision and constitution drafted; curriculum and
platform design not yet started. `site/` is a static build (`npm run build`)
that renders the constitution's markdown into a browsable HTML site
(`docs/00-overview.md` and friends).

Four learner-facing artifacts now exist, all free, zero-dependency,
client-side static pages (LICENSE, disclaimer, privacy line, local-first
usage counting, unit tested), listed together on
[`tools/index.html`](tools/index.html) — a hub page so someone who lands on
one tool can find the rest, and so adding a fifth doesn't mean editing four
existing pages:

- [`tools/resistor-calculator/`](tools/resistor-calculator/) — a resistor
  color code decoder and Ohm's law solver (21 passing unit tests).
- [`tools/led-resistor-calculator/`](tools/led-resistor-calculator/) — an
  LED current-limiting resistor calculator that also snaps to the nearest
  standard (E24) resistor value and recommends a power rating (16 passing
  unit tests).
- [`tools/voltage-divider-calculator/`](tools/voltage-divider-calculator/) —
  a voltage divider calculator with a load-loading correction (the sag a
  real load causes that the textbook formula ignores) and a target-output
  design mode that snaps R2 to a buyable E24 value (14 passing unit tests).
- [`tools/555-timer-calculator/`](tools/555-timer-calculator/) — astable and
  monostable 555 design in both directions (analyse the parts you have, or
  solve backwards from a target frequency, duty cycle, or pulse width to
  nearest-E24 resistors), with the buildability checks a bare formula skips:
  duty cycles a standard astable cannot reach, an R1 that over-currents the
  discharge pin, drift-prone resistor values, electrolytic-cap tolerance
  (29 passing unit tests).
- [`tools/rc-filter-calculator/`](tools/rc-filter-calculator/) — a first-order
  RC/RL filter cutoff-frequency calculator covering all four topologies
  (RC/RL × low/high-pass), with a design mode that solves for the missing
  component from a target cutoff and snaps it to a buyable standard value
  (24 passing unit tests).
- [`tools/capacitor-charge-calculator/`](tools/capacitor-charge-calculator/) —
  RC capacitor charge/discharge timing, voltage-after-delay, and reverse design
  for a target threshold (5 passing unit tests).

All six are deliberately narrower than "the MVP": small, self-contained
tools for the Circuits corner of the planned EE track, not a curriculum.
None is yet deployed to a live URL — publishing under the portfolio's name
is owner-gated per `portfolio/DIRECTION.md`; all six are ready to deploy
once that gate opens.

## Next steps

- Review, argue with, and revise the constitution in `docs/` — it's a v1
  draft meant to be tightened, not treated as settled.
- Add more small, self-contained EE tools in `tools/` (e.g. a capacitor
  charge/discharge time calculator, a 555-timer astable/monostable
  calculator) as further seeds of the Circuits track, each shippable and
  testable independently of the full curriculum design. Add each one to
  `tools/index.html` and to the CI matrix in
  `.github/workflows/ai-engineering-academy-ci.yml`; the per-tool pages only
  need the one back-link to `../`, so cross-links stay O(n) rather than
  every page having to know about every other.
- Prototype the fuller MVP scope: Electrical Engineering track (Circuits,
  Electronics, Embedded Systems) with 30–50 projects, AI tutoring, and
  portfolio generation.
