// Claude Platform on AWS through the first-party SDK + SigV4 fetch: the request that leaves the
// Worker must be the first-party request byte for byte, sent to the AWS endpoint with the
// workspace header and a valid SigV4 signature, and no API key.
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AnthropicLlm } from "./anthropic-llm";
import { signRequest } from "./aws-sigv4";
import { claudeOnAwsBaseUrl, createClaudeOnAwsClient } from "./claude-on-aws";

const NOW = new Date("2026-11-24T09:15:30Z");
const CREDS = {
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  sessionToken: "FQoGZXIvYXdzEXAMPLETOKEN",
};

function message(text: string) {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 10,
      cache_read_input_tokens: 50,
      cache_creation_input_tokens: 0,
    },
  };
}

type Call = { url: string; method: string; headers: Headers; body: string };

function transport(respond: () => Response) {
  const calls: Call[] = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      body: String(init?.body ?? ""),
    });
    return respond();
  };
  return { calls, fetchImpl };
}

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });

const REQ = {
  purpose: "drafting.section",
  system: "You draft grant sections.",
  context: "FACTS: ...",
  prompt: "Write the need statement.",
};

describe("createClaudeOnAwsClient", () => {
  it("sends the first-party request unchanged to the AWS endpoint, signed, with the workspace id", async () => {
    const aws = transport(() => json(message("hello")));
    const first = transport(() => json(message("hello")));
    const awsLlm = new AnthropicLlm({
      defaultModel: "claude-opus-5-5",
      client: createClaudeOnAwsClient({
        region: "us-west-2",
        workspaceId: "wrkspc_test123",
        credentials: CREDS,
        fetchImpl: aws.fetchImpl,
        now: () => NOW,
      }),
    });
    const firstLlm = new AnthropicLlm({
      defaultModel: "claude-opus-5-5",
      client: new Anthropic({ apiKey: "sk-test", fetch: first.fetchImpl }),
    });

    const res = await awsLlm.generateText(REQ);
    await firstLlm.generateText(REQ);
    expect(res.text).toBe("hello");
    expect(res.usage.model).toBe("claude-opus-5-5");
    expect(res.usage.cacheReadTokens).toBe(50);

    const a = aws.calls[0] as Call;
    const f = first.calls[0] as Call;
    expect(a.url).toBe("https://aws-external-anthropic.us-west-2.api.aws/v1/messages");
    expect(f.url).toBe("https://api.anthropic.com/v1/messages");
    expect(a.method).toBe("POST");
    // Same body: model id bare, fallbacks "default", caching and effort exactly as first party.
    expect(a.body).toBe(f.body);
    const body = JSON.parse(a.body);
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.fallbacks).toBe("default");
    expect(body.output_config).toEqual({ effort: "medium" });

    expect(a.headers.get("anthropic-workspace-id")).toBe("wrkspc_test123");
    expect(a.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(a.headers.get("x-api-key")).toBeNull();
    expect(a.headers.get("x-amz-security-token")).toBe(CREDS.sessionToken);
    const auth = a.headers.get("authorization") ?? "";
    expect(auth).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20261124\/us-west-2\/aws-external-anthropic\/aws4_request, SignedHeaders=[^,]*anthropic-workspace-id[^,]*, Signature=[0-9a-f]{64}$/,
    );
    // The signature verifies over what was actually sent.
    const resigned = await signRequest({
      method: a.method,
      url: a.url,
      headers: a.headers,
      body: a.body,
      service: "aws-external-anthropic",
      region: "us-west-2",
      credentials: CREDS,
      date: NOW,
    });
    expect(resigned.get("authorization")).toBe(auth);
  });

  it("works for structured output (beta.messages.parse) too", async () => {
    const aws = transport(() => json(message('{"score":7}')));
    const llm = new AnthropicLlm({
      defaultModel: "claude-opus-5-5",
      client: createClaudeOnAwsClient({
        region: "eu-west-1",
        workspaceId: "wrkspc_x",
        credentials: CREDS,
        fetchImpl: aws.fetchImpl,
      }),
    });
    const res = await llm.generateStructured({ ...REQ, schema: z.object({ score: z.number() }) });
    expect(res.data).toEqual({ score: 7 });
    expect(JSON.parse((aws.calls[0] as Call).body).output_config.format.type).toBe("json_schema");
  });

  it("surfaces AWS errors as the SDK's typed errors", async () => {
    const aws = transport(() =>
      json({ type: "error", error: { type: "overloaded_error", message: "busy" } }, 503),
    );
    const client = createClaudeOnAwsClient({
      region: "us-east-1",
      workspaceId: "wrkspc_x",
      credentials: CREDS,
      maxRetries: 0,
      fetchImpl: aws.fetchImpl,
    });
    const llm = new AnthropicLlm({ defaultModel: "claude-opus-5-5", client });
    await expect(llm.generateText(REQ)).rejects.toBeInstanceOf(Anthropic.InternalServerError);
  });

  it("refuses missing settings and region values that are not AWS regions", () => {
    const ok = { region: "us-east-1", workspaceId: "w", credentials: CREDS };
    expect(() => createClaudeOnAwsClient({ ...ok, workspaceId: " " })).toThrow(/workspace id/);
    expect(() =>
      createClaudeOnAwsClient({ ...ok, credentials: { accessKeyId: "", secretAccessKey: "" } }),
    ).toThrow(/AWS credentials/);
    expect(() => createClaudeOnAwsClient({ ...ok, region: "x.evil.com" })).toThrow(/region/);
    expect(claudeOnAwsBaseUrl("ap-southeast-2")).toBe(
      "https://aws-external-anthropic.ap-southeast-2.api.aws",
    );
  });
});
