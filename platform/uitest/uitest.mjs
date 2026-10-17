#!/usr/bin/env node
// uitest: agent-driven UI and full-stack testing for web apps.
//
//   node platform/uitest/uitest.mjs --url http://localhost:3000 --goal "Sign up and reach the dashboard"
//   node platform/uitest/uitest.mjs uitest.json --out uitest-report
//   node platform/uitest/uitest.mjs --serve dist --crawl 20            # no key: smoke-test every page
//   node platform/uitest/uitest.mjs --start "npm start" --wait-for http://localhost:3000/health --goal "..."
//
// The model key is the runner's own (platform/llm/byok.mjs): ANTHROPIC_API_KEY,
// OPENAI_API_KEY, GEMINI_API_KEY, or LLM_PROVIDER + LLM_BASE_URL for anything
// that speaks /chat/completions, local models included. With no key, goals are
// reported as skipped and everything deterministic still runs.
//
// Exit codes: 0 passed, 1 something failed, 2 nothing was verified, 3 bad usage.

import { readFile } from 'node:fs/promises';
import { parseArgs, resolveSpec, SpecError } from './lib/spec.mjs';
import { run } from './lib/run.mjs';
import { launch } from './lib/browser.mjs';
import { configFromEnv, complete, isConfigured, normalise } from '../llm/byok.mjs';

const HELP = `uitest — agent-driven UI / full-stack tests for web apps

Usage: uitest [spec.json] [flags]

Target (one of):
  --url URL               app already running (or set baseUrl in the spec)
  --serve DIR             serve a static build directory on a free port
  --start CMD             start the app with CMD, then poll --wait-for URL

Scenarios:
  --goal TEXT             a plain-language task for the agent (needs a model key)
  --expect TEXT           what must be true for the goal to pass
  --name NAME             name for the --goal scenario
  --path PATH             where the --goal or smoke scenario starts (default /)
  --only a,b              run only these scenarios from the spec
  --crawl N               also smoke-test up to N same-site pages linked from the start pages
  --workers N             run up to N scenarios at once (default 1, max 16)
  --no-explore            skip the deterministic smoke check
  --no-agent              ignore any model key (deterministic only)

Limits and policy:
  --max-steps N           agent actions per goal (default 15)
  --timeout-ms N          navigation timeout (default 15000)
  --console-errors L      fail | warn | ignore (default fail)
  --request-failures L    fail | warn | ignore (default warn)
  --allow-origin URL      another origin the agent may navigate to (repeatable)

Output:
  --out DIR               write report.json, junit.xml, summary.md, screenshots/
  --json                  print report.json to stdout
  --headed                show the browser

Model (bring your own key): ANTHROPIC_API_KEY | OPENAI_API_KEY | GEMINI_API_KEY,
or LLM_PROVIDER, LLM_MODEL, LLM_BASE_URL, LLM_API_KEY. See platform/llm/README.md.

Exit: 0 pass, 1 fail, 2 nothing verified, 3 usage error.`;

async function main(argv, env) {
  let parsed;
  try { parsed = parseArgs(argv); } catch (err) { console.error(`uitest: ${err.message}\n\n${HELP}`); return 3; }
  if (parsed.flags.help) { console.log(HELP); return 0; }
  let spec;
  try {
    let fileSpec = null;
    if (parsed.file) {
      try { fileSpec = JSON.parse(await readFile(parsed.file, 'utf8')); } catch (err) { throw new SpecError(`cannot read ${parsed.file}: ${err.message}`); }
    }
    spec = resolveSpec(fileSpec, parsed.flags);
  } catch (err) {
    console.error(`uitest: ${err.message}`);
    return 3;
  }

  let ask = null;
  let model = null;
  const cfg = parsed.flags['no-agent'] ? null : configFromEnv(env);
  if (cfg && isConfigured(cfg)) {
    const c = normalise(cfg);
    model = { provider: c.provider, model: c.model };
    ask = async (system, prompt) => complete(c, { system, prompt, maxTokens: 1024 });
  } else if (spec.scenarios.some(s => s.goal) && !parsed.flags['no-agent']) {
    console.error('uitest: no model key configured; agent goals will be skipped (set ANTHROPIC_API_KEY or see --help)');
  }

  const { result, markdown } = await run(spec, { launch, ask, model, out: parsed.flags.out || null, headed: parsed.flags.headed, env });
  if (parsed.flags.json) console.log(JSON.stringify(result, null, 2));
  else console.error('\n' + markdown);
  if (result.exitCode === 2) console.error('uitest: nothing was verified (every scenario skipped). This is not a pass.');
  return result.exitCode;
}

process.exitCode = await main(process.argv.slice(2), process.env);
