# Slopsquatting Check

A free tool that flags an npm dependency name that looks like a hallucinated
or typosquatted variant of a well-known package. A May 2025 USENIX Security
study, *"We Have a Package for You! A Comprehensive Analysis of Package
Hallucinations by Code Generating LLMs,"* tested 16 code-generating models
and found **19.7% of the packages they recommended did not exist at all**
— 21.7% for open-source models versus 5.2% for proprietary ones — and
collected more than 205,000 unique hallucinated package names across the
study. Attackers pre-register the names models are most likely to
hallucinate; the next developer who copies an AI's install suggestion gets
the attacker's package instead of an install error. This is now called
**slopsquatting**.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/slopsquatting-check/

**What it is not:** a malware scanner, a security audit, or a verdict on
any specific package. A flagged name is a prompt to read that package
before trusting it, not a claim that it is malicious.

After using this, you can now **catch a hallucinated or freshly squatted
dependency name before it ever resolves to a malicious package**, which used
to take **nobody noticing until credentials were already stolen.**

## Two tools, two different privacy trade-offs

- **[`index.html`](index.html)** runs entirely offline. It parses the
  `package.json` you paste in your own browser and compares each dependency
  name against roughly 130 hard-coded, extremely well-known package names
  using edit distance — no network call of any kind, from this page, ever.
  The trade-off: it can flag a *near-miss* of a name it already knows, but
  it has no way to know whether a name it doesn't recognize actually exists.

- **[`cli.mjs`](cli.mjs)** makes the live check that actually answers the
  question: for each dependency, it sends one read-only GET request to
  `registry.npmjs.org` (the same public API `npm install` itself uses) and
  reports whether the name exists at all, and if it does, whether it was
  published suspiciously recently with almost no version history. This is
  the only network call anywhere in this tool, and it sends only each
  dependency's *name* — never your code, never the rest of the manifest.

## Two real cases

| Case | Date | What happened |
|---|---|---|
| huggingface-cli | 2023 | Security researcher Bar Lanyado registered a package under a name he had seen an LLM hallucinate and published it empty, as a proof of concept. It was downloaded more than 30,000 times in three months, and the same hallucinated name turned up inside an Alibaba research repository's own README. |
| PhantomRaven campaign | flagged October 2025 (active since November 2022) | Koi Security and DCODX documented 100+ malicious npm packages distributed under slopsquatted and typosquatted names; CrowdStrike assessed the malware itself was written with the help of an LLM. The packages stole authentication tokens, CI/CD secrets, and GitHub credentials. |

Sources: [Wikipedia: Slopsquatting](https://en.wikipedia.org/wiki/Slopsquatting)
(summarizing the USENIX study and the huggingface-cli case) and
[The Hacker News on PhantomRaven](https://thehackernews.com/2026/09/claimed-bug-bounty-hunter-likely-used.html).
Both were independently fetched and checked against this tool's own copy on
2026-09-24, not restated from memory.

## Quickstart (CLI)

Zero dependencies, one file, Node 18+.

```sh
node cli.mjs                        # scan ./package.json against the live registry
node cli.mjs path/to/package.json
node cli.mjs --json
node cli.mjs --strict               # also fail (exit 1) on a suspiciously new but real name
```

**Classification, stated plainly.** A dependency is `NOT_FOUND` if the
registry returns a 404 for its name — the definitional hallucination case.
It is `SUSPICIOUS_NEW` if it exists but was created fewer than 180 days ago
with 3 or fewer published versions — the fingerprint of a name freshly
registered after being squatted, not proof of it: a genuine new project can
trip this too, which is why the CLI prints the raw age and version count
for you to judge rather than a bare pass/fail, and why `--strict` (which
also fails CI on this weaker signal) is opt-in. A specifier that doesn't
resolve against the public registry at all — `git+...`, `file:`, `link:`,
`workspace:`, a bare URL — is skipped rather than mis-checked.

Compares to a real named alternative: [`vs-socket.html`](vs-socket.html).
The mechanism explained in full: [`what-is-slopsquatting.html`](what-is-slopsquatting.html).

## Also worth a look

[`dependency-confusion-check`](../dependency-confusion-check/) flags
`--extra-index-url` and unscoped-private-registry configuration mistakes —
a different npm/pip supply-chain risk, checked entirely offline.
[`npm-lifecycle-script-check`](../npm-lifecycle-script-check/) diffs two
lockfile snapshots to name exactly which package just started running code
at install time — the mechanism behind Shai-Hulud.

## License

MIT — see [`LICENSE`](LICENSE).
