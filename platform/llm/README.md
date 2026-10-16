# platform/llm: bring-your-own-key model calls

`byok.mjs` is the one model client ventures share. The person running the tool
brings the provider, the key and the model; the portfolio never holds a key.
It has no dependencies and uses plain `fetch`, so the same file works in a static page, a
Node server, an edge function and a Capacitor or Expo phone app.

| Provider | `provider` | Needs |
|---|---|---|
| Anthropic | `anthropic` | key; model defaults to `claude-opus-5-5` |
| OpenAI | `openai` | key, model |
| Google Gemini | `gemini` | key, model |
| Anything speaking `/chat/completions` (OpenRouter, Groq, Together, Mistral, local Ollama or LM Studio) | `openai-compatible` | `baseUrl`, model; key optional |

```js
import { complete, withFallback, configFromEnv } from '../../platform/llm/byok.mjs';

const cfg = configFromEnv(process.env);  // LLM_PROVIDER / LLM_MODEL / LLM_BASE_URL / LLM_API_KEY,
                                         // or ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY
const { value, source } = await withFallback(cfg,
  () => templateFollowUp(lead),                                   // always works, no key
  c => complete(c, { system: TONE, prompt: brief(lead) }).then(r => r.text));
```

Rules it encodes (PRODUCT_PLAYBOOK.md §3):

- **The deterministic path is the product.** `withFallback` returns it when no
  key is set or the call fails, and says which path ran (`source`) so the page
  can tell the user AI is off rather than degrade silently.
- **Keys stay with their owner.** In a page, pass `browser: true` and keep the
  key in the visitor's own browser storage; on a server, read it from the
  deployer's environment. Error messages never echo a provider's response
  body, which can reflect the request.
- **No stale third-party model ids.** Only Anthropic has a default; for the
  others the person names the model.

**Spend caps.** Pass an [LLM Spend Guard](../../ventures/llm-spend-guard/)
to cap what a feature can spend: `complete(cfg, { prompt, guard, scope: { user, feature } })`.
A call that would cross a budget is refused before it is sent (a `ByokError`
with `reasons`), the output cap is lowered to the policy's ceiling, and real
usage is charged afterwards. With a deployer's key on a server, this is what
stops one visitor or one loop from spending the month.

Tests: `node --test platform/llm/*.test.mjs` (no network; `fetch` is injected).
