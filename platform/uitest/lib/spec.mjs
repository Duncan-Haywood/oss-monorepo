// What to test: a spec file, command-line flags, or both.
//
// A spec is plain JSON so the tool keeps zero dependencies:
//
//   {
//     "baseUrl": "http://localhost:3000",       // or "serve": "dist" / "start" + "waitFor"
//     "scenarios": [
//       { "name": "signup", "path": "/", "goal": "Create an account", "expect": "A welcome message" },
//       { "name": "quote",  "path": "/quote", "steps": [
//           { "fill": "Width", "value": "12" }, { "click": "Calculate" }, { "expectText": "gallons" } ] }
//     ]
//   }
//
// Flags override the file, and `--url URL --goal "..."` alone is a complete
// spec, so a one-off check needs no file at all.

export class SpecError extends Error {
  constructor(message) { super(message); this.name = 'SpecError'; }
}

export const DEFAULTS = Object.freeze({
  maxSteps: 15,
  crawl: 0,
  workers: 1,
  consoleErrors: 'fail',     // 'fail' | 'warn' | 'ignore'
  requestFailures: 'warn',   // same-origin 4xx/5xx and network failures
  explore: true,             // deterministic smoke on every scenario's start page
  timeoutMs: 15000,
  viewport: { width: 1280, height: 800 },
});

const STEP_KINDS = ['goto', 'fill', 'click', 'select', 'check', 'press', 'expectText', 'expectNoText', 'expectUrl', 'wait', 'screenshot'];
const LEVELS = ['fail', 'warn', 'ignore'];

/** Parse argv into { file, flags }. Unknown flags are an error, not a silent no-op. */
export function parseArgs(argv) {
  const flags = {};
  let file = null;
  const take = (i, name) => {
    if (i + 1 >= argv.length) throw new SpecError(`--${name} needs a value`);
    return argv[i + 1];
  };
  const known = {
    url: 'string', goal: 'string', expect: 'string', serve: 'string', start: 'string', 'wait-for': 'string',
    crawl: 'int', out: 'string', path: 'string', workers: 'int', 'max-steps': 'int', only: 'string', 'console-errors': 'string',
    'request-failures': 'string', 'allow-origin': 'list', name: 'string', 'timeout-ms': 'int',
    headed: 'bool', 'no-explore': 'bool', 'no-agent': 'bool', help: 'bool', json: 'bool',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      if (file) throw new SpecError(`unexpected argument "${arg}" (spec file already given: ${file})`);
      file = arg;
      continue;
    }
    let [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
    const kind = known[name];
    if (!kind) throw new SpecError(`unknown flag --${name}`);
    if (kind === 'bool') { flags[name] = true; continue; }
    const raw = inline !== undefined ? inline : take(i++, name);
    if (kind === 'int') {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new SpecError(`--${name} must be a non-negative integer, got "${raw}"`);
      flags[name] = n;
    } else if (kind === 'list') {
      (flags[name] ||= []).push(raw);
    } else {
      flags[name] = raw;
    }
  }
  return { file, flags };
}

/** Merge a parsed spec file with flags, fill defaults, and validate. */
export function resolveSpec(fileSpec, flags = {}) {
  const spec = { ...DEFAULTS, ...(fileSpec || {}) };
  if (flags.url) spec.baseUrl = flags.url;
  if (flags.serve) spec.serve = flags.serve;
  if (flags.start) spec.start = flags.start;
  if (flags['wait-for']) spec.waitFor = flags['wait-for'];
  if (flags.crawl !== undefined) spec.crawl = flags.crawl;
  if (flags.workers !== undefined) spec.workers = flags.workers;
  if (flags['max-steps'] !== undefined) spec.maxSteps = flags['max-steps'];
  if (flags['timeout-ms'] !== undefined) spec.timeoutMs = flags['timeout-ms'];
  if (flags['console-errors']) spec.consoleErrors = flags['console-errors'];
  if (flags['request-failures']) spec.requestFailures = flags['request-failures'];
  if (flags['allow-origin']) spec.allowedOrigins = [...(spec.allowedOrigins || []), ...flags['allow-origin']];
  if (flags['no-explore']) spec.explore = false;

  let scenarios = Array.isArray(spec.scenarios) ? spec.scenarios.map(s => ({ ...s })) : [];
  if (flags.goal) {
    scenarios.push({ name: flags.name || 'goal', path: flags.path || '/', goal: flags.goal, expect: flags.expect });
  } else if (flags.expect) {
    throw new SpecError('--expect needs --goal');
  }
  // A bare URL with nothing to do still gets the deterministic smoke check.
  if (!scenarios.length) scenarios.push({ name: flags.name || 'smoke', path: flags.path || '/' });
  if (flags.only) {
    const wanted = new Set(flags.only.split(',').map(s => s.trim()).filter(Boolean));
    scenarios = scenarios.filter(s => wanted.has(s.name));
    if (!scenarios.length) throw new SpecError(`--only matched no scenario (wanted ${[...wanted].join(', ')})`);
  }
  spec.scenarios = scenarios;
  return validate(spec);
}

export function validate(spec) {
  const problems = [];
  if (spec.serve && spec.start) problems.push('give "serve" (a static directory) or "start" (a command), not both');
  if (spec.start && !spec.waitFor && !spec.baseUrl) problems.push('"start" needs "waitFor" or "baseUrl" so the run knows when the app is up');
  if (!spec.baseUrl && !spec.serve && !spec.start) problems.push('nothing to test: give a baseUrl (--url), a directory to serve (--serve), or a command to start (--start)');
  if (spec.baseUrl) {
    try {
      const u = new URL(spec.baseUrl);
      if (!/^https?:$/.test(u.protocol)) problems.push(`baseUrl must be http(s), got ${u.protocol}`);
    } catch { problems.push(`baseUrl is not a URL: ${spec.baseUrl}`); }
  }
  if (!LEVELS.includes(spec.consoleErrors)) problems.push(`consoleErrors must be one of ${LEVELS.join(', ')}`);
  if (!LEVELS.includes(spec.requestFailures)) problems.push(`requestFailures must be one of ${LEVELS.join(', ')}`);
  if (!Number.isInteger(spec.workers) || spec.workers < 1 || spec.workers > 16) problems.push('workers must be an integer from 1 to 16');
  if (!Number.isInteger(spec.maxSteps) || spec.maxSteps < 1 || spec.maxSteps > 100) problems.push('maxSteps must be an integer from 1 to 100');
  const names = new Set();
  spec.scenarios.forEach((s, i) => {
    const where = `scenario ${i + 1}${s.name ? ` ("${s.name}")` : ''}`;
    if (!s.name) problems.push(`${where} needs a name`);
    else if (names.has(s.name)) problems.push(`${where}: duplicate name`);
    names.add(s.name);
    if (s.path !== undefined && typeof s.path !== 'string') problems.push(`${where}: path must be a string`);
    if (s.goal !== undefined && (typeof s.goal !== 'string' || !s.goal.trim())) problems.push(`${where}: goal must be a non-empty string`);
    if (s.expect !== undefined && s.expect !== null && typeof s.expect !== 'string') problems.push(`${where}: expect must be a string`);
    if (s.steps !== undefined) {
      if (!Array.isArray(s.steps)) problems.push(`${where}: steps must be an array`);
      else s.steps.forEach((step, j) => {
        const kinds = STEP_KINDS.filter(k => k in (step || {}));
        if (kinds.length !== 1) problems.push(`${where}, step ${j + 1}: needs exactly one of ${STEP_KINDS.join(', ')}`);
        else if ((kinds[0] === 'fill' || kinds[0] === 'select') && step.value === undefined) problems.push(`${where}, step ${j + 1}: ${kinds[0]} needs a value`);
      });
    }
  });
  if (problems.length) throw new SpecError(problems.join('\n'));
  return spec;
}

/** Turn a scenario path into an absolute URL under the base. */
export function scenarioUrl(baseUrl, path = '/') {
  if (/^https?:\/\//i.test(path)) return path;
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  return new URL(path.replace(/^\/+/, ''), base).href;
}

/** Origins the agent may navigate to: the base's own plus any listed. */
export function allowedOrigins(spec) {
  const out = new Set();
  if (spec.baseUrl) out.add(new URL(spec.baseUrl).origin);
  for (const o of spec.allowedOrigins || []) out.add(new URL(o).origin);
  return out;
}
