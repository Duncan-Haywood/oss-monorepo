# Meta Ads Fatigue Analyzer

A free browser tool for small advertisers and freelance paid-social managers:
**drop in a Meta (Facebook / Instagram) Ads Manager ad-level CSV and see cost per
result, ROAS and CTR for every ad, which creatives show fatigue signals, how much
spend produced no results, and which ads beat the account median.** The file is
read in the browser; nothing is uploaded and no ad-account access is needed.

**Live tool:** https://marisstella.app/meta-ads-fatigue-analyzer/

After using this, you can now **see which ads pair a high frequency with a weak
CTR or cost per result against your own account median, split spend with no
results into proven, overspent and too-little-data, and shortlist the ads that
beat the median with enough results**, which used to mean giving a
creative-analytics tool (Motion, Triple Whale, Madgicx) access to your ad account
or building the pivot table by hand.

## Input

The ad-level export from Ads Manager (view: Ads, Reports, Export table data, CSV).
Needs `Ad name`, `Amount spent`, `Impressions` and one of `Results`, `Purchases`
or `Leads`; `Campaign name`, `Ad set name`, `Reach`, `Frequency`, `Link clicks`,
`CTR`, purchase conversion value or `Purchase ROAS` and a `Day` breakdown are used
when present. Headers are matched by alias (including a currency suffix such as
`Amount spent (USD)`), thousands separators are handled, dates may be month-first,
day-first or ISO, and comma, tab and semicolon files in UTF-8 (with or without a
BOM) or UTF-16 are read. Unreadable rows are listed with a line number and reason.
Column names were written from memory of the export; the first report of an
unread file is the priority fix.

## Model

Rows are combined per campaign, ad set and ad. An ad is flagged for fatigue when
its frequency is at or above the threshold (default 3) with enough impressions and
one of: CTR under 80% of the account median, cost per result over 125% of the
median, spend over one result's cost with none, or (daily exports) CTR down 25% or
more from the first to the last third of its days. No-result spend is **proven**
at the fewest link clicks `n` with `(1 - rate)^n < 0.05`, **overspent** above one
result's cost, otherwise **watch**. Scale candidates need enough results, a cost
per result at least 20% under the median and frequency under the threshold. It is
arithmetic on the file, not advice; see the page for what is not modelled.

## Known gaps

From the quality audit of 2026-11-13
([`portfolio/quality/audits/2026-11-13-meta-ads-fatigue-analyzer.json`](../../portfolio/quality/audits/2026-11-13-meta-ads-fatigue-analyzer.json)):

- With a Day breakdown each row carries that day's frequency (usually 1 to 1.5), and the averaged
  figure rarely reaches the frequency threshold, so the daily CTR-trend signal seldom fires on a
  real daily export. Until the model handles it, export without the Day breakdown for period
  frequency, or lower the threshold.
- Ads are compared with one median across all campaigns, so retargeting (high frequency by design)
  dominates the flags; CPM is not computed. The thresholds (frequency 3, CTR 80%, cost 125%, trend
  -25%) are rules of thumb, not sourced from Meta.

## Run

Open `index.html` in a browser (or serve the folder). Tests: `node --test`.
