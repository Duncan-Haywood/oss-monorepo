# KDP Royalty Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/kdp-royalty-calculator/>

A free, browser-local calculator for self-published authors. It answers a concrete question: **on this 90-day window, does Kindle Unlimited plus KDP paid sales keep more than the same book sold wide?**

After using this, you can now see exclusive versus wide totals, the KU page-reads that match one paid sale, and the reads that would match your other-store extras — which used to take a spreadsheet that mixed last month's KENP rate with a print-cost guess.

Open `index.html`. It needs no Amazon account, network request, or API key. Every rate is a box you overwrite from your own KDP royalty report and print preview.

- [Should I enroll this book in Kindle Unlimited?](should-i-enroll-this-book-in-kindle-unlimited.html) walks the starting example.
- [This calculator vs. Amazon's KDP royalty calculator](vs-amazon-kdp-royalty-calculator.html) says what the official tool does and what it leaves open.

## Privacy and usage

Everything runs in your browser. Your numbers are never uploaded and there are no accounts, cookies, tracking pixels, or analytics vendor. Unless opted out, the page stores only an aggregate event name and day in local storage. It stores no identity, IP address, title, or royalty inputs. Do Not Track and Global Privacy Control disable counting.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not legal, tax, financial, or publishing advice, and it does not replace a qualified professional or Amazon's own royalty reports. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and never changes what the tool does.

## Why this niche

Authors on r/selfpublish and r/KDP already argue exclusive-versus-wide in public threads. Amazon's official royalty calculator (account required) prices one format and does not put KU page-reads next to wide volume. Search phrases: "kdp royalty calculator", "how many KU pages equal one sale", "KU vs going wide".

This is not a `<trade>-bid-calculator`. Liability is contained: rates are user-typed, output is arithmetic not a recommendation, and the page names Amazon only to describe what it is not.

Run tests with `node --test`.
