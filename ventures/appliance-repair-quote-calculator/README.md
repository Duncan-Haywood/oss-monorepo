# Appliance Repair Quote Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/appliance-repair-quote-calculator/>

The free appliance repair quote calculator helps an independent technician price a job before sending the customer a number. Enter the diagnostic and repair hours, loaded labor cost, trip cost, parts, parts markup, callback reserve, overhead, and target margin. It shows a quote target, walk-away floor, effective hourly rate, a price sensitivity table, and whether finishing that repair still beats recommending replace — customer cost per remaining year versus what you keep if they decline.

Open `index.html` in a browser. It works without an account, network request, API key, or paid service. All arithmetic is deterministic and the inputs remain in the browser.

## Why this niche

Appliance repair technicians search for repair pricing and service-call fee guidance, but flat hourly-rate calculators commonly omit windshield time, parts handling, warranty callbacks, and the difference between diagnostic and repair labor. This tool makes those assumptions visible so a technician can revise them from their own books. It does not tell a technician what a customer must pay or certify that a quote is profitable.

The product is distinct from the portfolio's janitorial and trade bid calculators: its unit is a single service call with parts risk and callback reserve, not a recurring contract or construction job. The repair-versus-replace table is also distinct from the boiler bid's winters-of-patches model — one quoted visit against remaining years, not a season of callbacks against replacing the plant.

[Should I repair or replace this appliance?](should-i-repair-or-replace-this-appliance.html) walks the default driveway: a $635.25 quote on a machine with three years left costs $211.75 a year, while a $799 replacement that lasts ten costs $79.90 a year. Eight remaining years flips the customer back to repair. Selling the replacement for $150 flips your book to replace.

## Privacy and usage

Everything runs in your browser. Your prices, customer details, and repair notes are never uploaded. There are no accounts, cookies, tracking pixels, or analytics vendor. Unless you opt out, an anonymous local counter records only feature names and the day: quote calculations after an edited input, replace comparisons, and copied summaries. It never records inputs or customer content. Turn it off with the checkbox in the footer; Do Not Track and Global Privacy Control also disable it.

## Legal guardrail

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.
