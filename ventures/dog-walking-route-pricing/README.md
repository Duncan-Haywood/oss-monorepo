# Dog Walking & Pet Sitting Rate Calculator

Independent dog walkers and pet sitters can use this free browser-local calculator to price a walk, drop-in visit, or overnight stay from on-site time, drive time, mileage, extra-pet surcharges, and overhead — then roll a client list up into monthly route revenue and check it against an income goal. **After using this, you can set a defensible per-visit price and know how many more visits it takes to hit your income goal, which used to take a spreadsheet and a guess about drive time and on-call nights.**

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/dog-walking-route-pricing/

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

## Why this is different from a flat per-walk rate

A generic "$20 a walk" number ignores five things that change the real economics for an independent operator (not a marketplace app that sets the rate for you):

- **Drive time between stops** is paid time even though no dog is being walked during it.
- **Extra pets at the same household** take more attention and leash-handling than a flat rate assumes.
- **An overnight stay commits the whole night**, not just the minutes spent walking a dog at 7am and 9pm — the calculator prices on-call hours separately from active minutes.
- **Late cancellations you don't bill** leave an unpaid gap in the route, so the price carries a cushion for them.
- **A payment app's processing fee** comes out of your margin unless the price is grossed up to cover it.

The route section then answers the question a single visit price can't: given your actual client list, does this route hit your monthly income goal, and if not, how many more visits at your average price close the gap?

## Privacy and usage

Everything runs in your browser and nothing is ever uploaded. Your visit inputs (on-site time, drive, mileage, pets, overhead) are saved locally on this device so you don't retype them — **Reset to defaults** clears them, and **Copy shareable link** puts them in a URL fragment your browser never sends anywhere. Your client list is a separate promise: it is never saved anywhere, and the route table clears on refresh by design. We count anonymous local feature events only (`estimate`, `route-check`, `link-copied`, `reset`), with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. No people, prices, or client names are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not tax, financial, or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

This calculator produces arithmetic observations from numbers you supply. It does not evaluate whether an animal is fit to be walked or boarded, does not screen clients, and does not replace your own judgment, contract, or insurance.

MIT licensed. See `LICENSE`.
