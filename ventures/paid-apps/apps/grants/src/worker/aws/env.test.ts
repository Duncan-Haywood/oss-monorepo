import { describe, expect, it } from "vitest";
import { buildGrantsEnv, parseAppSecret, type StarterEnv } from "./env";
import { withTrustedClientIp } from "./lambda-app";
import type { PgPool } from "./pg-d1";

const pool = {
  query: async () => ({ rows: [], rowCount: 0 }),
  connect: async () => ({}),
} as unknown as PgPool;
const bucket = {} as NonNullable<StarterEnv["BUCKET"]>;

describe("AWS env", () => {
  it("parses the app secret and refuses keys that would replace a binding", () => {
    expect(parseAppSecret('{"AUTH_SECRET":"s","BILLING_API_KEY":"k"}')).toEqual({
      AUTH_SECRET: "s",
      BILLING_API_KEY: "k",
    });
    expect(() => parseAppSecret('{"DB":"x"}')).toThrow(/disallowed key: DB/);
    expect(() => parseAppSecret('{"lower":"x"}')).toThrow(/disallowed/);
    expect(() => parseAppSecret('{"A":1}')).toThrow(/must be a string/);
    expect(() => parseAppSecret("[]")).toThrow(/JSON object/);
  });

  it("merges vars, passthrough env and secrets, and wires the AWS bindings", async () => {
    const names: string[] = [];
    const starter: StarterEnv = {
      pg: pool,
      BUCKET: bucket,
      VARS: { APP_ENV: "production", GRANTS_SECRET_NAME: "grants/app", DB: "ignored" },
      secret: async (n) => {
        names.push(n);
        return '{"AUTH_SECRET":"from-secret"}';
      },
    };
    const env = await buildGrantsEnv(starter, {
      LLM_PROVIDER: "aws",
      AWS_REGION: "us-east-1",
      PATH: "/bin",
    });
    expect(names).toEqual(["grants/app"]);
    expect(env.APP_ENV).toBe("production");
    expect(env.AUTH_SECRET).toBe("from-secret");
    expect(env.LLM_PROVIDER).toBe("aws");
    expect((env as unknown as Record<string, unknown>).PATH).toBeUndefined();
    expect(env.RUNTIME).toBe("aws");
    expect(typeof env.DB.prepare).toBe("function");
    expect(env.VECTOR_STORE).toBeDefined();
    expect(env.APPLICATION_PIPELINE).toBeDefined();
  });

  it("refuses APP_ENV=test on Lambda", async () => {
    const starter: StarterEnv = {
      pg: pool,
      BUCKET: bucket,
      VARS: { APP_ENV: "test" },
      secret: async () => "{}",
    };
    await expect(buildGrantsEnv(starter, {})).rejects.toThrow(/APP_ENV=test/);
  });

  it("trusts only the address API Gateway appended, never a client-sent cf-connecting-ip", () => {
    const req = withTrustedClientIp(
      new Request("https://x/api/health", {
        headers: { "cf-connecting-ip": "6.6.6.6", "x-forwarded-for": "6.6.6.6, 203.0.113.7" },
      }),
    );
    expect(req.headers.get("cf-connecting-ip")).toBe("203.0.113.7");
    const none = withTrustedClientIp(
      new Request("https://x/", { headers: { "cf-connecting-ip": "6.6.6.6" } }),
    );
    expect(none.headers.get("cf-connecting-ip")).toBeNull();
  });
});

describe("QueuedPipeline", () => {
  it("queues the pipeline and reports no live workflow, so events run inline", async () => {
    const { QueuedPipeline, isPipelineJob } = await import("./queued-pipeline");
    const sent: unknown[] = [];
    const p = new QueuedPipeline({ send: async (b) => void sent.push(b) });
    const params = { orgId: "org_a", applicationId: "app_1", startedBy: "usr_1" };
    const instance = await p.create({ id: "app_1", params });
    expect(sent).toEqual([{ type: "aws.pipeline.run", params }]);
    expect(isPipelineJob(sent[0])).toBe(true);
    expect(isPipelineJob({ type: "aws.pipeline.run" })).toBe(false);
    expect(await instance.status()).toEqual({ status: "complete" });
  });
});
