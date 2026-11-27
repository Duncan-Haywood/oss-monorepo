// @ts-check
// LLM port for the paid layer. Proprietary (see ../LICENSE).
//
// Every model call goes through `llm.complete({ purpose, ... })` with a dotted purpose, so tests
// and the offline demo use FakeLlm (fake-llm.mjs) and never need an API key. The model only ever
// *explains* a finding the deterministic checker already produced; it never decides validity.
//
// The real adapter wraps an `@anthropic-ai/sdk` client. The SDK is not a dependency of this
// folder (the imported venture is zero-dependency); `loadLlmFromEnv` imports it lazily and returns
// null when it is absent or no key is set, and the explainer then falls back to the checker's own
// English text. Model: env LLM_MODEL, default claude-haiku-5-5 (the repository's cheapest-model rule,
// CLAUDE.md: explaining one finding in plain words is a small task; move up only if evals show Haiku
// gets it wrong). Haiku has no server-side refusal fallback, so the fallback beta is sent only to
// models that offer one.

export const DEFAULT_MODEL = "claude-haiku-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * @typedef {{ purpose: string, system: string, prompt: string, schema: Record<string, unknown>, maxTokens?: number }} LlmRequest
 * @typedef {{ model: string, inputTokens: number, outputTokens: number }} LlmUsage
 * @typedef {{ complete(req: LlmRequest): Promise<{ data: unknown, usage: LlmUsage }> }} Llm
 */

export class LlmError extends Error {
  /** @param {string} purpose @param {string} message */
  constructor(purpose, message) {
    super(`${purpose}: ${message}`);
    this.name = "LlmError";
    this.purpose = purpose;
  }
}

/**
 * Minimal shape of the SDK client this adapter uses.
 * @typedef {{ beta: { messages: { create(params: Record<string, unknown>): Promise<any> } } }} SdkClient
 */

/** Whether the model takes the server-side refusal fallback (Haiku does not). @param {string} model */
export function supportsServerFallback(model) {
  return !model.startsWith("claude-haiku");
}

/** @implements {Llm} */
export class AnthropicLlm {
  /** @param {{ client: SdkClient, model?: string }} opts */
  constructor(opts) {
    this.client = opts.client;
    this.model = opts.model || DEFAULT_MODEL;
  }

  /** @param {LlmRequest} req */
  async complete(req) {
    const msg = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 2000,
      // Stable instructions first and cached; the volatile finding goes last.
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: [{ type: "text", text: req.prompt }] }],
      output_config: { effort: "low", format: { type: "json_schema", schema: req.schema } },
      ...(supportsServerFallback(this.model) ? { betas: [FALLBACK_BETA], fallbacks: "default" } : {}),
    });
    if (msg.stop_reason === "refusal") throw new LlmError(req.purpose, "model declined");
    if (msg.stop_reason === "max_tokens") throw new LlmError(req.purpose, "output truncated");
    const text = (msg.content ?? [])
      .filter((/** @type {{type: string}} */ b) => b.type === "text")
      .map((/** @type {{text: string}} */ b) => b.text)
      .join("");
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new LlmError(req.purpose, "output is not JSON");
    }
    const u = msg.usage ?? {};
    return {
      data,
      usage: { model: msg.model ?? this.model, inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0 },
    };
  }
}

/**
 * The real adapter when ANTHROPIC_API_KEY is set and the SDK is installed, else null.
 * @param {Record<string, string | undefined>} env
 * @returns {Promise<Llm | null>}
 */
export async function loadLlmFromEnv(env) {
  if (env.FAKE_LLM === "true") {
    const { FakeLlm } = await import("./fake-llm.mjs");
    return new FakeLlm();
  }
  if (!env.ANTHROPIC_API_KEY) return null;
  try {
    const sdkName = "@anthropic-ai/sdk";
    const mod = await import(sdkName);
    const Anthropic = mod.default ?? mod.Anthropic;
    return new AnthropicLlm({ client: new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 }), model: env.LLM_MODEL });
  } catch {
    return null;
  }
}
