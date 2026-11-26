// The env switches for moving our own LLM and email traffic to AWS without downtime
// (owner, 2026-11-24): both paths wired, a switch, automatic failover to the old provider, then flip.
//
//   LLM_PROVIDER    anthropic (default)  first-party Claude API (ANTHROPIC_API_KEY), as before
//                   aws                  Claude Platform on AWS only
//                   aws-with-fallback    AWS first; per call, falls back to first party when AWS is
//                                        unavailable (5xx/429/network/auth), logging llm.provider_fallback
//   EMAIL_PROVIDER  ses                  Amazon SES v2 for transactional and marketing mail
//                   ses-with-fallback    SES first; Resend / Cloudflare only when SES definitely
//                                        refused the message (4xx), logging email.provider_fallback
//                   (auto | cloudflare | resend keep their meaning: context.ts, createEmailSender)
//
// A switch set to an AWS value without complete AWS settings keeps the old provider and logs a
// warning, so a half-configured deploy degrades to today's behaviour instead of failing.
//
// AWS settings: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, optional AWS_SESSION_TOKEN (secrets),
// AWS_REGION, optional SES_REGION (SES in another region than Claude), ANTHROPIC_AWS_WORKSPACE_ID,
// optional SES_CONFIGURATION_SET (vars). docs/DEPLOY.md, docs/EMAIL.md.
import { AnthropicLlm, type AnthropicLlmOptions } from "./anthropic-llm";
import type { AwsCredentials } from "./aws-sigv4";
import { createClaudeOnAwsClient } from "./claude-on-aws";
import type { EmailSender } from "./email";
import { type EmailFallbackEvent, FallbackEmailSender } from "./fallback-email";
import { FallbackLlm } from "./fallback-llm";
import type { LlmClient } from "./llm";
import { SesEmailSender } from "./ses-email";

export interface AwsProviderEnv {
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_SESSION_TOKEN?: string;
  AWS_REGION?: string;
  SES_REGION?: string;
  SES_CONFIGURATION_SET?: string;
  ANTHROPIC_AWS_WORKSPACE_ID?: string;
}

export interface LlmProviderEnv extends AwsProviderEnv {
  LLM_PROVIDER?: string;
  ANTHROPIC_API_KEY?: string;
  LLM_MODEL: string;
}

/** The slice of a logger these factories use. */
export interface WarnLogger {
  warn(msg: string, data?: Record<string, unknown>): void;
}

export function awsCredentialsFromEnv(env: AwsProviderEnv): AwsCredentials | null {
  const accessKeyId = env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) return null;
  const sessionToken = env.AWS_SESSION_TOKEN?.trim();
  return { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) };
}

const norm = (v: string | undefined, dflt: string) => (v ?? dflt).trim().toLowerCase() || dflt;

/**
 * The real (non-fake) LLM client for this deployment, or null when no provider is configured.
 * Usage recording (`onUsage`) is attached to each provider's adapter; the caller wraps the result
 * in BudgetedLlm so spend caps apply once per call whichever provider served it.
 */
export function createLlmFromEnv(
  env: LlmProviderEnv,
  opts: {
    onUsage?: AnthropicLlmOptions["onUsage"];
    logger: WarnLogger;
    /** Tests: the transport under the AWS signer. */
    awsFetch?: Parameters<typeof createClaudeOnAwsClient>[0]["fetchImpl"];
  },
): LlmClient | null {
  const choice = norm(env.LLM_PROVIDER, "anthropic");
  const base = { defaultModel: env.LLM_MODEL, onUsage: opts.onUsage };
  const anthropic = env.ANTHROPIC_API_KEY
    ? new AnthropicLlm({ ...base, apiKey: env.ANTHROPIC_API_KEY })
    : null;
  if (choice === "anthropic") return anthropic;
  if (choice !== "aws" && choice !== "aws-with-fallback") {
    opts.logger.warn("llm.provider_unknown", { provider: choice, using: "anthropic" });
    return anthropic;
  }

  let aws: LlmClient | null = null;
  const creds = awsCredentialsFromEnv(env);
  const missing = [
    !creds && "AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY",
    !env.AWS_REGION?.trim() && "AWS_REGION",
    !env.ANTHROPIC_AWS_WORKSPACE_ID?.trim() && "ANTHROPIC_AWS_WORKSPACE_ID",
  ].filter(Boolean);
  if (creds && missing.length === 0) {
    try {
      aws = new AnthropicLlm({
        ...base,
        client: createClaudeOnAwsClient({
          region: (env.AWS_REGION ?? "").trim(),
          workspaceId: env.ANTHROPIC_AWS_WORKSPACE_ID ?? "",
          credentials: creds,
          // With a fallback behind it, fail over quickly instead of retrying AWS for long.
          maxRetries: choice === "aws-with-fallback" && anthropic ? 1 : 3,
          fetchImpl: opts.awsFetch,
        }),
      });
    } catch (e) {
      missing.push(e instanceof Error ? e.message : "invalid AWS settings");
    }
  }
  if (!aws) {
    opts.logger.warn("llm.aws_not_configured", { provider: choice, missing, using: "anthropic" });
    return anthropic;
  }
  if (choice === "aws" || !anthropic) return aws;
  return new FallbackLlm(aws, anthropic, { primary: "aws", secondary: "anthropic" }, (e) =>
    opts.logger.warn("llm.provider_fallback", { ...e }),
  );
}

/**
 * For EMAIL_PROVIDER=ses / ses-with-fallback: the senders per category, built over the legacy
 * ones (what `auto` would pick). Returns null for any other choice, or when SES is not configured
 * (then the caller keeps the legacy senders, and a warning is logged).
 */
export function sesEmailRouting(
  env: AwsProviderEnv & { EMAIL_PROVIDER?: string; EMAIL_FROM: string },
  legacy: {
    transactional: EmailSender | null;
    marketing: EmailSender | null;
    /** For the fallback log line, e.g. "resend" / "cloudflare". */
    transactionalName?: string;
  },
  opts: {
    logger: WarnLogger;
    fetchImpl?: ConstructorParameters<typeof SesEmailSender>[0]["fetchImpl"];
  },
): { transactional: EmailSender; marketing: EmailSender } | null {
  const choice = norm(env.EMAIL_PROVIDER, "auto");
  if (choice !== "ses" && choice !== "ses-with-fallback") return null;
  const creds = awsCredentialsFromEnv(env);
  const region = (env.SES_REGION || env.AWS_REGION || "").trim();
  let ses: SesEmailSender | null = null;
  let problem = !creds ? "AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY" : !region ? "AWS_REGION" : "";
  if (creds && region) {
    try {
      ses = new SesEmailSender({
        region,
        credentials: creds,
        from: env.EMAIL_FROM,
        configurationSetName: env.SES_CONFIGURATION_SET,
        fetchImpl: opts.fetchImpl,
      });
    } catch (e) {
      problem = e instanceof Error ? e.message : "invalid SES settings";
    }
  }
  if (!ses) {
    opts.logger.warn("email.ses_not_configured", { provider: choice, missing: problem });
    return null;
  }
  const sender: SesEmailSender = ses;
  if (choice === "ses") return { transactional: sender, marketing: sender };
  const onFallback = (e: EmailFallbackEvent) =>
    opts.logger.warn("email.provider_fallback", { ...e });
  const wrap = (secondary: EmailSender | null, name: string) =>
    secondary
      ? new FallbackEmailSender(sender, secondary, { primary: "ses", secondary: name }, onFallback)
      : sender;
  return {
    transactional: wrap(legacy.transactional, legacy.transactionalName ?? "legacy"),
    marketing: wrap(legacy.marketing, "resend"),
  };
}
