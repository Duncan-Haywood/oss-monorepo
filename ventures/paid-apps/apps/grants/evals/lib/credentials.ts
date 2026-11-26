// Anthropic credentials for Node-side evals/benchmarks: an API key, or Workload Identity Federation
// (GitHub Actions OIDC). With WIF the SDK exchanges the identity token itself, so no key is stored.
export function hasAnthropicCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ANTHROPIC_API_KEY) return true;
  return Boolean(
    env.ANTHROPIC_FEDERATION_RULE_ID &&
      env.ANTHROPIC_ORGANIZATION_ID &&
      (env.ANTHROPIC_IDENTITY_TOKEN || env.ANTHROPIC_IDENTITY_TOKEN_FILE),
  );
}

/** Pass to AnthropicLlm: the key if present, else undefined so the SDK resolves WIF env vars. */
export const anthropicApiKey = (env: NodeJS.ProcessEnv = process.env) =>
  env.ANTHROPIC_API_KEY || undefined;
