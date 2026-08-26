import { buildReport } from './calc.mjs';

export const USAGE_KEY = 'shopify-a11y-evidence-usage';

export const IMPACT_WEIGHT = {
  critical: 4,
  serious: 3,
  moderate: 2,
  minor: 1,
  unknown: 2,
};

/**
 * Shopify storefront areas a developer can actually open. Order is the
 * match priority: more specific selectors (checkout, cart-drawer) win
 * before generic ones (drawer, product).
 */
export const THEME_AREAS = [
  {
    id: 'checkout',
    label: 'Checkout',
    open: 'Checkout UI extensions or additional scripts — classic checkout is not a theme Liquid file.',
    patterns: [/\bcheckout\b/, /shopify-checkout/, /checkout__/, /#checkout/, /shipping-address/],
  },
  {
    id: 'cart',
    label: 'Cart',
    open: 'sections/main-cart.liquid or the cart drawer snippet.',
    patterns: [/\bcart-drawer\b/, /\bmini-cart\b/, /\bcart-count\b/, /\bcart__/, /\b#cart\b/, /\.cart\b/, /id="cart"/],
  },
  {
    id: 'collection',
    label: 'Collection / product grid',
    open: 'sections/main-collection.liquid or the product-card snippet.',
    patterns: [/\bcollection\b/, /product-grid/, /product-card/, /card-product/, /grid-product/, /facet-filters/],
  },
  {
    id: 'product',
    label: 'Product form',
    open: 'sections/main-product.liquid (buy button, variants, price).',
    patterns: [/product-form/, /add-to-cart/, /product-info/, /product__/, /product-title/, /variant-picker/, /quantity-input/, /price-item/],
  },
  {
    id: 'search',
    label: 'Search',
    open: 'sections/main-search.liquid or the predictive-search snippet.',
    patterns: [/\bpredictive-search\b/, /\bsearch-modal\b/, /\b#search\b/, /\bsearch-form\b/],
  },
  {
    id: 'account',
    label: 'Account / login',
    open: 'sections/main-login.liquid or customers/ templates.',
    patterns: [/\bcustomer-login\b/, /\baccount\b/, /\bregister\b/, /forgot-password/],
  },
  {
    id: 'header',
    label: 'Header / navigation',
    open: 'sections/header.liquid or the announcement bar.',
    patterns: [/\bheader\b/, /\bsite-nav\b/, /\bmenu-drawer\b/, /\bhamburger\b/, /announcement/, /\bnavbar\b/, /\bnavigation\b/],
  },
  {
    id: 'footer',
    label: 'Footer',
    open: 'sections/footer.liquid.',
    patterns: [/\bfooter\b/, /site-footer/, /footer-block/],
  },
  {
    id: 'overlay',
    label: 'Popup / modal / app embed',
    open: 'A popup section, app embed, or cookie banner — often not core theme Liquid.',
    patterns: [/\bmodal\b/, /\bpopup\b/, /\bdrawer\b/, /newsletter/, /cookie-banner/, /age-gate/],
  },
];

const OTHER_AREA = {
  id: 'other',
  label: 'Unclassified / theme.liquid',
  open: 'layout/theme.liquid or a shared snippet. Inspect the selector before guessing a file.',
};

function haystack(node) {
  const targets = Array.isArray(node?.target) ? node.target.flat(Infinity).filter((part) => typeof part === 'string').join(' ') : '';
  const html = typeof node?.html === 'string' ? node.html : '';
  return `${targets} ${html}`.toLowerCase();
}

export function classifyThemeArea(node) {
  const text = haystack(node);
  if (!text.trim()) return { ...OTHER_AREA };
  for (const area of THEME_AREAS) {
    if (area.patterns.some((pattern) => pattern.test(text))) {
      return { id: area.id, label: area.label, open: area.open };
    }
  }
  return { ...OTHER_AREA };
}

function impactWeight(impact) {
  return IMPACT_WEIGHT[impact] || IMPACT_WEIGHT.unknown;
}

/**
 * Route one axe-core JSON export to likely Shopify theme areas so a
 * merchant knows which Liquid file to open first. Classification is a
 * selector/HTML heuristic, not a theme-file guarantee and not a
 * compliance determination.
 */
export function groupByThemeArea(input, date = new Date().toISOString().slice(0, 10)) {
  const report = buildReport(input, date);
  const violations = Array.isArray(input?.violations) ? input.violations : [];
  const buckets = new Map();

  for (const violation of violations) {
    const id = String(violation?.id || 'unknown-rule');
    const impact = String(violation?.impact || 'unknown');
    const help = String(violation?.help || 'Review this result manually.');
    const nodes = Array.isArray(violation?.nodes) ? violation.nodes : [{}];
    const weight = impactWeight(impact);

    for (const node of nodes.length ? nodes : [{}]) {
      const area = classifyThemeArea(node);
      const current = buckets.get(area.id) || {
        id: area.id,
        label: area.label,
        open: area.open,
        nodes: 0,
        score: 0,
        rules: new Map(),
      };
      current.nodes += 1;
      current.score += weight;
      const rule = current.rules.get(id) || { id, impact, help, nodes: 0 };
      rule.nodes += 1;
      current.rules.set(id, rule);
      buckets.set(area.id, current);
    }
  }

  const areas = [...buckets.values()]
    .map((area) => ({
      id: area.id,
      label: area.label,
      open: area.open,
      nodes: area.nodes,
      score: area.score,
      rules: [...area.rules.values()].sort((a, b) => b.nodes - a.nodes || a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => b.score - a.score || b.nodes - a.nodes || a.label.localeCompare(b.label));

  return {
    date: report.date,
    url: report.url,
    tool: report.tool,
    counts: report.counts,
    areas,
    openFirst: areas[0] || null,
    empty: areas.length === 0,
  };
}

export function themeAreasAsText(grouped) {
  const lines = [
    'Shopify theme-area routing (from an axe-core scan)',
    `Checked: ${grouped.date}`,
    `URL: ${grouped.url}`,
    `Engine: ${grouped.tool}`,
    '',
    `Violation rules: ${grouped.counts.violations} / affected nodes: ${grouped.counts.nodes}`,
    '',
  ];
  if (grouped.empty) {
    lines.push('No violations were present in this supplied result. Manual review is still required.');
  } else {
    lines.push(`Open first: ${grouped.openFirst.label} — ${grouped.openFirst.open}`);
    lines.push('');
    for (const area of grouped.areas) {
      lines.push(`## ${area.label} (${area.nodes} node${area.nodes === 1 ? '' : 's'}, score ${area.score})`);
      lines.push(`Open: ${area.open}`);
      for (const rule of area.rules) {
        lines.push(`- [${rule.impact}] ${rule.id}: ${rule.help} (${rule.nodes} node${rule.nodes === 1 ? '' : 's'})`);
      }
      lines.push('');
    }
  }
  lines.push('This is a heuristic from selectors and HTML snippets, not a guarantee of which Liquid file is responsible and not a compliance determination.');
  return lines.join('\n');
}

export function recordThemeAreaUsage(storage = globalThis.localStorage, optOut = false, event = 'theme_areas_generated') {
  if (optOut || !storage) return;
  let current = {};
  try {
    current = JSON.parse(storage.getItem(USAGE_KEY) || '{}');
  } catch {
    current = {};
  }
  if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
  current[event] = Number(current[event] || 0) + 1;
  try {
    storage.setItem(USAGE_KEY, JSON.stringify(current));
  } catch {
    /* storage is optional */
  }
}
