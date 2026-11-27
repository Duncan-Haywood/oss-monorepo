// Shared subprocessor entries. Each product profile picks the ones its code calls and may narrow the
// `data` / `condition` text. docs/trust/subprocessors.md is the human-readable version; a test keeps
// the two in step. trustUrl values are candidates: none was opened from the session that wrote this
// (the hosts were not reachable), so no trustUrlCheckedOn is set and the renderer does not link them.
// docs/trust/OWNER-CONFIRM.md, "Provider pages", asks the owner to check each one and set the date.

import type { Subprocessor } from "./types.ts";

export const CLOUDFLARE_BASE = {
  id: "cloudflare",
  name: "Cloudflare, Inc.",
  location:
    "Cloudflare's global network runs the code; database and file storage sit in a location Cloudflare picks when they are created (no region is pinned in configuration)",
  trustUrl: "https://www.cloudflare.com/trust-hub/",
} as const;

export const ANTHROPIC_BASE = {
  id: "anthropic",
  name: "Anthropic, PBC",
  location: "Not stated in the repository; see Anthropic's commercial terms",
  trustUrl: "https://trust.anthropic.com/",
} as const;

export const PADDLE_BASE = {
  id: "paddle",
  name: "Paddle (merchant of record)",
  location: "Not stated in the repository; see Paddle's terms",
  trustUrl: "https://www.paddle.com/legal/soc-2-compliance",
} as const;

export const RESEND_BASE = {
  id: "resend",
  name: "Resend",
  location: "Not stated in the repository; see Resend's terms",
  trustUrl: "https://resend.com/docs/knowledge-base/downloading-documents",
} as const;

export const GOOGLE_SIGNIN_BASE = {
  id: "google-signin",
  name: "Google (sign-in only)",
  location: "Not stated in the repository",
} as const satisfies Partial<Subprocessor>;

export const GITHUB_ACTIONS_BASE = {
  id: "github-actions",
  name: "GitHub, Inc. (GitHub Actions)",
  location: "GitHub-hosted runners; region not stated in the repository",
  trustUrl: "https://github.com/security",
} as const;
