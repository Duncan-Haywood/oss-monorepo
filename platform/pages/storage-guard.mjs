// Asks the browser to keep the freelancer suite's data, and says how old the
// last backup is.
//
// Why this exists
// ---------------
// Invoice Maker, Estimate Maker, Time Tracker, Expense Tracker and Mileage Log
// keep a freelancer's business records in `localStorage`. Safari evicts
// script-written storage for a site not opened in seven days, and "clear
// browsing data" removes it anywhere; the pages said "download a backup" but
// nothing asked the browser to protect the data or told the user the last
// backup was four months ago. `navigator.storage.persist()` is the request
// that makes eviction a user decision rather than a silent one (honoured by
// Chrome/Edge/Firefox on engagement or install, and by Safari for installed
// web apps), and the backup age is the part only the user can act on.
//
// The same snippet is pasted into each page (they are self-contained and the
// mirror serves them standalone); `storage-guard.test.mjs` fails if a page
// carries a different copy. Run `node platform/pages/storage-guard.mjs` to
// (re)insert it.

import { readFileSync, writeFileSync } from 'node:fs';

export const GUARD_SLUGS = [
  'invoice-maker',
  'estimate-maker',
  'time-tracker',
  'expense-tracker',
  'mileage-log',
  'freelance-dashboard',
];

export const GUARD_MARKER = 'data-storage-guard';
export const BACKUP_KEY = 'freelance-suite-last-backup';

export const GUARD_SCRIPT = `<script ${GUARD_MARKER}>
(function () {
  var KEY = "${BACKUP_KEY}", el = document.getElementById("storage-guard");
  if (!el) return;
  var persisted = null;
  function days() {
    try {
      var t = Number(localStorage.getItem(KEY));
      return t > 0 ? Math.floor((Date.now() - t) / 86400000) : null;
    } catch (e) { return null; }
  }
  function render() {
    var d = days(), parts = [];
    parts.push(persisted === true
      ? "Storage protection: on, so this browser will not clear your data to free space."
      : persisted === false
        ? "Storage protection: not granted. This browser may erase your data after a stretch of not visiting, or when it is low on space."
        : "Storage protection: not supported here, so a backup file is your only safety copy.");
    parts.push(d === null
      ? "No backup downloaded from this device yet."
      : d === 0 ? "Last backup: today."
      : "Last backup: " + d + (d === 1 ? " day" : " days") + " ago" + (d > 30 ? " - download a new one." : "."));
    el.textContent = parts.join(" ");
  }
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("#export-json, #backup") : null;
    if (!b) return;
    try { localStorage.setItem(KEY, String(Date.now())); } catch (x) {}
    render();
  });
  render();
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persisted().then(function (p) {
        return p ? true : navigator.storage.persist();
      }).then(function (p) { persisted = Boolean(p); render(); }, function () {});
    }
  } catch (e) {}
})();
</script>`;

export const GUARD_PARAGRAPH = '<p class="note" id="storage-guard" aria-live="polite"></p>';

export function applyGuard(html) {
  let out = html.replace(/<script data-storage-guard>[\s\S]*?<\/script>\n?/, '');
  out = out.replace(/ *<p class="note" id="storage-guard"[^>]*><\/p>\n?/, '');
  const btn = out.match(/^([ \t]*)<button[^>\n]*id="(?:export-json|backup)"/m);
  if (!btn) throw new Error('no backup button found');
  out = out.replace(btn[0], `${btn[1]}${GUARD_PARAGRAPH}\n${btn[0]}`);
  const at = out.lastIndexOf('</body>');
  return `${out.slice(0, at)}${GUARD_SCRIPT}\n${out.slice(at)}`;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  for (const slug of GUARD_SLUGS) {
    const path = new URL(`../../ventures/${slug}/index.html`, import.meta.url);
    writeFileSync(path, applyGuard(readFileSync(path, 'utf8')));
    console.log(`storage guard applied: ${slug}`);
  }
}
