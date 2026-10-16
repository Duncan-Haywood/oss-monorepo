// Turning results into something CI and people read: a verdict per scenario,
// JUnit XML (every CI system renders it), Markdown (GitHub's job summary, a PR
// comment), and JSON (everything, for whoever wants to build on it).

export const VERDICTS = ['pass', 'fail', 'inconclusive', 'error', 'skipped'];
const ICON = { pass: '✅', fail: '❌', inconclusive: '⚠️', error: '💥', skipped: '⏭️' };

/**
 * Fold everything one scenario produced into its verdict. A failed scripted
 * step or a smoke-check failure fails it; JS errors fail it when the policy
 * says so; the agent's verdict counts when it ran; a scenario that only had a
 * goal and no key is skipped, not passed.
 */
export function judge({ steps, explore, agent, browserEvents = {}, policy = {}, hadGoal = false }) {
  const issues = [...(explore?.issues || [])];
  const level = (p, d) => policy[p] || d;
  const js = [...(browserEvents.pageErrors || []).map(e => `uncaught error: ${e}`), ...(browserEvents.consoleErrors || []).map(e => `console.error: ${e}`)];
  if (level('consoleErrors', 'fail') !== 'ignore') for (const m of js) issues.push({ level: level('consoleErrors', 'fail'), message: m });
  if (level('requestFailures', 'warn') !== 'ignore') for (const m of browserEvents.requestFailures || []) issues.push({ level: level('requestFailures', 'warn'), message: `request failed: ${m}` });
  for (const u of browserEvents.blocked || []) issues.push({ level: 'warn', message: `blocked navigation off the site under test: ${u}` });
  for (const d of browserEvents.dialogs || []) issues.push({ level: 'warn', message: `dialog dismissed: ${d}` });

  const failedStep = steps?.steps?.find(s => !s.ok);
  const hardIssue = issues.find(i => i.level === 'fail');
  if (failedStep) return { verdict: 'fail', reason: `step "${failedStep.desc}" failed: ${failedStep.error}`, issues };
  if (agent && agent.verdict !== 'pass') return { verdict: agent.verdict, reason: agent.reason, issues };
  if (hardIssue) return { verdict: 'fail', reason: hardIssue.message, issues };
  if (agent) return { verdict: 'pass', reason: agent.reason, issues };
  const what = [steps?.steps?.length && `${steps.steps.length} step(s) passed`, explore && 'smoke check passed'].filter(Boolean).join('; ');
  // The goal is what this scenario is for; passing it on the smoke check alone
  // would report a check nobody ran.
  if (hadGoal) return { verdict: 'skipped', reason: `goal not run: no model key configured${what ? ` (${what})` : ''}`, issues };
  return { verdict: what ? 'pass' : 'skipped', reason: what || 'nothing checked', issues };
}

export function summarise(run) {
  const counts = Object.fromEntries(VERDICTS.map(v => [v, 0]));
  for (const s of run.scenarios) counts[s.verdict] += 1;
  const usage = run.scenarios.reduce((u, s) => ({
    input: u.input + (s.agent?.usage?.input || 0), output: u.output + (s.agent?.usage?.output || 0), calls: u.calls + (s.agent?.usage?.calls || 0),
  }), { input: 0, output: 0, calls: 0 });
  return { counts, usage, total: run.scenarios.length };
}

/** 0 all passed; 1 anything failed; 2 nothing was verified (everything skipped). */
export function exitCode(run) {
  const { counts, total } = summarise(run);
  if (counts.fail || counts.inconclusive || counts.error) return 1;
  if (counts.skipped === total) return 2;
  return 0;
}

const xml = s => String(s ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]))
  // XML 1.0 forbids most control characters even escaped.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function transcript(s) {
  const lines = [];
  if (s.explore) lines.push(`smoke: status ${s.explore.status ?? '?'}, filled ${s.explore.filled}, clicked ${s.explore.clicked}`);
  for (const st of s.steps?.steps || []) lines.push(`step: ${st.ok ? 'ok  ' : 'FAIL'} ${st.desc}${st.error ? ` — ${st.error}` : ''}`);
  for (const st of s.agent?.steps || []) lines.push(`agent ${st.n}: ${st.desc}${st.error ? ` -> ERROR: ${st.error}` : ''}${st.thought ? `   (${st.thought})` : ''}`);
  for (const i of s.issues || []) lines.push(`${i.level}: ${i.message}`);
  return lines.join('\n');
}

export function toJUnit(run) {
  const { counts, total } = summarise(run);
  const failures = counts.fail + counts.inconclusive;
  const out = [`<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuites name="uitest" tests="${total}" failures="${failures}" errors="${counts.error}" skipped="${counts.skipped}" time="${(run.durationMs / 1000).toFixed(3)}">`,
    `  <testsuite name="${xml(run.name || 'uitest')}" tests="${total}" failures="${failures}" errors="${counts.error}" skipped="${counts.skipped}" time="${(run.durationMs / 1000).toFixed(3)}" timestamp="${xml(run.startedAt)}">`];
  for (const s of run.scenarios) {
    out.push(`    <testcase name="${xml(s.name)}" classname="${xml(s.url)}" time="${((s.durationMs || 0) / 1000).toFixed(3)}">`);
    if (s.verdict === 'fail' || s.verdict === 'inconclusive') out.push(`      <failure message="${xml(s.reason)}" type="${s.verdict}">${xml(transcript(s))}</failure>`);
    else if (s.verdict === 'error') out.push(`      <error message="${xml(s.reason)}">${xml(transcript(s))}</error>`);
    else if (s.verdict === 'skipped') out.push(`      <skipped message="${xml(s.reason)}"/>`);
    out.push(`      <system-out>${xml(transcript(s))}</system-out>`, '    </testcase>');
  }
  out.push('  </testsuite>', '</testsuites>', '');
  return out.join('\n');
}

const md = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function toMarkdown(run) {
  const { counts, usage, total } = summarise(run);
  const head = VERDICTS.filter(v => counts[v]).map(v => `${ICON[v]} ${counts[v]} ${v}`).join(' · ') || 'no scenarios';
  const lines = [`## UI test: ${head}`, ''];
  lines.push(`Target: ${run.baseUrl} · ${total} scenario(s) · ${(run.durationMs / 1000).toFixed(1)}s` +
    (run.model ? ` · agent: ${run.model.provider}/${run.model.model}, ${usage.calls} call(s), ${usage.input.toLocaleString('en-US')} in / ${usage.output.toLocaleString('en-US')} out tokens` : ' · agent: off (no model key)'), '');
  lines.push('| | Scenario | Result |', '|---|---|---|');
  for (const s of run.scenarios) lines.push(`| ${ICON[s.verdict]} | ${md(s.name)} | ${md(s.reason)} |`);
  for (const s of run.scenarios.filter(x => x.verdict !== 'pass' || (x.issues || []).length)) {
    lines.push('', `<details${s.verdict === 'pass' ? '' : ' open'}><summary>${ICON[s.verdict]} ${md(s.name)} — ${s.url}</summary>`, '', '```', transcript(s), '```');
    for (const shot of s.screenshots || []) lines.push(`Screenshot: \`${shot}\``);
    lines.push('</details>');
  }
  lines.push('');
  return lines.join('\n');
}
