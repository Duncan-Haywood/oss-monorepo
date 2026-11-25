import { syncInbox } from "./sync-inbox.js";
import { DEFAULT_DB, openDb } from "./db.js";
import { DEFAULT_TIME_ZONE, printReport, ReportScopeError, type ReportOptions } from "./report.js";
import { todayIsoDate } from "./kpi.js";
import {
  DEFAULT_CORS_ORIGINS,
  DEFAULT_KPI_HOST,
  DEFAULT_KPI_PORT,
  startKpiServer,
} from "./kpi-server.js";

const [, , command, ...rest] = process.argv;

function parseFlag(name: string, fallback: string): string {
  const i = rest.indexOf(name);
  return i >= 0 && rest[i + 1] ? rest[i + 1]! : fallback;
}

function reportOptions(): ReportOptions {
  const storeId = parseFlag("--store", "");
  const timeZone = parseFlag("--tz", DEFAULT_TIME_ZONE);
  const includeSynthetic = rest.includes("--include-synthetic");
  return { ...(storeId ? { storeId } : {}), timeZone, ...(includeSynthetic ? { includeSynthetic } : {}) };
}

function parsePort(raw: string): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error("serve-kpis --port must be an integer between 0 and 65535");
    process.exit(1);
  }
  return port;
}

switch (command) {
  case "init": {
    openDb(DEFAULT_DB);
    console.log(`Initialized ${DEFAULT_DB}`);
    break;
  }
  case "sync": {
    const r = syncInbox({});
    console.log(`Synced ${r.aggregates} aggregates, ${r.sales} sales into ${DEFAULT_DB}`);
    break;
  }
  case "report": {
    const options = reportOptions();
    const requested = parseFlag("--date", "today");
    const day = requested === "today" ? todayIsoDate(new Date(), options.timeZone) : requested;
    try {
      printReport(DEFAULT_DB, day, options);
    } catch (error) {
      if (error instanceof ReportScopeError) {
        console.error(error.message);
        process.exit(1);
      }
      throw error;
    }
    break;
  }
  case "serve-kpis": {
    const host = parseFlag("--host", DEFAULT_KPI_HOST);
    const port = parsePort(parseFlag("--port", String(DEFAULT_KPI_PORT)));
    const dbPath = parseFlag("--db", DEFAULT_DB);
    const corsRaw = parseFlag("--cors-origin", DEFAULT_CORS_ORIGINS.join(","));
    const corsOrigins = corsRaw
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
    const server = await startKpiServer({ dbPath, host, port, corsOrigins, report: { ...reportOptions(), includeSynthetic: false } });
    console.log(`KPI API listening on ${server.url}`);
    console.log("  GET /health");
    console.log("  GET /api/kpis/today");
    console.log("  GET /api/kpis/latest");
    console.log("  GET /api/kpis?date=YYYY-MM-DD");
    console.log("Read-only aggregates. Bind --host 0.0.0.0 only on a trusted store LAN.");
    break;
  }
  default:
    console.error(
      "Usage: cli.ts init | sync | report [--date today|YYYY-MM-DD] [--store ID] [--tz Europe/Rome] [--include-synthetic] | serve-kpis [--store ID] [--tz Europe/Rome] [--port 8787] [--host 127.0.0.1] [--db data/pilot.db] [--cors-origin http://localhost:5174]",
    );
    process.exit(1);
}
