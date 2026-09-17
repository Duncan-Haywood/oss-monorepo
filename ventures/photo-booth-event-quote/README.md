# Photo Booth Event Quote Calculator

Independent mobile photo booth operators can use this free browser-local calculator to find the real price for one event booking — after setup and teardown time, travel, attendant labor, an equipment cost, a weekend/holiday premium, and the print cost an unlimited-print package depends on — then check a price already on the table against the breakeven, and see the recommended rate for running long. **After using this, you can quote a booking on the time and cost it actually takes, which used to take a flat package price that hid the setup hour, the drive, and how much of the margin an unlimited-print package's paper and ink were quietly eating.**

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Why a package price is the wrong number to build a quote from

A "3-hour, $500" package looks simple, but a booth business (not a fixed photo studio and not a DJ or photographer selling their own time only) carries costs a flat headline price doesn't show:

- **Setup and teardown are committed time, not free time.** An hour to arrive, build the backdrop, run test prints, and check lighting, plus 30–45 minutes to pack down, both happen whether the booth runs 2 hours or 6.
- **Travel is a cost every time, not just for "far" venues.** Mileage and drive time apply on every booking, and add up fastest on the bookings that felt closest to home.
- **An unlimited-print package's cost scales with the party, not the quote.** Paper and dye-sub ribbon cost the same per print regardless of how many guests show up — a busy open bar can print two or three times a seated dinner's count, and the operator who quoted from an average estimate finds out the difference only after the event.
- **Equipment wears out and needs replacing.** The booth, camera, and printer are capital costs that a per-event flat fee has to recover, the same way a contractor's tools do.

The print-volume section then answers the question a flat unlimited-print line can't: given this quote's price, how many actual prints can this event produce before the margin it was built on is gone — so a busy open bar and a quiet dinner don't get the same package without the operator knowing which one is riskier.

## Privacy and usage

Everything runs in your browser. Your event details, prices, and costs are never uploaded, there is no account, and nothing is saved when you close the tab — every field resets on refresh by design. We count anonymous local feature events only (`quote-priced`, `proposed-price-checked`), with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. No event details, prices, or costs are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not tax, financial, or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It does not audit your books, verify a venue or vendor contract, predict actual attendance or print volume, or replace your own contract, insurance, or accountant.

MIT licensed. See `LICENSE`.
