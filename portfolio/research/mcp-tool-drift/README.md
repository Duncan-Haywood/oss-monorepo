# MCP tool-declaration drift: a measured base rate

**Measured 2026-08-19. Primary sources, reproducible from this repo.**

This directory answers one question with data instead of prose:

> Do third-party MCP servers actually change the tools they declare, often
> enough that monitoring the change is worth paying for?

**Answer: yes, and not marginally.** Across sampled adjacent releases of MCP
servers published to npm, **69% changed their declared tool surface**, **29%
removed a tool outright**, and **at least 33% changed a tool description** —
the class that matters most, and the one this method under-counts.

## Why this measurement and not another

The candidate pipeline proposed in PR #79 (`portfolio/pipeline/`) contains eight
scored business candidates. Two prior firings of the screening task established
that **six of the eight rest on regulatory claims that cannot be verified from
this environment at all** — `eur-lex.europa.eu`, `www.ftc.gov`, `www.w3.org`,
`shopify.dev` and six other candidate-critical domains are blocked at the egress
proxy, and unlike GitHub's and WordPress's documentation, EU legislation is not
generated from a public source repository, so there is no way around it.

`mcp-supply-chain-watch` is one of only two candidates whose thesis does not
depend on regulatory timing, and the only one whose primary data sources are
reachable. It is therefore the single candidate in the pipeline that can be
de-risked **without anyone unblocking anything**. That is why it was chosen.

The candidate's own write-up specifies the test and the kill condition:

> Poll a set of publicly listed MCP servers on a daily interval and measure how
> many change a tool description at all over two weeks. If the base rate is near
> zero, there is no product — that is the cheapest possible kill.

It also names the most likely ending:

> Registry commoditisation. If the major MCP registries or an agent framework
> ship signed, versioned tool manifests, the mutable-declaration problem is
> fixed upstream and this candidate is obsolete rather than competed with. That
> is the most likely ending and it should be checked before building, not after.

Both were run. Neither killed it.

## Finding 1 — the gap is not closed upstream

`check_spec_integrity.py`, against the spec's own normative JSON Schema:

| Spec revision | Fields on `Tool` | Integrity/version field | Integrity terms anywhere in schema |
|---|---|---|---|
| 2025-03-26 | annotations, description, inputSchema, name | **NONE** | NONE |
| 2025-06-18 | + `_meta`, outputSchema, title | **NONE** | NONE |
| 2025-11-25 | + execution, icons | **NONE** | NONE |
| draft | + icons | **NONE** | NONE |

No revision — including the current draft — gives a `Tool` a version, hash,
signature, digest, or any other attribute a client could pin. Zero occurrences
of *signature*, *signing*, *integrity*, *checksum*, *sha256*, *provenance*,
*attestation*, *lockfile*, or *immutable* anywhere in any schema.

And the official registry does not fill the gap either. Across **4,000 version
records covering 1,548 distinct servers**:

- **`inputSchema` occurs 0 times.** Registry records carry `name`,
  `description`, `title`, `version`, `repository`, `icons`, `websiteUrl`,
  `packages`, `remotes` — and no tool declarations at all.
- **85% of records point at a remote endpoint** (3,387 of 4,000). For those,
  the registry stores a URL. Whatever that URL serves on the day a client
  connects is entirely unconstrained by anything recorded at publication.
- **31.6% of servers have published more than one version record**, so servers
  demonstrably do change; only 85 of 4,000 records were mutated in place, which
  means change arrives as a new version rather than as an edit — and nothing
  ties a customer's approval to a particular one.

The registry indexes *servers*. The trust decision is made against a *tool
list*. Those are different objects, and no artifact in the ecosystem currently
connects them.

## Finding 2 — the drift base rate

`measure_drift.py` diffs the tool declarations npm already holds across a
package's published versions, so the two-week forward poll the candidate
proposed is answerable today instead.

**Consecutive releases** — "I am pinned to version N and upgrade to N+1; how
often does the tool surface move under me?" This is the number the product
thesis rests on. 49 usable version-pairs across 7 servers:

| Change between adjacent releases | Rate |
|---|---|
| Tool surface changed at all | **69%** (34/49) |
| A tool was added | 55% (27/49) |
| **A tool was removed** (breaking) | **29%** (14/49) |
| A tool description changed | **≥33%** (16/49) — under-counted, see below |

**Whole lifetime** — first published version against last, 28 usable packages
(median 13 published versions, median 73 days apart):

| Change over the package's life | Rate |
|---|---|
| Tool surface changed at all | **86%** (24/28) |
| A tool was added | 82% (23/28) |
| A tool was removed | 32% (9/28) |

An earlier hand-picked sample of 10 different servers gave 61% / 13% / 20% on
the same three consecutive-release measures. Different sample, same conclusion:
the base rate is nowhere near zero.

Raw rows: [`results-2026-08-19-consecutive.json`](results-2026-08-19-consecutive.json),
[`results-2026-08-19-lifetime.json`](results-2026-08-19-lifetime.json).

## What this does and does not establish

**Established.** Tool surfaces move, frequently, including in the
backwards-incompatible direction; the protocol offers no way to pin them; the
registry does not record them. The candidate's cheapest kill test does not fire,
and its most-likely-ending check comes back negative. On the evidence, the
technical premise holds.

**Not established, and load-bearing for the business.** The candidate's own
write-up names buyer ambiguity as "the failure mode to test first" — security
owns the risk, engineering owns the integration, neither reliably owns the
budget. **Nothing here tests that.** A real drift rate is necessary for the
product to make sense and nowhere near sufficient for it to sell. Steps 2 and 3
of the candidate's experiment — hand-labelling changes as cosmetic /
schema-widening / instruction-bearing, and taking the rate to ten teams at
$29/server/month — remain undone, and step 3 cannot be done by an unattended
agent at all.

Also unaddressed: this measures *npm packages*, where a version boundary makes
drift observable. The 85% of the registry that is remote endpoints is where the
security argument is strongest and where drift is *least* observable — which is
the product's reason to exist, but also means this measurement is from the
easier half of the market.

## Honest limits of the method

Tool declarations are extracted **statically, with regexes over shipped JS/TS**,
because running an untrusted MCP server to ask it `tools/list` is precisely the
thing not to do on a research box. Consequences, all of which push the reported
rates **down**:

- A package that adopts a bundler or minifier can stop matching entirely. That
  shows up as "every tool removed at once"; those pairs are flagged `wipe` and
  **excluded** from every rate above (3 of the 32 analysable packages in
  lifetime mode). They are measurement artifacts, not removals.
- **Description changes are under-counted.** Only descriptions written adjacent
  to their tool name are recovered. The true description-drift rate is at least
  the reported one and likely higher — and since an instruction-bearing
  description change is the alert the product is actually selling, this is the
  gap most worth closing next.
- Packages where nothing extracted from either version are reported
  `no-tools-extracted` and excluded rather than counted as "no change"
  (13 of 45 in lifetime mode).

So treat these as a **floor**, and as directional evidence for a build/kill
decision. They are not customer-facing claims and should not appear in copy.

## Reproducing

Standard library only, no dependencies, no credentials, read-only against
public APIs:

```bash
python3 portfolio/research/mcp-tool-drift/check_spec_integrity.py
python3 portfolio/research/mcp-tool-drift/measure_drift.py --mode consecutive --limit 10
python3 portfolio/research/mcp-tool-drift/measure_drift.py --mode lifetime --limit 45
```

Re-run `check_spec_integrity.py` before acting on the candidate. If a future
spec revision adds an integrity field to `Tool`, or registry records start
carrying `inputSchema`, the gap has closed upstream and this candidate should be
killed rather than built — the script prints exactly that.

## Status

This is research, not a venture. No `ventures/` directory and no `VENTURE.yaml`
is created here, so the router allocates nothing to it; graduation remains a
decision for the account owner, per `portfolio/pipeline/README.md`.

Nothing here contradicts the candidate's existing score. Its `defensibility: 4`
floor is untouched by this work and remains the thing most likely to decide the
outcome: the mechanism is still reproducible by anyone who decides to, and the
pinned per-customer history is still the only accruing asset.
