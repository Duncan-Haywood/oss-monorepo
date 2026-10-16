# Food Truck Event & Catering Margin Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/food-truck-event-margin-calculator/>

Independent food truck and trailer operators can use this free browser-local calculator to find the real price for one private event, catering, or festival booking — after commissary prep and breakdown time, travel, staff labor, propane and generator fuel, the commissary fee, amortized truck and equipment cost, and the one-off special-event permit fee many jurisdictions require — then check a price already on the table against the breakeven, and see the recommended rate for an extra guest. **After using this, you can quote a booking on the time and cost it actually takes, which used to take a flat per-head price that hid the prep hours, the drive, and how much of the margin a better-than-expected turnout was quietly eating.**

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Why a per-head price is the wrong number to build a quote from

A "$8/head, 100-guest minimum" quote looks simple, but a food truck business (not a fixed restaurant kitchen and not a caterer working from a client's own venue kitchen) carries costs a flat headline price doesn't show:

- **Commissary prep and breakdown are committed time, not free time.** Portioning and packing the menu before departure, and cleaning up and loading out after service, both happen whether the event runs 2 hours or 6.
- **Travel is a cost every time, not just for "far" venues.** Mileage and drive time apply on every booking, and add up fastest on the bookings that felt closest to home.
- **A flat event price's food cost scales with the party, not the quote.** Ingredients cost the same per guest regardless of how many people show up — a well-attended wedding can serve two or three times a seated corporate lunch's headcount, and the operator who quoted from an average estimate finds out the difference only after the event.
- **Equipment wears out and needs replacing.** The truck, generator, and cooking equipment are capital costs that a per-event flat fee has to recover, the same way a contractor's tools do.
- **A one-off event often needs its own permit.** Many jurisdictions require a temporary special-event or health permit on top of the truck's standing license — a cost a regular route stop never carries.

The turnout section then answers the question a flat per-head line can't: given this quote's price, how many actual guests can this event serve before the margin it was built on is gone — so a well-attended wedding and a guaranteed corporate headcount don't get the same quote without the operator knowing which one is riskier.

## Privacy and usage

Everything runs in your browser. Your event details, prices, and costs are never uploaded, there is no account, and nothing is saved when you close the tab — every field resets on refresh by design. We count anonymous local feature events only (`quote-priced`, `proposed-price-checked`), with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. No event details, prices, or costs are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not tax, financial, or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It does not audit your books, verify a venue or vendor contract, predict actual turnout, determine health-department or permit requirements, or replace your own contract, insurance, or accountant.

MIT licensed. See `LICENSE`.
