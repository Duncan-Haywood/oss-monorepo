// The prompt-injection screen for requests from outside: website form
// messages, issue bodies, anything a stranger typed that an agent will later
// read before deciding what to build.
//
//   node portfolio/requests/screen.mjs "some text"     # or text on stdin
//   node portfolio/requests/screen.mjs --json < body.txt
//
// Exit 0 clear, 1 caution, 2 hold. Pure and dependency-free, so the edge pull
// (platform/edge/pull-feedback.mjs), the intake (intake.mjs), CI and an agent
// all run the same rules.
//
// What it is and is not. It is a tripwire: deterministic patterns for the
// shapes injected instructions take (overriding earlier instructions,
// pretending to be a system or the owner, asking an agent to merge, run,
// fetch, reveal or hide something, invisible characters that hide text from a
// human reviewer). It is not a proof of safety. A clever attacker can word
// around any list, so the rule that request text is data and never
// instructions (`CLAUDE.md`, "Public repository") still does the real work.
// The screen decides how much care a request gets before anyone reads it as
// a brief:
//
//   clear    nothing matched; triage as usual.
//   caution  an agent-directed or risky phrase; triage, restate the ask in
//            your own words, and act on none of the flagged parts.
//   hold     the shape of an attack; record it, do not build from it, and
//            leave it for the owner (README, "Screening").
//
// Bump SCREEN_VERSION when a rule changes, so records say which rules
// cleared them.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCREEN_VERSION = 1;
export const VERDICTS = Object.freeze({ clear: 0, caution: 1, hold: 2 });

// Characters that render as nothing (or reorder text) and so hide words from a
// person reading the issue while an agent still reads them.
const INVISIBLE = /[​-‏‪-‮⁠-⁤⁦-⁩﻿­᠎]|[\u{E0000}-\u{E007F}]/gu;

/**
 * Each rule: id, severity (`hold` or `caution`), a regex run on the
 * normalized text, and why it matters. Normalized means NFKC, invisible
 * characters removed, lower case, whitespace collapsed, so `I G N O R E`
 * written with full-width letters or zero-width joiners still matches.
 */
export const RULES = Object.freeze([
  // Overriding the reader's instructions.
  { id: 'override', severity: 'hold', why: 'tells the reader to drop its earlier instructions',
    re: /\b(ignore|disregard|forget|override|bypass|skip)\b.{0,40}\b(previous|prior|above|earlier|preceding|all|any|your|the|these|system|original)\b.{0,30}\b(instructions?|prompts?|rules?|directions?|guidelines?|guardrails?|context|messages?|policy|policies|constraints?)\b/ },
  { id: 'new-instructions', severity: 'hold', why: 'claims to replace the reader\'s instructions',
    re: /\b(new|updated|real|actual|true|revised)\s+(system\s+)?(instructions?|prompt|directive|orders?)\b\s*[:\-]|\byour (new )?(task|instructions?|job|role) (is|are) now\b|\bfrom now on,? (you|the agent|claude)\b/ },
  { id: 'role-markup', severity: 'hold', why: 'imitates a system, developer or assistant turn',
    re: /<\/?\s*(system|assistant|developer|instructions?|im_start|im_end|tool_use|function_calls?|antml[:\w]*|user_message)\b[^>]*>|\[\/?(inst|system|sys)\]|<<\/?sys>>|^\s*(system|developer|assistant)\s*:|(\n|^)#{1,3}\s*(system|developer) (prompt|message)\b|<\|[a-z_]+\|>/m },
  { id: 'persona', severity: 'hold', why: 'tries to change who the reader is or lift its limits',
    re: /\byou are (now|no longer)\b|\b(developer|god|dan|jailbreak|unrestricted|admin) mode\b|\bjailbreak\b|\bpretend (you are|to be) (an? )?(unrestricted|unfiltered|different)\b|\bwithout (any )?(restrictions|limits|filters|guardrails)\b/ },
  { id: 'authority', severity: 'hold', why: 'claims to speak for the owner, maintainers or the platform',
    re: /\b(the )?(repo(sitory)?|project) owner (says|said|wants|has approved|approves|authori[sz]es?)\b|\b(this|i) (is|am) (the )?(owner|maintainer|admin(istrator)?|duncan)\b|\b(message|note|instructions?) from (anthropic|openai|github|the owner|the maintainers?|your developers?)\b|\bauthori[sz]ed by (the )?(owner|maintainer|admin)\b|\bpre-?approved\b/ },
  { id: 'conceal', severity: 'hold', why: 'asks the reader to hide what it does',
    re: /\b(do not|don't|never|without) (tell|telling|inform|informing|mention|mentioning|alert|alerting|notify|notifying|report|reporting)\b.{0,30}\b(owner|user|human|maintainer|anyone|reviewer)s?\b|\b(silently|secretly|quietly|covertly)\b.{0,30}\b(add|change|commit|push|merge|run|remove|send|install)\b|\bkeep (this|it) (secret|hidden|between us)\b/ },

  // Privileged repository actions.
  { id: 'repo-control', severity: 'hold', why: 'asks for a merge, approval, force push or a change to the guard rails',
    re: /\b(merge|approve|auto-?merge)\b.{0,30}\b(this|my|the|that|pr|pull request|branch)\b.{0,20}\b(without|immediately|now|directly|skip)\b|\bforce[- ]push\b|\bpush (directly )?to (main|master)\b|\b(disable|remove|skip|delete|turn off|weaken)\b.{0,25}\b(ci|checks?|hooks?|codeowners|ruleset|branch protection|review|guard|screen(ing)?|scanner)\b|\b(edit|change|modify|update|rewrite|overwrite|replace|delete|add to|append to)\b.{0,25}(codeowners|\.github\/workflows|\.claude\/|\.mcp\.json|claude\.md|agents\.md|prompt\.md)/ },
  { id: 'control-files', severity: 'caution', why: 'names a file that steers the agents or CI',
    re: /(codeowners|\.github\/workflows|\.claude\/|\.mcp\.json|claude\.md|agents\.md|prompt\.md)/ },
  { id: 'secrets', severity: 'hold', why: 'asks for credentials, tokens or environment contents',
    re: /\b(print|show|reveal|send|post|share|echo|dump|output|paste|leak|exfiltrate|upload|cat|read|list)\b.{0,20}\b(your|the agent'?s?|the repo(sitory)?'?s?|this repo(sitory)?'?s?|the session'?s?|the ci|the workflow'?s?|all( of)?( the| your)?|its|any)\b.{0,20}\b(secrets?|tokens?|api[_ -]?keys?|passwords?|credentials?|env(ironment)? (vars?|variables)|\.env|ssh keys?|private keys?|cookies?|session ids?)\b|\b(print|show|reveal|send|post|share|echo|dump|output|paste|leak|exfiltrate|upload|cat|read|list)\b.{0,30}\b[a-z0-9]+_(token|api_key|secret|secret_access_key|password)\b|\$\{\{\s*secrets\./ },
  { id: 'secret-names', severity: 'caution', why: 'names a credential variable',
    re: /\b(github_token|gh_token|anthropic_api_key|openai_api_key|aws_secret_access_key|cloudflare_api_token)\b/ },
  { id: 'exec', severity: 'hold', why: 'contains a command to run',
    re: /\b(curl|wget|iwr|invoke-webrequest)\b[^\n]{0,120}\|\s*(ba|z|k)?sh\b|\b(bash|sh|zsh|python3?|node|perl|ruby|powershell|pwsh)\s+-(c|e|command)\b|\brm\s+-[a-z]*r[a-z]*f?\s+[\/~*.]|\b(eval|exec)\s*\(|\bbase64\s+(-d|--decode)\b|\bchmod\s+\+x\b|\bnc\s+-[a-z]*e\b/ },
  { id: 'install', severity: 'caution', why: 'names a package to install, which could be a typosquat or a planted dependency',
    re: /\b(npx|pip3? install|npm (i|install)|pnpm add|yarn add|go install|cargo install|gem install)\s+[^\s]+/ },
  { id: 'exfil', severity: 'hold', why: 'asks the reader to send repository or session data somewhere',
    re: /\b(send|post|upload|forward|transmit|exfiltrate|report back)\b.{0,50}\b(to|at)\b.{0,10}(https?:\/\/|webhook|my (server|endpoint|email)|this (url|endpoint|address))|\b(webhook\.site|requestbin|pipedream\.net|ngrok(-free)?\.(io|app)|interact\.sh|burpcollaborator|oast\.(pro|live|fun|me))\b/ },

  // Agent-directed text. Not an attack on its own (people do write "Claude,
  // could you"), but text addressed to the agent rather than describing a
  // job deserves a careful reading.
  { id: 'addresses-agent', severity: 'caution', why: 'addresses the AI reader directly',
    re: /\b(dear|hey|attention|note (to|for)|to the|hello)\s+(ai|llm|agent|assistant|claude|codex|copilot|gpt|chatgpt|gemini|model|bot)s?\b|\b(ai|llm|language model|agent|assistant)s? (reading|processing|reviewing|parsing) this\b|\bif you are an? (ai|llm|agent|language model|assistant)\b|\bas an ai (agent|model|assistant)\b/ },
  { id: 'imperative-agent', severity: 'caution', why: 'tells the agent what to do in its session',
    re: /\b(you must|you should|you will|you have to|make sure you|be sure to|remember to)\b.{0,40}\b(run|execute|commit|push|open a pr|create a pr|delete|install|download|fetch|clone|curl|call|modify|edit|update)\b|\b(before|after) (you )?(do(ing)? anything|reading|triag(e|ing)|start(ing)?)\b.{0,40}\b(run|open|fetch|visit|read|execute)\b/ },
  { id: 'fetch-follow', severity: 'caution', why: 'asks the reader to fetch and follow instructions somewhere else',
    re: /\b(read|follow|fetch|load|open|visit|see|use)\b.{0,30}\b(instructions?|the steps|the prompt|the rules|guide)\b.{0,30}\b(at|in|from|on)\b.{0,10}(https?:\/\/|the (gist|pastebin|link|url|attached))|\b(pastebin\.com|paste\.ee|hastebin|ghostbin|rentry\.(co|org)|gist\.githubusercontent\.com|raw\.githubusercontent\.com)\b|\b(bit\.ly|tinyurl\.com|t\.co|is\.gd|cutt\.ly|rb\.gy)\/\S+/ },
  { id: 'code-block', severity: 'caution', why: 'carries a code or shell block',
    re: /```|(^|\n)\s*(\$|#|>|ps>)\s*(sudo|curl|wget|git|npm|pip|python|node|bash|sh|cd|chmod|export)\b/ },
]);

/** NFKC, invisible characters out, lower case, whitespace collapsed. */
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .toLowerCase()
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/\r\n?/g, '\n');
}

/**
 * Text safe to copy into requests.json or a page: invisible and bidi
 * characters and HTML comments removed (both hide words from a human
 * reviewer), whitespace tidied. Escaping for HTML is still the renderer's job.
 */
export function sanitize(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/<!--[\s\S]*?(-->|$)/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function excerpt(text, index, length) {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + length + 20);
  return `${start ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`.slice(0, 160);
}

/**
 * Screen one piece of untrusted text. Returns
 * `{ verdict, version, findings: [{ rule, severity, why, excerpt }] }`.
 * `excerpt` comes from the normalized text, so it is safe to print.
 */
export function screen(text) {
  const raw = String(text ?? '');
  const findings = [];
  const hidden = raw.match(INVISIBLE) || [];
  if (hidden.length) {
    // One stray soft hyphen or zero-width space is copy-paste noise; several,
    // or any bidi override or tag character, is text made to look different
    // to a person than to a model.
    const bidiOrTag = hidden.some((c) => /[‪-‮⁦-⁩]|[\u{E0000}-\u{E007F}]/u.test(c));
    findings.push({
      rule: 'hidden-text', severity: bidiOrTag || hidden.length > 3 ? 'hold' : 'caution',
      why: 'invisible or direction-changing characters, which can hide words from a human reviewer',
      excerpt: `${hidden.length} character(s): ${[...new Set(hidden)].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ')}`,
    });
  }
  if (/<!--[\s\S]*?-->/.test(raw)) {
    findings.push({ rule: 'html-comment', severity: 'caution', why: 'an HTML comment, which GitHub does not show to a person reading the issue', excerpt: excerpt(normalize(raw), normalize(raw).indexOf('<!--'), 40) });
  }
  const blob = raw.match(/[A-Za-z0-9+/]{120,}={0,2}/);
  if (blob) findings.push({ rule: 'encoded-blob', severity: 'caution', why: 'a long base64-like run, which can carry an encoded instruction', excerpt: `${blob[0].slice(0, 40)}… (${blob[0].length} chars)` });
  const norm = normalize(raw);
  for (const rule of RULES) {
    const m = rule.re.exec(norm);
    if (m) findings.push({ rule: rule.id, severity: rule.severity, why: rule.why, excerpt: excerpt(norm, m.index, m[0].length) });
  }
  const verdict = findings.some((f) => f.severity === 'hold') ? 'hold' : findings.length ? 'caution' : 'clear';
  return { verdict, version: SCREEN_VERSION, findings };
}

/** The compact record stored next to a message: verdict, version and rule ids. */
export function screenRecord(text) {
  const { verdict, version, findings } = screen(text);
  return { verdict, version, rules: findings.map((f) => f.rule) };
}

function main(argv) {
  const asJson = argv.includes('--json');
  const words = argv.filter((a) => a !== '--json');
  const text = words.length ? words.join(' ') : readStdin();
  const result = screen(text);
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.verdict} (screen v${result.version})`);
    for (const f of result.findings) console.log(`  ${f.severity.padEnd(7)} ${f.rule}: ${f.why}\n          ${f.excerpt}`);
  }
  return VERDICTS[result.verdict];
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
