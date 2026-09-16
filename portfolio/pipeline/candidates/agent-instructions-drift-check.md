# Agent instructions drift check

Scored 2026-09-16. Composite 6.5 · floor 1 (ai_leverage). The floor is the
point, same as this portfolio's other deterministic checker ventures: whether
a markdown-link or inline-code file reference still resolves, whether a named
`npm run` script is defined, and whether a known interpreter-mismatch shell
footgun is present is decided by regex extraction and a filesystem/JSON
lookup — no model in the loop, which is what keeps the per-user cost at zero
and every finding traceable to an exact line number.

## The niche and the evidence for it

AI coding agents now read a project-level instruction file as standard
practice: `AGENTS.md` became a real, multi-vendor convention through 2025
(OpenAI's Codex, Anthropic's Claude Code, and others all read one at a
project's root), alongside the older `.cursorrules` (Cursor) and
`.github/copilot-instructions.md` (GitHub Copilot). These files are prose,
so nothing mechanical keeps them in sync with the repo they describe — a
renamed script, a moved doc, or a renamed `package.json` script leaves a
stale reference behind that a human skims past but an agent can act on
literally.

This portfolio's own `CLAUDE.md` is direct, checkable evidence that the
failure mode is real rather than hypothetical: its dated entries for
2026-09-11 and 2026-09-12 record real sessions losing time to exactly the
interpreter-mismatch footgun this tool flags mechanically — a bare `pytest`
or `mypy` silently resolving to an isolated interpreter (a `uv tool
install`) missing the repository's own dependencies, producing a
plausible-looking failure that has nothing to do with the code under test.
Running this venture's own CLI against this repo's real, current `AGENTS.md`
(not a fabricated example) finds one live broken reference today
(`usage/usage.yaml`, a shorthand missing its `portfolio/` prefix) — the exact
shape of drift the tool exists to catch, on the very file that inspired it.

## Why this venture, not a 201st trade calculator or a 39th generic checker

`portfolio/pipeline/README.md`'s "archetype itself" section flags both the
`<trade>-bid-calculator` shape (141+ tries, zero confirmed visitors) and the
generic `-check`/`-checker` shape (38+ tries at last count) as needing a
genuinely new angle, not just a new niche, to count as evidence of novelty.
This is a new *object* to check — an AI-coding-agent instruction file — not
a new instance of an existing misconfiguration check, and `duplicate_check.py`
against a description naming this mechanism (AGENTS.md/CLAUDE.md, broken
file references, npm scripts, the pytest/mypy interpreter-mismatch footgun)
topped out at **0.10** against `docker-base-image-pin-check` — well under
the 0.45 read-this-first bar. A hand grep of every `VENTURE.yaml` and
`screened-out.md` for "agent" / "AGENTS.md" / "CLAUDE.md" / "instruction"
turned up only `real-estate-agent-photo-app` and `ubuntu-agent-server` (an
unrelated sense of "agent" each) and screened-out.md's "Agent observability
platform" row, a hosted telemetry-monitoring business competing with funded
incumbents — a different business entirely from a static instruction-file
linter.

**The angle that is new:** no existing venture or candidate reads an
AGENTS.md/CLAUDE.md-shaped file at all, and the specific checks (npm-script
existence against `package.json`, and the named pytest/mypy
interpreter-mismatch shell footgun) are not covered by general-purpose
markdown-link checkers, which verify link targets exist but know nothing
about npm scripts or this specific shell-interpreter failure mode.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic regex extraction plus a filesystem/JSON existence check; no model in the loop |
| Autonomous ops | 10 | Zero-dependency CLI + static browser page, no queue, no server, no ops |
| Time to revenue | 5 | Donations only; "time to first user" is plausible via GitHub/npm search once a repo owner searches for a way to validate their own AGENTS.md, but the convention is new enough that search volume is unconfirmed |
| Gross margin | 10 | Zero marginal cost; the CLI runs on the user's own machine and the browser page parses pasted text and local file *names* in the visitor's own tab |
| Defensibility | 3 | The underlying mechanism (a markdown-link/reference checker) is a well-trodden general category; the specific combination (npm-script check + the named interpreter-mismatch footgun, scoped to agent instruction files) is a modest, not a strong, moat |
| Distribution | 5 | Named channel: the AGENTS.md convention's own fast-growing multi-vendor adoption through 2025-2026 and the developer communities actively discussing agent tooling (r/ChatGPTCoding, r/cursor, r/ClaudeAI, Hacker News agent-tooling threads); scored moderately because the strongest evidence in hand is this portfolio's own internal CLAUDE.md incident record, which proves the failure mode is real but not external search volume |
| Liability containment | 9 | Reads only text the user supplies and (optionally) file *names* from a locally-picked folder; never touches a third party, never claims correctness of the instructions themselves, only whether a specific reference resolves. Worst case of being wrong is a missed or over-reported drift line, not a legal or financial exposure |
| Ethical robustness | 9 | Donations-only with no per-use fee, so there is no direction in which the tool profits from over- or under-reporting; gets more useful the more of a user's own repo they check; the one known false-positive shape (a context-dependent shorthand reference) is disclosed explicitly on the docs page rather than hidden or silently "fixed" with guesswork that could introduce false negatives |

Composite 6.5 (mean of eight). Both gates clear the floor of 5:
`liability_containment` (9) and `ethical_robustness` (9), each well above the
5 floor. The dimensions at or below 4 are `ai_leverage` (1) and
`defensibility` (3), named as mitigation targets below rather than
disqualifiers, matching this pipeline's standing treatment of any other
narrow, evidence-shaped checker with the same floor.

**Mitigation for the sub-5 dimensions (`ai_leverage` 1, `defensibility` 3):**
keep the check purely mechanical and disclosed — never judge whether an
instruction is good advice, only whether a referenced path, script, or known
shell pattern still matches the repo; restrict file-reference extraction to
markdown links and inline code spans, never bare prose, to keep the
false-positive rate low; name the one known false-positive shape (a
context-dependent shorthand reference) explicitly on the docs page instead
of attempting fuzzy resolution that could quietly convert a real broken
reference into a false negative; measure real GitHub/npm engagement and any
external CI adoption before investing further, given the currently unproven
distribution.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not `env-example-drift-check` (`.env.example` variable
names vs. `process.env`/`os.getenv` reads, not an agent instruction file);
not `pinned-actions-check` (GitHub Actions SHA-pinning, an unrelated
misconfiguration class); not `codeowners-shadow-check` or
`docker-base-image-pin-check` (different file pairs entirely); and not the
screened-out "Agent observability platform" (a hosted telemetry-monitoring
business, not a static instruction-file linter). `duplicate_check.py`
returned no match above the read-this-first threshold against the final
description.

## Verdict

**Build now.** Graduated 2026-09-16 as
`ventures/agent-instructions-drift-check` — a zero-dependency Node CLI
(`cli.mjs`), browser page (`index.html`, with an optional local folder
picker that reads file *names* only, never contents or uploads), and a
shared parsing/diff engine (`engine.mjs`: markdown-link and inline-code
file-reference extraction, `npm run`/`npm test`/`npm start` script-reference
extraction, and fenced-code-block interpreter-mismatch footgun detection for
bare `pytest`/`mypy`). 41 `node --test` assertions cover the engine's
extraction and diff logic, the CLI's argument handling, exit codes, and
`--json` output (via real subprocess runs against real temp-directory
fixtures), and the page's structure, disclaimers, JSON-LD, and worked
example — plus a dogfood test that runs the real CLI against this repo's own
`AGENTS.md` from the real repo root and confirms a known-stable reference
resolves correctly. Running the CLI against this repo's own `AGENTS.md`
during graduation found one live, real broken reference
(`usage/usage.yaml`, referenced without its `portfolio/` prefix) — direct,
non-fabricated proof the tool works on the exact class of document it exists
to check. Repeat usage, organic search demand, and any external CI adoption
remain unmeasured, same as every other checker at graduation.
