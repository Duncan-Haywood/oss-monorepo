import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const AUTOMATICALLY_BLOCKED_UI_PROMOTIONS = [
  {
    workflow: '.gitea/workflows/homepage-ci.yml',
    job: 'deploy',
    privilegedMarker: 'Configure production cluster access',
  },
  {
    workflow: '.gitea/workflows/pairwise-ci.yml',
    job: 'promote',
    privilegedMarker: 'persist-credentials: true',
  },
  {
    workflow: '.gitea/workflows/ai-first-markets-deploy.yml',
    job: 'verify-and-deploy',
    privilegedMarker: 'Deploy to Cloudflare',
  },
];

function jobBlock(source, jobName) {
  const escaped = jobName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(
    new RegExp(`^  ${escaped}:\\n([\\s\\S]*?)(?=^  [a-zA-Z0-9_-]+:\\n|(?![\\s\\S]))`, 'm'),
  );
  return match?.[1] ?? '';
}

test('Production UI Promotion Policy - missing browser gates fail closed', () => {
  for (const entry of AUTOMATICALLY_BLOCKED_UI_PROMOTIONS) {
    const source = fs.readFileSync(path.join(REPO_ROOT, entry.workflow), 'utf8');
    const block = jobBlock(source, entry.job);

    assert.ok(block, `${entry.workflow} must contain the ${entry.job} job`);
    assert.match(
      block,
      /github\.event_name == 'workflow_dispatch'/,
      `${entry.workflow} ${entry.job} must not run automatically while its candidate browser gate is missing`,
    );
    assert.match(
      block,
      /github\.ref == 'refs\/heads\/main'/,
      `${entry.workflow} ${entry.job} must reject production dispatches from feature branches`,
    );
    assert.match(
      block,
      /inputs\.quality_exception == 'APPROVED'/,
      `${entry.workflow} ${entry.job} must require explicit owner exception approval`,
    );
    assert.match(
      block,
      /inputs\.exception_issue != ''/,
      `${entry.workflow} ${entry.job} must require a tracked exception issue`,
    );
    assert.match(
      block,
      /scripts\/ci\/validate-release-exception\.sh/,
      `${entry.workflow} ${entry.job} must validate evidence and bounded expiry before release`,
    );
    const validateIdx = block.indexOf('Validate the bounded release exception');
    const privilegedIdx = block.indexOf(entry.privilegedMarker);
    assert.notEqual(
      validateIdx,
      -1,
      `${entry.workflow} ${entry.job} must contain the "Validate the bounded release exception" step`,
    );
    assert.notEqual(
      privilegedIdx,
      -1,
      `${entry.workflow} ${entry.job} must contain the privileged step "${entry.privilegedMarker}"`,
    );
    assert.ok(
      validateIdx < privilegedIdx,
      `${entry.workflow} ${entry.job} must validate before ${entry.privilegedMarker}`,
    );
    const stepMatch = block.match(/- name: Validate the bounded release exception[\s\S]*?(?=\n      - name:)/);
    assert.ok(
      stepMatch,
      `${entry.workflow} ${entry.job} step "Validate the bounded release exception" block missing`,
    );
    assert.doesNotMatch(
      stepMatch[0],
      /run:[\s\S]*\$\{\{\s*inputs\./,
      `${entry.workflow} ${entry.job} must pass dispatch input through env, not shell source`,
    );
  }
});
