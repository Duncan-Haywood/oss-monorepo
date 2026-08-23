# mcp-drift-watch

**Probe for [`mcp-supply-chain-watch`](../../candidates/mcp-supply-chain-watch.md).**
Built 2026-08-22. 104 tests. Not published, not a graduation. `ai_leverage`
moved once (6 → 7); still capped by `defensibility` at 3.

Pin what a connected MCP server declared, diff it on re-poll, classify what
moved, and hand the subscriber a record. That is the candidate's own
"Pin · Diff · Classify · Archive", built as the smallest working thing, and
used to answer the question its research left open.

---

> **Two further passes landed the same day, by sessions that could not see each
> other, and they took the two different next steps the first pass named.** This
> one collected the third corpus and measured the rule edits on it. The other
> ran a model over corpus 2 and is the [model-pass
> amendment](#amendment-2026-08-22-a-model-was-run-over-the-corpus) at the end
> of this file; it is the one that moved `ai_leverage` 6 → 7. They do not
> overlap, and each bears on the other: the model's figure is a single held-out
> measurement of exactly the kind this pass shows can halve on a second corpus.
>
> **A third same-day pass closed that gap**: the model, asked the identical
> question on corpus 3. See [the closing
> section](#third-pass-2026-08-22-the-model-asked-the-same-question-on-corpus-3).
> The short version: it still beats the rules, by a much wider margin than on
> corpus 2 — which is itself the caution, not just the result.
>
> **A fourth pass, 2026-08-23**, built the rule those passes named as the real
> gap. See [that section](#fourth-pass-2026-08-23-the-rule-for-the-class-corpus-3-named).
> It reproduces the same
> in-sample/out-of-sample collapse a third time — and finds why: the class the
> rule detects is a property of *which publisher* you watch, not of the
> population, so the aggregate accuracy figures this probe prints are averages
> over two populations that behave nothing alike.
>
> **A fifth pass, 2026-08-23**, measured that last sentence on the classifier it
> indicts — the shipped one, the only one a customer is ever shown a figure
> from — and it is the section immediately below. The consequence holds and the
> shape does not: there is no well-watched population. The record now discloses
> the split.

## Fifth pass, 2026-08-23: the consequence the fourth pass named, measured on the shipped rules

The fourth pass closed by indicting every figure this probe publishes:

> A portfolio-wide recall figure is a weighted average over two populations, and
> the weights are whichever servers a subscriber happens to watch. [...] Every
> accuracy figure this probe has published so far — including the 0.40–0.62 span
> the subscriber record prints — is an aggregate of exactly this kind.

It argued that from `relation.py`'s per-publisher table. But `relation.py` is not
adopted and never will be shown to a customer, and the table scores `variant` and
`variant+relation` — **not the shipped classifier the record actually quotes**.
So the charge was laid against figures that had never been split. This pass
splits them: [`score_by_publisher.py`](score_by_publisher.py) labels both
committed held-out corpora with `classify_drift.classify` unmodified and scores
each publisher on its own.

### The consequence holds. The shape the fourth pass assumed does not

That distinction is the finding, and it runs the *unfavourable* way.

|  | pooled (what the record printed) | split by publisher |
|---|---:|---:|
| recall, corpus 2 | 0.235 | median publisher **0.00** |
| recall, corpus 3 | 0.102 | median publisher **0.048** |
| publishers with a qualifying change | — | 16 |
| …on which the watch caught **nothing at all** | — | **9** |
| …on which it caught **everything** | — | 3, each with exactly **1** qualifying change |
| best recall on any publisher with more than one | — | **0.33** |

The fourth pass's table showed `variant+relation` taking recall from near zero to
0.67–1.00 on four publishers and leaving nine unmoved, which reads as two
populations: servers a watch covers well and servers it does not. **On the
shipped rules there is no first population.** Every publisher the watch caught
*everything* on had exactly one qualifying change, where the figure is one coin
flip and not a rate; on every publisher with more than one, it never caught more
than a third. The pooled number is not a blend of good and bad
coverage; it is a blend of near-zero coverage and small samples, and the second
is what lifts it.

The direction is worse still on the servers that matter most. The largest
publisher in each corpus carries **59%** and **43%** of that corpus's qualifying
changes — one publisher rewriting a release, the concentration both prior passes
noted — and the shipped watch scores **0.20** and **0.095** on exactly those two.
The servers generating the most work for a subscriber are the ones it is worst
on, because bulk rewrites are where the cross-tool routing class lives.

### The false alerts concentrate harder than the misses

Split the same way, the other direction is sharper and nobody had looked:

- All **9** false alerts across both corpora came from **4 of the 44 publishers
  watched**. Forty produced none.
- **5 of the 6** false alerts in corpus 2 came from one publisher,
  `@sonarapp/mcp`.

So `0.40–0.62 precision` is not a tax paid evenly. On most servers it is
invisible; on one it was most of what the subscriber saw. That is worth stating
to a customer because it predicts the complaint they will actually have — "all my
noise comes from one server" — and correctly attributes it to that server's
prose rather than to its behaviour.

### What shipped, and the rule it is held to

`subscriber_record.py` now prints the split: one clause in the headline (the 9 of
16 that caught nothing, beside the pooled span) and three paragraphs in the
accuracy section, including the paragraph that says what does **not** follow —
that no server is well covered, so nobody should read the split as a good tier
they might be in.

Fourteen figures are printed, and every one is re-derived in
`test_subscriber_record.py` from the two committed corpora by plain counting over
`label_corpus`, not by calling `score_by_publisher`'s own summary — re-deriving a
figure with the code that produced it checks nothing. That is the
`eaa-wcag-triage` citation pattern the probes README asks for. Each of the
fourteen was mutation-checked: changed one at a time to a neighbouring value, all
fourteen failed the suite. Suite 95 → 104.

Two figures were rewritten during that check rather than after it, and the reason
is worth recording because it is this probe's own recurring error. The first
draft reported *"publishers with recall above a third"* — and that claim flips
between a cutoff of 0.25 and one of 0.33, both defensible, both read off the very
table the claim described. It was replaced by two figures that need no cutoff:
which publishers the watch caught **everything** on (3, each with one qualifying
change), and the **best** recall on any publisher with more than one (0.33). Same
conclusion, no free parameter.

### What this does not settle

- **44 publishers and 2 corpora.** This is the direction of the error, not a
  per-server rate that could be quoted in advance, and the record says so in
  those words. A per-server rate is precisely what the finding says cannot be
  quoted.
- **The per-publisher denominators are small** — 12 of the 16 publishers with a
  qualifying change have three or fewer. That is not a flaw in the split; it is
  the reason the pooled figure was misleading, and it is why the disclosure is
  written as a count of servers rather than as a distribution.
- **Nothing here re-labels anything.** The hand labels, corpora, and shipped
  rules are untouched; only the reporting changed. The pooled figures are still
  printed, unaltered, beside the split.

**No score moved.** This corrects how an already-measured figure is presented
rather than measuring a new capability, and `defensibility` at 3 — the floor that
keeps this candidate from graduating under README.md rule 2 — is untouched. The
fourth pass's own reason applies unchanged: a finding about presentation does not
revise a score in either direction.

Reproduce (offline, from the committed corpora):

```bash
python3 -m pytest portfolio/pipeline/probes/mcp-drift-watch/ -q
python3 score_by_publisher.py        # both corpora, shipped rules, per publisher
```

| File | What it is |
|---|---|
| `score_by_publisher.py` | The split: shipped classifier, both corpora, scored per publisher, both directions. |
| `publisher-split-2026-08-23.json` | That run, committed: every publisher's own counts, and the pooled figures the record cites. |

---

## Fourth pass, 2026-08-23: the rule for the class corpus 3 named

The corpus-3 pass named the gap and the next spend:

> 35 of the 44 missed positives are one mechanism the first pass never saw ...
> **a server naming another of its own tools and saying when to reach for it,
> in a phrasing the verb list does not cover** ... What would be worth it is a
> rule for the class below, measured on a fourth corpus.

[`relation.py`](relation.py) is that rule, with 27 tests. A fourth corpus turned
out not to be what it needed: the eligible population was exhausted by corpora 2
and 3, and **corpus 2 is already held out for this rule** — collected and
hand-labelled the day before this file existed, sharing no package with corpus
3, and not inspected while the rule was written. Corpus 3 named the class, so
corpus 3 is in sample. That is the same split `rule_variants.py` had, one corpus
later.

### It could not be edit 4 in the signal table, and that is the reason five passes of widening failed

Every prior attempt at this class was a wider regex in
`classify_drift.INSTRUCTION_SIGNALS`, and each bought less than the last. The
obstacle is structural, not a failure of pattern-writing. A signal in that table
is a function of one description's text, and the relation needs two facts that
are not in that text:

1. **which tool is being described**, so a tool naming *itself* is not read as
   routing — the rubric scores self-description negative; and
2. **what the server's other tools are called**, so that `check_smtp_tls` is
   distinguishable from `idempotency_key`. Both are snake_case; only one is a
   tool.

`classify(old, new)` is handed neither, so a regex can only guess that any
snake_case token is a tool name — which is exactly what makes phrase-keyed rules
fire on parameter documentation. **Both facts are already in the subscriber's
pin**, because the watch stores the whole tool list per server. The product had
the information the classifier's signature could not see. The rule therefore
lives here and takes the namespace as an argument; `classify_drift.py` is still
imported unmodified and still decides the bucket first, and the rule only ever
*upgrades* a change the engine did not already flag — so every figure this
repository quotes about the shipped rules is untouched, asserted by a test.

### 1. The in-sample / out-of-sample gap reproduces a third time

| | corpus 3 (named the class) | corpus 2 (held out) |
|---|---|---|
| `variant` (the three prior edits) | P 0.778 · R 0.143 · F1 0.241 | P 1.00 · R 0.529 · F1 0.692 |
| `variant+relation` | P **0.929** · R **0.796** · F1 **0.857** | P 0.917 · R **0.647** · F1 **0.759** |
| changes the rule moved | 33 (32 agree with the hand label) | 3 (2 agree) |

In sample the rule finds 32 of the 44 misses that motivated it. Held out it
finds two. Both prior passes closed on a version of this — the corpus-2 pass
found a stable rate hiding unstable labels, the corpus-3 pass found the three
fixes ranked in reverse out of sample — and this is the third instance in the
same probe: **a rule written from the corpus that named its class is worth an
order of magnitude less on a corpus that did not.** The gain is real (recall
0.529 → 0.647, one false positive) and it is 6% of what the in-sample table
shows.

### 2. The class is a property of the publisher, not of the population

That gap is not sampling noise, and this is the finding worth carrying
elsewhere. Recall per server, hand positives caught:

| server | corpus | `variant` | `variant+relation` |
|---|---|---:|---:|
| `intodns-mcp` | 3 | 2/21 | **21/21** |
| `@oobe-protocol-labs/sap-mcp-server` | 3 | 0/13 | **9/13** |
| `@wpconvert/mcp` | 3 | 1/6 | **4/6** |
| `@naumu/mcp` | 2 | 6/10 | **8/10** |
| `autonomad-travel`, `@i18n-agent/mcp-client`, `@clize/clize`, `@adeu/mcp-server`, `bizmuse-mcp`, `@sonarapp/mcp`, `@picsha-ai/mcp-server` | 2, 3 | unchanged | unchanged |

On the four servers that write cross-tool routing the rule takes recall from
near zero to 0.67–1.00. On the nine whose positives are the imperative class it
changes nothing at all. Corpus 3 happened to contain two publishers who rewrote
every description with routing text in one release; corpus 2 contained one. That
is the whole explanation of both the 35-of-44 that named the class and the
2-of-3 that is all it wins held out.

The consequence is commercial rather than statistical. **A portfolio-wide recall
figure is a weighted average over two populations, and the weights are whichever
servers a subscriber happens to watch.** A customer subscribed to `intodns-mcp`
would see a watch that finds essentially everything; a customer subscribed to
`bizmuse-mcp` would see the same 0.10 recall the shipped rules have. Quoting one
aggregate number at both of them is quoting a number that is true of neither.
Every accuracy figure this probe has published so far — including the 0.40–0.62
span the subscriber record prints — is an aggregate of exactly this kind.

### 3. Alert volume, which is the candidate's own kill question

| | `variant` | `variant+relation` |
|---|---:|---:|
| corpus 3, share of changes flagged | 6.1% | **28.4%** |
| corpus 2, share of changes flagged | 6.6% | **8.8%** |

[`mcp-tool-drift`](../../../research/mcp-tool-drift/) Finding 4 converts the
alerting share into "roughly two alerts a month across twenty servers", and that
figure has been quoted as evidence that alert fatigue is survivable. It was
derived from a classifier that misses 86% of what it defines as an alert, so it
is a floor rather than an estimate: a classifier that actually detects the class
raises the same subscriber's volume by 1.3× or 4.6×, decided by which servers
they watch. The candidate names alert fatigue as its own kill condition. It is
not settled by the old number, and this pass does not settle it either — it
shows the number was measuring the classifier's blindness as much as the
market's churn.

### What was deliberately not done, and the two defects found in building it

**Not adopted** — not into `classify_drift.py`, not into the shipped signal
table, and not into `subscriber_record.py`'s printed rates. The reason is the
denominator, not the gain: the entire held-out evidence for this rule is **three
changes on one publisher**, `@naumu/mcp`, and both prior passes established that
one publisher rewriting a release is one editorial decision rather than N
independent observations. A test pins that all three moves are that publisher.
Adopting on that evidence would repeat, at the level of a rule, the error the
corpus-3 pass documented at the level of a ranking.

**The one held-out false positive is a rubric disagreement, and it is not
relabelled.** `naumu_get_ai_thread` gained *"Use to read the AI response after a
`naumu_ask` call"* — a named sibling tool with an ordering cue, which is what
this rule detects, and which the hand labels score negative because it says when
to reach for *this* tool rather than for the other one. Rubric (a) is written
the other way round. Moving a hand label to suit a new rule is how a corpus
stops being evidence, so the label stands and the rule wears the false positive.
The in-sample false positive (`wpconvert_explain_failure`, *"recovering a
submission ... via `wpconvert_convert_folder`"*) is a genuine over-fire on a
descriptive mention, and `via`/`from` were kept rather than trimmed to fix it —
trimming a cue to remove one false positive on the corpus that suggested it is
the same error one level down.

**A defect the first draft had, worth naming because it is the shipped engine's
own bug one level down.** Newness was first tested on the text span from cue to
tool name, taking the *first* cue in the window. `discover_dkim` reworded a
clause sitting beside a routing clause that had pointed at the same tool for
releases; the span straddled the semicolon, was new because its neighbour was,
and the rule reported a months-old relation as newly injected. Newness is now
tested on the **relation** — a tool this description already pointed at is not
an alert, however much the prose around it moved — and the cue nearest the name
is the one used. Both are pinned by tests.

**Coverage limits, stated as numbers.** Single-word tool names (`ask`, `sync`,
`context` — 21 of them across 7 packages in the two corpora) are out of scope by
construction: they cannot be told from prose without a parser, and admitting
them would trade the precision case for a handful of changes. The namespace here
is derived from the corpus, so it holds only tools whose descriptions changed —
a lower bound, which makes every recall figure above a floor. A subscriber's pin
carries the full list and would do better.

**No score moved.** `ai_leverage` stays at 7: this pass is more evidence that
rules can be pushed further than the corpus-2 reading assumed, and the model
pass already measured the model beating them on both corpora. A rule whose
held-out evidence is one publisher does not revise a score in either direction.

Reproduce (offline, from the committed corpora):

```bash
python3 -m pytest portfolio/pipeline/probes/mcp-drift-watch/ -q
python3 score_relation.py            # both corpora, four rule sets, per-publisher split
```

---

## Second pass, 2026-08-22: a third corpus, and the fixes measured on it

The first pass below closed by naming three rule edits, declining to make them,
and saying why:

> dropping `secret_or_credential` alone takes precision from 0.40 to 1.00 with
> no true positive lost. That number would be in sample, and quoting it as
> accuracy is precisely the error this pass exists to correct. Anyone taking
> those fixes needs a **third** corpus.

That corpus is now here: the **remaining 103** of the 164 eligible packages,
collected with `--exclude-from` so it shares no package with corpus 2, yielding
**148 description changes across 21 servers**, all hand-labelled against the
same rubric ([`build_labels_c3.py`](build_labels_c3.py)). The edits are in
[`rule_variants.py`](rule_variants.py) and encode only the three mechanisms the
first pass had already named in prose. Three results, in order of how much they
change what this probe can claim.

### 1. Nothing about the shipped classifier replicated — including the rate

| | corpus 1 (tuning) | corpus 2 (held out) | corpus 3 (held out) |
|---|---:|---:|---:|
| share of changes flagged | 7.2% | 7.4% | **5.4%** |
| precision | — | 0.40 | **0.625** |
| recall | — | 0.24–0.29 | **0.10–0.11** |

Corpus 2's headline was that a stable *rate* had hidden an unstable set of
labels. Corpus 3 removes even that consolation: the rate moved two points, and
precision and recall moved in opposite directions again — precision up by half,
recall down by more than half. Three corpora, three different answers, and the
spread between them is far wider than the labelling uncertainty inside any one
of them. The customer-facing record now prints the **span across both held-out
corpora** (precision 0.40–0.62, recall 0.10–0.29) rather than either figure,
because quoting one of two disagreeing measurements is choosing which one
flatters the product.

### 2. The three fixes are ranked in exactly the reverse order out of sample

Each edit, applied alone, against both corpora:

| edit | corpus 2 (the one that suggested it) | corpus 3 (never seen) |
|---|---|---|
| drop `secret_or_credential` | precision 0.40 → **1.00** | precision 0.625 → 0.714 |
| widen routing to `prefer` *named tool* | recall 0.24 → **0.53** | **no change at all** |
| relax `important:` punctuation | no change | recall 0.10 → **0.14**, precision → 0.70 |
| all three | P **1.00**, R **0.53–0.64** | P 0.778, R 0.14–0.15 |

The first pass argued hardest for the routing edit — it carried five of that
corpus's ten clear misses — and it buys **nothing** here. Corpus 3 contains one
instance of its exact mechanism (`ponlo_ai_chat`: *"For updating or deleting
specific items, prefer the structured tools (`ponlo_calendar_delete_event`,
`ponlo_tasks_update`, etc.)"*) and the widened pattern still misses it, because
the preference points at a category noun with the tool names in a parenthesis
after it. Meanwhile the edit that pass treated as a punctuation footnote is the
only one that finds anything new.

So the edits *are* an improvement out of sample — precision 0.625 → 0.778 and
recall 0.102 → 0.143, with no true positive lost — and it is a fraction of what
they were worth on the corpus that suggested them. **The reusable point is that
ranking candidate fixes by how much they move the numbers on the corpus that
suggested them does not survive contact with a second one.** This repository
has done that ranking before.

**The edits are still not adopted into the shipped rules**, and the reason is
not the size of the gain. Adopting them changes
[`classify_drift.py`](../../../research/mcp-tool-drift/classify_drift.py), whose
committed corpus-1 labels and 7.2% figure are cited across `portfolio/`; the
same relabelling measures corpus 1 at 6.6%. Paying that to ship a classifier
that still misses 86% of what it defines as an alert is the wrong trade. What
would be worth it is a rule for the class below, measured on a fourth corpus.

### 3. Two of the five signal alternatives are dead patterns, not bad judgement

`imperative_priority` and `secret_or_credential` are each written as
`\b( … | important: | … | \.env\b | … )\b`. The trailing `\b` cannot hold after
a colon followed by a space, or the leading one before a dot — so:

- **`important:` has never fired on ordinary prose.** Corpus 2 recorded the
  `@adeu/mcp-server` miss as an em-dash edge case (*"the text uses an em dash
  where the pattern requires a colon"*). The colon form does not work either:
  corpus 3 contains two `IMPORTANT: …` blocks, both genuine directives to the
  model, both read as `cosmetic`/`schema-widening` by the shipped rules. That is
  the entire out-of-sample recall gain in the table above.
- **`\.env` has never fired at all**, in any corpus. It changes no number here —
  edit 1 removes the whole signal — but it is the second alternative in this
  classifier found dead on punctuation rather than on judgement, which says
  something about how the patterns were reviewed. Both are pinned by tests in
  [`test_rule_variants.py`](test_rule_variants.py).

### What corpus 3 says the real gap is

35 of the 44 missed positives are one mechanism the first pass never saw,
because corpus 2 had no instance of it: **a server naming another of its own
tools and saying when to reach for it, in a phrasing the verb list does not
cover** — *"use `check_email_security` for the broader overview"*, *"hosted users
should call `sap_escrow_build_close_transaction`"*, *"Call this before
`wpconvert_convert_folder`"*, *"you can call `wpconvert_download_result`"*. The
shipped pattern recognises `use x_y to|first|instead|before` and nothing else,
so `for`, `or`, `should call` and `can call` all pass.

Two other things worth carrying forward:

- **The corpus is a handful of editorial decisions, again.** Two of 21 packages
  (`intodns-mcp`, `@oobe-protocol-labs/sap-mcp-server`) rewrote every
  description in a single release and carry 34 of the 49 positives. Corpus 2 had
  the same shape with `@naumu/mcp`, so per-change denominators overstate how
  much independent evidence either corpus holds.
- **Both remaining false positives are one sentence template.** *"Hosted
  accountless SAP MCP rejects this tool before x402 payment"*, copied across two
  tools, matches `(?:this|use this) tool (?:first|before|instead)`. A rule keyed
  on a phrase rather than on a relation between two named tools will keep doing
  this.
- **One instruction-bearing change is in Chinese** (`@clize/clize`, a *should* →
  *must* strengthening of a human-confirmation gate). None of the five signal
  patterns can match any non-Latin text, and no coverage statement anywhere in
  this probe said so until now.

Reproduce (all offline except the collector):

```bash
python3 -m pytest portfolio/pipeline/probes/mcp-drift-watch/ -q
python3 build_labels_c3.py            # scores both rule sets on corpus 3
python3 rule_variants.py --corpus results-holdout-c3-2026-08-22.json
python3 collect_holdout.py --limit 200 \
    --exclude-from results-holdout-2026-08-22.json --out results-new.json
```

---

## The first pass, 2026-08-22: the headline result

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

> **Answered the same day**, by the second pass at the top of this file. The
> remaining 103 packages were collected, hand-labelled and scored: out of sample
> the three fixes are worth precision 0.625 → 0.778 and recall 0.102 → 0.143,
> against 0.40 → 1.00 and 0.24 → 0.53 in sample. The rules are still not
> changed, for a different reason than this paragraph gives.

**No score moved in `candidates.yaml`.** Two arguments in this write-up point at
scores and neither is a measurement:

- `ai_leverage` is 6, lowered on 2026-08-19 on the finding that the
  classification is rule-separable rather than model work. A precision of 0.40
  and a recall of 0.25 is the strongest evidence yet that rules are *not*
  sufficient here, which argues the leverage is higher than 6 — but no model was
  run against this corpus, so that is an argument. Running one is the obvious
  next pass and it is now cheap: 136 changes with committed hand labels.

  **Both later passes acted on this, in opposite ways, and the model pass is the
  one that moved the score.** The corpus-3 pass strengthened the argument
  without settling it — recall of 0.10 is the weakest showing yet for the rule
  approach, and a second unmeasured argument is not evidence, so it recorded
  examined-and-not-revised a second time. The model pass measured it: a blind
  Claude Sonnet 5 read scores F1 0.61–0.71 against the rules' 0.30–0.33 on the
  same corpus, and `ai_leverage` moved **6 → 7**. What is still open is whether
  *that* figure replicates, since the corpus-3 pass showed the rules' own F1
  falling by half between two corpora drawn the same way, and the model has only
  been asked about one of them. There are now 284 changes with committed hand
  labels; the model has seen 136.

  **Closed the same day, by a third pass**: the model, asked on corpus 3. F1
  0.93–0.96 against the rules' 0.17–0.19 there — a wider gap than corpus 2's,
  not a narrower one, so the qualitative finding replicates twice for two and
  the magnitude does not replicate at all (2× on corpus 2, ~5× on corpus 3).
  `ai_leverage` was **not** moved again: a score that tracked the more
  flattering of two disagreeing measurements is the exact error the corpus-3
  rules pass named a section for. See [the closing
  section](#third-pass-2026-08-22-the-model-asked-the-same-question-on-corpus-3).
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
| `collect_holdout.py` | Builds a held-out corpus. Records what it excluded and why; `--exclude-from` subtracts an earlier corpus. |
| `build_labels.py` | The hand labels as data, the rubric that produced them, and the scoring. |
| `build_labels_c3.py` | The same, for corpus 3, scoring both rule sets. Reuses the scorer rather than forking it. |
| `rule_variants.py` | The three edits corpus 2 argued for, applied by swapping the signal table into the shipped `classify()`. |
| `relation.py` | The named-tool-relation rule: fires on a relation between two named tools, using the server's own namespace. Upgrade-only; never edits the shipped engine. |
| `score_relation.py` | Scores four rule sets on both corpora, with the per-publisher split and the coverage gap. |
| `relation-scores-2026-08-23.json` | That run, committed: every moved change, the per-publisher recall, both borderline readings. |
| `render_sample.py` | Renders one real record from live npm data. |
| `results-holdout-2026-08-22.json` | Corpus 2: 136 changes, 23 packages, with full before/after text. |
| `holdout-labels-2026-08-22.json` | Every label, every borderline call, and a note on each judgement. |
| `results-holdout-c3-2026-08-22.json` | Corpus 3: 148 changes, 21 packages, disjoint from corpus 2 by construction. |
| `holdout-labels-c3-2026-08-22.json` | The same for corpus 3, plus both rule sets' scores side by side. |
| `model-pass-c3-2026-08-22.json` | The model's 148 blind labels on corpus 3, same method as the corpus-2 pass. |
| `score_model_pass_c3.py` | Scores the corpus-3 model pass against its hand labels; `--disagree` lists every split. |
| `sample-record-2026-08-22.md` | A real record, chosen to be unflattering — see below. |
| `test_drift_watch.py`, `test_subscriber_record.py`, `test_rule_variants.py`, `test_build_labels_c3.py`, `test_relation.py` | 104 tests. |

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
- **All 164 eligible packages have now been taken**: 60 in corpus 2 and the
  remaining 103 in corpus 3, which excludes corpus 2 by name from its own
  output rather than by re-ranking. One package (`mcp-socialapi`) is excluded as
  tuned-on. The population is therefore exhausted at today's registry ranking; a
  fourth corpus needs the registry to grow, or a different registry.
- **No non-Latin text is matched by any signal.** Every pattern is English
  keywords. Corpus 3 contains 8 Chinese and 2 Korean description changes, one of
  which is instruction-bearing by hand and invisible to the rules by
  construction.

## What this does not establish

- **That 0.40–0.62 is the classifier's accuracy.** It is its accuracy on two
  corpora of npm-published servers, hand-labelled by one reader against a rubric
  written down before counting. The rubric is in `build_labels.py` and every
  borderline call is marked; disagree with any of them and re-run the scorer.
  Two measurements that disagree this much are better read as a caution about
  the third than as brackets around a true value.
- **That the three edits are the right fix.** They are measured out of sample
  and they help, and they leave 86% of the qualifying changes unfound. The class
  that carries 35 of 44 misses has no rule at all yet.
- **That a model would do better.** Measured now, on both held-out corpora — see
  the [model-pass amendment](#amendment-2026-08-22-a-model-was-run-over-the-corpus)
  and its [corpus-3 follow-up](#third-pass-2026-08-22-the-model-asked-the-same-question-on-corpus-3).
  It does, on precision and recall both, on both corpora, and it does worse on
  the one thing this probe's whole methodology is built around: judging only the
  newly added text. **The two measurements themselves disagree**, the same way
  the rules' two measurements disagree: F1 0.61–0.71 on corpus 2, F1 0.93–0.96 on
  corpus 3. A single figure from either pass is no more "the" model accuracy than
  7.4% was "the" alert rate.
- **That severity is separable at all.** A benign deprecation notice and an
  injected routing instruction are the same shape in text. This probe labels
  *whether* text addresses the model, never whether it is hostile, and the
  record says so.
- **Anything about the 85%.** Every number here is from the 15% of the registry
  that ships a package.

## Amendment, 2026-08-22: a model was run over the corpus

The write-up above named this the obvious next pass and put a number on why it
was cheap: 136 changes with committed hand labels. Run here, blind: four
independent Claude Sonnet 5 passes, one per disjoint 34-item slice of the
corpus, each given only a tool's old/new description text, a mechanical
newly-added-text hint, and the rubric from `build_labels.py`'s docstring — not
the rule classifier's bucket for that item, not the hand labels, not
`build_labels.py` itself. Scored against the same committed hand labels the
rules were scored against, by `score_model_pass.py`.

|  | rules (2026-08-22) | model, one blind pass |
|---|---:|---:|
| precision | 0.40 | **0.48–0.60** |
| recall | 0.24–0.29 | **0.86–0.88** |
| F1 | 0.30–0.33 | **0.61–0.71** |

**The model beats the rules on both axes, by a wide margin on recall.** It
caught 15 of 17 hand-labelled instruction-bearing changes (13 of 15 counting
borderline calls conservatively) against the rules' 4 of 17 (4 of 14
conservative). That is direct evidence against this candidate's `ai_leverage`
score of 6, which was lowered on 2026-08-19 on the finding that "the
classification is rule-separable rather than model work" — on this corpus it
demonstrably is not: a model gets roughly twice the rules' F1.

**It is not simply better, and the way it is worse is the reusable finding.**
Of the model's 10 false positives (counting borderline calls as positive), 4
are hand-noted as judging text that was not actually new — the exact
discipline `build_labels.py`'s rubric leads with ("applied to the *newly
added* text only … text already present in the old description is not new
evidence"):

- `@gency-ai/gency-mcp` `update_product_status`: flagged "Confirm with the
  user" as a new imperative; the old text already carried the identical
  instruction, just at greater length.
- `@naumu/mcp` `naumu_remove_edge` (0.1.5): flagged "Prefer `naumu_ask`" as a
  new priority claim; it is in both versions, unchanged — the case the
  hand-labels call out as "the span-must-be-new rule working" against the
  rules, and the model missed it in the direction the rules got right.
- `@naumu/mcp` `naumu_add_node` (0.1.5): flagged a new imperative in a version
  where the hand labels record the *opposite* edit — a directive being
  *removed*, not added.
- `@agenttrust/mcp-server` `agenttrust_inbox`: flagged a tool reference as new
  routing guidance; the same routing was already present in the prior
  description.

A rule-based diff can guarantee it only ever sees the new span; nothing here
stopped the model from re-reading the full before/after pair and losing track
of which words were actually added, and about a quarter of its false alarms
came from exactly that. The other 6 false positives and both false negatives
are genuine judgement calls, not this failure mode — see
`score_model_pass.py --disagree` for the full list with both readings side by
side, including one item (`@flydocs/cli` `install`/`sync`) where the "new"
text is itself truncated mid-sentence ("deprecated — use ") in a way that
makes the hand label's call defensible but not obviously the only reasonable
one.

**What was deliberately not done here either:** the disagreements were not
adjudicated in the model's favour, the hand labels were not revised, and this
was not repeated to average away the single-pass noise the labels
(`model-pass-2026-08-22.json`'s own `single_pass_caveat`) already flag. One
blind pass beating the rules by this much is itself the finding; turning it
into a shippable classifier is a different, larger piece of work this pass
does not claim to have done.

**Score moved:** `ai_leverage` 6 → 7 in `candidates.yaml`, reversing part of
the 2026-08-19 reduction — see that file's `measured` block for the exact
wording. Composite 6.75 → 6.875. No other score moves; `defensibility` (the
candidate's actual floor, at 3, mitigation refuted per the entry above) is
untouched and this still cannot graduate under README.md rule 2.

| File | What it is |
|---|---|
| `model-pass-2026-08-22.json` | The model's 136 blind labels plus its per-item reasoning, and the exact method in its own `method` field. |
| `score_model_pass.py` | Scores the model pass against the hand labels; `--disagree` lists every split with both sides' reasoning. |

## Third pass, 2026-08-22: the model, asked the same question on corpus 3

The amendment above closed by naming the open question in one sentence: "the
model's 0.61–0.71 has not been asked the same question" on corpus 3. It has
now. Same method, same rubric, same discipline — four independent Claude
Sonnet 5 passes, one per disjoint 37-item slice of the 148-item corpus, each
given only a tool's old/new description text, a mechanical newly-added-text
hint, and `build_labels.py`'s rubric — not the rules' bucket, not the hand
labels, not `build_labels_c3.py` itself. Scored against the same committed
labels the rules were scored against on this corpus, by
`score_model_pass_c3.py`.

|  | rules (corpus 3) | model, one blind pass (corpus 3) | model, one blind pass (corpus 2) |
|---|---:|---:|---:|
| precision | 0.625 | **0.90–0.96** | 0.48–0.60 |
| recall | 0.10–0.11 | **0.96** | 0.86–0.88 |
| F1 | 0.17–0.19 | **0.93–0.96** | 0.61–0.71 |

**The model beats the rules by a wider margin here than on corpus 2, not a
narrower one.** It caught 44–47 of the corpus's 49 hand-labelled
instruction-bearing changes against the rules' 5. Only 4 of 148 labels
disagree with the hand reading at all (2 false positives, 2 false negatives,
counting the corpus's 3 borderline calls as positive — the same 3 the model
also flagged, including the one written in Chinese, a language no rule pattern
in this probe can match by construction):

- `intodns-mcp` `scan_domain`: flagged "This is the default tool for
  agent-visible scan evidence" as a priority claim (rubric c); the hand label
  reads it as a superlative about itself, naming no other tool — the same
  reading corpus 2 gave `meetlark_get_admin_view`.
- `intodns-mcp` `discover_dkim`: flagged "use `check_email_security` for the
  broader SPF/DKIM/DMARC overview" as new cross-tool routing (rubric a) — but
  that sentence is in both the old and new description, unchanged. This is the
  exact **span-must-be-new** failure the corpus-2 pass found in a quarter of
  its own false positives, reproduced here in one of two.
- `autonomad-travel` `create_booking_intent` and `@oobe-protocol-labs/
  sap-mcp-server` `sap_sns_register_agent_domain` (both false negatives): the
  model read "call this only when/after …" as self-describing usage guidance
  naming no other tool; the hand labels read the same phrasing as an ordering
  or gating imperative (rubric b), the reading corpus 2 gave `naumu_search`'s
  "only use this when" clause. Genuine judgement calls, not the truncation or
  stale-span failure modes — see `score_model_pass_c3.py --disagree` for both
  readings side by side.

**Two things this settles, and one it does not.** It settles that the
corpus-2 result was not a fluke of that corpus: the model beats the rules on
precision and recall on both held-out corpora now measured, which is what
`ai_leverage`'s 2026-08-22 move argued from one. It also settles that the
span-must-be-new failure mode is real and recurring rather than a one-corpus
artifact — one clean instance here, in the same shape as before. **It does not
settle what the model's own accuracy is**: 0.61–0.71 and 0.93–0.96 are both
single blind passes, and this probe's own corpus-3 rules section exists to
demonstrate that ranking a method by the corpus that most flatters it does not
survive a second one. Two model passes agreeing on direction (model beats
rules) while disagreeing by roughly 2× to 5× on magnitude is the model
reproducing the same lesson the rules did, not escaping it.

**Score not moved again.** `ai_leverage` stays at 7. The 2026-08-22 amendment
already moved it on the strength of "not rule-separable," and this pass adds a
second corpus of support for exactly that claim — it does not add support for
a *stronger* claim, since the magnitude that would justify moving further is
the one number this pass shows swings hardest between corpora. Moving the
score again on the more flattering of two disagreeing measurements is the
error the corpus-3 rules section above is named for. `defensibility` (the
floor, at 3) is untouched, and this still cannot graduate under README.md rule
2.

| File | What it is |
|---|---|
| `model-pass-c3-2026-08-22.json` | The model's 148 blind labels on corpus 3 plus its per-item reasoning, and the exact method in its own `method` field. |
| `score_model_pass_c3.py` | Scores the corpus-3 model pass against the hand labels; `--disagree` lists every split with both sides' reasoning. |
