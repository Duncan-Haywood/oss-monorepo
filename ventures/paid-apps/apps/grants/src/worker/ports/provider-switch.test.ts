import { describe, expect, it } from "vitest";
import { AnthropicLlm } from "./anthropic-llm";
import type { EmailMessage, EmailSender } from "./email";
import { FallbackEmailSender } from "./fallback-email";
import { FallbackLlm } from "./fallback-llm";
import { awsCredentialsFromEnv, createLlmFromEnv, sesEmailRouting } from "./provider-switch";
import { SesEmailSender } from "./ses-email";

const AWS = {
  AWS_ACCESS_KEY_ID: "AKID",
  AWS_SECRET_ACCESS_KEY: "secret",
  AWS_REGION: "us-east-1",
  ANTHROPIC_AWS_WORKSPACE_ID: "wrkspc_1",
};
const BASE = { LLM_MODEL: "claude-opus-5-5", ANTHROPIC_API_KEY: "sk-test" };

function logger() {
  const warnings: { msg: string; data?: Record<string, unknown> }[] = [];
  return {
    warnings,
    warn: (msg: string, data?: Record<string, unknown>) => warnings.push({ msg, data }),
  };
}

describe("createLlmFromEnv", () => {
  it("defaults to first-party Anthropic, exactly as before", () => {
    const l = logger();
    expect(createLlmFromEnv({ ...BASE, ...AWS }, { logger: l })).toBeInstanceOf(AnthropicLlm);
    expect(createLlmFromEnv({ LLM_MODEL: "m" }, { logger: l })).toBeNull();
    expect(l.warnings).toHaveLength(0);
  });

  it("aws: Claude Platform on AWS only (works without ANTHROPIC_API_KEY)", () => {
    const llm = createLlmFromEnv(
      { LLM_MODEL: "m", LLM_PROVIDER: "aws", ...AWS },
      { logger: logger() },
    );
    expect(llm).toBeInstanceOf(AnthropicLlm);
    expect(llm).not.toBeInstanceOf(FallbackLlm);
  });

  it("aws-with-fallback: AWS first with first party behind it", () => {
    const llm = createLlmFromEnv(
      { ...BASE, ...AWS, LLM_PROVIDER: " AWS-with-Fallback " },
      { logger: logger() },
    );
    expect(llm).toBeInstanceOf(FallbackLlm);
  });

  it("keeps first party and warns when the AWS settings are incomplete or invalid", () => {
    for (const env of [
      { ...BASE, LLM_PROVIDER: "aws" },
      { ...BASE, ...AWS, ANTHROPIC_AWS_WORKSPACE_ID: "", LLM_PROVIDER: "aws-with-fallback" },
      { ...BASE, ...AWS, AWS_REGION: "x.evil.com", LLM_PROVIDER: "aws" },
    ]) {
      const l = logger();
      expect(createLlmFromEnv(env, { logger: l })).toBeInstanceOf(AnthropicLlm);
      expect(l.warnings[0]?.msg).toBe("llm.aws_not_configured");
      // Names of settings only, never their values.
      expect(JSON.stringify(l.warnings)).not.toContain("secret");
    }
    const l = logger();
    createLlmFromEnv({ ...BASE, LLM_PROVIDER: "bedrock" }, { logger: l });
    expect(l.warnings[0]?.msg).toBe("llm.provider_unknown");
  });

  it("logs llm.provider_fallback when AWS fails over", async () => {
    const l = logger();
    const llm = createLlmFromEnv(
      { ...BASE, ...AWS, LLM_PROVIDER: "aws-with-fallback" },
      {
        logger: l,
        awsFetch: async () =>
          new Response(JSON.stringify({ type: "error", error: { type: "x", message: "x" } }), {
            status: 400,
            headers: { "content-type": "application/json" },
          }),
      },
    );
    // A 400 is a request error: no failover, so no network call to first party in this test.
    await expect(llm?.generateText({ purpose: "p", system: "s", prompt: "q" })).rejects.toThrow();
    expect(l.warnings).toHaveLength(0);
  });
});

describe("awsCredentialsFromEnv", () => {
  it("needs both keys; the session token is optional", () => {
    expect(awsCredentialsFromEnv({ AWS_ACCESS_KEY_ID: "a" })).toBeNull();
    expect(awsCredentialsFromEnv({ AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "b" })).toEqual({
      accessKeyId: "a",
      secretAccessKey: "b",
    });
    expect(
      awsCredentialsFromEnv({
        AWS_ACCESS_KEY_ID: "a",
        AWS_SECRET_ACCESS_KEY: "b",
        AWS_SESSION_TOKEN: "t",
      }),
    ).toEqual({ accessKeyId: "a", secretAccessKey: "b", sessionToken: "t" });
  });
});

class Recorder implements EmailSender {
  async send(_msg: EmailMessage) {
    return { id: "x" };
  }
}

describe("sesEmailRouting", () => {
  const legacy = { transactional: new Recorder(), marketing: new Recorder() };
  const FROM = { EMAIL_FROM: "a@example.org" };

  it("is not involved for the existing choices", () => {
    for (const p of [undefined, "auto", "cloudflare", "resend"]) {
      expect(
        sesEmailRouting({ ...AWS, ...FROM, EMAIL_PROVIDER: p }, legacy, { logger: logger() }),
      ).toBeNull();
    }
  });

  it("ses: SES for both categories", () => {
    const r = sesEmailRouting({ ...AWS, ...FROM, EMAIL_PROVIDER: "ses" }, legacy, {
      logger: logger(),
    });
    expect(r?.transactional).toBeInstanceOf(SesEmailSender);
    expect(r?.marketing).toBe(r?.transactional);
  });

  it("ses-with-fallback: SES with the legacy senders behind it; SES_REGION overrides AWS_REGION", () => {
    const r = sesEmailRouting(
      { ...AWS, ...FROM, SES_REGION: "eu-west-1", EMAIL_PROVIDER: "ses-with-fallback" },
      legacy,
      { logger: logger() },
    );
    expect(r?.transactional).toBeInstanceOf(FallbackEmailSender);
    expect(r?.marketing).toBeInstanceOf(FallbackEmailSender);
    const noMarketing = sesEmailRouting(
      { ...AWS, ...FROM, EMAIL_PROVIDER: "ses-with-fallback" },
      { transactional: null, marketing: null },
      { logger: logger() },
    );
    expect(noMarketing?.marketing).toBeInstanceOf(SesEmailSender);
  });

  it("keeps the legacy senders and warns when SES is not configured", () => {
    const l = logger();
    expect(sesEmailRouting({ ...FROM, EMAIL_PROVIDER: "ses" }, legacy, { logger: l })).toBeNull();
    expect(l.warnings[0]?.msg).toBe("email.ses_not_configured");
    const bad = logger();
    expect(
      sesEmailRouting({ ...AWS, EMAIL_FROM: "not an address", EMAIL_PROVIDER: "ses" }, legacy, {
        logger: bad,
      }),
    ).not.toBeNull(); // From is validated per send, so a bad EMAIL_FROM fails loudly there
  });
});
