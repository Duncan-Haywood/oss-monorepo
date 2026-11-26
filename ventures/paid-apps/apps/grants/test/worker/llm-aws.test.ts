// Claude Platform on AWS in the Workers runtime: the SDK subclass and the WebCrypto signer run in
// workerd (no Node credential chain), and LLM_PROVIDER switches the composition root's client.
// The AWS endpoint is stubbed; nothing leaves the machine.
import { AnthropicLlm } from "@worker/ports/anthropic-llm";
import { createClaudeOnAwsClient } from "@worker/ports/claude-on-aws";
import { createLlmFromEnv } from "@worker/ports/provider-switch";
import { describe, expect, it } from "vitest";

const reply = () =>
  new Response(
    JSON.stringify({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 3, output_tokens: 1 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("Claude Platform on AWS in workerd", () => {
  it("signs and sends a Messages call", async () => {
    const seen: { url: string; headers: Headers }[] = [];
    const llm = new AnthropicLlm({
      defaultModel: "claude-opus-5-5",
      client: createClaudeOnAwsClient({
        region: "us-east-1",
        workspaceId: "wrkspc_test",
        credentials: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "test-secret" },
        fetchImpl: async (url, init) => {
          seen.push({ url: String(url), headers: new Headers(init?.headers) });
          return reply();
        },
      }),
    });
    const res = await llm.generateText({ purpose: "test.ping", system: "s", prompt: "p" });
    expect(res.text).toBe("ok");
    expect(seen[0]?.url).toBe("https://aws-external-anthropic.us-east-1.api.aws/v1/messages");
    expect(seen[0]?.headers.get("anthropic-workspace-id")).toBe("wrkspc_test");
    expect(seen[0]?.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
  });

  it("LLM_PROVIDER=aws builds the AWS client from Worker env values", async () => {
    let calls = 0;
    const llm = createLlmFromEnv(
      {
        LLM_MODEL: "claude-opus-5-5",
        LLM_PROVIDER: "aws",
        AWS_ACCESS_KEY_ID: "AKIDEXAMPLE",
        AWS_SECRET_ACCESS_KEY: "test-secret",
        AWS_REGION: "us-west-2",
        ANTHROPIC_AWS_WORKSPACE_ID: "wrkspc_test",
      },
      {
        logger: { warn: () => {} },
        awsFetch: async () => {
          calls++;
          return reply();
        },
      },
    );
    expect(
      (await llm?.generateText({ purpose: "test.ping", system: "s", prompt: "p" }))?.text,
    ).toBe("ok");
    expect(calls).toBe(1);
  });
});
