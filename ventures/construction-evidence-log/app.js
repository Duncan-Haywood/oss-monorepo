import { makeRecord, summary, buildEvidencePack, packSummary, entriesToCsv } from './record.mjs';

const $ = (id) => document.getElementById(id);
const today = new Date().toISOString().slice(0, 10);
$('date').value = today;
let latest = null;

const ENTRIES_KEY = 'construction-evidence-log-entries-v1';

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

function loadEntries() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ENTRIES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveEntries(entries) {
  try {
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  } catch (_) { /* Storage can be full or disabled; the current session still works. */ }
}

function newId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function projectFilter() {
  return $('project').value.trim().toLowerCase();
}

function filteredEntries() {
  const filter = projectFilter();
  const entries = loadEntries();
  if (!filter) return entries;
  return entries.filter((e) => (e.record.log.project || '').trim().toLowerCase() === filter);
}

function truncate(text, max = 90) {
  const flat = (text || '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function renderEntries() {
  const entries = filteredEntries();
  const list = $('history-list');
  list.replaceChildren();
  const sorted = [...entries].sort((a, b) => (a.record.log.date < b.record.log.date ? 1 : -1));
  for (const e of sorted) {
    const li = document.createElement('li');
    const info = document.createElement('div');
    const findingsBadge = e.findings.length ? ` <span class="badge warn">${e.findings.length} notes</span>` : '';
    info.innerHTML = `<strong>${e.record.log.date || '(no date)'}</strong> — ${e.record.log.project || '(no project)'}${findingsBadge}<br><span class="muted">${truncate(e.record.log.work)}</span>`;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'secondary small';
    del.textContent = 'Delete';
    del.addEventListener('click', () => {
      const remaining = loadEntries().filter((x) => x.id !== e.id);
      saveEntries(remaining);
      event('entry_deleted');
      renderEntries();
    });
    li.appendChild(info);
    li.appendChild(del);
    list.appendChild(li);
  }
  const count = entries.length;
  const allCount = loadEntries().length;
  $('history-empty').hidden = allCount !== 0;
  $('history-actions').hidden = allCount === 0;
  $('history-filter-note').hidden = !projectFilter() || allCount === 0;
  $('history-filter-value').textContent = $('project').value.trim();
  $('history-count').textContent = `${count} saved`;
  $('download-pack').disabled = count === 0;
  $('download-pack').textContent = projectFilter()
    ? `Download combined pack for this project (${count})`
    : `Download combined pack, all saved entries (${count})`;
  $('download-csv').disabled = count === 0;
  $('download-csv').textContent = projectFilter()
    ? `Download CSV for this project (${count})`
    : `Download CSV, all saved entries (${count})`;
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

  const entries = loadEntries();
  entries.push({ id: newId(), savedAt: new Date().toISOString(), record: latest.record, findings: latest.findings });
  saveEntries(entries);
  event('entry_saved');
  renderEntries();

  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

$('project').addEventListener('input', renderEntries);

$('download-pack').addEventListener('click', () => {
  const entries = filteredEntries();
  if (!entries.length) return;
  const pack = buildEvidencePack(entries);
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  const scope = projectFilter() ? projectFilter().replace(/[^a-z0-9]+/g, '-') : 'all-projects';
  const range = pack.dateRange ? `${pack.dateRange.from}_to_${pack.dateRange.to}` : 'undated';
  link.download = `construction-evidence-pack-${scope}-${range}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  event('combined_pack_downloaded');
  $('history-action-status').textContent = `Downloaded a combined pack. ${packSummary(pack).split('\n')[0]}`;
});

$('download-csv').addEventListener('click', () => {
  const entries = filteredEntries();
  if (!entries.length) return;
  const csv = entriesToCsv(entries);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  const scope = projectFilter() ? projectFilter().replace(/[^a-z0-9]+/g, '-') : 'all-projects';
  link.download = `construction-evidence-log-${scope}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  event('csv_downloaded');
  $('history-action-status').textContent = `Downloaded ${entries.length} saved ${entries.length === 1 ? 'entry' : 'entries'} as a CSV.`;
});

$('clear-entries').addEventListener('click', () => {
  const allCount = loadEntries().length;
  if (!allCount) return;
  const ok = window.confirm(`Delete all ${allCount} saved entries from this browser? This cannot be undone.`);
  if (!ok) return;
  saveEntries([]);
  event('all_entries_cleared');
  $('history-action-status').textContent = 'All saved entries cleared from this browser.';
  renderEntries();
});

renderEntries();

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
