// Real LLM adapter: Claude via the official Anthropic SDK.
// - Structured outputs (Zod) via beta.messages.parse + betaZodOutputFormat
// - Server-side refusal fallback opted in (`fallbacks: "default"`) except on Haiku models, which have
//   none (a decline stays declined; we surface it as LlmRefusalError either way)
// - Prompt caching on the stable system + context blocks
// - Adaptive thinking is on by default (claude-haiku-5-5, the default, and claude-opus-5-5); depth
//   is controlled with output_config.effort
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  type LlmClient,
  LlmOutputError,
  LlmRefusalError,
  type LlmRequestBase,
  type LlmUsage,
  type StructuredRequest,
} from "./llm";
import { costMicros } from "./llm-pricing";

export interface AnthropicLlmOptions {
  /** Omit to let the SDK resolve credentials (e.g. Workload Identity Federation env vars). */
  apiKey?: string;
  defaultModel: string;
  /** Per-purpose model overrides, e.g. { "matching.score": "claude-haiku-5-5" }. */
  modelByPurpose?: Record<string, string>;
  onUsage?: (
    purpose: string,
    usage: LlmUsage,
    req: LlmRequestBase,
    error?: string,
  ) => Promise<void> | void;
}

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Haiku models have no server-side refusal fallback; every other current model does. */
export const supportsServerFallback = (model: string) => !model.startsWith("claude-haiku-");

export class AnthropicLlm implements LlmClient {
  private client: Anthropic;

  constructor(private readonly opts: AnthropicLlmOptions) {
    this.client = new Anthropic(
      opts.apiKey ? { apiKey: opts.apiKey, maxRetries: 3 } : { maxRetries: 3 },
    );
  }

  private modelFor(purpose: string) {
    return this.opts.modelByPurpose?.[purpose] ?? this.opts.defaultModel;
  }

  private buildParams(req: LlmRequestBase, model: string) {
    const system: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: "text", text: req.system, cache_control: { type: "ephemeral" } },
    ];
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (req.context) {
      content.push({ type: "text", text: req.context, cache_control: { type: "ephemeral" } });
    }
    content.push({ type: "text", text: req.prompt });
    return {
      model,
      max_tokens: req.maxTokens ?? 16000,
      system,
      messages: [{ role: "user" as const, content }],
      ...(supportsServerFallback(model)
        ? { betas: [FALLBACK_BETA], fallbacks: "default" as const }
        : {}),
    };
  }

  private usageOf(msg: Anthropic.Beta.BetaMessage, model: string, started: number): LlmUsage {
    const u = msg.usage;
    const tokens = {
      inputTokens: u.input_tokens ?? 0,
      outputTokens: u.output_tokens ?? 0,
      cacheReadTokens: u.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
    };
    return {
      model: msg.model ?? model,
      ...tokens,
      costMicros: costMicros(msg.model ?? model, tokens),
      latencyMs: Date.now() - started,
      stopReason: msg.stop_reason ?? null,
    };
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<{ data: T; usage: LlmUsage }> {
    const model = this.modelFor(req.purpose);
    const started = Date.now();
    const msg = await this.client.beta.messages.parse({
      ...this.buildParams(req, model),
      output_config: {
        effort: req.effort ?? "high",
        format: betaZodOutputFormat(req.schema as never),
      },
    });
    const usage = this.usageOf(msg, model, started);
    await this.opts.onUsage?.(req.purpose, usage, req);
    if (msg.stop_reason === "refusal") {
      throw new LlmRefusalError(req.purpose, msg.stop_details?.category ?? null);
    }
    if (msg.stop_reason === "max_tokens") {
      throw new LlmOutputError(req.purpose, "output truncated at max_tokens");
    }
    const parsed = msg.parsed_output as T | null | undefined;
    if (parsed == null) throw new LlmOutputError(req.purpose, "structured output failed to parse");
    return { data: parsed, usage };
  }

  async generateText(req: LlmRequestBase): Promise<{ text: string; usage: LlmUsage }> {
    const model = this.modelFor(req.purpose);
    const started = Date.now();
    const msg = await this.client.beta.messages.create({
      ...this.buildParams(req, model),
      output_config: { effort: req.effort ?? "medium" },
    });
    const usage = this.usageOf(msg, model, started);
    await this.opts.onUsage?.(req.purpose, usage, req);
    if (msg.stop_reason === "refusal") {
      throw new LlmRefusalError(req.purpose, msg.stop_details?.category ?? null);
    }
    const text = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { text, usage };
  }
}
