# Pool Route Pricing Calculator

Independent pool service operators can use this free browser-local calculator to price recurring accounts after service labor, drive time, chemicals, and monthly route overhead. **After using this, you can set a minimum monthly account price, which used to take a spreadsheet and a guess about windshield time.**

Open `index.html` directly, or serve this directory with `python3 -m http.server`. The deterministic calculation works with no account, API key, upload, or paid dependency.

Your route assumptions are kept as a private local draft in this browser and restored the next time you open the page, and a "Copy shareable link" button puts the same numbers in the URL hash so you can send a route to a partner or co-owner without retyping eight fields.

## Privacy and usage

Everything runs in your browser. Your route assumptions are never uploaded, and we don't have accounts, tracking cookies, or an analytics vendor. The saved draft lives only in this browser's local storage, and a shared link carries its numbers in the URL hash, read only on the recipient's own device. We count anonymous local feature events only (`estimate`, `share-link`, `current-price-checked`), with a visible opt-out. Do Not Track and Global Privacy Control disable counting automatically. No people, IP addresses, or route content are recorded. The counter is not sent to the maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not tax, financial, or business advice, and it does not replace a qualified professional. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

MIT licensed. See `LICENSE`.
