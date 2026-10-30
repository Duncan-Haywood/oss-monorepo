// Keyboard and screen-reader wiring for the app's tab bar, following the WAI-ARIA
// tabs pattern: each tab controls its panel (aria-controls / aria-labelledby),
// only the selected tab is in the Tab order, and the arrow keys, Home and End move
// between tabs and open the one they land on.
//
// It reads the markup at runtime (every `[data-tab]` button and its
// `[data-panel]` section), so a tab added to index.html needs no change here.

// Which tab index a key press moves to, or -1 when the key is not a tab key.
export function nextTab(index, key, count) {
  if (count < 1) return -1;
  switch (key) {
    case "ArrowRight": case "ArrowDown": return (index + 1) % count;
    case "ArrowLeft": case "ArrowUp": return (index - 1 + count) % count;
    case "Home": return 0;
    case "End": return count - 1;
    default: return -1;
  }
}

// Give every tab and panel its ids and ARIA links, and handle the keys. `show(name)`
// is the page's own function that selects a tab; this keeps the roving tabindex in
// step with aria-selected whoever changes it.
export function enhanceTabs(doc, show) {
  const tabs = () => [...doc.querySelectorAll('[role="tablist"] [data-tab]')];
  for (const tab of tabs()) {
    const name = tab.dataset.tab;
    const panel = doc.querySelector(`[data-panel="${name}"]`);
    if (!tab.id) tab.id = `tab-${name}`;
    if (!panel) continue;
    if (!panel.id) panel.id = `panel-${name}`;
    tab.setAttribute("aria-controls", panel.id);
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    panel.tabIndex = -1;
  }
  const sync = () => { for (const t of tabs()) t.tabIndex = t.getAttribute("aria-selected") === "true" ? 0 : -1; };
  const list = doc.querySelector('[role="tablist"]');
  if (!list) return sync;
  list.addEventListener("keydown", (e) => {
    const all = tabs();
    const i = all.indexOf(e.target.closest("[data-tab]"));
    if (i < 0) return;
    const j = nextTab(i, e.key, all.length);
    if (j < 0) return;
    e.preventDefault();
    show(all[j].dataset.tab);
    all[j].focus();
    all[j].scrollIntoView?.({ block: "nearest", inline: "nearest" });
  });
  new (doc.defaultView?.MutationObserver || MutationObserver)(sync).observe(list, { subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
  sync();
  return sync;
}

// WCAG 2 contrast ratio of two #rrggbb colours (1 to 21).
export function contrast(a, b) {
  const lum = (h) => {
    const hex = h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}
