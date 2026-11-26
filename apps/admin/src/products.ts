// Reads one product's admin API with the service credential. A product that cannot be read is
// reported as such (ok: false + reason); its numbers are never replaced by zeros.
import {
  ADMIN_CONTRACT_VERSION,
  type AdminAccountList,
  type AdminAccountsPage,
  type AdminSignupsPage,
  type EarlyAccessMetrics,
  type ProductAdminMetrics,
} from "../../../packages/admin-metrics/src/index.ts";
import type { ProductConfig } from "./config.ts";

export const FETCH_TIMEOUT_MS = 8_000;

export type Fetched<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ProductClient {
  metrics(days: number): Promise<Fetched<ProductAdminMetrics | EarlyAccessMetrics>>;
  accounts(
    list: AdminAccountList,
    limit: number,
  ): Promise<Fetched<AdminAccountsPage | AdminSignupsPage>>;
}

export function productClient(
  p: ProductConfig,
  env: Record<string, unknown>,
  fetchFn: typeof fetch = fetch,
): ProductClient {
  const token = env[p.tokenEnv];
  async function get<T extends { contractVersion: number; kind: string }>(
    path: string,
  ): Promise<Fetched<T>> {
    if (typeof token !== "string" || !token)
      return { ok: false, error: `${p.tokenEnv} is not set on the console` };
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (p.accessClientIdEnv && p.accessClientSecretEnv) {
      const id = env[p.accessClientIdEnv];
      const secret = env[p.accessClientSecretEnv];
      if (typeof id !== "string" || !id || typeof secret !== "string" || !secret) {
        return {
          ok: false,
          error: `${p.accessClientIdEnv}/${p.accessClientSecretEnv} not set on the console`,
        };
      }
      headers["CF-Access-Client-Id"] = id;
      headers["CF-Access-Client-Secret"] = secret;
    }
    let res: Response;
    try {
      res = await fetchFn(`${p.adminUrl}${path}`, {
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error && e.name === "TimeoutError" ? "timed out" : "unreachable",
      };
    }
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    let body: T;
    try {
      body = (await res.json()) as T;
    } catch {
      return { ok: false, error: "not JSON" };
    }
    if (body?.contractVersion !== ADMIN_CONTRACT_VERSION)
      return { ok: false, error: "unknown contract version" };
    if (body.kind !== p.kind)
      return { ok: false, error: `expected kind ${p.kind}, got ${String(body.kind)}` };
    return { ok: true, data: body };
  }
  return {
    metrics: (days) => get(`/metrics?days=${days}`),
    accounts: (list, limit) => get(`/accounts?list=${list}&limit=${limit}`),
  };
}
