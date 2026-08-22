# Declaration record: io.github.naumu/mcp

**Accuracy, measured out of sample on 2026-08-22: precision 0.40, recall 0.23-0.29.** About six in ten of the alerts below are not what this watch says they are, and it finds roughly one in four of the changes that meet its own definition. Read the accuracy section before acting on any row.

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

Measured **2026-08-22**, on **136 tool-description changes across 23 npm-published MCP servers** chosen
because none of them was read while the classification rules were being written.
Derivation: `portfolio/pipeline/probes/mcp-drift-watch/ (collect_holdout.py, build_labels.py)`.

| | measured |
|---|---:|
| Precision (of what we alert on, how much is real) | **0.40** |
| Recall (of what is real, how much we alert on) | **0.23-0.29** |

The range on recall is the labelling: three of the changes are calls a careful
reader could reverse, and both readings are published rather than one being
chosen.

**Both directions are bad, and they are bad for different reasons.**

*We over-report.* Six of ten alerts in the held-out run were ordinary
documentation. All six came from one signal -- a credential word appearing in a
description -- and every one of them was a server documenting its pricing
("works without an API key") or using "token" to mean units of text rather than
a secret. If a row in the table above cites a credential word as its only
evidence, treat it as unread until you have read it yourself.

*We under-report.* This watch found about a quarter of the changes that meet
its own definition of an alert. The largest single class it missed is a server
telling the model to prefer a different tool -- the phrase "prefer `other_tool`"
appears repeatedly in the held-out corpus and matches none of our rules. One
package accounted for six misses in a single version bump.

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
