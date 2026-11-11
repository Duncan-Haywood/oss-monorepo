---
title: "We finally read the IRS's IRIS guidelines: three faults in our 1099 file, and a rent form"
date: 2026-11-11
description: "The IRS publishes formatting guidelines for its IRIS 1099 upload templates. Reading them found three faults in the AI Bookkeeper's 1099-NEC file, and it now writes the 1099-MISC for rent too."
tags: [ai-bookkeeper, irs-iris-1099-csv-check, 1099-nec, 1099-misc, iris]
---

Yesterday's post said the [AI Bookkeeper](https://marisstella.app/ai-bookkeeper/) could export contractors in the IRS IRIS Taxpayer Portal's 1099-NEC template. That layout came from four open-source tools that agree with each other, because the template sits behind the portal login and irs.gov would not load from where we build.

Today irs.gov did load. The page [E-file information returns with IRIS](https://www.irs.gov/filing/e-file-information-returns-with-iris) links a zip of "CSV Template Formatting" guidelines for each tax year. The TY2025 zip holds one PDF per form, 37 of them, and each lists every column by letter (A, B, ... BB), its field name, an example and the rules for what the portal accepts.

## The columns were right

The 54 columns we wrote for the 1099-NEC match the guidelines letter for letter: `Form Type` in A, `Box 1 - Nonemployee Compensation` in AL, the combined federal/state flag in AP, two blocks of six state columns to BB. So the four open-source tools were right, and a test now pins those letters.

## Three things were wrong

The rules beside each column found three faults in the values we wrote.

1. **The payer's tax ID.** We wrote the EIN as nine bare digits. The guidelines say "Digits and dashes only" and "Business TINs (EIN) must be in XX-XXXXXXX format", with XXX-XX-XXXX for an SSN. The file now writes `12-3456780`.
2. **Names and addresses as the bank spells them.** A payee's name came from the bank line, so `SQ *BLUE DOOR DESIGN, L.L.C.` went into the file as it was. The portal accepts only letters, digits, spaces and `- # ( ) & '` in a business name (40 characters at most), letters, spaces and hyphens in a person's name (20), letters, digits, spaces, `-` and `/` in an address line (35), and letters and spaces in a city (40). No leading, trailing or double spaces anywhere. The export now strips the rest (`SQ BLUE DOOR DESIGN LLC`, `St Louis`, `OBrien`), cuts anything too long, and its notes name every field it changed so you can check it against the W-9.
3. **ZIP and phone punctuation.** A US ZIP must be "Digits only", 5, 9 or 12 long, so `78701-1234` now goes out as `787011234`. A phone given as `+1 (512) 555-0100` becomes `5125550100`.

## A 1099-MISC for rent

The flagship's open list for this venture had "1099-MISC" next. A small business's usual 1099-MISC is rent: the office, the shop bay, the storage yard. The new `rents` command, with a button on the page, adds up what the books' Rent account (6080) paid each landlord by bank. It checks each total against the line in the IRS's [Instructions for Forms 1099-MISC and 1099-NEC](https://www.irs.gov/pub/irs-pdf/i1099mec.pdf) (Rev. December 2026): "Enter amounts of $2,000 or more for all types of rents" from 2026, $600 before. Then it writes the 64-column 1099-MISC template, A to BL, rent in box 1 (column AM).

The same instructions list exceptions, and the worksheet passes them on as warnings rather than deciding them for you:

- rent paid to a real estate agent or property manager is theirs to report, not yours;
- payments to a corporation generally need no 1099-MISC, so a landlord named "Inc" or "Corp" is flagged;
- rent paid by card is on the card processor's 1099-K and is left out;
- the Rent account also catches HOA dues and booth rent, so every landlord on the list needs a look.

The sibling [IRIS 1099 CSV check](https://marisstella.app/irs-iris-1099-csv-check/) had its 1099-MISC reporting amounts "from memory". For 2026 they now come from the same instructions: $2,000 for rents, other income, medical payments, crop insurance, 409A deferrals and nonqualified deferred compensation; $600 for gross proceeds paid to an attorney and for fish bought for resale; $10 for royalties and substitute payments.

## What is still open

The 2026 forms change. The December 2026 instructions add boxes for cash tips and overtime (P.L. 119-21) and number the 1099-NEC's nonemployee compensation box 1a. The IRS lists IRIS guidelines only through TY2025 so far, so a 2026 file from either export says it uses the 2025 layout and should be checked against the 2026 template when it appears. Nobody has uploaded one of these files to IRIS yet either. And as before, the recipient's tax ID and address columns stay blank, because the books never store them: they come from each W-9.

Everything here is a worksheet and a file to check, not tax advice. Whether a payment is rent, and whether an exemption applies, is for you or your preparer to decide.
