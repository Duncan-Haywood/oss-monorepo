# platform/llm: bring-your-own-key or local model calls

`byok.mjs` is the one model client ventures share. The person running the tool
brings the provider, the key and the model, or points it at a model running on
their own computer (Ollama, LM Studio, llama.cpp) with no key at all; the
portfolio never holds a key.
It has no dependencies and uses plain `fetch`, so the same file works in a static page, a
Node server, an edge function and a Capacitor or Expo phone app.

| Provider | `provider` | Needs |
|---|---|---|
| Anthropic | `anthropic` | key; model defaults to `claude-opus-5-5` |
| OpenAI | `openai` | key, model |
| Google Gemini | `gemini` | key, model |
| Anything speaking `/chat/completions` (OpenRouter, Groq, Together, Mistral) | `openai-compatible` | `baseUrl`, model; key optional |
| [Ollama](https://ollama.com) on this machine | `ollama` | model; no key (`http://localhost:11434/v1`) |
| [LM Studio](https://lmstudio.ai) on this machine | `lmstudio` | model; no key (`http://localhost:1234/v1`) |
| [llama.cpp](https://github.com/ggml-org/llama.cpp) `llama-server` on this machine | `llamacpp` | model; no key (`http://localhost:8080/v1`) |

```js
import { complete, withFallback, configFromEnv } from '../../platform/llm/byok.mjs';

const cfg = configFromEnv(process.env);  // LLM_PROVIDER / LLM_MODEL / LLM_BASE_URL / LLM_API_KEY,
                                         // or ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY
const { value, source } = await withFallback(cfg,
  () => templateFollowUp(lead),                                   // always works, no key
  c => complete(c, { system: TONE, prompt: brief(lead) }).then(r => r.text));
```

## Local models: no key, no bill, nothing leaves the machine

The three local presets are the same OpenAI wire format with the right default
port, so a page or server can offer "a model on your own computer" next to the
hosted providers. Pass `baseUrl` to reach one on another port or another box on
the network.

```js
import { detectLocal, listModels, isLocal } from '../../platform/llm/byok.mjs';

const found = await detectLocal();   // [{ provider: 'ollama', baseUrl, models: ['llama3.2', ...] }]
const models = await listModels({ provider: 'lmstudio' });   // works for hosted providers too
isLocal(cfg);                        // true for localhost and private addresses: say "stays on your computer"
```

On a server, `LLM_PROVIDER=ollama` (or `lmstudio`, `llamacpp`) plus `LLM_MODEL`
is enough; Ollama's own `OLLAMA_HOST` is read too. From inside a container, use
`LLM_BASE_URL=http://host.docker.internal:11434/v1`.

From a page served on the web (the GitHub Pages catalogue), the visitor's
browser calls `http://localhost` directly. Three things decide whether that works,
and the page should say them:

- **CORS.** Ollama accepts only its own local origins by default; start it with
  `OLLAMA_ORIGINS=https://duncan-haywood.github.io` (or the deployer's origin).
  LM Studio has a CORS switch in its server settings. `llama-server` answers
  cross-origin requests by default.
- **Local network permission.** Recent Chrome versions ask the visitor before a
  public site can reach `localhost` or the local network.
- **Mixed content.** Browsers treat `http://localhost` as secure, so an https
  page may call it; a LAN address over plain http is blocked from an https page.
  Use the server path, or put the local server behind https, for that.

`detectLocal` reports a server that refuses this page's origin the same as one
that is off, so a page that finds nothing should show the setup line above
rather than "no local model".

**Images and video.** No venture generates images or video yet. When one does,
the same rule holds (PRODUCT_PLAYBOOK.md §3): a local server (ComfyUI, Stable
Diffusion WebUI, LocalAI's `/images/generations`) is offered next to any hosted
API, and the main flow needs neither. Add the client here when that first
caller exists, not before.

## Rules it encodes (PRODUCT_PLAYBOOK.md §3)

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
