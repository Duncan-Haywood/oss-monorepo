// Display names for area rows. Preset space types already have a label; an
// "Other space" row does not, and a bid that lists three identical "Area N"
// lines is not something a contractor can paste into a proposal. A trimmed
// custom name wins, then the preset label, then a stable fallback.

export function displayAreaName(presetLabel, customName, index) {
  const custom = String(customName ?? '').trim();
  if (custom) return custom;
  const preset = String(presetLabel ?? '').trim();
  if (preset) return preset;
  return `Area ${index + 1}`;
}

// Optional proposal names work on every row, including catalog types, so two
// restrooms can be told apart. Draft restore keeps space type in its own
// field; the typed name is only a label.
export function nameForRow(presetLabel, customName, index) {
  return displayAreaName(presetLabel, customName, index);
}

// Area names are written into the labor-split HTML. Escape so a name like
// "Hall <west>" cannot inject markup into the contractor's own page.
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
