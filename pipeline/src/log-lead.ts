/**
 * log-lead.ts — `npm run log-lead -- --audience agent --contact "Agent —
 * Keller Williams downtown" --channel email --stage contacted [--template
 * agent-cold-email] [--notes "..."] [--date 2026-07-12] [--dry-run]`
 *
 * Appends one real entry to process/leads-log.ts's `leadsLog` array without
 * hand-editing TypeScript, so a human can log a real reply/booking from a
 * terminal (or a phone SSH session) in one command right after it happens.
 * This never invents data: every field is required input, there is no
 * default lead content, and `--dry-run` previews the exact diff before it
 * touches the file. See process/leads-log.ts's own header for why only real,
 * human-sourced entries belong here.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

import type { Lead, LeadStage } from "../../process/leads-log";
import type { OutreachTemplate } from "../../process/outreach-templates";

export const AUDIENCES: OutreachTemplate["audience"][] = ["agent", "brokerage", "str_host"];
export const CHANNELS: OutreachTemplate["channel"][] = ["email", "dm", "in_person_script", "sms"];
export const STAGES: LeadStage[] = [
  "identified",
  "contacted",
  "responded",
  "booked",
  "shot_complete",
  "delivered",
  "paid",
  "declined",
];

export type LeadInput = Omit<Lead, "id">;

export function validateLeadInput(input: Partial<LeadInput>): asserts input is LeadInput {
  if (!input.audience || !AUDIENCES.includes(input.audience)) {
    throw new Error(`--audience is required and must be one of: ${AUDIENCES.join(", ")}`);
  }
  if (!input.contactLabel || !input.contactLabel.trim()) {
    throw new Error("--contact is required (a non-identifying label, not a real name/PII)");
  }
  if (!input.channel || !CHANNELS.includes(input.channel)) {
    throw new Error(`--channel is required and must be one of: ${CHANNELS.join(", ")}`);
  }
  if (!input.stage || !STAGES.includes(input.stage)) {
    throw new Error(`--stage must be one of: ${STAGES.join(", ")}`);
  }
  if (!input.dateLogged || !/^\d{4}-\d{2}-\d{2}$/.test(input.dateLogged)) {
    throw new Error("--date must be in YYYY-MM-DD form");
  }
}

/** Finds the next sequential `lead-NNN` id by scanning existing ids in the source text. */
export function nextLeadId(existingSource: string): string {
  const matches = [...existingSource.matchAll(/id:\s*"lead-(\d+)"/g)];
  const max = matches.reduce((m, x) => Math.max(m, Number(x[1])), 0);
  return `lead-${String(max + 1).padStart(3, "0")}`;
}

function escapeString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function formatLeadEntry(id: string, input: LeadInput): string {
  const lines = [
    `  {`,
    `    id: "${id}",`,
    `    audience: "${input.audience}",`,
    `    contactLabel: "${escapeString(input.contactLabel)}",`,
    `    channel: "${input.channel}",`,
  ];
  if (input.templateId) lines.push(`    templateId: "${escapeString(input.templateId)}",`);
  lines.push(`    stage: "${input.stage}",`);
  lines.push(`    dateLogged: "${input.dateLogged}",`);
  if (input.notes) lines.push(`    notes: "${escapeString(input.notes)}",`);
  lines.push(`  },`);
  return lines.join("\n");
}

const ARRAY_MARKER = "export const leadsLog: Lead[] = [";

/** Inserts a new formatted Lead object literal just before the closing `];` of leadsLog. */
export function appendLeadToSource(source: string, input: LeadInput): { updated: string; id: string } {
  const markerIdx = source.indexOf(ARRAY_MARKER);
  if (markerIdx === -1) throw new Error("could not find `export const leadsLog: Lead[] = [` in leads-log.ts");
  const arrayStart = markerIdx + ARRAY_MARKER.length;
  const closeIdx = source.indexOf("];", arrayStart);
  if (closeIdx === -1) throw new Error("could not find the closing `];` of leadsLog");

  const id = nextLeadId(source);
  const entry = formatLeadEntry(id, input);

  const before = source.slice(0, arrayStart);
  const inner = source.slice(arrayStart, closeIdx).replace(/\s*$/, "");
  const after = source.slice(closeIdx);
  const updatedInner = inner.trim().length > 0 ? `${inner}\n${entry}\n` : `\n${entry}\n`;

  return { updated: `${before}${updatedInner}${after}`, id };
}

function parseArgs(argv: string[]): Partial<LeadInput> & { dryRun: boolean } {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };

  return {
    audience: get("--audience") as LeadInput["audience"] | undefined,
    contactLabel: get("--contact"),
    channel: get("--channel") as LeadInput["channel"] | undefined,
    templateId: get("--template"),
    stage: (get("--stage") ?? "contacted") as LeadStage,
    dateLogged: get("--date") ?? new Date().toISOString().slice(0, 10),
    notes: get("--notes"),
    dryRun: argv.includes("--dry-run"),
  };
}

const USAGE =
  'Usage: npm run log-lead -- --audience <agent|brokerage|str_host> --contact "<non-identifying label>" ' +
  "--channel <email|dm|in_person_script|sms> [--stage contacted] [--template <outreach-template-id>] " +
  '[--notes "..."] [--date YYYY-MM-DD] [--dry-run]';

async function main() {
  const { dryRun, ...rest } = parseArgs(process.argv.slice(2));
  validateLeadInput(rest);

  const __filename = fileURLToPath(import.meta.url);
  const leadsLogPath = join(dirname(__filename), "..", "..", "process", "leads-log.ts");

  const source = await readFile(leadsLogPath, "utf8");
  const { updated, id } = appendLeadToSource(source, rest);

  if (dryRun) {
    console.log(`[dry run] would append ${id} to process/leads-log.ts:\n`);
    console.log(formatLeadEntry(id, rest));
    return;
  }

  await writeFile(leadsLogPath, updated, "utf8");
  console.log(`Appended ${id} to process/leads-log.ts. Review the diff, then commit.`);
}

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    console.error(`\n${USAGE}`);
    process.exitCode = 1;
  });
}
