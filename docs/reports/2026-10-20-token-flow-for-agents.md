# Where a run's tokens go: brief for an agent reader

**Date:** 2026-10-20. **Reader:** an LLM agent running a session in this
repository that wants to get more work done for the same quota.
**Human version:** [`2026-10-20-token-flow-for-people.md`](2026-10-20-token-flow-for-people.md).
**Data and code:** [`assets/token-flow/`](assets/token-flow/).

## Answer

You pay for re-reading, not for writing. Each API request re-reads your whole
context (about 81,000 tokens in a median run), and you make about 19 of them.
Output, the only tokens that are your work, is 0.56% of the tokens a run
processes and 16% of its API-equivalent cost. So every extra request, every
line of tool output and every always-read document costs you again on each
later request. Make fewer, fuller requests and keep what enters the context
small.

## Evidence (verified 2026-10-20, reproducible)

Command: `python3 docs/reports/assets/token-flow/analyze.py` (stdlib only).
Output: [`assets/token-flow/results.txt`](assets/token-flow/results.txt).
Source: the `usage` block `prompts/runcost.py attach` wrote into 856 run
records (one per session, 2026-10-16 to 10-20; 826 Sonnet 5.5, 29 Opus 5.5).

- Pooled tokens: cache reads 96.0%, cache writes 3.4%, output 0.56%,
  uncached input 0.002%. Pooled API-equivalent $734: cache reads 48%, 1-hour
  cache writes 36%, output 16%. 177 tokens read per token written. Thinking
  is 18% of output.
- Median run: 19 requests, 22 tool calls, 1.57M tokens read, 8,561 output
  tokens, $0.67.
- Fitted per run: context at request 1 is about 65,000 tokens (bootstrap 95%
  60,000 to 69,000); each request adds about 1,700 (1,200 to 2,100). 69% of all
  tokens read are that fixed prefix being re-read.
- This brief's own session: the first request was 75,941 tokens, 47,778 of
  them read from a cache shared across sessions (harness prompt and tool
  schemas) and 28,161 written fresh (CLAUDE.md, skill and tool lists).
- Runs of 25 to 50 requests cost the least per output token (median $0.064
  per 1,000, against $0.086 for runs under 25 and $0.105 for 100 to 200). The
  model puts the minimum at about 35 requests.
- Tool calls: Bash 79%, Read 7%, ToolSearch 3% (0.8 per run). 0.90 requests per
  tool call pooled: most calls are made one per request.
- Tools take 67% of active time; the model 33%.

## Do this

Each saving below is the model's estimate for a median Sonnet run, holding
output fixed.

1. **Batch independent tool calls in one response**, and chain shell steps
   with `&&` or `;` in one Bash call. Twenty percent fewer requests for the
   same work is about 20% fewer tokens and 10% less cost.
2. **Cap what a tool returns.** Pipe to `| tail -20`, `| head -50`,
   `grep -c`, `wc -l`. Read files with an offset and limit or `grep -n`
   first. Run tests with `-q` and print only failures. A tool result stays in
   context and is re-read by every later request; halving growth per request
   saves about 11% of cost.
3. **Read always-read documents by section, not whole.** `grep -n '^## '`
   then `sed -n a,bp`. `prompts/goals.md` is 33,000 characters (about 8,000
   tokens); its own header says to read Guardrails plus the section your task
   touches. Each 10,000 tokens kept out of the prefix saves about 12%.
4. **Load every deferred tool you will need in one `ToolSearch`** with
   `select:a,b,c`, not one search per tool.
5. **Do not split a task to stop early.** Short runs pay the fixed prefix
   for little work. If you finish at 15 requests and a related item is next in
   the queue, doing it in the same run is cheaper per unit of output than a new
   run, up to roughly 35 to 50 requests.
6. **Don't write documents you think agents will "always read" unless they
   must be.** Every always-read line is paid for on every request of every run.
   Prefer a pointer to a runbook read only when needed.

## Limits

- Cost is an API-equivalent from list prices in `prompts/pricing.json`, not a
  bill. How the subscription quota weights cache reads against output is not
  known here. On raw token count, re-reading is 96%; on dollar weight, 84%.
  Both readings lead to the same advice.
- The prefix and growth figures come from a least-squares fit of mean context
  per request on request count. It describes the typical run, not any one run.
  The fitted model reproduces the median cost ($0.644 modelled, $0.658
  measured).
- The tool-result split by tool is from one session (this one) and so is
  only illustrative.
- The 5-minute versus 1-hour cache choice (16% of cost in the model) belongs to
  the harness, not to you, and a 5-minute cache expires during long tool waits.
- Five days, one model in 97% of runs, and only records whose run took the
  cost step.
