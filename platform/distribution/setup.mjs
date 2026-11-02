#!/usr/bin/env node
/**
 * The owner's setup checklist for every distribution channel, from one file.
 *
 *   node platform/distribution/setup.mjs            # print the checklist
 *   node platform/distribution/setup.mjs --write    # regenerate portfolio/distribution/SETUP.md
 *   node platform/distribution/setup.mjs --check    # exit 1 on drift (see below) or a stale SETUP.md
 *
 * Source of truth: portfolio/distribution/accounts.json, one row per external
 * account: where to sign up, the address to sign up with (accounts@ on the
 * site's domain, routed by platform/pages/cloudflare/email-routing.json), and
 * the secret and variable NAMES the workflows read. Values never appear here.
 *
 * Why a checklist and not an agent that signs up (owner asked on 2026-11-02
 * for "a managed email entity that the agents control and use to sign up for
 * sites"): registering accounts and publishing under the portfolio's name are
 * owner-only in goals.md's hard limits, and sign-up forms put the human in
 * the loop on purpose (terms acceptance, CAPTCHAs, phone checks); getting past
 * those by automation is what the distribution spec's "never" list rules out.
 * So the shared address is managed as code and every step after the sign-up
 * is automated; the sign-up itself is a few minutes of the owner's time.
 *
 * --check catches the drift that would make that checklist wrong:
 *   - a secret or variable a distribute-*.yml workflow reads that no account
 *     row lists (a new channel added a credential nobody will be asked for);
 *   - a name an account lists that none of its workflows reads (stale);
 *   - a channel id in `unlocks` that is not in channels.yaml;
 *   - a workflow that does not exist;
 *   - a sign-up address that email-routing.json does not route.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readChannels } from './attribution.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
export const ACCOUNTS = path.join(REPO_ROOT, 'portfolio', 'distribution', 'accounts.json');
export const SETUP_MD = path.join(REPO_ROOT, 'portfolio', 'distribution', 'SETUP.md');
const CHANNELS = path.join(REPO_ROOT, 'portfolio', 'distribution', 'channels.yaml');
const EMAIL = path.join(REPO_ROOT, 'platform', 'pages', 'cloudflare', 'email-routing.json');
const WORKFLOWS = path.join(REPO_ROOT, '.github', 'workflows');

/** Names every workflow gets from GitHub or the runner setup, not from an account. */
export const IGNORED_NAMES = new Set(['GITHUB_TOKEN', 'CI_RUNNER']);

export const TIERS = {
  0: 'No new account: switches on this repository',
  1: 'Labelled bot accounts (free, API-friendly)',
  2: 'Cross-posting the blog posts, with a canonical link back',
  3: 'Package registries',
  4: 'Accounts that need a decision first',
};

/** `secrets.X` and `vars.X` names a workflow reads, split by kind. */
export function namesIn(text) {
  const secrets = new Set();
  const variables = new Set();
  for (const m of text.matchAll(/\b(secrets|vars)\.([A-Z][A-Z0-9_]*)/g)) {
    if (IGNORED_NAMES.has(m[2])) continue;
    (m[1] === 'secrets' ? secrets : variables).add(m[2]);
  }
  return { secrets, variables };
}

export function load(root = REPO_ROOT) {
  const p = (...xs) => path.join(root, ...xs);
  const accounts = JSON.parse(fs.readFileSync(p('portfolio', 'distribution', 'accounts.json'), 'utf8'));
  const channels = readChannels(fs.readFileSync(p('portfolio', 'distribution', 'channels.yaml'), 'utf8'));
  const email = JSON.parse(fs.readFileSync(p('platform', 'pages', 'cloudflare', 'email-routing.json'), 'utf8'));
  const wfDir = p('.github', 'workflows');
  const workflows = {};
  for (const f of fs.readdirSync(wfDir)) if (f.endsWith('.yml')) workflows[f] = fs.readFileSync(path.join(wfDir, f), 'utf8');
  return { accounts, channels, email, workflows };
}

/** Every way accounts.json can disagree with the workflows, channels and email routing. */
export function problems({ accounts, channels, email, workflows }) {
  const out = [];
  const routed = new Set(email.addresses.map((a) => a.local));
  const channelIds = new Set(channels.map((c) => c.id));
  const signup = accounts.signup_address?.local;
  if (!signup || !routed.has(signup)) out.push(`signup address ${signup}@ is not in email-routing.json`);

  const claimed = new Set();
  for (const a of accounts.accounts) {
    if (a.signup_with && !routed.has(a.signup_with)) out.push(`${a.id}: signs up with ${a.signup_with}@, which email-routing.json does not route`);
    for (const c of a.unlocks) if (!channelIds.has(c)) out.push(`${a.id}: unlocks unknown channel ${c}`);
    const read = { secrets: new Set(), variables: new Set() };
    for (const w of a.workflows) {
      if (!(w in workflows)) { out.push(`${a.id}: workflow ${w} does not exist`); continue; }
      const n = namesIn(workflows[w]);
      n.secrets.forEach((x) => read.secrets.add(x));
      n.variables.forEach((x) => read.variables.add(x));
    }
    for (const kind of ['secrets', 'variables']) {
      for (const name of a[kind]) {
        claimed.add(`${kind}:${name}`);
        if (!read[kind].has(name)) out.push(`${a.id}: lists ${kind} ${name}, which none of its workflows reads`);
      }
    }
  }
  for (const [f, text] of Object.entries(workflows)) {
    if (!f.startsWith('distribute-')) continue;
    const n = namesIn(text);
    for (const kind of ['secrets', 'variables']) {
      for (const name of n[kind]) {
        if (!claimed.has(`${kind}:${name}`)) out.push(`${f} reads ${kind} ${name}, but no row in accounts.json asks the owner for it`);
      }
    }
  }
  return out;
}

/** The checklist as Markdown, ordered by tier (cheapest first). */
export function checklist({ accounts, channels, email }) {
  const rung = Object.fromEntries(channels.map((c) => [c.id, c.rung]));
  const addr = (local) => `${local}@${email.zone}`;
  const lines = [
    '# Distribution setup: the owner\'s checklist',
    '',
    '<!-- Generated by `node platform/distribution/setup.mjs --write` from',
    '     portfolio/distribution/accounts.json. Edit that file, not this one. -->',
    '',
    `Every channel in [\`channels.yaml\`](channels.yaml) is built and does a dry run until its switch is set. This page lists the switches, cheapest first. Sign every account up with **${addr(accounts.signup_address.local)}** (${accounts.signup_address.purpose}); it forwards to your inbox once the Cloudflare email step below is done. Secrets go in Settings > Secrets and variables > Actions; their values never go in the repository.`,
    '',
    'Agents do everything after the sign-up: the posts, the tokens\' use, de-duplication, measuring. The sign-up itself is yours (goals.md, "Hard limits": registering accounts and publishing under the portfolio\'s name), because sign-up forms ask a person to accept the terms and prove they are a person, and automating past that is on the distribution spec\'s "never" list.',
    '',
  ];
  const byTier = {};
  for (const a of accounts.accounts) (byTier[a.tier] ??= []).push(a);
  for (const tier of Object.keys(byTier).sort((x, y) => x - y)) {
    lines.push(`## ${tier}. ${TIERS[tier] ?? `Tier ${tier}`}`, '');
    for (const a of byTier[tier]) {
      lines.push(`### ${a.name}`, '');
      const facts = [];
      if (a.signup_url) facts.push(`Sign up: ${a.signup_url}${a.signup_with ? ` with ${addr(a.signup_with)}` : ''}`);
      if (a.unlocks.length) facts.push(`Switches on: ${a.unlocks.map((c) => `\`${c}\` (now ${rung[c] ?? '?'})`).join(', ')}`);
      if (a.secrets.length) facts.push(`Secrets: ${a.secrets.map((s) => `\`${s}\``).join(', ')}`);
      if (a.variables.length) facts.push(`Variables: ${a.variables.map((s) => `\`${s}\``).join(', ')}`);
      for (const f of facts) lines.push(`- ${f}`);
      lines.push('');
      a.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
      lines.push('');
    }
  }
  lines.push('After each one, move its row in `channels.yaml` to `live`, and to `measured` once `node platform/distribution/attribution.mjs` shows arrivals from it.', '');
  return lines.join('\n');
}

function main(argv) {
  const data = load();
  const md = checklist(data);
  if (argv.includes('--write')) {
    fs.writeFileSync(SETUP_MD, md);
    console.log(`wrote ${path.relative(REPO_ROOT, SETUP_MD)}`);
  }
  if (argv.includes('--check')) {
    const out = problems(data);
    const current = fs.existsSync(SETUP_MD) && fs.readFileSync(SETUP_MD, 'utf8') === md;
    if (!current) out.push('portfolio/distribution/SETUP.md is stale: run node platform/distribution/setup.mjs --write');
    for (const p of out) console.error(`setup: ${p}`);
    if (out.length) process.exit(1);
    console.log(`setup: ${data.accounts.accounts.length} accounts agree with the workflows, channels.yaml and email routing`);
    return;
  }
  if (!argv.includes('--write')) process.stdout.write(md);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
