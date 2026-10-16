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
// Providers: `anthropic`, `openai`, `gemini`, and `openai-compatible` (OpenRouter,
// Groq, Together, Mistral, a local Ollama or LM Studio: anything that speaks
// /chat/completions). Only Anthropic gets a default model; for the others the
// person names the model, because a hard-coded third-party model id goes stale.

export const PROVIDERS = Object.freeze({
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', defaultModel: 'claude-opus-5-5', keyRequired: true },
  openai: { baseUrl: 'https://api.openai.com/v1', defaultModel: null, keyRequired: true },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: null, keyRequired: true },
  'openai-compatible': { baseUrl: null, defaultModel: null, keyRequired: false },
});

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
    || null;
  if (!provider) return null;
  const keyVar = {
    anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY',
    'openai-compatible': 'LLM_API_KEY',
  }[provider];
  return normalise({
    provider,
    apiKey: env.LLM_API_KEY || env[keyVar] || null,
    model: env.LLM_MODEL || null,
    baseUrl: env.LLM_BASE_URL || null,
  });
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
 */
export async function complete(config, { system = '', prompt, maxTokens = 2048, fetch: fetchImpl = globalThis.fetch, signal } = {}) {
  const cfg = normalise(config);
  if (typeof prompt !== 'string' || !prompt.trim()) throw new ByokError('prompt is empty', { provider: cfg.provider });
  const req = request(cfg, { system, prompt, maxTokens });
  let res;
  try {
    res = await fetchImpl(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body), signal });
  } catch (err) {
    throw new ByokError(`could not reach ${cfg.provider}: ${err.message}`, { provider: cfg.provider, retryable: true });
  }
  if (!res.ok) {
    // Never echo the response body: some providers reflect the request, key included.
    throw new ByokError(`${cfg.provider} returned HTTP ${res.status}`, {
      provider: cfg.provider, status: res.status, retryable: res.status === 429 || res.status >= 500,
    });
  }
  const { text, usage } = parse(cfg.provider, await res.json());
  return { text, provider: cfg.provider, model: cfg.model, usage };
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
