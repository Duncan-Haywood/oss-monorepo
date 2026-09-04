const KEY = 'payment-reconciliation-usage';
export function count(event) { if (localStorage.getItem('payment-reconciliation-disable') === '1' || navigator.globalPrivacyControl || navigator.doNotTrack === '1') return; const data = JSON.parse(localStorage.getItem(KEY) || '{}'); data[event] = (data[event] || 0) + 1; localStorage.setItem(KEY, JSON.stringify(data)); }
