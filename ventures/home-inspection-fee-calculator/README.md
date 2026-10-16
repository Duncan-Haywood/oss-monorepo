# Home Inspection Fee Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/home-inspection-fee-calculator/>

Independent residential home inspectors can use this free browser-local
calculator to price one inspection from square footage, stories, foundation
type, and home age — the specifics that actually drive on-site time, which a
flat per-square-foot fee schedule quietly folds away — then add radon, sewer
scope, termite/WDO, and mold testing at their own flat fee, and a same-day
rush premium applied to labor time only. A second section checks a week of
bookings, at that average profit, against a target weekly income. **After
using this, you can quote a crawlspace, older-home inspection with add-ons
without underpricing the extra time it actually takes, which used to mean
guessing at a flat per-square-foot number that priced an easy slab job and a
hard crawlspace job the same.**

Open `index.html` directly, or serve this directory with
`python3 -m http.server`. The deterministic calculation works with no
account, API key, upload, or paid dependency.

## Why a flat per-square-foot fee schedule underprices some jobs

A franchise brand (Pillar To Post, WIN, HouseMaster) hands its inspectors an
internal fee schedule; an independent has to build their own. The trap is
pricing purely by square footage, because the real driver of on-site time is
also:

- **Stories** — climbing to and inspecting an additional level takes real
  minutes a single-story number doesn't need.
- **Foundation type** — a crawlspace means suiting up and physically moving
  through a tight space; a basement usually holds the mechanicals in one
  place that still needs its own attention.
- **Home age** — older systems and more deferred maintenance take longer to
  document, even at the same square footage as a newer house.

Add-on services (radon, sewer scope, termite/WDO, mold) are priced as their
own flat fee rather than folded into the time estimate, because each is
usually a separate instrument or specialist step, not more minutes of the
same walk-through.

See
[how to price a home inspection](how-to-price-a-home-inspection.html)
for a full worked example with every line item shown.

## Privacy and usage

Everything runs in your browser and nothing is ever uploaded. Your last
job's numbers (square footage, stories, foundation, age, travel, rate,
add-ons, overhead, margin, and this week's income-check numbers) are saved
locally on this device so you don't retype them — **Reset to defaults**
clears them. We count anonymous local feature events only (`quote-priced`,
`weekly-goal-check`), with a visible opt-out. Do Not Track and Global
Privacy Control disable counting automatically. No fees, addresses, or
income figures are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, licensing, insurance, or
business advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it**,
and for meeting any obligation it helps you prepare for. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It
does not verify a home inspector license, insurance, or continuing-education
status, does not determine what your state or governing Standards of
Practice (InterNACHI, ASHI, or your state board) require you to inspect, and
does not replace your own E&O policy, contract, or accountant.

MIT licensed. See `LICENSE`.
