#!/usr/bin/env node
/**
 * Campaign window gate for Print Atelier orchestrator.
 * Exit 0 = run allowed, exit 1 = skip.
 *
 * Usage:
 *   node scripts/orchestrator-gate.mjs
 *   node scripts/orchestrator-gate.mjs --status
 *   node scripts/orchestrator-gate.mjs --force   # bypass window (manual)
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CAMPAIGN_PATH = join(ROOT, "docs/ORCHESTRATOR_CAMPAIGN.json");
const RUNS_PATH = join(ROOT, "docs/orchestrator-runs.json");

const args = process.argv.slice(2);
const force = args.includes("--force") || process.env.ORCHESTRATOR_FORCE === "true";
const statusOnly = args.includes("--status");

function loadCampaign() {
  if (!existsSync(CAMPAIGN_PATH)) {
    return { enabled: false, error: "missing_campaign_file" };
  }
  return JSON.parse(readFileSync(CAMPAIGN_PATH, "utf8"));
}

function parseDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function evaluate(campaign, now = new Date()) {
  if (!campaign.enabled) {
    return { allowed: false, phase: "disabled", reason: "enabled is false" };
  }

  const start = parseDate(campaign.campaign_start);
  const activeDays = campaign.active_days ?? 1;
  const pauseDays = campaign.pause_days ?? 365;
  const activeUntil = addDays(start, activeDays);
  const resumeAt = addDays(activeUntil, pauseDays);
  const onResume = campaign.on_resume ?? "stop";

  if (now < start) {
    return {
      allowed: false,
      phase: "before_start",
      reason: `Campaign starts ${start.toISOString()}`,
      start,
      activeUntil,
      resumeAt,
    };
  }

  if (now >= start && now < activeUntil) {
    return {
      allowed: true,
      phase: "active",
      reason: "Within active campaign window",
      start,
      activeUntil,
      resumeAt,
      hoursRemaining: Math.max(0, (activeUntil - now) / 3600000),
    };
  }

  // Past active window
  if (onResume === "new_campaign" && now >= resumeAt) {
    return {
      allowed: true,
      phase: "resumed",
      reason: "Pause ended; on_resume=new_campaign",
      start,
      activeUntil,
      resumeAt,
      note: "Agent should roll campaign_start forward in ORCHESTRATOR_CAMPAIGN.json",
    };
  }

  return {
    allowed: false,
    phase: "paused",
    reason: `Paused until ${resumeAt.toISOString()} (on_resume=${onResume})`,
    start,
    activeUntil,
    resumeAt,
    daysUntilResume: Math.max(0, (resumeAt - now) / 86400000),
  };
}

function loadRuns() {
  if (!existsSync(RUNS_PATH)) {
    return { runs: [] };
  }
  try {
    return JSON.parse(readFileSync(RUNS_PATH, "utf8"));
  } catch {
    return { runs: [] };
  }
}

function main() {
  const campaign = loadCampaign();
  if (campaign.error) {
    const out = { allowed: false, phase: "error", reason: campaign.error };
    if (statusOnly) {
      console.log(JSON.stringify(out, null, 2));
      process.exit(1);
    }
    console.error(out.reason);
    process.exit(1);
  }

  const result = evaluate(campaign);
  const runs = loadRuns();
  const status = {
    ...result,
    campaign_start: campaign.campaign_start,
    active_days: campaign.active_days,
    pause_days: campaign.pause_days,
    enabled: campaign.enabled,
    total_runs_logged: runs.runs?.length ?? 0,
    now: new Date().toISOString(),
    forced: force,
  };

  if (statusOnly) {
    console.log(JSON.stringify(status, null, 2));
    process.exit(result.allowed || force ? 0 : 1);
  }

  if (force) {
    console.log(JSON.stringify({ ...status, allowed: true, phase: "forced" }));
    process.exit(0);
  }

  console.log(JSON.stringify(status));
  process.exit(result.allowed ? 0 : 1);
}

main();
