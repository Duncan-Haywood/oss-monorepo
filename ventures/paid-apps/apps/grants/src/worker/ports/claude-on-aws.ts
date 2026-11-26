// Claude Platform on AWS (Anthropic-operated; same Messages API as first party, bare model ids,
// billed through AWS Marketplace) with the existing `@anthropic-ai/sdk` client: no new dependency.
//
// What the official client (`@anthropic-ai/aws-sdk` 1.1.2, src/client.ts + src/core/auth.ts, read
// from the npm tarball on 2026-11-24) does, and what this file reproduces:
// - base URL `https://aws-external-anthropic.{region}.api.aws`;
// - header `anthropic-workspace-id: <workspace id>` on every request (option `workspaceId`, env
//   `ANTHROPIC_AWS_WORKSPACE_ID`; required, the client throws without it);
// - SigV4 with signing name `aws-external-anthropic`, applied to the final request; no
//   `x-api-key` / bearer header in SigV4 mode;
// - no lookup of local Anthropic credentials (`_shouldResolveDefaultCredentials() === false`).
// Why not that package on Workers: it pulls `@aws-sdk/credential-providers`,
// `@smithy/node-config-provider` and friends (Node fs / ~/.aws config); it accepts explicit keys
// and a custom `providerChainResolver`, but adds ~10 packages we do not need for static keys.
//
// Self-contained on purpose (imports only the SDK and aws-sigv4.ts) so it can move to saas-kit.
import Anthropic from "@anthropic-ai/sdk";
import {
  type AwsCredentials,
  assertAwsRegion,
  createSigV4Fetch,
  type FetchLike,
} from "./aws-sigv4";

export const CLAUDE_ON_AWS_SERVICE = "aws-external-anthropic";

export interface ClaudeOnAwsOptions {
  region: string;
  workspaceId: string;
  credentials: AwsCredentials;
  /** Override the endpoint (tests, a VPC endpoint). Defaults to the regional public endpoint. */
  baseURL?: string;
  maxRetries?: number;
  /** The transport under the signer (tests). */
  fetchImpl?: FetchLike;
  now?: () => Date;
}

export const claudeOnAwsBaseUrl = (region: string) =>
  `https://aws-external-anthropic.${assertAwsRegion(region)}.api.aws`;

/** The first-party client with its own auth turned off: the signing fetch authenticates instead. */
class SigV4Anthropic extends Anthropic {
  protected override _shouldResolveDefaultCredentials(): boolean {
    return false;
  }
  protected override validateHeaders(): void {
    // Auth is the SigV4 signature added by the fetch below, not a header the SDK can see.
  }
  protected override async authHeaders(): Promise<undefined> {
    return undefined;
  }
}

export function createClaudeOnAwsClient(opts: ClaudeOnAwsOptions): Anthropic {
  const workspaceId = opts.workspaceId.trim();
  if (!workspaceId) throw new Error("Claude Platform on AWS needs a workspace id");
  if (!opts.credentials.accessKeyId || !opts.credentials.secretAccessKey) {
    throw new Error("Claude Platform on AWS needs AWS credentials");
  }
  const region = assertAwsRegion(opts.region);
  return new SigV4Anthropic({
    apiKey: null,
    authToken: null,
    baseURL: opts.baseURL ?? claudeOnAwsBaseUrl(region),
    maxRetries: opts.maxRetries ?? 3,
    defaultHeaders: { "anthropic-workspace-id": workspaceId },
    fetch: createSigV4Fetch({
      service: CLAUDE_ON_AWS_SERVICE,
      region,
      credentials: opts.credentials,
      fetchImpl: opts.fetchImpl,
      now: opts.now,
    }),
  });
}
