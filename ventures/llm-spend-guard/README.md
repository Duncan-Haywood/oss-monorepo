# LLM Spend Guard

Stop a runaway OpenAI or Anthropic bill **before** the call is sent. Hard
dollar budgets per user, feature, API key and agent run, an output-token
ceiling, and circuit breakers that trip when an agent loops. It runs as a
self-hosted proxy (one base-URL change) or as a zero-dependency library
around your SDK call.

```
node cli.mjs init guard-policy.json          # example policy; put in your models and current prices
node cli.mjs check-policy guard-policy.json  # summary + gaps
node cli.mjs simulate guard-policy.json last-month.jsonl   # what would it have refused?
node cli.mjs proxy guard-policy.json --port 8787
```

Then point the SDK at it:

```
ANTHROPIC_BASE_URL=http://127.0.0.1:8787/anthropic
OPENAI_BASE_URL=http://127.0.0.1:8787/openai/v1
```

Browser simulator (paste a usage log, nothing uploaded):
<https://duncan-haywood.github.io/monorepo-projects/llm-spend-guard/>.

## Why use this

What a team has today:

- **The provider's own console limits and alerts.** Keep them on; they are
  the backstop. They cover the whole organisation or project, though. One
  user or one stuck agent run trips the limit for everyone. Depending on the
  provider and setting, a limit may alert rather than refuse.
- **AI gateways and observability platforms** (LiteLLM, Portkey, Helicone and
  others) offer budgets, rate limits or dashboards in various forms. Check
  their current documentation for what each enforces and on which plan. Not
  affiliated with, endorsed by, or sponsored by any of them. Their names are
  trademarks of their owners, used here only to describe what this tool is
  and is not.
- **A counter in your own code** that adds up `usage` after each response.
  It is too late under concurrency: twenty parallel calls all see the same
  remaining budget.

What this does differently:

1. **Worst-case holds.** Each call reserves its worst case (a high input
   estimate plus the full output cap) against every budget it belongs to
   *before* it is sent. Real usage then replaces the hold, so a budget is
   never promised twice.
2. **Per-run breakers for agents.** The guard catches the same request
   repeated *n* times in a window, calls or dollars per minute over a limit,
   and a per-run step cap. A stuck tool-call loop stops in seconds, not when
   the monthly budget is gone.
3. **It fails closed.** A model with no configured price is refused, so a
   new model name cannot pass every budget at $0. A request with no output
   cap is refused, or gets the policy's default cap.
4. **It can be read in an hour.** About 800 lines across three files, no
   dependencies. The same engine runs the proxy, the library and the
   browser simulator.
5. **It is offline.** Replay last month's log through a policy and see
   exactly which calls it would have refused before you enforce it.

## Policy

```json
{
  "mode": "enforce",
  "prices": { "claude-sonnet-4-5": { "in": 0, "out": 0, "cacheRead": 0, "cacheWrite": 0 } },
  "requireKnownPrice": true,
  "defaultMaxOutputTokens": 1024,
  "maxOutputTokens": 8192,
  "maxCostPerCallUsd": 0.5,
  "budgets": [
    { "id": "org-day",   "scope": "global", "window": "day",   "limitUsd": 25, "alertAt": [0.5, 0.8, 1] },
    { "id": "user-day",  "scope": "user",   "window": "day",   "limitUsd": 2 },
    { "id": "run-total", "scope": "run",    "window": "total", "limitUsd": 3, "limitCalls": 150 }
  ],
  "breakers": [
    { "id": "loop",  "scope": "run",    "maxRepeats": 20, "repeatWindowSec": 300, "cooldownSec": 900 },
    { "id": "burst", "scope": "global", "maxCallsPerMinute": 120, "maxSpendPerMinuteUsd": 2, "cooldownSec": 120 }
  ]
}
```

The zeros are placeholders. Prices are USD per million tokens: put in your
provider's current rates. A price key also matches dated snapshots by prefix
(`claude-sonnet-4-5` prices `claude-sonnet-4-5-20250929`).

| Field | Meaning |
|---|---|
| `mode` | `enforce` refuses; `observe` refuses nothing and reports what enforce would refuse (a dry run) |
| `budgets[].scope` | `global`, `user`, `feature`, `key` (a fingerprint of the caller's credential), `run` |
| `budgets[].window` | UTC `minute`, `hour`, `day`, `month`, or `total` |
| `budgets[].limitUsd` / `limitCalls` | dollar cap, call cap, or both |
| `breakers[].maxRepeats` | same model + input more than *n* times in `repeatWindowSec` |
| `breakers[].maxCallsPerMinute` / `maxSpendPerMinuteUsd` | rolling 60-second rate |
| `breakers[].cooldownSec` | how long an open breaker refuses calls in its scope |
| `holdTtlSec` | an unsettled hold is charged in full after this (default 600) |

Calls with no user, feature or run share one `(none)` bucket for that scope.
Anonymous traffic is capped too.

## Proxy

`node cli.mjs proxy policy.json [--port 8787] [--host 127.0.0.1] [--state guard-state.json]`

- Routes: `POST /anthropic/v1/messages` and `POST /openai/v1/chat/completions`
  (also the bare `/v1/...` paths). Streams pass through byte for byte. They
  are settled from the usage they report: OpenAI streams get
  `stream_options.include_usage` switched on. A stream that ends early is
  charged at its hold.
- Scope headers: `x-guard-user`, `x-guard-feature`, `x-guard-run`.
- Refusals use the provider's own error shape. **402** means a budget is
  spent (SDKs do not retry it). **429 + Retry-After** means a breaker is
  open. The `x-guard-blocked` header names the reason codes.
- Keys: with no upstream key set, each caller's own key is forwarded and
  never stored. If you set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` on the
  proxy, callers must send one of `GUARD_PROXY_TOKENS`. The proxy refuses to
  listen on a non-local interface with a held key and no tokens.
- Admin (with `GUARD_ADMIN_TOKEN` as a bearer token): `GET /guard/status`,
  `POST /guard/halt?reason=...` (a kill switch for every call),
  `POST /guard/resume`.
- Alerts: set `GUARD_WEBHOOK_URL` to POST budget alerts, breaker trips and
  halts as Slack-compatible `{"text": ...}`. It is off unless set.
- State: budget counters are written to `--state` (atomic rename) and
  survive restarts. One proxy per state file.

Docker: `docker build -t llm-spend-guard . && docker run -p 8787:8787 -v $PWD:/data llm-spend-guard`
(the image reads `/data/guard-policy.json` and listens on `0.0.0.0`, so set
`GUARD_PROXY_TOKENS` if you also set an upstream key).

## Library

```js
import { createGuard } from './guard.mjs';
const guard = createGuard(policy, { onEvent: (e) => console.log(e) });

const d = guard.check({ model, maxOutputTokens: 1024, input: messages, scope: { user, run } });
if (!d.allowed) throw new Error(d.reasons.map((r) => r.message).join('; '));
try {
  const r = await client.messages.create({ model, max_tokens: d.maxOutputTokens, messages });
  guard.settle(d.id, { input: r.usage.input_tokens, output: r.usage.output_tokens,
    cacheRead: r.usage.cache_read_input_tokens, cacheWrite: r.usage.cache_creation_input_tokens });
} catch (e) { guard.cancel(d.id); throw e; }
```

Or use `guard.guarded(req, run)`, which does all three. In this monorepo,
`platform/llm/byok.mjs`'s `complete()` takes the guard directly:
`complete(cfg, { prompt, guard, scope })`.

## Tests

```
node --test guard.test.mjs proxy.test.mjs cli.test.mjs page.test.mjs
```

The proxy tests run a fake provider on a real socket. Nothing touches the
network.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not financial, legal, security or
engineering advice, and it is not a billing system. It estimates cost from
the prices you configure and the usage providers report, and its figures can
differ from your invoice. Keep your provider's own spend limits on as well.
**You are responsible for reviewing and verifying its configuration and
output before relying on it.** To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.

## Privacy

The browser simulator runs entirely in your browser. Nothing you paste is
uploaded, and there are no accounts, cookies or analytics vendors. It counts
two anonymous feature events in local storage, and you can switch that off
on the page. The proxy runs where you run it. It talks only to the
providers' APIs (or the upstreams you set) and to your webhook if you set
one. It never stores prompts, responses or keys: the state file holds dollar
and call counters keyed by budget, scope value and window.

## Licence

MIT. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
Roadmap: [`ROADMAP.md`](ROADMAP.md).
