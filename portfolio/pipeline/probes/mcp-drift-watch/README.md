# mcp-drift-watch

**Probe for [`mcp-supply-chain-watch`](../../candidates/mcp-supply-chain-watch.md).**
Built 2026-08-22. 32 tests. Not published, not a graduation, no score moved.

Pin what a connected MCP server declared, diff it on re-poll, classify what
moved, and hand the subscriber a record. That is the candidate's own
"Pin · Diff · Classify · Archive", built as the smallest working thing, and
used to answer the question its research left open.

---

## The headline result

`portfolio/research/mcp-tool-drift/` measured this candidate's base rates on
2026-08-19 and closed with a caveat nobody had re-opened:

> The corrected classifier was tuned on the corpus it is scored against, so
> 7.2% is in-sample and will not hold unchanged on fresh data.

It was re-opened here, on **136 description changes across 23 npm-published MCP
servers, none of them read while the rules were being written**. The result is
not the one either reading of that caveat predicts.

| | in sample (2026-08-19) | held out (2026-08-22) |
|---|---:|---:|
| share of changes flagged | 7.2% | **7.4%** |
| precision | 9 of 11 by the research's own reading | **0.40** (4 of 10) |
| recall | never measured | **0.24–0.29** |

**The rate reproduced almost exactly. The labels did not.** Flagging 7.4% where
the tuned corpus flagged 7.2% looks like a classifier that generalised, and it
is not one: out of sample it is wrong about six of every ten alerts it raises
and silent on about three of every four changes that meet its own definition.
The two errors run in opposite directions and very nearly cancel in the count,
which is exactly why the count looked stable.

This matters beyond one classifier. `alerting_share_pct` is the number
[`mcp-tool-drift`](../../../research/mcp-tool-drift/) Finding 4 converts into
alerts per server-month, and that finding survives — a customer really would
see roughly two alerts a month across twenty servers. What does not survive is
the assumption underneath the product: that the alerts they see are the changes
that matter.

Both readings of the borderline labels are published (`0.24` counting three
disputable calls as real misses, `0.29` counting them as clean), because a
figure whose direction depends on a hidden judgement is not a measurement.

## Where the error localises, and why it is not tuning noise

Precision splits cleanly by signal family:

| signal | flagged | correct | precision |
|---|---:|---:|---:|
| `tool_routing` | 3 | 3 | **1.00** |
| `imperative_priority` | 1 | 1 | **1.00** |
| `secret_or_credential` | 6 | 0 | **0.00** |

**Every false positive came from one signal, and that signal has now produced
zero true positives on two independent corpora.** In sample it fired twice and
the research pass had already read both as "ordinary documentation expansion
that newly introduces a credential word" — it was 2 of 11 alerts there, a
footnote. Out of sample it is 6 of 10, and the corpus shows two distinct ways it
fails:

- **Pricing documentation.** Five of the six are one publisher adding *"Works
  without an API key (free tier, limited daily use per IP)"* to five tool
  descriptions in a single release. The word "API key" is genuinely new; nothing
  credential-directed happened.
- **Word sense.** The sixth is `crawlio-browser` documenting
  *"interactive=true for 60-80% token reduction"*. "Token" here means units of
  text. The rule reads it as a secret.

The misses localise too, and the mechanism is small enough to name:

- **"Prefer `other_tool`" matches nothing.** `tool_routing` recognises
  `prefer this (?:tool|over)` but not a preference expressed *toward a named
  other tool*, which is how every instance in this corpus is written. That one
  gap carries 5 of the 10 clear misses.
- **`important:` requires the colon.** `@adeu/mcp-server` added an
  `IMPORTANT — login is user-level, not account-level:` block with an em dash.
  Missed on punctuation.
- **One package carries six misses in one version bump.** `@naumu/mcp` 0.1.0 →
  0.1.5 added *"**Prefer `naumu_ask`**"* to four low-level graph tools at once,
  re-pointed a fifth's routing target, and added a call-order directive to a
  sixth (that sixth is one of the three borderline calls). Per-change accuracy
  figures treat those as six independent observations; they are one editorial
  decision, which is a reason to read 0.24–0.29 as softer than its denominator
  suggests.

## What was deliberately **not** done

**The rules were not changed.** Two of the fixes above are obvious, cheap and
would move both numbers a long way — dropping `secret_or_credential` alone takes
precision from 0.40 to 1.00 with no true positive lost. That number would be in
sample, and quoting it as accuracy is precisely the error this pass exists to
correct. The classifier is imported from
[`portfolio/research/mcp-tool-drift/classify_drift.py`](../../../research/mcp-tool-drift/classify_drift.py)
rather than forked, and it is imported unmodified, so the figure printed at a
customer is a figure about the shipped rules.

Anyone taking those fixes needs a **third** corpus. The eligible population is
large — the collector found 164 held-out packages and this run took 60, which
the output records rather than silently truncating — so a third is a command
away, and the labels for this one are committed as data so the comparison is
against something fixed.

**No score moved in `candidates.yaml`.** Two arguments in this write-up point at
scores and neither is a measurement:

- `ai_leverage` is 6, lowered on 2026-08-19 on the finding that the
  classification is rule-separable rather than model work. A precision of 0.40
  and a recall of 0.25 is the strongest evidence yet that rules are *not*
  sufficient here, which argues the leverage is higher than 6 — but no model was
  run against this corpus, so that is an argument. Running one is the obvious
  next pass and it is now cheap: 136 changes with committed hand labels.
- `ethical_robustness` is 8. This probe ships the disclosure surface the
  candidate never had, and it does so from its first version rather than after a
  deduction. There was no measured deficit to restore, so the score is recorded
  as examined-and-not-revised, on the precedent
  [`shopify-a11y-evidence`](../../candidates/shopify-a11y-evidence.md) set.

**Nothing was published, and step 3 is still step 3.** The candidate's only
remaining commercial gate is taking the base rate to ten teams at $29/server/
month. That needs buyer contact an unattended agent cannot make, and no finding
here changes it.

## What is here

| File | What it is |
|---|---|
| `drift_watch.py` | Pin, diff, and the severity ordering. The product surface. |
| `subscriber_record.py` | The document a subscriber holds, with coverage and both error rates in it. |
| `collect_holdout.py` | Builds the held-out corpus. Records what it excluded and why. |
| `build_labels.py` | The hand labels as data, the rubric that produced them, and the scoring. |
| `render_sample.py` | Renders one real record from live npm data. |
| `results-holdout-2026-08-22.json` | The corpus: 136 changes, 23 packages, with full before/after text. |
| `holdout-labels-2026-08-22.json` | Every label, every borderline call, and a note on each judgement. |
| `sample-record-2026-08-22.md` | A real record, chosen to be unflattering — see below. |
| `test_drift_watch.py`, `test_subscriber_record.py` | 32 tests. |

```bash
python3 -m pytest portfolio/pipeline/probes/mcp-drift-watch/ -q   # offline
python3 build_labels.py                                          # offline, re-scores
python3 collect_holdout.py --limit 60 --out results-new.json      # needs npm
python3 render_sample.py --out sample.md                          # needs npm
```

## The sample record is the one that fails

`sample-record-2026-08-22.md` is `@naumu/mcp` 0.1.0 → 0.1.5 — the package that
carries six of the misses. A subscriber watching it would have received a record
listing three new tools, two flagged descriptions, and six more marked
`cosmetic` that the hand labels say carried newly added model-directed text
(five clear, one borderline). That is what the
product does today, printed rather than described.

It is also what the accuracy section on that record is for. A customer reading
it is told, above the table, that six in ten rows are wrong and that the watch
finds about one in four; that the credential signal specifically should be
distrusted; that a quiet server is not a clean server; and that **the direction
of error that pays the operator is the over-reporting one**, because a
per-server subscription that never alerts looks identical to one that is blind.
Tool additions and removals are kept out of the accuracy claim entirely — those
are a set difference between two pins, exact, with no rule in between.

## Coverage, stated here as well as in the product

- **85% of the registry cannot be pinned from a published artifact.** Registry
  records point at remote endpoints and carry no tool declarations at all
  (`inputSchema` occurs zero times across 4,000 version records). Those are
  pinnable only by polling the endpoint a customer connected, on their own
  surface — which this environment cannot reach, and which is where the
  candidate's *durable* asset lives, since a remote endpoint's history is
  reconstructable by nobody who was not watching.
- **Static extraction only.** No MCP server is ever run. Asking an untrusted
  server for its tool list is the thing this product exists to be careful about.
  Minified and bundled packages defeat static reading.
- **The tuning/holdout split is a guarantee about labels, not about fetches.**
  `TUNED_ON` names the 19 packages whose pairs were read by hand; a test checks
  it still matches the research corpus. Up to 21 further packages were *fetched*
  by that pass and yielded no labelled pair, and today's registry ranking is not
  that day's, so `--min-rank` is best effort while `TUNED_ON` is exact.
- **60 of 164 eligible packages were taken.** Recorded in the output, not
  dropped silently.

## What this does not establish

- **That 0.40 is the classifier's accuracy.** It is its accuracy on one corpus
  of npm-published servers, hand-labelled by one reader against a rubric written
  down before counting. The rubric is in `build_labels.py` and every borderline
  call is marked; disagree with any of them and re-run the scorer.
- **That a model would do better.** Nobody has tried. That is the next pass.
- **That severity is separable at all.** A benign deprecation notice and an
  injected routing instruction are the same shape in text. This probe labels
  *whether* text addresses the model, never whether it is hostile, and the
  record says so.
- **Anything about the 85%.** Every number here is from the 15% of the registry
  that ships a package.
