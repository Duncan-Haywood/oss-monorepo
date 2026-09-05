# SaaS Seat True-Up Calculator

If you are preparing a SaaS renewal, this free browser calculator shows how many purchased seats were unused and how much recurring spend is exposed. **After using this, you can now take a quantified seat-reduction scenario into a vendor renewal discussion, which used to take a spreadsheet and manual arithmetic.**

Open [`index.html`](index.html) directly or serve this directory as a static site. It needs no account, API key, network call, or paid dependency. All calculations are deterministic and the user's data stays in the browser. The product is distinct from quote-margin tools because it focuses on recurring software-seat utilization and renewal timing.

## Usage

Enter purchased seats, seats used in the latest review, per-seat monthly price, months remaining, and any contracted overage premium. Unused seats become avoidable spend. Used seats above the purchased count become overage, billed at list price plus that premium (0% keeps the same-price default). The result is a planning scenario, not a vendor invoice or savings guarantee.

Use **Save scenario** to keep the entered totals in this browser for the next renewal review. **Reset** restores the example numbers and deletes the saved scenario. Saved values never leave the device.

Optionally enter the contract's **renewal date** and the **notice period** (in days) it requires before that renewal to drop seats. Many SaaS agreements auto-renew at the full purchased count unless notice is given by a deadline ahead of the term end — if that deadline has already passed, the avoidable spend above is not actually avoidable this cycle, and the tool says so plainly instead of showing a number nobody can act on. These two fields are not saved with the scenario (a renewal date from last quarter is stale next quarter); re-enter them each review.

The product counts local aggregate events (`true_up_calculated`, `scenario_saved`, `scenario_restored`). It stores no names, identifiers, IP addresses, or content, sends nothing to an analytics vendor, honors Do Not Track and Global Privacy Control, and includes a persistent opt-out. Baseline usage is recorded in `portfolio/usage/usage.yaml`.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not financial or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.
