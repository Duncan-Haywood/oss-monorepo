# Google Ads Wasted Spend Analyzer

A free browser tool for small advertisers and freelance PPC managers: **drop in a
Google Ads search terms report and see how much you spent on searches that never
converted, how sure you can be, and which negative keywords are safe to add.**
The file is read in the browser; nothing is uploaded and no account access is
needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/google-ads-wasted-spend-analyzer/

After using this, you can now **see your wasted spend split into proven,
overspent and too-little-data, get a negative keyword list that never contains a
word from a converting search term, and find the converting terms you only reach
through broad or phrase match**, which used to mean giving an audit tool (Optmyzr,
Adalysis, WordStream) access to your ad account or building the pivot table by
hand.

## Input

The Search terms report CSV from Google Ads (Insights and reports, Search terms,
Download). Needs `Search term`, `Cost`, `Clicks` and `Conversions`; `Match type`,
`Campaign`, `Added/Excluded`, `Impr.` and `Conv. value` are used when present.
Google's title, date-range and `Total:` rows are skipped. Comma, tab and
semicolon files are read, and so is the older UTF-16 export. Unreadable rows are
listed with a line number and reason, never dropped silently.

## Model

A term is wasted spend if it converted zero times. It is **proven** when it has
the fewest clicks `n` for which a term converting at the account's own rate `p`
would show no conversion less than 5% of the time, `(1 - p)^n < 0.05`; **overspent**
when it spent more than the target (or average) cost per conversion with none;
otherwise **watch**. Word negatives need two or more terms, no converting term
anywhere in the file, under a quarter of all clicks, and are never a word you
list as core. See the page for what is not modelled.

## Run

Open `index.html` in a browser (or serve the folder). Tests: `node --test`.
