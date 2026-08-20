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

---

# Step 2: is the drift worth alerting on?

**Measured 2026-08-19, same day, by a later scheduled run.** Everything above is
step 1 of the candidate's experiment and is unchanged. This section is step 2,
which that experiment specifies and which was still undone:

> "Hand-label the changes that do occur as cosmetic, schema-widening, or
> instruction-bearing, and check whether a model reproduces the labels."

Step 2 is the decisive one, because it tests the failure mode the candidate
itself names:

> "**Alert fatigue.** Servers under active development change constantly. If the
> classifier cannot keep routine churn out of the instruction-bearing bucket,
> the alerts get muted and the product is dead."

A 69% drift rate is a business only if a small, stable slice of it deserves a
human's attention. This section measures where in that range reality sits.

Harness: [`classify_drift.py`](classify_drift.py). Corpus:
[`results-2026-08-19-classified.json`](results-2026-08-19-classified.json) —
152 description changes with the full before/after text of each, so every label
below can be re-derived, disputed, or re-labelled offline:

```bash
python3 classify_drift.py --recompute-from results-2026-08-19-classified.json
```

## Finding 3 — the drift is overwhelmingly cosmetic, and rules can tell

152 description changes, across 19 packages, from 270 sampled adjacent version
pairs (173 of which shared at least one tool between versions, which is the
denominator a description change can come from at all):

| Bucket | n | Share |
|---|---:|---:|
| **cosmetic** — wording moved, meaning did not | 119 | **78.3%** |
| **capability-change** — the described action itself changed | 13 | 8.6% |
| **instruction-bearing** — the new text addresses the *model* | **11** | **7.2%** |
| schema-widening — the described input surface changed | 9 | 5.9% |

`capability-change` is not in the candidate's three-bucket taxonomy. The data
forced it: "Get status of an uploaded media file" becoming "Get detailed
information about a specific media file … including its type, dimensions, file
size, upload status" is neither cosmetic nor instruction-bearing, and it has a
different response (re-read the tool) than either.

All eleven instruction-bearing changes, with the span that triggered each:

| Package · tool | Signal | New text that fired it |
|---|---|---|
| `mcp-socialapi` · `social_api_revoke_key` | tool routing | "Use social_api_list_keys to…" |
| `mcp-socialapi` · `social_api_delete_webhook` | tool routing | "Use social_api_list_webhooks to…" |
| `mcp-socialapi` · `social_api_update_webhook` | tool routing | "Use social_api_list_webhooks to…" |
| `mcp-socialapi` · `social_api_get_reviews` | tool routing | "Use social_api_reply_to_review to…" |
| `mcp-socialapi` · `social_api_create_webhook` | credential | "secret" |
| `mcp-socialapi` · `social_api_exchange_oauth` | credential | "token" |
| `@ankimcp/anki-mcp-server` · `addNote` | tool routing | "instead of calling addNote repeatedly" |
| `@ankimcp/anki-mcp-server` · `addNotes` | tool routing | "instead of repeated addNote calls" |
| `@kawacode/mcp` · `get_relevant_context` | tool routing | "instead of dumping…" |
| `fodda-mcp` · `search_insights` | tool routing | "use search_statistics instead" |
| `@certscore/mcp` · `scan_site` | embedded URL | `https://certscore.ai/api/v2/openapi.json` |

Nine of the eleven are model-directed text rather than documentation; the two
credential rows are ordinary documentation expansion that newly introduces a
credential word, and are discussed under "where the first classifier was wrong".
None is malicious — this is a sample of ordinary public servers, not an attack
corpus. That distinction is the product's whole proposition: these are the
changes a customer would want surfaced, and the ones a raw `diff` buries under
119 rewordings.

## Finding 4 — the risk is the opposite of the one the candidate feared

Converting the shares above into the number that actually decides the product —
**alerts per monitored server per month** — across the 10 packages whose sampled
history spans 30 days or more:

| | alerts/server/month |
|---|---:|
| median | **0.00** |
| mean | 0.11 |
| p90 | 0.53 |

A customer monitoring twenty connected servers would see **roughly two alerts a
month**, and the median individual server would go a month producing none.

**Alert fatigue does not kill this candidate.** The failure mode named in the
write-up as the thing most likely to end it is not present in the data at any
plausible portfolio size.

The inverted risk is the one now on the table, and it is a pricing problem
rather than a technical one: at $19–$49 per server per month, a customer is
paying per server for something that, per server, is usually silent. The
candidate's own framing — "Pin · Diff · Classify · Archive" — already contains
the answer, and this measurement reorders it. **Archive is the durable value and
the alert is the occasional event**, not the other way round. What a customer
holds after a silent month is a retained, exportable record of what every
connected server declared when it was approved, which is the artifact a security
review actually asks for. Priced per server, silence reads as nothing delivered;
priced per portfolio as a monitored-and-evidenced record, silence reads as the
product working. Nothing here says which price clears — that is step 3, and step
3 still cannot be done by an unattended agent.

## Finding 5 — the classification is not model work

The candidate scores **AI leverage 7**, justified as: *"Classifying whether a
tool-description change is benign or instruction-bearing is model work; the
diffing underneath is not."*

On this corpus that is not what happened. Deterministic regex rules over the
*newly added spans* separate 119 cosmetic changes from 11 instruction-bearing
ones with no model in the loop, no API key, and no per-change inference cost.
The signals that fire are shallow and stable: cross-tool references, imperative
and priority phrasing, credential vocabulary, embedded URLs, exfiltration-shaped
verbs.

Two consequences, in opposite directions:

- **Against the candidate.** AI leverage 7 looks overstated. If the classifier
  is rules, the product is a scheduled fetcher plus a diff plus a regex pass —
  which is cheaper to run than scored (good for gross margin, already 9) and
  cheaper to *copy* (bad for defensibility, already the floor at 4). This is
  evidence that the floor dimension is worse than scored, not better.
- **For the candidate.** Per-change inference cost was a real objection to
  monitoring hundreds of servers per customer. It is now measured at zero for
  the common path, with a model needed only for the ~7% a rule pass promotes.

## Where the first classifier was wrong

Step 2 asks whether a model reproduces the hand-labels. It was run the other way
round — rules first, then hand-labelled by reading all 152 before/after pairs —
because that is the direction that produces a correction rather than a score.

The first pass flagged **9** changes as instruction-bearing. Reading all 152
before/after pairs by hand disputed **4 of those 9**, and all four failed the
same way: signals were matched against whole *sentences* judged new, so
rewording a sentence that already mentioned an API key re-flagged it.
`@bolthub/mcp`'s `mint_scoped_token` was flagged for changing "prepaid bundle"
to "multi-use credential" — the word "credential" was in both versions.

The same pass also produced a **false negative**: `social_api_revoke_key` gained
"Use social_api_list_keys to find the key_id", a textbook cross-tool routing
instruction, and was flagged only incidentally, by the credential rule.

Three fixes, all visible in `classify_drift.py`:

1. A signal fires only if the matched span *itself* is absent from the old
   description, not merely inside a sentence that changed.
2. `use <other_tool_name> to …` was added to the routing signal.
3. A capability verb preceded by an article or adjective is read as a noun —
   "a ranked **list** of results" is not a new `list` action.

Fix 1 is the mechanism, and its effect alone is reproducible from the committed
corpus with no re-fetching. `--lenient` restores sentence-granularity matching
while keeping the corrected patterns, so the pair below isolates that one
change:

```bash
python3 classify_drift.py --recompute-from results-2026-08-19-classified.json --lenient
python3 classify_drift.py --recompute-from results-2026-08-19-classified.json
```

| | sentence granularity | span-must-be-new |
|---|---:|---:|
| instruction-bearing | 13 (8.6%) | **11 (7.2%)** |

The two it drops are exactly `mint_scoped_token` and `social_api_create_key` —
two of the four hand-disputed flags, removed by mechanism rather than by a rule
written against them.

**The other two survive, and the honest reading is that they are a severity
problem, not a detection one.** `social_api_create_webhook` and
`social_api_exchange_oauth` newly introduce the words "secret" and "token"; the
words really are new, so the rule is right that something credential-shaped
entered a model-visible description, and reading them shows ordinary
documentation expansion. There is no text rule that separates those cases. That
is the unmeasured severity axis listed under "what this does not establish",
and it is the part of the classifier a model would plausibly earn its cost on.

**The corrected classifier was tuned on the corpus it is scored against**, so
7.2% is in-sample and will not hold unchanged on fresh data. What is not
in-sample is finding 4: even at the loosest setting tried the alert volume is
about half an alert per server-month, and the untuned first pass put it lower
still. No tuning choice available here moves it into fatigue territory.

## Finding 6 — the description under-counting is partly closed

`measure_drift.py`'s README named this as "the gap most worth closing next":
descriptions were only recovered when written immediately adjacent to their tool
name. `classify_drift.py` adds four more declaration shapes — description-before
-name, template literals, `registerTool("x", { … })` with the description behind
the options brace, and the positional `.tool("x", "y")` form.

Run head-to-head on the same twelve tarballs:

| | descriptions recovered |
|---|---:|
| `measure_drift.py` | 187 |
| `classify_drift.py` | **218** (+16.6%) |

The aggregate understates it. Two packages went from **0 recovered to 10 and 15**
— entirely invisible to the first extractor, fully readable by the second. The
remaining gap is minified and bundled packages, where nothing static will work.

## What step 2 does and does not establish

**Established.** Ordinary MCP servers do emit model-directed text in tool
descriptions, at a measurable and low rate; the churn around it is ~78%
cosmetic; and separating the two is mechanical rather than model work. The
alert-fatigue failure mode does not fire.

**Not established.** Every limit in the step 1 section still applies — static
extraction, npm-packaged servers only, and the 85% of the registry that is
remote endpoints remains the half where drift is least observable and the
security argument strongest. Additionally:

- **No malicious sample.** Every flagged change here is benign. Nothing measures
  whether the same rules catch a deliberately hostile description, and a
  motivated attacker writing around a published regex is the obvious next
  objection. Do not read finding 3 as a detection rate.
- **Severity is a second axis and is unmeasured.** Of the 11 alerts, 4 are
  routine batching advice from a note-taking server. A customer wants those
  ranked below a new credential mention, and nothing here ranks them.
- **Step 3 is still undone and still not doable here.** "Take the observed base
  rate to ten teams and ask for $29/server/month" needs contact with buyers.
  Finding 4 changes what to ask them — price the archive, not the alert — but
  it does not answer it.

## Status

Same as the step 1 section: research, not a venture. No `ventures/` directory,
no `VENTURE.yaml`, no router allocation, no spend, nothing published, no account
registered, no credential used. Graduation remains the account owner's decision.

The numbers here are primary measurements against public APIs with the raw rows
committed. They are **not customer-facing claims** and must not appear in copy.
