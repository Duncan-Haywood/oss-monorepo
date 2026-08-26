// One Pages site, one publisher — asserted against the workflow files.
//
// A GitHub repository serves exactly one Pages site. Three separate sessions
// added a `deploy-pages` workflow to this repo on 2026-08-26 (#1718, #1724, and
// a third branch), and two of them ended up reading the *same*
// `GITHUB_PAGES_ENABLED` variable from *different* concurrency groups. The owner
// flip everybody is waiting on would therefore have started two deployments at
// once, racing for one site, and the public URL would have shown whichever
// finished last — re-rolled on every push to `ventures/**`, which is most days.
//
// Nothing caught it. `publish_surface.py` faithfully listed both publishers, but
// listing them is not the same as objecting, and each PR looked correct on its
// own. So this asserts the invariant directly.
//
// What it proves: every workflow that can publish to Pages shares one
// concurrency group, and only one of them is reachable on the owner flip alone.
// What it cannot prove: that a gate is *semantically* exclusive — a human still
// has to read a new gate. It catches the accident, not a determined mistake.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { REPO_ROOT } from './build.mjs';

const WORKFLOWS = path.join(REPO_ROOT, '.github', 'workflows');
const SHARED_GROUP = 'github-pages-site';
const OWNER_FLIP = 'GITHUB_PAGES_ENABLED';

/** Every workflow file that can deploy to GitHub Pages. */
async function pagesWorkflows() {
  const names = (await fs.readdir(WORKFLOWS)).filter((n) => n.endsWith('.yml') || n.endsWith('.yaml'));
  const found = [];
  for (const name of names) {
    const text = await fs.readFile(path.join(WORKFLOWS, name), 'utf8');
    if (!text.includes('actions/deploy-pages')) continue;
    found.push({ name, text });
  }
  return found;
}

/** The `concurrency.group` declared at workflow level, if any. */
function concurrencyGroup(text) {
  return text.match(/^concurrency:\s*\n(?:\s*#.*\n)*\s*group:\s*(\S+)/m)?.[1] ?? null;
}

/**
 * The `if:` gates in a workflow, flattened to one line each.
 *
 * Both block (`if: >-`) and inline forms appear in this repo, so this joins the
 * continuation lines rather than assuming either.
 */
function gates(text) {
  const lines = text.split('\n');
  const found = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^\s*if:\s*(.*)$/);
    if (!match) continue;
    let value = match[1].trim();
    if (value === '>-' || value === '>' || value === '|') {
      value = '';
      const indent = lines[i].search(/\S/);
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j];
        if (!next.trim() || next.search(/\S/) <= indent) break;
        value += ` ${next.trim()}`;
      }
    }
    found.push(value.replace(/\s+/g, ' ').trim());
  }
  return found;
}

test('every Pages-publishing workflow shares one concurrency group', async () => {
  const workflows = await pagesWorkflows();
  assert.ok(workflows.length > 0, 'expected at least one workflow that deploys Pages');

  for (const { name, text } of workflows) {
    assert.equal(
      concurrencyGroup(text),
      SHARED_GROUP,
      `${name} must use "concurrency: group: ${SHARED_GROUP}" — a repository has one ` +
        'Pages site, and separate groups let two publishes run at the same moment.',
    );
  }
});

test('only one workflow can publish on the owner flip alone', async () => {
  const workflows = await pagesWorkflows();

  // A gate is reachable on the flip alone when it requires GITHUB_PAGES_ENABLED
  // and no *other* repository variable. A gate naming a second `vars.` needs a
  // deliberate extra switch, so it cannot fire by accident when the owner flips
  // the one everybody is waiting on.
  const onFlipAlone = workflows.filter(({ text }) =>
    gates(text).some((gate) => {
      if (!gate.includes(`vars.${OWNER_FLIP}`)) return false;
      const otherVars = [...gate.matchAll(/vars\.([A-Z0-9_]+)/g)]
        .map((m) => m[1])
        .filter((v) => v !== OWNER_FLIP);
      return otherVars.length === 0;
    }),
  );

  assert.equal(
    onFlipAlone.length,
    1,
    `exactly one workflow may publish when ${OWNER_FLIP} is set, but ` +
      `${onFlipAlone.length} would: ${onFlipAlone.map((w) => w.name).join(', ')}. ` +
      'Two deploy-pages jobs on one variable race for one site and the last one wins. ' +
      'Gate the others behind their own variable, as pages.yml does.',
  );

  assert.equal(onFlipAlone[0].name, 'portfolio-pages.yml');
});

test('no Pages deploy job can be triggered from a branch other than main', async () => {
  // `workflow_dispatch` accepts any branch. Publishing the live site from a
  // feature branch is not a mistake anyone notices quickly.
  const workflows = await pagesWorkflows();
  const publisher = workflows.find((w) => w.name === 'portfolio-pages.yml');
  assert.ok(publisher, 'portfolio-pages.yml should exist');

  const deployGate = gates(publisher.text).find((g) => g.includes(`vars.${OWNER_FLIP}`));
  assert.match(deployGate, /github\.ref == 'refs\/heads\/main'/);
  assert.match(deployGate, /github\.event_name != 'pull_request'/);
});
