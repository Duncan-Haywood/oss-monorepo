# Development analyses (`dev/analyses/` on the Pages site)

The qualitative half of "How it is built": what the agents building this
portfolio have tried, measured and tripped on. Static pages rendered from
files on `main`, rebuilt on every Pages publish.

| Section | Source |
|---|---|
| What runs keep tripping on (friction by file, by day) | `doc_friction` in `prompts/runs/*.json` |
| Experiments on the prompt system, with verdicts | `prompts/experiments.md` |
| Process backlog: status, metric, result | `prompts/process/backlog/P*.json` |
| Process reports, drift reports (full text) | `prompts/process/reports/`, `prompts/drift/` |
| Studies (full text) | `portfolio/research/*/README.md` |
| Integrity issues caught, deviations | `integrity_issues`, `deviations` in run records |

```
node platform/devlog/build.mjs --out=_site/dev/analyses   # index, experiments/, one page per document, analyses.json
node --test platform/devlog/*.test.mjs
```

`platform/pages/publish-branch.sh` runs it after `check.mjs`, like the deploy
page. Adding a report, a drift report, a study, an experiment or a backlog
item needs no change here: the next publish lists it.

Rules: nothing is typed by hand; a missing source renders an empty section,
never a zero. Markdown is escaped before formatting (`markdown.mjs`), only
http(s), in-page and repository links survive, and repository paths link to
the file on GitHub.
