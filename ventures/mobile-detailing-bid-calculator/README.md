# Mobile Detailing Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/mobile-detailing-bid-calculator/>

The free mobile detailing bid calculator shows the minimum quote and target-margin price for a mobile detail job after hands-on time, travel/setup/cleanup hours, hourly wage plus payroll burden, round-trip miles, vehicle cost, supplies, overhead, and payment fees. After using this, you can price a job with its real travel burden, which used to take a spreadsheet and a second guess. A $180 default bid stays in the black when wage is left at 0; putting $28/hour plus 25% burden on the 4.25-hour stop turns it into a loss. Fee and margin are both slices of the final price — the form names how much of the ticket they already claim, and it will not print a negative quote when they jointly exceed 100%.

Once the number is right, **Print proposal** turns it into the one-page sheet you hand the customer: your business details, the scope drafted from the job you just priced, the price, a price-held date, and a signature line. Your wage, burden, supplies, overhead, and margin are not on it and are not printed. Print or "Save as PDF" from the browser.

**Copy share link** encodes the whole job — hours, miles, wage, burden, supplies, overhead, fee, and target margin, plus the deposit/terms from the proposal panel — into a URL fragment you can send to a second detailer, whoever books the calendar, or the customer; nothing is uploaded, and opening the link reopens the same quote instead of the form's defaults. See [`share.mjs`](share.mjs).

Open `index.html` in a browser. It runs without an account, network request, API key, or paid dependency. Numbers are saved only in the browser and can be shared as a URL when you choose to copy one. If you have saved your shop rates on another calculator on the site, this one opens with your wage, payroll burden, and target margin already filled; its overhead is dollars for the job rather than a percentage, so a saved overhead rate is left alone here.

Search page: [`how-much-to-charge.html`](how-much-to-charge.html).

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not business, tax, financial, or professional advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

## Privacy and usage

Everything runs in your browser. Your prices, costs, and job details are never uploaded. There are no accounts, cookies, tracking pixels, or analytics vendor. Unless you opt out, the browser stores only anonymous event names and the day a feature was used (including `share_link_copied` when you copy a bid link); it never stores inputs in the usage counter. The footer checkbox turns this counter off.

## Opportunity assessment

The target user is an independent mobile detailer or two-person crew pricing a one-off job. Generic hourly-rate calculators commonly omit round-trip driving, setup/load-out time, chemical consumption, and card fees, causing underquoted jobs and unpaid travel. The differentiated result is a transparent, detailing-specific quote that shows break-even, target-margin price, and effective hourly contribution side by side.

Acquisition can come from searches such as “mobile detailing price calculator”, “mobile detailer minimum charge”, and “how much should I charge to detail a car”. A later hosted tier could add saved job templates or optional AI explanations using the user's own API key, but the free arithmetic core has zero inference and hosting cost. Risks are limited to users treating estimates as guarantees; the visible disclaimer, explicit assumptions, and wording as a pricing worksheet rather than advice contain that risk.
