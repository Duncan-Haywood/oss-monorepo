const $ = (id) => document.getElementById(id);
const today = new Date().toISOString().slice(0, 10);
$("date").value = today;
let latest = null;

function event(name) {
  if (!$('usage').checked || navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  try {
    const events = JSON.parse(localStorage.getItem('construction-evidence-events') || '[]');
    events.push({ event: name, day: today });
    localStorage.setItem('construction-evidence-events', JSON.stringify(events.slice(-100)));
  } catch (_) { /* Local usage must never block the record. */ }
}

function value(id) { return $(id).value.trim(); }
function makeRecord() {
  const type = value('changeType');
  const record = { schema: 'construction-evidence-log/v1', createdAt: new Date().toISOString(), log: { date: value('date'), project: value('project'), crew: value('crew'), conditions: value('conditions'), work: value('work') }, change: type === 'none' ? null : { type, requestedBy: value('requestedBy'), impact: value('impact'), details: value('changeDetails') } };
  const findings = [];
  if (!record.log.crew) findings.push('People on site was left blank. Add it if labor attribution matters.');
  if (!record.log.conditions) findings.push('Site conditions were not recorded. Add weather, access, or other observable conditions.');
  if (record.change && !record.change.requestedBy) findings.push('The change or delay has no requester/observer named.');
  if (record.change && !record.change.details) findings.push('The change or delay has no description. Record the request, cause, and response.');
  return { record, findings };
}
function summary(bundle) { return `${bundle.record.log.date} | ${bundle.record.log.project}\nWork: ${bundle.record.log.work}\n${bundle.record.change ? `Change/delay: ${bundle.record.change.details || '(not described)'}` : 'No change or delay recorded.'}`; }

$('log-form').addEventListener('submit', (e) => { e.preventDefault(); latest = makeRecord(); $('result').hidden = false; $('result-title').textContent = `${latest.record.log.project} / ${latest.record.log.date}`; $('status').textContent = latest.findings.length ? `${latest.findings.length} review notes` : 'Ready to review'; $('status').className = `badge ${latest.findings.length ? 'warn' : 'ready'}`; $('findings').innerHTML = latest.findings.length ? latest.findings.map((f) => `<li>${f}</li>`).join('') : '<li>No missing-field observations. Review the record before relying on it.</li>'; $('preview').textContent = JSON.stringify(latest.record, null, 2); event('daily_log_created'); $('result').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
$('download').addEventListener('click', () => { if (!latest) return; const blob = new Blob([JSON.stringify(latest.record, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `construction-log-${latest.record.log.date}.json`; link.click(); URL.revokeObjectURL(link.href); event('evidence_pack_downloaded'); $('action-status').textContent = 'Downloaded locally. Keep a backup you control.'; });
$('copy').addEventListener('click', async () => { if (!latest) return; await navigator.clipboard.writeText(summary(latest)); $('action-status').textContent = 'Summary copied.'; event('summary_copied'); });
