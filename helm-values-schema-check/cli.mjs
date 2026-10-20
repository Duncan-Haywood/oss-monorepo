#!/usr/bin/env node
// Zero-dependency CLI: check a Helm chart's values.yaml against its own
// values.schema.json -- no Helm binary, no chart dependency resolution, no
// cluster, no network call.
//
//   node cli.mjs check values.yaml values.schema.json
//   node cli.mjs check values.yaml values.schema.json --strict
//   node cli.mjs check values.yaml values.schema.json --json

import fs from "node:fs/promises";
import { checkValues, SEVERITY } from "./engine.mjs";

function parseArgs(argv) {
  const args = { json: false, strict: false, positional: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--strict") args.strict = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!args.sub && !a.startsWith("-")) args.sub = a;
    else args.positional.push(a);
  }
  return args;
}

function describe(f) {
  const head = `[${f.severity}] ${f.path}  ${f.title.slice(f.title.indexOf(":") + 2)}`;
  return `${head}\n      ${f.detail}`;
}

function renderHuman(result, { strict }) {
  const high = result.findings.filter((f) => f.severity === SEVERITY.HIGH).length;
  const other = result.findings.length - high;
  const lines = [
    `${result.fieldsChecked} field(s) in values.yaml checked: ${result.findings.length} finding(s) (${high} would fail \`helm install --dry-run --validate\`, ${other} informational).`,
  ];
  for (const f of result.findings) lines.push(`  ${describe(f)}`);
  if (other > 0 && !strict) {
    lines.push("", "Re-run with --strict to also fail on the informational (undeclared-field) findings.");
  }
  return lines.join("\n");
}

export async function run(argv, { readFile = (p) => fs.readFile(p, "utf8") } = {}) {
  const args = parseArgs(argv);

  if (args.help || !args.sub) {
    return {
      exitCode: args.help ? 0 : 1,
      output: [
        "Usage:",
        "  node cli.mjs check <values.yaml> <values.schema.json> [--strict] [--json]",
        "",
        "Validates a Helm chart's values.yaml against its own values.schema.json",
        "(JSON Schema) without running Helm. Exits 1 if any field would fail",
        "`helm install --dry-run --validate` (a type mismatch, a missing required",
        "field, an enum or min/max violation, or a field forbidden by an explicit",
        "additionalProperties: false).",
        "",
        "Without --strict, a field present in values.yaml but not declared",
        "anywhere in the schema is reported but does not fail the command --",
        "most schemas do not set additionalProperties: false, so such a field is",
        "not a schema violation, only very often a typo. Add --strict to fail on",
        "those too.",
      ].join("\n"),
    };
  }

  if (args.sub === "check") {
    const [valuesPath, schemaPath] = args.positional;
    if (!valuesPath || !schemaPath) {
      return { exitCode: 2, output: "Usage: node cli.mjs check <values.yaml> <values.schema.json>" };
    }
    let valuesText, schemaText;
    try {
      [valuesText, schemaText] = await Promise.all([readFile(valuesPath), readFile(schemaPath)]);
    } catch (err) {
      return { exitCode: 2, output: `Error: ${err.message}` };
    }
    let result;
    try {
      result = checkValues(valuesText, schemaText);
    } catch (err) {
      return { exitCode: 2, output: `Error: ${err.message}` };
    }

    const anyHigh = result.findings.some((f) => f.severity === SEVERITY.HIGH);
    const anyOther = result.findings.some((f) => f.severity !== SEVERITY.HIGH);
    const exitCode = anyHigh || (args.strict && anyOther) ? 1 : 0;

    if (args.json) return { exitCode, output: JSON.stringify(result, null, 2) };
    return { exitCode, output: renderHuman(result, { strict: args.strict }) };
  }

  return { exitCode: 2, output: `Unknown subcommand "${args.sub}". Try --help.` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { exitCode, output } = await run(process.argv.slice(2));
  console.log(output);
  process.exitCode = exitCode;
}
