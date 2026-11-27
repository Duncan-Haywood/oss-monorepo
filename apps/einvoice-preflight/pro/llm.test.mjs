// The real adapter's request shape, against a recording client (no network, no key).
// FSL-1.1-MIT (see ../LICENSE, part 2).
import assert from "node:assert/strict";
import { test } from "node:test";
import { AnthropicLlm, DEFAULT_MODEL, supportsServerFallback } from "./llm.mjs";

function recordingClient() {
  /** @type {Record<string, unknown>[]} */
  const calls = [];
  const client = {
    beta: {
      messages: {
        /** @param {Record<string, unknown>} params */
        async create(params) {
          calls.push(params);
          return {
            model: params.model,
            stop_reason: "end_turn",
            content: [{ type: "text", text: '{"ok":true}' }],
            usage: { input_tokens: 3, output_tokens: 2 },
          };
        },
      },
    },
  };
  return { client, calls };
}

const REQ = { purpose: "explain.rule", system: "s", prompt: "p", schema: { type: "object" } };

test("defaults to the cheapest model (repository rule) and sends no fallback beta to it", async () => {
  assert.equal(DEFAULT_MODEL, "claude-haiku-5-5");
  const { client, calls } = recordingClient();
  const out = await new AnthropicLlm({ client }).complete(REQ);
  assert.deepEqual(out.data, { ok: true });
  assert.equal(calls[0].model, "claude-haiku-5-5");
  assert.equal("fallbacks" in calls[0], false);
  assert.equal("betas" in calls[0], false);
});

test("a model with a server-side refusal fallback gets it", async () => {
  assert.equal(supportsServerFallback("claude-sonnet-5-5"), true);
  const { client, calls } = recordingClient();
  await new AnthropicLlm({ client, model: "claude-sonnet-5-5" }).complete(REQ);
  assert.equal(calls[0].fallbacks, "default");
  assert.deepEqual(calls[0].betas, ["server-side-fallback-2026-07-01"]);
});
