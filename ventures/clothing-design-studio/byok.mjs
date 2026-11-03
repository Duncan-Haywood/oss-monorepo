// Bring-your-own-key model calls for any venture, any provider.
//
// Zero dependencies, plain `fetch`, so it runs unchanged in a browser page, in
// Node 18+, in a Cloudflare/Vercel/Deno function and inside a Capacitor or
// Expo app. The person using the tool supplies the provider, the key and the
// model; nothing here holds or forwards a key of ours (PRODUCT_PLAYBOOK.md §3,
// "The API-key switch"). Every caller keeps a deterministic path for when no
// key is set: `withFallback` makes that the default shape.
//
//   import { complete, withFallback, configFromEnv } from './byok.mjs';
//   const cfg = configFromEnv(process.env);            // or settings from the page
//   const text = await withFallback(cfg, () => templateEmail(lead),
//     c => complete(c, { system: SALES_SYSTEM, prompt: leadBrief(lead) }).then(r => r.text));
//
// Providers: `anthropic`, `openai`, `gemini`, `openai-compatible` (OpenRouter,
// Groq, Together, Mistral: anything that speaks /chat/completions), and three
// local servers that need no key and cost nothing per call: `ollama`,
// `lmstudio` and `llamacpp` (llama.cpp's llama-server), each preset to its
// default localhost port. Only Anthropic gets a default model; for the others
// the person names the model (or picks one from `listModels`/`detectLocal`),
// because a hard-coded model id goes stale.

export const PROVIDERS = Object.freeze({
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-opus-5-5', keyRequired: true },
  openai: { baseUrl: 'https://api.openai.com/v1', defaultModel: null, keyRequired: true },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: null, keyRequired: true },
  'openai-compatible': { baseUrl: null, defaultModel: null, keyRequired: false },
  // Local servers: the model runs on the person's own machine, so there is no
  // key and no per-call bill. All three speak the OpenAI wire format.
  ollama: { baseUrl: 'http://localhost:11434/v1', defaultModel: null, keyRequired: false, local: true },
  lmstudio: { baseUrl: 'http://localhost:1234/v1', defaultModel: null, keyRequired: false, local: true },
  llamacpp: { baseUrl: 'http://localhost:8080/v1', defaultModel: null, keyRequired: false, local: true },
});

export const LOCAL_PROVIDERS = Object.freeze(Object.keys(PROVIDERS).filter(p => PROVIDERS[p].local));

export class ByokError extends Error {
  constructor(message, { provider, status, retryable = false } = {}) {
    super(message);
    this.name = 'ByokError';
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
  }
}

/** Read a config from environment variables; null when nothing is configured. */
export function configFromEnv(env = {}) {
  const provider = env.LLM_PROVIDER
    || (env.ANTHROPIC_API_KEY && 'anthropic')
    || (env.OPENAI_API_KEY && 'openai')
    || (env.GEMINI_API_KEY && 'gemini')
    || (env.LLM_BASE_URL && 'openai-compatible')
    || (env.OLLAMA_HOST && 'ollama')
    || null;
  if (!provider) return null;
  const keyVar = {
    anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY',
  }[provider] || 'LLM_API_KEY';
  return normalise({
    provider,
    apiKey: env.LLM_API_KEY || env[keyVar] || null,
    model: env.LLM_MODEL || null,
    baseUrl: env.LLM_BASE_URL || (provider === 'ollama' ? ollamaBase(env.OLLAMA_HOST) : null),
  });
}

// OLLAMA_HOST is Ollama's own variable: "0.0.0.0", "127.0.0.1:11434" or a full URL.
function ollamaBase(host) {
  if (!host) return null;
  let h = host.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(h)) h = `http://${h}`;
  const u = new URL(h);
  if (u.hostname === '0.0.0.0') u.hostname = 'localhost';  // a bind address, not a destination
  if (!u.port && !/^https?:\/\/[^/]+:\d+/.test(h)) u.port = '11434';
  return `${u.origin}/v1`;
}

/** Validate and fill defaults; throws ByokError on a config that cannot work. */
export function normalise(cfg) {
  if (!cfg || typeof cfg !== 'object') throw new ByokError('no model provider configured');
  const spec = PROVIDERS[cfg.provider];
  if (!spec) {
    throw new ByokError(`unknown provider "${cfg.provider}"; use one of ${Object.keys(PROVIDERS).join(', ')}`);
  }
  const out = {
    provider: cfg.provider,
    apiKey: cfg.apiKey || null,
    model: cfg.model || spec.defaultModel,
    baseUrl: (cfg.baseUrl || spec.baseUrl || '').replace(/\/+$/, ''),
    browser: Boolean(cfg.browser),
  };
  if (!out.baseUrl) throw new ByokError(`${cfg.provider} needs a baseUrl`, { provider: cfg.provider });
  if (spec.keyRequired && !out.apiKey) throw new ByokError(`${cfg.provider} needs an API key`, { provider: cfg.provider });
  if (!out.model) throw new ByokError(`${cfg.provider} needs a model name`, { provider: cfg.provider });
  return out;
}

/**
 * True when the config's model runs on this machine or this network (a local
 * preset, or a baseUrl on localhost or a private address). A page can say
 * "nothing leaves your computer" only when this is true.
 */
export function isLocal(cfg) {
  let c;
  try { c = normalise(cfg); } catch { return false; }
  let host;
  try { host = new URL(c.baseUrl).hostname.replace(/^\[|\]$/g, ''); } catch { return false; }
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1'
    || /^(127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(host);
}

/** True when a usable config is present; the cheap check before showing AI features. */
export function isConfigured(cfg) {
  try { normalise(cfg); return true; } catch { return false; }
}

function request(cfg, { system, prompt, maxTokens }) {
  const { provider, apiKey, model, baseUrl } = cfg;
  if (provider === 'anthropic') {
    const headers = { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
    // A key the visitor typed into this page, sent from their own browser.
    if (cfg.browser) headers['anthropic-dangerous-direct-browser-access'] = 'true';
    return {
      url: `${baseUrl}/messages`,
      headers,
      body: { model, max_tokens: maxTokens, ...(system ? { system } : {}), messages: [{ role: 'user', content: prompt }] },
    };
  }
  if (provider === 'gemini') {
    return {
      url: `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      },
    };
  }
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  return {
    url: `${baseUrl}/chat/completions`,
    headers,
    body: {
      model,
      max_tokens: maxTokens,
      messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
    },
  };
}

function parse(provider, data) {
  if (provider === 'anthropic') {
    if (data.stop_reason === 'refusal') throw new ByokError('the model declined this request', { provider });
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const u = data.usage || {};
    return { text, usage: { input: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0), output: u.output_tokens || 0 } };
  }
  if (provider === 'gemini') {
    const parts = data.candidates?.[0]?.content?.parts || [];
    const u = data.usageMetadata || {};
    return { text: parts.map(p => p.text || '').join(''), usage: { input: u.promptTokenCount || 0, output: u.candidatesTokenCount || 0 } };
  }
  const u = data.usage || {};
  return { text: data.choices?.[0]?.message?.content || '', usage: { input: u.prompt_tokens || 0, output: u.completion_tokens || 0 } };
}

/**
 * One prompt in, text out, from whichever provider the person configured.
 * Resolves to { text, provider, model, usage: { input, output } }.
 *
 * `guard` is optional: anything with LLM Spend Guard's check/settle/cancel
 * (ventures/llm-spend-guard/guard.mjs). With one, the call is refused before
 * it is sent when it would cross a budget, its output cap may be lowered to
 * the policy ceiling, and its real usage is charged afterwards. `scope`
 * ({ user, feature, run }) says which budgets it counts against.
 */
export async function complete(config, { system = '', prompt, maxTokens = 2048, fetch: fetchImpl = globalThis.fetch, signal, guard = null, scope } = {}) {
  const cfg = normalise(config);
  if (typeof prompt !== 'string' || !prompt.trim()) throw new ByokError('prompt is empty', { provider: cfg.provider });
  let hold = null;
  if (guard) {
    const d = guard.check({ model: cfg.model, maxOutputTokens: maxTokens, input: { system, prompt }, scope });
    if (!d.allowed) {
      const err = new ByokError(`spend guard refused the call: ${d.reasons.map(r => r.message).join('; ')}`, { provider: cfg.provider });
      err.reasons = d.reasons;
      throw err;
    }
    hold = d.id;
    if (d.maxOutputTokens) maxTokens = d.maxOutputTokens;
  }
  const req = request(cfg, { system, prompt, maxTokens });
  let res;
  try {
    res = await fetchImpl(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal });
  } catch (err) {
    if (hold) guard.cancel(hold);
    throw new ByokError(`could not reach ${cfg.provider}: ${err.message}`, { provider: cfg.provider, retryable: true });
  }
  if (!res.ok) {
    if (hold) guard.cancel(hold);
    // Never echo the response body: some providers reflect the request, key included.
    throw new ByokError(`${cfg.provider} returned HTTP ${res.status}`, {
      provider: cfg.provider, status: res.status, retryable: res.status === 429 || res.status >= 500,
    });
  }
  let parsed;
  try {
    parsed = parse(cfg.provider, await res.json());
  } catch (err) {
    // The provider answered, so it may have billed: charge the hold.
    if (hold) guard.settle(hold, null);
    throw err;
  }
  if (hold) guard.settle(hold, parsed.usage);
  return { text: parsed.text, provider: cfg.provider, model: cfg.model, usage: parsed.usage };
}

/**
 * The models a provider offers, as an array of ids, so a page can offer a
 * picker instead of a free-text box. Needs no model in the config. For a local
 * server these are the models the person has already downloaded.
 */
export async function listModels(config, { fetch: fetchImpl = globalThis.fetch, signal } = {}) {
  const cfg = normalise({ model: 'x', ...config });
  const { provider, apiKey, baseUrl } = cfg;
  const headers = {};
  if (provider === 'anthropic') {
    Object.assign(headers, { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' });
    if (cfg.browser) headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else if (provider === 'gemini') headers['x-goog-api-key'] = apiKey;
  else if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  let res;
  try {
    res = await fetchImpl(`${baseUrl}/models`, { method: 'GET', headers, signal });
  } catch (err) {
    throw new ByokError(`could not reach ${provider}: ${err.message}`, { provider, retryable: true });
  }
  if (!res.ok) throw new ByokError(`${provider} returned HTTP ${res.status}`, { provider, status: res.status });
  const data = await res.json();
  if (provider === 'gemini') return (data.models || []).map(m => String(m.name || '').replace(/^models\//, '')).filter(Boolean);
  return (data.data || []).map(m => m.id).filter(Boolean);
}

/**
 * Probe the default ports of the local servers (Ollama, LM Studio, llama.cpp)
 * and resolve to the ones that answered: [{ provider, baseUrl, models }].
 * Never rejects; a server that is off, slow or blocks this page's origin
 * (CORS) is simply absent. Each probe gives up after `timeoutMs`.
 */
export async function detectLocal({ fetch: fetchImpl = globalThis.fetch, timeoutMs = 1500 } = {}) {
  const probes = LOCAL_PROVIDERS.map(async provider => {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctl?.abort(), timeoutMs);
    try {
      const models = await listModels({ provider }, { fetch: fetchImpl, signal: ctl?.signal });
      return { provider, baseUrl: PROVIDERS[provider].baseUrl, models };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  });
  return (await Promise.all(probes)).filter(Boolean);
}

/**
 * The shape every AI feature should take: the deterministic result when no
 * key is configured or the call fails, the model's result otherwise.
 * Resolves to { value, source: 'model' | 'fallback', error? }.
 */
export async function withFallback(config, deterministic, viaModel) {
  if (!isConfigured(config)) return { value: await deterministic(), source: 'fallback' };
  try {
    return { value: await viaModel(normalise(config)), source: 'model' };
  } catch (error) {
    return { value: await deterministic(), source: 'fallback', error: error.message };
  }
}
