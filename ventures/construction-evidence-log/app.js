import { makeRecord, summary } from './record.mjs';

const $ = (id) => document.getElementById(id);
const today = new Date().toISOString().slice(0, 10);
$('date').value = today;
let latest = null;

function usageAllowed() {
  if (!$('usage').checked) return false;
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return false;
  return true;
}

function event(name) {
  if (!usageAllowed()) return;
  try {
    const counts = JSON.parse(localStorage.getItem('construction-evidence-log-usage') || '{}');
    counts[name] = (counts[name] || 0) + 1;
    localStorage.setItem('construction-evidence-log-usage', JSON.stringify(counts));
  } catch (_) { /* Local usage must never block the record. */ }
}

function formInput() {
  return {
    date: $('date').value,
    project: $('project').value,
    crew: $('crew').value,
    conditions: $('conditions').value,
    work: $('work').value,
    changeType: $('changeType').value,
    requestedBy: $('requestedBy').value,
    impact: $('impact').value,
    changeDetails: $('changeDetails').value,
  };
}

function renderFindings(findings) {
  const list = $('findings');
  list.replaceChildren();
  const items = findings.length
    ? findings
    : ['No missing-field observations. Review the record before relying on it.'];
  for (const text of items) {
    const li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  }
}

$('log-form').addEventListener('submit', (e) => {
  e.preventDefault();
  latest = makeRecord(formInput());
  $('result').hidden = false;
  $('result-title').textContent = `${latest.record.log.project} / ${latest.record.log.date}`;
  $('status').textContent = latest.findings.length ? `${latest.findings.length} review notes` : 'Ready to review';
  $('status').className = `badge ${latest.findings.length ? 'warn' : 'ready'}`;
  renderFindings(latest.findings);
  $('preview').textContent = JSON.stringify(latest.record, null, 2);
  event('daily_log_created');
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('download').addEventListener('click', () => {
  if (!latest) return;
  const blob = new Blob([JSON.stringify(latest.record, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `construction-log-${latest.record.log.date}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  event('evidence_pack_downloaded');
  $('action-status').textContent = 'Downloaded locally. Keep a backup you control.';
});

$('copy').addEventListener('click', async () => {
  if (!latest) return;
  await navigator.clipboard.writeText(summary(latest));
  $('action-status').textContent = 'Summary copied.';
  event('summary_copied');
});
