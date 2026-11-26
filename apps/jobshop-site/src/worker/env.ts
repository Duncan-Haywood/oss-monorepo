// Worker bindings and the settings derived from them.

import { DEFAULT_SITE_URL } from "@site/config";

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  /** Workers Rate Limiting binding; optional so local tools without it still work. */
  EARLY_ACCESS_LIMITER?: RateLimit;
  /** Secret salt for hashing client IPs. Unset = no IP hash is stored. */
  IP_HASH_SALT?: string;
  /**
   * The owner console's (apps/admin) credential for {base}/api/admin/* (admin.ts):
   * `Authorization: Bearer <token>`, at least 32 characters. Unset = closed.
   */
  ADMIN_SERVICE_TOKEN?: string;
  /** Agents' read-only token: /api/admin/metrics only (no sign-up list). ≥ 32 chars; never committed. */
  ADMIN_METRICS_TOKEN?: string;
  /** "" or e.g. "/jobshop"; must match the BASE_PATH the site was built with. */
  BASE_PATH?: string;
  /** Canonical origin + base path for pages the Worker renders; defaults to DEFAULT_SITE_URL. */
  SITE_URL?: string;
}

export function basePath(env: Pick<Env, "BASE_PATH">): string {
  const segments = (env.BASE_PATH ?? "").split("/").filter(Boolean);
  return segments.length ? `/${segments.join("/")}` : "";
}

export function siteUrl(env: Pick<Env, "SITE_URL">): string {
  return (env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
}
