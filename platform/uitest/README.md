# uitest: AI agent end-to-end UI testing for web apps (CLI + GitHub Action)

`uitest` tests a web app the way a user does. You write what a user is trying
to do, in plain language. An AI agent opens a real browser (Chromium via
Playwright), works through your UI to do it, and passes or fails the run with
a quote of what it saw. The same run also does the checks that need no AI:
scripted steps, JavaScript errors, failed API calls, dead pages, and forms that
render but never respond.

- **For any web app**: static sites, SPAs and full-stack apps. Point it at a
  URL, a build directory, or a start command.
- **Bring your own model**: Anthropic, OpenAI, Gemini, or anything that speaks
  `/chat/completions` (OpenRouter, Groq, a local Ollama). The key is yours and
  stays in your CI secrets. With no key, the deterministic checks still run.
- **Runs in any CI**: it is one Node script plus Playwright. There is a GitHub
  Action, and the same command works in GitLab, CircleCI, Jenkins or on a laptop.
- **CI-native output**: JUnit XML, a Markdown job summary, JSON, and screenshots
  of every failure.
- MIT licensed, no telemetry, and nothing from this project runs between you
  and your model.

```yaml
# .github/workflows/ui.yml
- uses: Duncan-Haywood/oss-monorepo/platform/uitest@main
  with:
    start: npm start
    wait-for: http://localhost:3000
    goal: Sign up with a new email address and reach the dashboard
    expect: The dashboard greets the new user by name
    api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Why agent-driven

Scripted end-to-end tests break whenever a selector or some copy changes, and
they only check what someone thought to assert. An agent given a goal tests
the outcome, so a redesign that keeps signup working still passes, and a page
that renders fine but does nothing fails. The agent also does not stop at the
first assertion. It reads what the page shows and fails on wrong numbers, `NaN`,
error banners, or a button that does nothing.

Agents can be inconsistent, so `uitest` keeps the parts that must be exact
deterministic:

| Check | Needs a key | Fails the run when |
|---|---|---|
| Smoke (always on, `--no-explore` to skip) | no | the page returns 4xx/5xx or is blank. It fills every field with plausible values, clicks the safe buttons, and warns if nothing on the page changed |
| JavaScript errors | no | an uncaught exception or `console.error` happens at any point (`--console-errors warn` to relax) |
| Failed requests | no | a same-site request returns 4xx/5xx or fails, if you set `--request-failures fail` (the default only warns) |
| Scripted steps | no | a `fill` / `click` / `expectText` step fails |
| Goal | yes | the agent judges the expectation unmet, or reaches no verdict within the step budget |

A goal can only fail a run, never rescue one: if the agent says "pass" but the
page threw a JavaScript error, the scenario fails.

## Quick start (local)

```bash
npm i -D playwright && npx playwright install chromium
export ANTHROPIC_API_KEY=...            # optional

# One goal against a running app
node platform/uitest/uitest.mjs --url http://localhost:3000 \
  --goal "Add two items to the cart and check out as a guest" \
  --expect "An order confirmation number is shown"

# No key: smoke-test a static build and 20 pages linked from it
node platform/uitest/uitest.mjs --serve dist --crawl 20

# Full stack: start the app, wait for it, run a spec, keep a report
node platform/uitest/uitest.mjs uitest.json --start "npm run dev" \
  --wait-for http://localhost:5173 --out uitest-report
```

If Playwright is installed somewhere other than your project, set
`PLAYWRIGHT=/path/to/node_modules/playwright/index.js`. `CHROME_PATH` reuses a
Chromium that is already on the machine.

## The spec file

Plain JSON, so nothing else needs installing. Most fields can also be given as flags, which override the file (`--allow-origin` adds to `allowedOrigins`).

```json
{
  "baseUrl": "http://localhost:3000",
  "maxSteps": 15,
  "crawl": 0,
  "workers": 1,
  "consoleErrors": "fail",
  "requestFailures": "warn",
  "allowedOrigins": ["https://auth.example.com"],
  "scenarios": [
    {
      "name": "quote a job",
      "path": "/quote",
      "steps": [
        { "fill": "Square feet", "value": "1200" },
        { "select": "Finish", "value": "Satin" },
        { "check": "Include primer" },
        { "click": "Get quote" },
        { "expectText": "/\\$[\\d,]+/" },
        { "expectNoText": "NaN" },
        { "screenshot": "quote" }
      ]
    },
    {
      "name": "new user can save a quote",
      "path": "/",
      "goal": "Create an account, make a quote for a 1200 sq ft room and save it",
      "expect": "The saved quote appears in the account's quote list with the same total",
      "maxSteps": 25
    }
  ]
}
```

- **Targets** in steps are what a user reads: a label, a placeholder, or a
  button's or link's text. Use `css=...` when you must.
- **`expectText` / `expectNoText` / `expectUrl`** take a substring or a
  `/regex/flags`. `expectText` waits up to the timeout, while `expectNoText`
  checks the page as it is at that moment.
- A scenario can have **both** steps and a goal: the steps run first, which is
  a cheap way to get the agent to an interesting state. You can also set
  `"explore": false` on a scenario.
- Without `--out`, `screenshot` steps do nothing.

## GitHub Actions

```yaml
name: UI tests
on: [pull_request]
jobs:
  ui:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci && npm run build
      - uses: Duncan-Haywood/oss-monorepo/platform/uitest@main
        with:
          spec: uitest.json
          serve: dist                       # or start + wait-for, or url
          api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          fail-on-skip: false               # fork PRs get no secrets: run the no-key checks, don't fail
```

Pin `@main` to a commit SHA for reproducible runs.

| Input | Default | |
|---|---|---|
| `spec`, `url`, `serve`, `start`, `wait-for`, `path` | | what to test (see above) |
| `goal`, `expect` | | a one-off goal without a spec file |
| `crawl` | `0` | also smoke-test up to N linked same-site pages |
| `workers` | `1` | scenarios run at once, each in its own browser context |
| `max-steps` | `15` | agent actions per goal |
| `console-errors`, `request-failures` | `fail`, `warn` | `fail` / `warn` / `ignore` |
| `api-key`, `provider`, `model`, `base-url` | | the model (provider defaults to `anthropic` when a key is given) |
| `out`, `upload-report`, `report-name` | `uitest-report`, `true` | the report and its artifact |
| `fail-on-skip` | `true` | fail when nothing was verified |
| `playwright-version` | `1.63.0` | installed into a scratch directory, not your project |

Outputs: `result` (`pass` / `fail` / `skipped`), `exit-code`, `report-dir`.
The Markdown summary is added to the job summary automatically.

**Against a preview deploy** (Vercel, Netlify, Cloudflare Pages): pass the
preview URL as `url`, and use `allowedOrigins` in the spec for an auth
provider on another domain.

## Other CI systems

It is one command. With Microsoft's Playwright image there is nothing else to install:

```yaml
# GitLab CI
ui-test:
  image: mcr.microsoft.com/playwright:v1.63.0-noble
  script:
    - npm ci && npm run build
    - git clone --depth 1 https://github.com/Duncan-Haywood/oss-monorepo /tmp/uit
    - npm i --prefix /tmp/pw playwright@1.63.0
    - PLAYWRIGHT=/tmp/pw/node_modules/playwright/index.js node /tmp/uit/platform/uitest/uitest.mjs uitest.json --serve dist --out uitest-report
  artifacts:
    when: always
    paths: [uitest-report]
    reports:
      junit: uitest-report/junit.xml
```

You only need two directories from that clone, `platform/uitest/` and
`platform/llm/`, so vendoring them into your repository works too.

Exit codes: **0** passed, **1** something failed, **2** nothing was verified
(every scenario skipped, e.g. goals with no key), **3** usage error.

## How the agent works

On each step the agent receives a text snapshot of the page: the URL, the
headings, and a numbered list of the interactive elements with their labels,
values, options and states (stamped on the page as `data-uitest-ref`), plus
the visible text. It replies with one JSON action: `click`, `fill`, `select`,
`check`, `press`, `goto`, `scroll`, `back`, `wait`, or `done` with a verdict
and the reason. Each step sends text only and needs no vision model, so a step
costs a few thousand input tokens. The report lists the calls and tokens each
run used.

Guardrails:

- **The page is treated as untrusted.** Its content is fenced and labelled
  as data in the prompt, and the agent is told never to follow instructions
  found in it. It also has nothing to misuse: it can only drive this browser.
  Top-level navigation off the site under test is blocked (`allowedOrigins`
  extends it), and `goto` outside it is refused.
- **A step budget** (`maxSteps`) caps cost. An agent that runs out reports
  `inconclusive`, which fails the run, never a pass.
- **The smoke check stays away from buttons that cost money or destroy
  data**, such as delete, pay, buy or log out. The agent, though, will do what
  a goal asks, so run goals against a test environment, not production with
  real payment details.
- **Keys never appear in reports or logs.** `platform/llm/byok.mjs` never
  echoes a provider's response body.

## Limits

- Agents vary from run to run. A goal that sometimes fails is telling you
  something, either about the app or about how the goal is worded. Keep
  anything that must be exact as scripted steps.
- One tab, Chromium only. There is no file upload, drag and drop, or canvas
  interaction yet, and no visual-regression diffing (screenshots are evidence,
  not baselines).
- The smoke check's "nothing changed" warning reads visible text. A page that
  only updates an input's value, or draws on a canvas, gets the warning
  without being broken.

## In this repository

- Before merging a change to a venture's page, run its smoke check with
  sibling links resolving:
  `node platform/uitest/uitest.mjs --serve ventures --path /<slug>/ --crawl 5`
  (see `.github/prompts/verify-and-merge.md`).
- `.github/workflows/uitest-ci.yml` tests the tool and runs its own action.
  Its manual run takes a venture path and a goal, and uses the repository's
  model key only when the person dispatching it ticks the box.
- Tests: `node --test platform/uitest/*.test.mjs`. The browser half skips
  without Playwright; set `PLAYWRIGHT=` to run it.
  `browser.test.mjs` drives the agent through a local stand-in for an
  OpenAI-compatible server, so the whole agent path is tested with no key.
