// Can this web page reach a model running on your own computer, and if not,
// why not? Probes Ollama, LM Studio and llama.cpp's llama-server (or any
// OpenAI-compatible URL) from the browser, the same way a web tool would, and
// names the one thing in the way with the command that fixes it.
//
// The diagnosis rests on one browser behaviour: a normal (CORS) request to a
// server that refuses this page's origin fails exactly like a request to a
// server that is not running. A second request in `no-cors` mode tells them
// apart: it is allowed to reach the server without reading the reply, so it
// succeeds when something is listening and fails when nothing is.
//
// Zero dependencies; `fetch` and the clock are injected so every branch runs
// under `node --test` with no network.

export const SERVERS = Object.freeze([
  { id: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
  { id: 'lmstudio', name: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
  { id: 'llamacpp', name: 'llama.cpp (llama-server)', baseUrl: 'http://localhost:8080/v1' },
]);

export const STATUSES = Object.freeze({
  ok: 'Working: this page can reach it and it has models',
  'no-models': 'Running and reachable, but no model is downloaded or loaded',
  blocked: 'Running, but it refuses requests from this page (CORS)',
  unreachable: 'Nothing answered: not running, wrong port, or the browser blocked local access',
  'mixed-content': 'Blocked by the browser: an https page cannot call a plain-http address on your network',
  'bad-url': 'That is not a usable URL',
  'http-error': 'Something answered, but not like an OpenAI-compatible model server',
});

/** True for addresses browsers treat as this machine (allowed from an https page). */
export function isLoopback(hostname) {
  const h = String(hostname).replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\./.test(h);
}

/** Accepts "localhost:11434", "http://box:1234", "http://box:1234/v1/"; returns ".../v1" or null. */
export function normaliseBaseUrl(input) {
  let s = String(input || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!u.hostname) return null;
  const path = u.pathname.replace(/\/+$/, '');
  return `${u.origin}${path.endsWith('/v1') ? path : `${path}/v1`}`;
}

function withTimeout(fetchImpl, timeoutMs) {
  return async (url, init = {}) => {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctl?.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { ...init, signal: ctl?.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * Probe one server. Resolves (never rejects) to
 * { provider, baseUrl, status, models, httpStatus? }.
 * `pageProtocol` is the probing page's own protocol ("https:" on the hosted site).
 */
export async function probe({ provider = 'custom', baseUrl, pageProtocol = 'https:', fetch: fetchImpl = globalThis.fetch, timeoutMs = 2500 } = {}) {
  const base = normaliseBaseUrl(baseUrl);
  const out = { provider, baseUrl: base || String(baseUrl || ''), status: 'bad-url', models: [] };
  if (!base) return out;
  const url = new URL(base);
  if (pageProtocol === 'https:' && url.protocol === 'http:' && !isLoopback(url.hostname)) {
    return { ...out, status: 'mixed-content' };
  }
  const get = withTimeout(fetchImpl, timeoutMs);
  let res;
  try {
    res = await get(`${base}/models`, { method: 'GET' });
  } catch {
    // Off, or on but refusing this origin: ask without reading the reply.
    try {
      await get(`${url.origin}/`, { method: 'GET', mode: 'no-cors' });
      return { ...out, status: 'blocked' };
    } catch {
      return { ...out, status: 'unreachable' };
    }
  }
  if (!res.ok) return { ...out, status: 'http-error', httpStatus: res.status };
  let data;
  try { data = await res.json(); } catch { return { ...out, status: 'http-error', httpStatus: res.status }; }
  if (!Array.isArray(data?.data)) return { ...out, status: 'http-error', httpStatus: res.status };
  const models = data.data.map(m => m?.id).filter(id => typeof id === 'string' && id);
  return { ...out, status: models.length ? 'ok' : 'no-models', models };
}

/** Probe the three default ports at once. */
export function probeAll(opts = {}) {
  return Promise.all(SERVERS.map(s => probe({ ...opts, provider: s.id, baseUrl: s.baseUrl })));
}

const OS_LABEL = { mac: 'macOS', linux: 'Linux', windows: 'Windows' };

/** Best guess from a user-agent string; the page lets the person change it. */
export function guessOs(userAgent = '') {
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'mac';
  return 'linux';
}

/**
 * What to do next, as { title, steps: [{ text, command? }] }. `origin` is the
 * probing page's own origin, which is what a server must allow.
 */
export function fixFor(result, { origin = 'https://duncan-haywood.github.io', os = 'mac' } = {}) {
  const p = result.provider;
  const port = (() => { try { return new URL(result.baseUrl).port; } catch { return ''; } })();
  const lnaStep = { text: 'If the server is running, your browser may be blocking this site from reaching your computer. Chrome asks for "local network access" the first time; if you dismissed it, allow it under the site settings (the icon left of the address bar), then probe again.' };

  if (result.status === 'ok') {
    return {
      title: `${serverName(p)} is ready`,
      steps: [{ text: `Pick ${serverName(p)} as the AI provider in any of the tools below and use one of these models: ${result.models.slice(0, 5).join(', ')}${result.models.length > 5 ? ', …' : ''}. No key is needed.` }],
    };
  }
  if (result.status === 'mixed-content') {
    return {
      title: 'Use localhost, or put the server behind https',
      steps: [
        { text: 'Browsers let an https page call http://localhost, but not a plain-http address elsewhere on your network. Run the tool on the computer that runs the model and use localhost.' },
        { text: 'To use a model on another machine, serve it over https (for example behind a reverse proxy with a certificate), or forward the port to this computer:', command: `ssh -N -L ${port || '11434'}:localhost:${port || '11434'} you@that-machine` },
      ],
    };
  }
  if (result.status === 'bad-url') {
    return { title: 'Check the address', steps: [{ text: 'Enter something like localhost:11434 or http://127.0.0.1:1234/v1.' }] };
  }
  if (result.status === 'http-error') {
    return {
      title: 'Something else is on that port',
      steps: [
        { text: `The server answered ${result.httpStatus ? `HTTP ${result.httpStatus}` : 'without a model list'} at ${result.baseUrl}/models. Check the port belongs to your model server and that its OpenAI-compatible API is on /v1.` },
      ],
    };
  }
  if (result.status === 'no-models') {
    if (p === 'ollama') return { title: 'Download a model', steps: [{ text: 'Pull a small model to start with, then probe again:', command: 'ollama pull llama3.2' }] };
    if (p === 'lmstudio') return { title: 'Load a model', steps: [{ text: 'Download a model in LM Studio and load it in the Developer tab, or from a terminal:', command: 'lms get llama-3.2-3b-instruct && lms load llama-3.2-3b-instruct' }] };
    return { title: 'Load a model', steps: [{ text: 'Start the server with a model file:', command: `llama-server -m path/to/model.gguf --port ${port || '8080'}` }] };
  }
  if (result.status === 'blocked') {
    if (p === 'ollama' || p === 'custom' && port === '11434') {
      const steps = {
        mac: [
          { text: 'If you use the Ollama app, set the allowed origin, then quit Ollama from the menu bar and open it again:', command: `launchctl setenv OLLAMA_ORIGINS "${origin}"` },
          { text: 'If you start it from a terminal instead:', command: `OLLAMA_ORIGINS="${origin}" ollama serve` },
        ],
        linux: [
          { text: 'If Ollama runs as a systemd service, add an override:', command: 'sudo systemctl edit ollama.service' },
          { text: 'In the editor, add these two lines and save:', command: `[Service]\nEnvironment="OLLAMA_ORIGINS=${origin}"` },
          { text: 'Then restart it:', command: 'sudo systemctl daemon-reload && sudo systemctl restart ollama' },
          { text: 'If you start it from a terminal instead:', command: `OLLAMA_ORIGINS="${origin}" ollama serve` },
        ],
        windows: [
          { text: 'Set the allowed origin for your user, then quit Ollama from the system tray and start it again:', command: `setx OLLAMA_ORIGINS "${origin}"` },
        ],
      }[os] || [];
      return {
        title: `Ollama is running but refuses ${origin} (${OS_LABEL[os] || os})`,
        steps: [
          { text: 'Ollama accepts requests only from pages on your own computer unless you allow others with OLLAMA_ORIGINS. Allow just this site (add more origins separated by commas).' },
          ...steps,
        ],
      };
    }
    if (p === 'lmstudio') {
      return {
        title: `LM Studio is running but refuses ${origin}`,
        steps: [
          { text: 'Turn on CORS: in LM Studio open the Developer tab, Server Settings, and switch on "Enable CORS". Or restart the server from a terminal:', command: 'lms server start --cors' },
          { text: 'CORS lets any website you visit call the server while it runs. Stop the server when you are done if that matters to you.' },
        ],
      };
    }
    return {
      title: 'Something is running but refuses this page',
      steps: [
        { text: 'llama-server allows other origins by default, so check that the port belongs to it. Other servers need their CORS setting to allow:', command: origin },
      ],
    };
  }
  // unreachable
  if (p === 'ollama') return { title: 'Start Ollama', steps: [{ text: 'Open the Ollama app, or from a terminal:', command: 'ollama serve' }, lnaStep] };
  if (p === 'lmstudio') return { title: 'Start the LM Studio server', steps: [{ text: 'In LM Studio open the Developer tab and start the server, or from a terminal:', command: 'lms server start --cors' }, lnaStep] };
  if (p === 'llamacpp') return { title: 'Start llama-server', steps: [{ text: 'From a terminal, with a model file:', command: 'llama-server -m path/to/model.gguf --port 8080' }, lnaStep] };
  return { title: 'Nothing answered at that address', steps: [{ text: 'Check the server is running and the port is right.' }, lnaStep] };
}

export function serverName(id) {
  return SERVERS.find(s => s.id === id)?.name || 'Your server';
}

/**
 * Send one short prompt and time it. `complete` is byok.mjs's, injected so the
 * page and the tests share the code path. Resolves to
 * { ok, text, ms, outputTokens, tokensPerSecond } or { ok: false, error }.
 * The first call after a model loads includes the load time, so the page
 * offers a second run.
 */
export async function testPrompt({ complete, provider, baseUrl, model, fetch: fetchImpl = globalThis.fetch, now = () => Date.now() }) {
  const started = now();
  try {
    const r = await complete(
      { provider: provider === 'custom' ? 'openai-compatible' : provider, baseUrl, model, browser: true },
      { prompt: 'In one sentence, what is a local language model?', maxTokens: 80, fetch: fetchImpl },
    );
    const ms = Math.max(1, now() - started);
    const outputTokens = r.usage?.output || 0;
    return { ok: true, text: r.text, ms, outputTokens, tokensPerSecond: outputTokens ? Math.round((outputTokens / ms) * 10000) / 10 : null };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/** Plain-text report to paste into an issue or a chat. */
export function reportText(results, { origin, os } = {}) {
  const lines = [`Local LLM connection check from ${origin || 'this page'}`];
  for (const r of results) {
    lines.push('', `${serverName(r.provider)} at ${r.baseUrl}: ${STATUSES[r.status] || r.status}`);
    if (r.models.length) lines.push(`  models: ${r.models.join(', ')}`);
    const fix = fixFor(r, { origin, os });
    if (r.status !== 'ok') {
      lines.push(`  next: ${fix.title}`);
      for (const s of fix.steps) if (s.command) lines.push(`    ${s.command.replace(/\n/g, '\n    ')}`);
    }
  }
  return lines.join('\n');
}
