// Secrets this module reads. They belong in env.ts `Secrets` (integration pass); until then this
// accessor types them without touching the foundation file.
import type { Env } from "../../env";

export interface IntegrationEnv {
  /** Signing secret of the Slack app that owns the /grants slash command. */
  SLACK_SIGNING_SECRET?: string;
  /** Optional dedicated key for encrypting webhook URLs (falls back to AUTH_SECRET). */
  INTEGRATIONS_KEY?: string;
}

export const integrationEnv = (env: Env): Env & IntegrationEnv => env as Env & IntegrationEnv;
