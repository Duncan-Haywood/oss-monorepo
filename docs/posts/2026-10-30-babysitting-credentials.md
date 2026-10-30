---
title: "Babysitter setup: an EIN does not replace your SSN on Form W-10"
date: 2026-10-30
description: "A credentials tracker with 60/30/7-day expiry reminders, a readiness checklist, and a setup guide that found the IRS form contradicts a common EIN tip."
tags: [babysitting-business-kit, taxes, small-business]
---

The [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) now tracks the sitter's own paperwork: CPR and First Aid, a background check, a driver's license and car insurance (only if she drives kids), liability insurance and any local license. Each has an issue date, an expiry date, the provider and a note on where the paper is. No license, policy or Social Security number is stored.

What it does with the dates:

- **Today reminders** at 60, 30 and 7 days before expiry, then once it has expired. "Done for now" hides one step until the next, and entering renewed dates starts the reminders again.
- **The website stays honest.** Items ticked "show on my website" are written into the site's certifications list, and the site already drops a certification the day after its "valid through" date. There is one expiry rule, tested on both sides: shown on December 20, gone on December 21.
- **A business-readiness checklist** in Settings: 8 items, or 10 if she drives children (structure, taxpayer ID, separate account, records, CPR, background check, liability insurance, licensing check, plus license and car insurance). It counts only her ticks and the tracker's dates.

## The guide, and the claim it had to correct

The new page, [Setting up your babysitting business](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/babysitting-business-setup.html), links its sources twelve times (IRS, SBA and Childcare.gov pages, all read on October 30).

The brief behind this work said an EIN "lets families claim care credits without her SSN". That is common advice, and the kit's own tax pages say it too. The IRS instructions on Form W-10 (Rev. October 2020) say the opposite: "For individuals and sole proprietors, the TIN is a social security number (SSN)… For other entities, it is the employer identification number (EIN)." Publication 503 says the same for a provider who is an individual. So the guide says plainly that a sole proprietor should expect families to need her SSN, and should ask a tax preparer before giving an EIN instead. The EIN is still free, and the SBA notes it lets you open a business bank account.

On licensing, Childcare.gov says most states do not license occasional care in the child's own home. For care in the sitter's own home, some states require a license once she cares for more than one unrelated child, and others only at six or more. The federal database of state licensing rules could not be reached from here, so the page quotes no state's numbers. It sends readers to their state's child care licensing office.

11 new tests cover the reminder windows, the website sync, the checklist and the guide's sources and FAQ data. The kit's whole suite passes.
