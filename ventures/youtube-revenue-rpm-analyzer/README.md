# YouTube Revenue and RPM Analyzer

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/youtube-revenue-rpm-analyzer/>

A free browser tool for YouTube creators: **drop in a YouTube Studio analytics export and see
which videos actually pay.** The file is read in the browser; nothing is uploaded and no
channel access is needed.

After using this, you can now **see revenue per thousand views for every video, how
concentrated your income is, which videos pay under half your median and how much that
leaves on the table, which pay well but get little traffic, and how RPM changes with video
length**, which used to mean exporting the Content table and building the pivot by hand.

## Input

Any CSV with `Views` and `Estimated revenue`. The row label can be a video title, country,
traffic source or date (a by-day chart export gets a month-over-month view). Watch time,
Subscribers, Impressions, click-through rate and Duration are used when present. The file's
own `Total` row is used to say how much of the total the exported rows cover.

## Model

RPM is revenue / views x 1000, always computed from the file. The benchmark is the median RPM
over rows with a minimum number of views. The RPM gap is a ceiling, never a forecast. Click-through
is impression-weighted. See the page for what is not modelled.

## Run

Open `index.html` through any static server. Tests: `node --test`.
