# Declaration record: io.github.naumu/mcp

**Accuracy, measured out of sample on two independent corpora: precision 0.40-0.62, recall 0.10-0.29.** Between four and six of every ten alerts below are not what this watch says they are, and it finds between one in ten and one in four of the changes that meet its own definition. The two corpora disagree by more than either figure's own uncertainty, so read the whole span as the claim. Read the accuracy section before acting on any row.

Pinned **2026-03-09** at `@naumu/mcp@0.1.0` and re-observed **2026-03-31** at `@naumu/mcp@0.1.5`.

- Tools declared at the first pin: **12**
- Tools declared at the second: **15**
- Differences observed: **11**, of which **5** are flagged for a human

## What moved

| Tool | Change | Class | Evidence |
|---|---|---|---|
| `naumu_filter` | tool added | observed directly | -- |
| `naumu_text_search` | tool added | observed directly | -- |
| `naumu_traverse` | tool added | observed directly | -- |
| `naumu_ask` | description | instruction-bearing | instead of direct |
| `naumu_update_node` | description | instruction-bearing | Use naumu_get_schema to |
| `naumu_add_edge` | description | cosmetic | -- |
| `naumu_add_node` | description | cosmetic | -- |
| `naumu_get_schema` | description | cosmetic | -- |
| `naumu_remove_edge` | description | cosmetic | -- |
| `naumu_remove_node` | description | cosmetic | -- |
| `naumu_semantic_search` | description | cosmetic | -- |

## What was looked at

| | |
|---|---|
| Observations (pins) in this record | 2 |
| Taken from a published package | 2 |
| Taken from a live endpoint | 0 |
| Extraction | static, from the published artifact; no server was run |

**What is not covered, stated here rather than in terms:**

- **Servers we cannot pin from a published artifact.** 85% of records in the
  official MCP registry point at a remote endpoint, and the registry stores no
  tool declarations for them at all -- `inputSchema` occurs zero times across
  4,000 version records. Those servers can only be pinned by polling the
  endpoint you connected, on your own surface, with your consent. Any server in
  your portfolio that is not in the table above is not being watched.
- **Static extraction only.** Declarations are recovered by reading the
  published code, never by running the server and asking it `tools/list` --
  asking an untrusted server what tools it has is the thing this product exists
  to be careful about. Minified and bundled packages defeat this, and a
  declaration written in a shape our extractor does not know is invisible to
  it rather than reported as missing.
- **Polling interval.** A change made and reverted between two polls leaves no
  trace here. The record shows what was observed at the moments it was
  observed, and those moments are listed.
- **No compliance claim, ever.** This record says what changed between two
  observations of a server's declared surface. It does not say a server is
  safe, and nothing here sits in your agents' request path.

## How this watch can be wrong

Measured twice, on two corpora that share no package, neither of them read while
the classification rules were being written. Derivation:
`portfolio/pipeline/probes/mcp-drift-watch/ (collect_holdout.py, build_labels.py)`.

| | first corpus | second corpus |
|---|---:|---:|
| Changes / servers | 136 / 23 npm-published MCP servers | 148 / 21 npm-published MCP servers |
| Precision (of what we alert on, how much is real) | **0.40** | **0.62** |
| Recall (of what is real, how much we alert on) | **0.23-0.29** | **0.10-0.11** |

The honest claim is the span: precision **0.40-0.62**, recall
**0.10-0.29**. The range inside each column is the labelling --
some changes are calls a careful reader could reverse, and both readings are
published rather than one being chosen. The range *between* the columns is
larger, and it is not labelling: it is what happens when the same rules meet a
different set of servers.

**Do not read a reproduced alert rate as a reproduced accuracy.** The share of
changes this watch flags was 7.4% on the first corpus
against 7.2% on the tuning set -- close enough to
look settled -- while precision on that corpus was 0.40. On the
second corpus the share is 5.4% and precision is
0.62. Neither the rate nor the accuracy is stable, and the rate
is the one that looks stable.

**Both directions are bad, and they are bad for different reasons.**

*We over-report.* Six of ten alerts on the first corpus and one of eight on the
second were ordinary documentation. **Every credential-word alert across both
corpora -- seven of them -- was wrong**: servers documenting their pricing
("works without an API key"), or using "token" to mean units of text rather than
a secret. That signal has never produced a correct alert on any corpus it has
been scored against. If a row in the table above cites a credential word as its
only evidence, treat it as unread until you have read it yourself. The second
corpus added a different over-reporting shape: one sentence template
("rejects this tool before payment") copied across two tools, read as routing
because it contains the words "this tool before".

*We under-report.* This watch found about a quarter of the qualifying changes on
the first corpus and about **one in ten** on the second. The largest single
class it misses is a server naming another of its own tools and saying when to
reach for it -- "use `other_tool` for X", "hosted users should call
`other_tool`" -- which is 35 of the 44 misses on the second corpus. Misses also
arrive in clumps: two servers rewrote every description in one release and
carry 34 of that corpus's 49 qualifying changes between them, so a month can be
quiet for reasons that have nothing to do with your servers being quiet.

**The direction that pays us is the first one.** This subscription is priced per
connected server, and a month with no alert looks, from outside, exactly like a
month where the watch failed. A false alert costs you one glance and makes the
line item look alive; a miss costs us nothing and is invisible to you. That is
a real conflict of interest and it runs toward showing you more, not less.

**Our silence is not evidence.** On a server where nothing appears in the
table above, you
cannot tell from this document whether the server was quiet or the watch was
blind to what it did. Nothing in this record should be read as "no change" --
only as "nothing we detect fired".

**One thing here does not depend on the classifier at all.** A tool that
appeared or disappeared between two pins is a set difference between two
observations: exact, with no rule in between. The accuracy figures above are
about description changes only. Tool additions and removals are as reliable as
the extraction, and 29% of adjacent releases remove a tool
(`portfolio/research/mcp-tool-drift/`, Finding 2).

---

*Monitoring, not assurance. This document is a record of observations. It is not a security assessment, it does not certify any server, and it must not be represented as either.*
