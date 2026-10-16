# NY LLC Transparency Act Tracker

New York LLC owners and their bookkeepers can check whether their LLC likely owes a Beneficial Ownership Disclosure or an Attestation of Exemption under New York's LLC Transparency Act, see the applicable initial filing deadline counted down, and organize the beneficial-owner details they'll need before they file — without hiring a filing service or reading a law firm client alert to find the two dates that matter.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/ny-llc-transparency-act-tracker/

**After using this, you can now** see your LLC's likely filing category and the exact number of days left before your deadline, and hand yourself (or your attorney) a clean, exportable worksheet of beneficial-owner details instead of hunting through formation paperwork the week the deadline hits — which used to mean reading several law-firm alerts to piece together the rule, then building your own tracking spreadsheet.

The tracker is free, browser-only, and works without an account, API key, or network connection. It is a filing organizer and reference tool, not a legal determination and not a filing service — you remain the filer.

## What it checks

- **Category**: from four answers (formed in NY? authorized to do business in NY? formed outside the US? and the date), it reports a likely category — Reporting Company (full disclosure), Exempt Company (attestation only), or outside the Act's scope — per NY Department of State (NYDOS) guidance confirmed December 31, 2025, which limits the reporting obligation to LLCs formed outside the United States.
- **Deadline**: December 31, 2026 for an LLC whose New York nexus began before 2026; 30 days from formation/registration for one that began on or after January 1, 2026. Every subject LLC also owes a recurring annual statement — see the [deadline guide](when-is-the-ny-llc-transparency-act-deadline.html).
- **Worksheet**: add a row per beneficial owner (name, address, date of birth, ID type/number/jurisdiction), and download a plain-text organizer or CSV to review before you file. Nothing is uploaded, and the worksheet is kept only in page memory unless you explicitly opt in to browser storage.

## Run it

Open `index.html` directly, or:

```sh
python3 -m http.server 8879 --directory ventures/ny-llc-transparency-act-tracker
```

Then open `http://localhost:8879`.

## Privacy and safety

Everything runs in your browser. Nothing you type — including the beneficial-owner worksheet — is ever uploaded; there are no accounts, tracking cookies, or analytics vendors. The worksheet lives only in this page's memory and is lost on reload unless you check "keep this in my browser," which stores it in this device's local storage and nowhere else. We count anonymous feature events only (never what you typed); turn counting off on the page. Do Not Track and Global Privacy Control disable counting automatically.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, or financial advice, and it does not replace a qualified attorney licensed in New York. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any filing obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken, moved, or taken offline without notice. We do not promise uptime, backups of anything you type, or that a URL will keep working. Do not use this as a system of record for a beneficial-owner worksheet — download your organizer and keep your own copy.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## Tests

```bash
node --test
```

Future paid options could add maintained per-year filing templates, but this launch has no payment collection and no paid dependency.
