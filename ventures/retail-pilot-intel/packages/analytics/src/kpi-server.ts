import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { isIsoDate } from "./report.js";
import { kpisForDate, kpisForLatest, kpisForToday, type LiveKpiPayload } from "./kpi.js";

export const DEFAULT_KPI_PORT = 8787;
export const DEFAULT_KPI_HOST = "127.0.0.1";

export const DEFAULT_CORS_ORIGINS = [
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
] as const;

export interface KpiServerOptions {
  dbPath: string;
  host?: string;
  port?: number;
  corsOrigins?: readonly string[];
}

export interface StartedKpiServer {
  close: () => Promise<void>;
  url: string;
  host: string;
  port: number;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(payload);
}

function applyCors(
  req: IncomingMessage,
  res: ServerResponse,
  origins: readonly string[],
): void {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Accept");
}

function requestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? "/", "http://kpi.local");
}

function handleGet(dbPath: string, req: IncomingMessage, res: ServerResponse): void {
  const url = requestUrl(req);
  if (url.pathname === "/health") {
    json(res, 200, { ok: true });
    return;
  }
  if (url.pathname === "/api/kpis/today") {
    json(res, 200, kpisForToday(dbPath));
    return;
  }
  if (url.pathname === "/api/kpis/latest") {
    const latest = kpisForLatest(dbPath);
    if (!latest) {
      json(res, 404, { error: "no_activity", message: "Store database has no door or POS events yet." });
      return;
    }
    json(res, 200, latest);
    return;
  }
  if (url.pathname === "/api/kpis") {
    const date = url.searchParams.get("date");
    if (!date || !isIsoDate(date)) {
      json(res, 400, { error: "invalid_date", message: "Pass date=YYYY-MM-DD." });
      return;
    }
    json(res, 200, kpisForDate(dbPath, date) satisfies LiveKpiPayload);
    return;
  }
  json(res, 404, { error: "not_found" });
}

export function startKpiServer(options: KpiServerOptions): Promise<StartedKpiServer> {
  const host = options.host ?? DEFAULT_KPI_HOST;
  const port = options.port ?? DEFAULT_KPI_PORT;
  const corsOrigins = options.corsOrigins ?? DEFAULT_CORS_ORIGINS;
  const { dbPath } = options;

  const server = createServer((req, res) => {
    applyCors(req, res, corsOrigins);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method !== "GET") {
      json(res, 405, { error: "method_not_allowed" });
      return;
    }
    try {
      handleGet(dbPath, req, res);
    } catch {
      json(res, 500, { error: "internal_error" });
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address() as AddressInfo;
      resolve({
        host: address.address,
        port: address.port,
        url: `http://${address.address}:${address.port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) closeReject(error);
              else closeResolve();
            });
          }),
      });
    });
  });
}
