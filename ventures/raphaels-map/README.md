# Raphael's Map

Where a practicing Catholic single is more likely to meet marriage-minded
Catholics, from public aggregates only. Places, never people.

**Live:** https://duncan-haywood.github.io/oss-monorepo/raphaels-map/ ·
[Who it is for](for-catholic-singles.html) · [llms.txt](llms.txt)

Named for the archangel Raphael, who in the Book of Tobit guides Tobias to
his wife Sarah. Built from the owner's specification ([SPEC.md](SPEC.md),
drafted as "Covenant Atlas"); departures from it are in
[docs/decisions.md](docs/decisions.md).

## What it shows

| View | What | Source |
|---|---|---|
| Explore | County choropleth for any state: women 18–19, 20–24, 25–29, 30–34; never-married women by the same bins; Catholic adherents and congregations per capita. Click a county for the value, margin of error, universe, period and a six-step source trace. | ACS 2020–2024 5-year (B01001, B01003, B12002); 2020 U.S. Religion Census |
| Compare | 2–10 counties or metros side by side, with missing-data and vintage warnings, CSV and Markdown export with citations. | same |
| Rank | A user-weighted **research priority index** over demographic capacity, Catholic ecosystem, meeting access and values evidence, computed only over dimensions with data, with coverage, per-row explanation and rank sensitivity under ±10-point weight changes. Two modes: Find volume, Find concentrated values. | same |
| Surveys | 1,256 weighted tables from the General Social Survey (2000–2024) and NSFG 2022–23: ideal family size, role attitudes, divorce-law attitude, attendance by affiliation, by sex × age × religion × attendance × marital status; design-based intervals, n and n_eff, suppressed below n_eff 30, flagged exploratory below 100; nine preregistered proxy tests with temporal hold-out. | [docs/survey-methods.md](docs/survey-methods.md) |
| Communities | 21 public Catholic young-adult, campus and Latin Mass communities, 14 checked against their own pages. A sample, not a census, so weighted 0 by default. | `data/communities.json` |
| Toolkit | Preferences, profile-text drafts, a dating-app settings checklist and conversation questions, all the user's own text, kept in the browser. | — |
| International | 22 countries: fertility (estimates and projections kept apart), mean age at childbearing, population; marriage and divorce rates for 10 EU countries. Values surveys (ISSP, EVS/WVS) need the user's own licensed download. | UN WPP 2024, Eurostat, World Bank |

What it will not do: list, locate, score or profile any person; go below
18; multiply incompatible shares into a "number of matches" (SPEC §6.1);
show a remembered number where data are missing ("Not available" is not 0).

## Run it

```
cd ventures/raphaels-map
python3 -m http.server 8000      # then open http://localhost:8000/
node --test '*.test.mjs'         # 82 unit tests
NODE_PATH=/opt/node-tools/node_modules node tests/e2e.mjs   # browser happy path (Playwright)
python3 -m pytest -q pipeline    # pipeline tests
```

Rebuild the data: [pipeline/README.md](pipeline/README.md). Downloads run on a
GitHub runner (`.github/workflows/raphaels-map-fetch.yml`) and land on the
`raphaels-map-raw` branch; the build scripts turn them into `data/`.
Architecture and the data contract: [ARCHITECTURE.md](ARCHITECTURE.md).

## Known gaps

- Values evidence is national (and suppressed for the target subgroup); no
  public survey measures it by county.
- NSFG estimates carry n and n_eff but no percentages until each variable's
  coding is confirmed against the codebook (`pipeline/registry/nsfg_codings.json`).
- Connecticut's planning regions (2022) do not join to the 2020 Religion Census counties.
- County election returns and state homeschool data failed to download (HTTP 400 and 403); those proxies are defined but empty.
- Catholic county counts are republished from the ASARB workbooks with citation; see decision D3.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not legal, financial, relationship, religious or
professional advice, and it does not replace a qualified professional, your
priest or a spiritual director. **You are responsible for reviewing and
verifying its output before relying on it.** To the maximum extent permitted
by law, the authors accept no liability for any loss or damage arising from
its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. Do not use this as a
system of record.

## Privacy

Everything runs in your browser. Preferences, drafts and notes stay in this
browser's local storage and are never uploaded. There are no accounts,
tracking cookies or analytics vendor. The page counts anonymous events (which
views and buttons get used, nothing about who) in local storage, and you can
turn that off from the footer; Do Not Track and Global Privacy Control are
honoured.

## License

MIT ([LICENSE](LICENSE)). Data keep their sources' terms: see
`data/sources.json`. Optional support:
[github.com/sponsors/Duncan-Haywood](https://github.com/sponsors/Duncan-Haywood).
