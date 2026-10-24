# 1099-NEC Vendor Tracker

**Track which contractors need a 1099-NEC under the 2026 reporting threshold, without a paid e-filing subscription.** Add each vendor's entity type, payment category, and year-to-date total, and get a sorted review queue: who crosses the threshold, who is exempt as a corporation, and whose W-9 is still missing. The app runs entirely in the browser; vendor data never leaves your device.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/1099-vendor-tracker/

After using this, you can now see exactly which vendors need a 1099-NEC and which W-9s are still missing, which used to take re-deriving the threshold rule by hand every January.

## Why this exists now

The One Big Beautiful Bill Act (OBBBA) raised the Form 1099-NEC / 1099-MISC nonemployee-compensation reporting threshold from **$600 to $2,000**, effective for payments made on or after **January 1, 2026** — the first change to that number since 1954. The first filing season under the new rule is January 2027. Small businesses and bookkeepers who have the old $600 figure memorized are the exact audience who needs a tool that states the new one plainly and lets them re-check their vendor list against it.

## Use it

Open `index.html` in a browser. Set the tax year (the year payments were made — this decides which threshold applies) and, if a later year's inflation-adjusted figure has been published and this page has not been updated to match, type it into the threshold override. Add one row per vendor: name, entity type, payment category, total paid this year, and whether a W-9 is on file. Select **Review vendors** to see the sorted queue, and **Export CSV** to hand the list to your preparer or e-filing service.

See [when-do-i-need-to-send-a-1099.html](when-do-i-need-to-send-a-1099.html) for a worked example of the 2026 threshold change, [vs-track1099.html](vs-track1099.html) for how this free, private tracker differs from Track1099's paid e-filing service, or [vs-tracking-vendors-in-a-spreadsheet.html](vs-tracking-vendors-in-a-spreadsheet.html) for what a hand-kept spreadsheet formula tends to get wrong across a threshold change.

## What this does not cover

This tool computes one rule closely: the general 1099-NEC nonemployee-compensation threshold and the corporation exemption (with its attorney-fee exception). Two categories are deliberately **not** computed and are flagged `Check separately (not calculated)` instead:

- **Gross proceeds paid to an attorney** (e.g., in a settlement) — reported on 1099-MISC box 10 under its own $600 threshold, which did not move with OBBBA.
- **Medical or health-care payments** — reported on 1099-MISC, also reportable to a corporation, on a threshold and deadline this tool has not verified closely enough to compute.

It also does not cover rent, royalties, backup withholding, state-level 1099 filing requirements, or any determination of a vendor's correct entity classification. It is not the **IRS TIN Matching program** — that needs its own e-Services account and checks a name/TIN pair against IRS records; the optional TIN field here only checks that what you typed has the shape of a valid SSN or EIN (nine digits), to catch an obvious typo, and confirms nothing with the IRS. It does not file anything.

## Privacy and usage

Everything runs in your browser. Vendor names, amounts, and TINs are never uploaded, and there are no accounts, cookies, or analytics vendors. The optional usage switch counts only local feature events (`vendor_added`, `reviewed`, `sample_loaded`, `exported`, `vendor_removed`, `w9_received`) in this browser; it stores no vendor names, TINs, amounts, or identifiers. It is off by default, and counting stops automatically when the browser sends Do Not Track or Global Privacy Control.

## Safety boundary

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, financial, or tax advice, and it does not replace a qualified tax preparer. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any filing obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

The tracker produces a planning queue. It does not determine your correct tax classification, file a form, perform an IRS TIN match, or certify compliance. Verify the current threshold and rules in the IRS Instructions for Forms 1099-MISC and 1099-NEC, and check with your tax preparer.

## Development

```sh
node --test
```
