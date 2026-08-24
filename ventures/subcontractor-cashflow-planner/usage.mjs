const KEY = 'subcontractor-cashflow-planner-usage';
export function recordUsage(event, enabled = true) {
  if (!enabled || !['scenario_planned', 'csv_exported'].includes(event)) return;
  const usage = JSON.parse(localStorage.getItem(KEY) || '{}');
  usage[event] = (usage[event] || 0) + 1;
  localStorage.setItem(KEY, JSON.stringify(usage));
}
