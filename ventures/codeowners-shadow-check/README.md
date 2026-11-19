# CODEOWNERS Shadow Checker

A free tool for developers and repo maintainers: resolves a `CODEOWNERS` file the way
**GitHub actually resolves it** — the last matching pattern wins, the same rule
`.gitignore` uses — against a real list of file paths, and names exactly which rules
never win ownership of anything because a broader rule listed later always overrides
them.

**Live tool:** https://marisstella.app/codeowners-shadow-check/

This is the single most common way a `CODEOWNERS` file quietly stops doing what its
author intended. A specific rule (`/src/payments/*.js @payments-team`) works perfectly
for months. Someone adds a catch-all further down the file (`*.js @generalists`) for an
unrelated reason. Nothing errors. GitHub's own editor finds no syntax problem — every
owner is real, every pattern is valid. The payments rule still matches its files; it
just never wins anymore, so the pull requests it used to route for review quietly stop
requiring that reviewer. Nobody notices until a review that should have happened
didn't.

GitHub's own CODEOWNERS syntax highlighting checks that patterns and owners are
well-formed. It does not resolve every pattern against every file and compare winners
— that's the one thing this tool does.

## Two parts, sharing the same logic (`codeowners.mjs`)

### CLI — optional convenience, no network, no dependencies

```
node cli/check.mjs
```

Auto-detects your `CODEOWNERS` file (root, `.github/`, or `docs/`, the same three
locations GitHub itself checks) and your tracked files via `git ls-files`, and prints
one JSON object ready to paste into the browser page. Point it at a specific file, or
supply your own path list instead of `git ls-files`:

```
node cli/check.mjs path/to/CODEOWNERS
node cli/check.mjs --paths files.txt
```

### Browser — works from pasted text, CLI or not

Open `index.html` and either paste the CLI's JSON output, or paste your `CODEOWNERS`
file contents and a file list directly — the CLI is a convenience for grabbing both at
once, never a requirement. Nothing is uploaded; the page reads what you paste in
memory in your tab. Unlike several of this portfolio's other checkers, **there is no
CORS limitation to work around here** — both inputs are already local to the
repository being checked, so nothing needs fetching from another origin at all.

## What it reports

- **Shadowed rules** — matched files in your list, but a later rule always overrode
  them. Real evidence the rule is dead weight, with the exact overriding rule and which
  files named.
- **Redundant rules** — shadowed, but every rule that overrides them names the same
  owners, so no file loses a reviewer. Reported as a notice (the line can go), not a
  danger, and they do not fail `buildReport(...).ok`. Since 2026-11-19.
- **Unmatched rules** — matched nothing in your list at all. Reported separately from
  shadowing on purpose: this usually means a typo in the pattern or a path that no
  longer exists, not proof the rule is wrong — the honest limit of evidence from a
  finite file list rather than the whole repository.
- **Uncovered files** — files in your list with no matching rule, which fall back to
  the repository's default reviewers, if any.
- **Syntax errors** — an owner that isn't `@user`, `@org/team`, or an email address, and
  the gitignore syntax GitHub says does not work in CODEOWNERS: `!` negation, `[ ]`
  character ranges and `\#` escapes.

## Further reading

[`why-codeowners-review-stops-being-required.html`](why-codeowners-review-stops-being-required.html)
walks through the exact before-and-after of a rule losing a review requirement
with no error anywhere, and how to call `buildReport` directly to gate CI on
it instead of relying on the browser page.

## What this is, and isn't

**Evidence from the file list you gave it, not a determination about the whole
repository.** A rule matching nothing in your sample is flagged as a notice, not a
danger — it may simply be that your list didn't include a matching file.

**It cannot verify an owner is a real collaborator.** That needs an authenticated
GitHub API call this tool deliberately never makes — see Privacy below.

## Privacy

The CLI reads files already on your machine and never makes a network request. The
browser page only parses text you paste into it locally — nothing is uploaded, and no
GitHub authentication or authorisation is needed since nothing is fetched from GitHub
at all. The only thing stored is an anonymous local count (`localStorage`, browser
only) of which features were used and the day — no CODEOWNERS content, no file paths,
no account, no tracking cookies, no analytics vendor, honouring Do Not Track and Global
Privacy Control automatically. Turn it off with the checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not legal or compliance advice, and it does not replace a qualified
review of your repository's access controls. You are responsible for reviewing and
verifying its output before relying on it. To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free, experimental, and may
be slow, broken, moved, or taken offline without notice. The CLI has no such
dependency — it's a script you run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional and never
changes what the tool does.

## Tests

```
cd ventures/codeowners-shadow-check && node --test
```

Assertions across the parsing, gitignore-style pattern matching, and last-match-wins
resolution logic (`codeowners.test.mjs`), a differential test of the pattern matcher
against `git check-ignore` itself (`codeowners.git.test.mjs`, below), the CLI's file-discovery and argument parsing
(`check.test.mjs`), the usage counter (`usage.test.mjs`), and the page's structure,
disclaimers, and worked example (`page.test.mjs`).

### Tested against git

GitHub says CODEOWNERS patterns follow `.gitignore` rules, apart from the exceptions
its docs list. git is the reference implementation of those rules, so
`codeowners.git.test.mjs` writes generated patterns (`*`, `?`, `**`, leading and
trailing `/`, in up to three segments) one at a time to a scratch repository's
`.gitignore`, asks `git check-ignore` about a real tree of files and directories, and
compares every answer with `patternMatches`: about 20,000 pairs over three seeds in
under two seconds. It leaves out the cases where GitHub documents different behaviour
(`docs/*` does not reach nested files) and git's quirk of letting `a**` span `/`.

Its first run, on 2026-11-19, found about 1% of pairs wrong, all from one bug: a
trailing `**` (written as `docs/**`, or implied by a trailing slash in `build/`) also
matched zero segments, so `build/` owned a *file* named `scripts/build`, and a rule
for that file was wrongly reported as shadowed. Fixed the same day; seven seeds of
about 45,000 compared pairs each now agree with git on every pair compared.

## Known gaps

From the quality census of 2026-11-15 ([audit](../../portfolio/quality/audits/2026-11-15-codeowners-shadow-check.json)); the worst defect it found is fixed.

- Lines with invalid owners still take part in last-match resolution; GitHub skips them.
- Files whose winning rule has no owners (no review required) are counted as covered and not listed on the page.
- `!` negation, `[ ]` ranges and `\#` escapes, which GitHub's docs say do not work in CODEOWNERS, are flagged as syntax errors (since 2026-11-16) but still resolved as literal patterns, because the docs do not say what GitHub does with them.
