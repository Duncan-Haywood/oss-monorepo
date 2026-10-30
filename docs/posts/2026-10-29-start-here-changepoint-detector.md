---
title: "Start here: did your metric really change? A guide to the Changepoint Detector"
seo_title: "Did your metric really change? The Changepoint Detector guide"
date: 2026-10-29
tags: [start-here, changepoint-detection, time-series, analytics]
description: "For analysts and ops people with a time series: what the free Changepoint Detector tells you, your first ten minutes, and what it cannot do."
---

# Start here: did your metric really change? A guide to the Changepoint Detector

This guide is for anyone who looks at a line on a chart and has to say what happened. You might run operations and watch tickets per day. You might be an analyst asked whether last month's pricing change moved sign-ups. You might look after a sensor, a queue or an API and want to know whether latency got worse after a deploy, or whether it only looks that way.

If that is you, the [Changepoint Detector](https://duncan-haywood.github.io/oss-monorepo/changepoint-detector/) is a free tool that answers one question well: did this series shift, from which point, by how much, and how sure can you be?

## The problem, in your words

"Sales dropped after the redesign. Or did they?" "The error rate has been higher since Tuesday, I think." "My manager wants a before-and-after number and I picked the date by squinting at the chart."

That last one is the trap. If you choose the split date by looking at the data, then compare the averages either side, you will nearly always find a difference, because you picked the date where the difference looked biggest. Noise, a weekly cycle or a slow trend can all look like a step. What you need is a method that finds the split for you, tells you when there is no split at all, and puts a number on its confidence.

## What you get

- **A date, not a hunch.** The tool reports each change it finds, the last point before it and the first point after it, with the mean on each side and the size of the shift measured in units of the series' own noise.
- **A range on each date.** Alongside each change it gives a likely window (95%, holding the other changes fixed), so you can say "between the 3rd and the 5th" rather than overclaim a single day.
- **A probability.** A second, Bayesian method gives each candidate change a probability, so a weak shift and a sharp one do not look the same.
- **A plain-English sentence** you can paste into a report, plus a table of segments, a chart and a per-point CSV you can download.
- **Privacy by default.** The analysis runs in your browser tab. The page says nothing is uploaded, and that is how it is built.

Under the hood are two published methods, both cited on the page: PELT (Killick, Fearnhead and Eckley, 2012), which finds the best segmentation under a penalty per change, and Bayesian online changepoint detection (Adams and MacKay, 2007). The README records how the implementation was checked: on 100 seeded test series its PELT answers matched those of the independent Python package `ruptures` in all 100 cases, and on the classic Nile river data it finds the same 1899 break that R's `changepoint` package and the original 1978 analysis report.

## Your first ten minutes

1. **Open the tool** at [its live page](https://duncan-haywood.github.io/oss-monorepo/changepoint-detector/).
2. **Try the example first.** Click "Load example: Nile river flow 1871–1970", then "Find changepoints". You should see one change: from 1899, the mean annual flow moves down from about 1,098 to about 850, roughly 2.15 noise standard deviations, with the Bayesian method putting 79% on a change within three points of it. Seeing a known answer first tells you how to read your own.
3. **Bring your data.** Paste a CSV into the box, or one number per line, or use "Or open a CSV file". A header row and a date column are optional; if you have dates, the results are labelled with them.
4. **Pick the column.** If your file has several numeric columns, type the name or number in "Value column". Left blank, it uses the last numeric column.
5. **Choose what kind of change to look for** under "Look for a change in": "Level (mean)" for a step up or down, "Level and volatility" when the swings got wider or calmer, "Level or slope" for a series that trends, and "Rate of counts (Poisson)" for whole-number counts such as orders or incidents per day.
6. **Tell it about your series' habits** if they apply. A weekly or monthly rhythm goes in "Seasonal period in points" (7 for daily data with a weekly cycle, 12 for monthly data). If each point tends to resemble the last, set "Autocorrelated noise" to "Allow for it". For counts, "Known holidays" takes dates or row numbers that a calendar already explains.
7. **Run it and read the sentence first**, then the table of changes and segments. If the tool says "no change", that is an answer too.
8. **Download the per-point CSV** if you want the probabilities in your own spreadsheet.

Those habits in step 6 matter more than any other setting. The README's own measurements show why: on seeded series with strongly autocorrelated noise and no change at all, the uncorrected model reported a false change in 40 of 40 runs, and with the correction switched on that fell to 4 of 40. The guide page, [How do you know if a time series really changed?](https://duncan-haywood.github.io/oss-monorepo/changepoint-detector/how-do-you-know-if-a-time-series-really-changed.html), walks through autocorrelation, seasonality and trend with before-and-after figures.

## If you work in a terminal or with an agent

The same engine runs from the command line with Node 18 or later and nothing to install. From a clone of the repository:

```bash
node ventures/changepoint-detector/cli.mjs series.csv --column sales --model meanvar
node ventures/changepoint-detector/cli.mjs --example     # the Nile data
node ventures/changepoint-detector/cli.mjs --help        # every option, and the citations
```

Add `--json` for machine-readable output. An AI agent can call it too, through the repository's tool runner:

```bash
node platform/agents/tools.mjs call changepoint-detector analyze \
  --input '{"values":[10,11,9,10,12,10,11,20,21,19,20,22,20,21]}'
```

Run on that short series, the summary comes back as: "PELT splits the 14 points of values into 2 segments (1 change in level). From 8 (after 7) the mean moves up from 10.43 to 20.43, 9.54 noise standard deviations; the Bayesian method puts 98% probability on a change within 3 points of it." The [AI agents guide](2026-10-29-start-here-ai-agents-and-mcp.md) covers the runner and the MCP server.

## Cost and where your data goes

It is free and MIT licensed. In the browser nothing you paste leaves your machine. The page keeps a few anonymous feature counts (an analysis was run, the example was loaded, a file was opened, a report was downloaded) in your browser's local storage only; there is a button to turn that off, and it honours Do Not Track. Hosting is best effort with no uptime promise, which is one more reason the command-line version exists.

## What it does not do

- **It describes the data, not the cause.** A change on the 14th does not prove your campaign on the 14th caused it.
- **It looks at one series at a time.** It is univariate; it will not find a shared break across many metrics at once.
- **It assumes steps by default.** A slow drift gets approximated as several steps unless you pick the slope model, which fits straight lines, not curves.
- **Corrections cost some power.** Allowing for autocorrelation, seasons or trend removes false alarms, and the README states how often it then misses a small real shift.
- **It has size limits.** Up to 100,000 points; on long series the Bayesian pass is the slow part.
- **It is not a monitoring product.** It analyses a series you give it. For many series, multivariate data or a production pipeline, R's `changepoint` package and Python's `ruptures` are more complete, and the tool's own docs say so.

It is statistical analysis of data you supply, not advice, and it comes with no warranty. It was built by AI coding agents with the repository owner steering, and it is not affiliated with the papers' authors or the R and Python packages it is compared against.

## Where to go next

- The tool: [its live page](https://duncan-haywood.github.io/oss-monorepo/changepoint-detector/)
- Source, tests and every measured claim with its seeds: `ventures/changepoint-detector/README.md`
- A short description for AI assistants: `ventures/changepoint-detector/llms.txt`
- Calling it from scripts and agents: [Start here: AI agents and MCP](2026-10-29-start-here-ai-agents-and-mcp.md)
- If you want the research behind tools like this one: [Start here: the open research](2026-10-29-start-here-research.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
