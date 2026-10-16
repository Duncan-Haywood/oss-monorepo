// What the guard needs from each provider's wire format: the model, the
// output cap, the input to estimate, and the usage the response reports
// (whole JSON or a server-sent-event stream). Pure functions, no I/O.

export const PROVIDERS = Object.freeze({
  anthropic: {
    path: '/v1/messages',
    defaultBaseUrl: 'https://api.anthropic.com',
    capField: 'max_tokens',
  },
  openai: {
    path: '/v1/chat/completions',
    defaultBaseUrl: 'https://api.openai.com',
    capField: 'max_completion_tokens',
  },
});

/** Pull { model, maxOutputTokens, input, stream } out of a request body. */
export function describeRequest(provider, body) {
  const b = body && typeof body === 'object' ? body : {};
  if (provider === 'anthropic') {
    return {
      model: b.model,
      maxOutputTokens: b.max_tokens,
      input: { system: b.system, messages: b.messages, tools: b.tools },
      stream: b.stream === true,
    };
  }
  return {
    model: b.model,
    // max_tokens is the older name; when both are sent the newer one wins upstream.
    maxOutputTokens: b.max_completion_tokens ?? b.max_tokens,
    input: { messages: b.messages, tools: b.tools },
    stream: b.stream === true,
  };
}

/**
 * The body to forward: the guard's output cap written in, and on an OpenAI
 * stream `include_usage` switched on so the final chunk reports what was used.
 */
export function rewriteRequest(provider, body, maxOutputTokens) {
  const out = { ...body };
  if (maxOutputTokens != null) {
    if (provider === 'anthropic') out.max_tokens = maxOutputTokens;
    else {
      if ('max_tokens' in out && !('max_completion_tokens' in out)) out.max_tokens = maxOutputTokens;
      else out.max_completion_tokens = maxOutputTokens;
    }
  }
  if (provider === 'openai' && out.stream === true) {
    out.stream_options = { ...(out.stream_options ?? {}), include_usage: true };
  }
  return out;
}

/** Usage from a non-streamed response, as { input, output, cacheRead, cacheWrite }, or null. */
export function usageFromResponse(provider, data) {
  const u = data?.usage;
  if (!u || typeof u !== 'object') return null;
  if (provider === 'anthropic') {
    return {
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
    };
  }
  // OpenAI's prompt_tokens includes the cached part; split it out so cached
  // tokens are priced at the cache rate, not twice.
  const prompt = u.prompt_tokens ?? u.input_tokens ?? 0;
  const cached = u.prompt_tokens_details?.cached_tokens ?? u.input_tokens_details?.cached_tokens ?? 0;
  return {
    input: Math.max(0, prompt - cached),
    output: u.completion_tokens ?? u.output_tokens ?? 0,
    cacheRead: cached,
    cacheWrite: 0,
  };
}

/**
 * Incremental SSE reader that accumulates usage while the bytes pass through
 * untouched. Feed it text chunks with push(); usage() is null until the stream
 * has reported any.
 *   Anthropic: message_start carries input and cache counts, message_delta the
 *   running output count. OpenAI: the last chunk carries `usage` when
 *   stream_options.include_usage is on.
 */
export function streamUsageReader(provider) {
  let buf = '';
  let usage = null;
  const onData = (json) => {
    let ev;
    try { ev = JSON.parse(json); } catch { return; }
    if (provider === 'anthropic') {
      if (ev.type === 'message_start' && ev.message?.usage) {
        usage = { ...(usage ?? { output: 0 }), ...usageFromResponse('anthropic', ev.message) };
      } else if (ev.type === 'message_delta' && ev.usage) {
        usage = { input: 0, cacheRead: 0, cacheWrite: 0, ...(usage ?? {}), output: ev.usage.output_tokens ?? usage?.output ?? 0 };
      }
    } else if (ev.usage) {
      usage = usageFromResponse('openai', ev);
    }
  };
  return {
    push(text) {
      buf += text;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (line.startsWith('data:')) {
          const payload = line.slice(5).trim();
          if (payload && payload !== '[DONE]') onData(payload);
        }
      }
    },
    usage: () => usage,
  };
}

/** A refusal body in the provider's own error shape, so its SDK raises a normal API error. */
export function blockedBody(provider, decision) {
  const message = `LLM Spend Guard refused this call: ${decision.reasons.map((r) => r.message).join('; ')}`;
  const code = decision.reasons[0]?.code ?? 'blocked';
  if (provider === 'anthropic') return { type: 'error', error: { type: 'spend_guard_blocked', code, message } };
  return { error: { message, type: 'spend_guard_blocked', code, param: null } };
}
