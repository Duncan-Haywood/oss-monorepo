import { syncInbox } from "./sync-inbox.js";
import { DEFAULT_DB, openDb } from "./db.js";
import { printReport } from "./report.js";

const [, , command, ...rest] = process.argv;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseFlag(name: string, fallback: string): string {
  const i = rest.indexOf(name);
  return i >= 0 && rest[i + 1] ? rest[i + 1]! : fallback;
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
    const day =
      parseFlag("--date", "today") === "today" ? todayIso() : parseFlag("--date", todayIso());
    printReport(DEFAULT_DB, day);
    break;
  }
  default:
    console.error("Usage: cli.ts init | sync | report [--date today|YYYY-MM-DD]");
    process.exit(1);
}
