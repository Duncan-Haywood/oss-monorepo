---
title: "Babysitting flyers with tear-off tabs, and referral cards that credit the family"
date: 2026-10-30
tags: [babysitting-business-kit, qr-code, marketing, referrals]
description: "Flyers, Avery 8371 cards, bulletin ads, door hangers and referral cards, with a dependency-free QR encoder that matches a reference library on 11 of 11 codes."
---

Many babysitters still find families on paper: a flyer on the church bulletin board, an ad in the school newsletter, a card pinned up at the library or a coffee shop. The [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) now has a **Print** tab that makes those pieces from the profile the sitter has already filled in:

- a letter flyer with ten tear-off phone tabs along the bottom;
- a sheet of ten business cards on the Avery 8371 layout (two columns of five, 3.5 x 2 in, 0.5 in top and 0.75 in side margins, which fills a letter page exactly);
- a quarter-page bulletin ad, four to a sheet;
- a door hanger (4.25 x 11 in, two to a sheet, with a cut guide for the hole);
- **referral cards** for one family to hand to friends: "Mention the Rivera family", with a code such as `RIVERA-A77`.

Every piece carries a QR code to the sitter's website, tagged with where it was printed: `?ref=flyer`, `?ref=bulletin`, or the family's code on a referral card. The generated website now copies that tag into its "How did you hear about me?" field. When an inquiry's answer holds a family's code, or names exactly one family on the desk ("the Rivera family"), the lead is credited to that family. It gets the same +10 referral bonus in its score that a typed "referral" already got, and it counts in a new leads-by-source table with a per-family referral count. If two families share a surname, only the code counts. This works for leads typed into the app and for leads that come in through the self-hosted server's form.

Faith wording is optional. It appears only if the sitter turned on the faith section, and then only as the first sentence of the statement they wrote. With the section off, the tests check that none of the five pieces contains "Christian", "Bible" or "pray".

## A QR encoder with no dependencies

The app loads no outside scripts, so the QR code had to be written from scratch: `qr.mjs`, under 300 lines. It covers byte mode (UTF-8) at error-correction level M, versions 1 to 10 (up to 213 bytes, plenty for a link), and picks a mask with the four standard penalty rules. To check it we used two outside sources:

- **Matrices.** For 11 test strings, spanning versions 1 to 10 and including non-ASCII text, Project Nayuki's `qrcodegen` 1.8 for Python made reference symbols. Ours matches all 11 module for module, and picks the same mask in all 11. Those symbols are now fixtures in the test suite.
- **Error correction.** The Reed-Solomon remainder matches the worked example in ISO/IEC 18004 Annex I ("01234567" at version 1-M).

We also tried `segno`, a second reference library. Our module grids matched it everywhere except the padding. Each time the data ended exactly on a byte boundary, segno wrote an extra all-zero codeword before the standard pad bytes `0xEC 0x11`. Both versions decode, so this tells you something about the reference you pick, not about whether either one is wrong.

As an end-to-end check, we rendered every piece in headless Chromium and decoded its QR codes from screenshots with jsQR. All of them decoded to the expected link, for example `https://grace.example/?ref=RIVERA-A77`. Each piece printed to a one-page Letter PDF, with no text box overflowing.

## Numbers

- 19 new tests (7 for the encoder, 12 for the pieces, referral crediting and the server path). The whole venture suite passes.
- On the invented example desk, crediting a referral code raises a lead's score by exactly 10 points, the existing referral bonus. Nothing new was added to the scoring.

## Limits

Print at 100% ("Actual size"), and print a test page on plain paper before you use label stock. The encoder covers byte mode, level M and up to version 10 only. A link longer than 213 bytes prints a "link too long" note in place of the code. Many churches, schools and shops have rules about what goes on their boards, so ask first.
