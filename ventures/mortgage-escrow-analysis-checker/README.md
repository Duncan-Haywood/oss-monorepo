# Mortgage Escrow Analysis Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/mortgage-escrow-analysis-checker/>

A free browser tool for homeowners: **enter your yearly tax and insurance bills and the numbers on
your annual escrow statement, and see what payment those numbers support**, whether the cushion is
over the one-sixth limit, whether a shortage is being collected faster than Regulation X allows,
whether a surplus should be refunded, plus a twelve-month balance schedule and a draft request for
the servicer's worksheet. Nothing is uploaded.

After using this, you can now **tell which part of an escrow payment increase is the higher tax and
insurance bill and which part is shortage recovery, and ask the servicer specific questions**, which
used to mean decoding the statement's projection table by hand.

## Model

Aggregate accounting per 12 CFR 1024.17: monthly payment = 1/12 of yearly bills; cushion at most 1/6
of yearly bills; balance needed at the start of the year = cushion minus the lowest cumulative
(deposits less bills) over the twelve months. Below that: shortage (spread over at least 12 months,
or 30 days if under a month's payment). Below the zero-cushion figure: deficiency (two or more
payments). Above: surplus ($50 or more refunded within 30 days when current). Rules were read from
the CFPB's published text of the regulation.

Checks against the statement: cushion over 1/6, servicer's projected bills above the bills entered,
payment above what the numbers support, shortage larger than the numbers produce, shortage spread
over fewer than 12 months, surplus to refund. A "what if one bill changes" panel shows the effect
of an insurance quote or a tax appeal. The "most in question" figure is not a refund estimate.

Not checked: the servicer's own worksheet, disbursement dates other than the month entered, state
law, loan documents that set stricter terms, escrow waivers, whether a bill is itself correct.
Unverified against a real servicer's worksheet.

## Run

Open `index.html` through any static server. Tests: `node --test`.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal, tax, or financial advice, and it does not replace your servicer, a housing
counselor or a qualified professional. **You are responsible for reviewing and verifying its output
before relying on it**, and before disputing a payment or withholding any payment. A flagged item is
a question, not a finding that a servicer is wrong. To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.

Independent of any lender, servicer or government agency.

**Privacy.** Nothing is uploaded. Anonymous feature counts (`escrow_analyzed`, `example_loaded`,
`report_downloaded`) are kept only in local storage, can be switched off on the page, and honour Do
Not Track.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be slow, broken,
moved, or taken offline without notice. Do not use this as a system of record.

Free and open source (MIT, see `LICENSE`). Optional support:
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
