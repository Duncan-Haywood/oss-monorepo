// Configurable logging policy and nutrition targets.
//
// Defaults are generic placeholders. Personal values (body stats, targets) are
// set at runtime through `update_nutrition_targets` or a local, git-ignored
// config file (server/config.local.json); they never belong in this public tree.

export const DEFAULT_POLICY = {
  // An analysed meal/beverage is logged without asking when both hold:
  auto_log_confidence: 0.6, // analyzer's overall confidence, 0..1
  auto_log_consumed: 0.6, // likelihood the photographer ate it (vs. menu, someone else's plate)
  // Below that it is kept as `provisional`: counted separately, listed by get_pending_reviews.
  provisional_to_healthkit: false, // write provisional meals to Apple Health anyway?
  provisional_auto_confirm_hours: 0, // >0: provisional meals become logged after this many hours unless corrected
  // Photos the device marked as screenshots or images without camera EXIF (downloads, saved images):
  non_camera_images: "labels_only", // "ignore" | "labels_only" | "analyze"
  meal_window_minutes: 45, // photos this close together may be the same meal
  near_duplicate_hamming: 6, // dHash distance (of 64 bits) treated as the same shot
  near_duplicate_minutes: 10,
  image_retention_days: 3, // 0 = drop the image as soon as analysis finishes
  min_food_score: 0.15, // the device's on-device classifier score below which uploads are refused
  max_attempts: 5,
  paused: false, // pause automatic processing (uploads are refused while paused)
};

export const DEFAULT_TARGETS = {
  energy_kcal: 2000,
  protein_g: 120,
  carbs_g: null,
  fat_g: null,
  fiber_g: 30,
  weekly_weight_change_kg: null, // negative for loss, e.g. -0.5
  goal_weight_kg: null,
  goal_body_fat_pct: null,
  notes: null,
};

export const PROFILE_FIELDS = ["birth_year", "height_cm", "sex", "activity_notes"];

export function getPolicy(store) {
  return { ...DEFAULT_POLICY, ...(store.getSetting("policy", {}) || {}) };
}

export function updatePolicy(store, patch) {
  const cur = getPolicy(store);
  const next = { ...cur };
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in DEFAULT_POLICY)) throw new Error(`unknown policy field ${k}; known: ${Object.keys(DEFAULT_POLICY).join(", ")}`);
    const def = DEFAULT_POLICY[k];
    if (typeof def === "number") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new Error(`${k} must be a non-negative number`);
      next[k] = n;
    } else if (typeof def === "boolean") next[k] = v === true || v === "true";
    else if (k === "non_camera_images") {
      if (!["ignore", "labels_only", "analyze"].includes(v)) throw new Error("non_camera_images must be ignore, labels_only or analyze");
      next[k] = v;
    } else next[k] = v;
  }
  store.setSetting("policy", next);
  return next;
}

export function getTargets(store) {
  return { ...DEFAULT_TARGETS, ...(store.getSetting("targets", {}) || {}) };
}

const LB = 0.45359237;

export function updateTargets(store, patch) {
  const next = { ...getTargets(store) };
  const p = { ...(patch || {}) };
  // Accept pounds for convenience; store kilograms.
  if (p.weekly_weight_change_lb != null) p.weekly_weight_change_kg = Number(p.weekly_weight_change_lb) * LB;
  if (p.goal_weight_lb != null) p.goal_weight_kg = Number(p.goal_weight_lb) * LB;
  delete p.weekly_weight_change_lb;
  delete p.goal_weight_lb;
  for (const [k, v] of Object.entries(p)) {
    if (!(k in DEFAULT_TARGETS)) throw new Error(`unknown target ${k}; known: ${Object.keys(DEFAULT_TARGETS).join(", ")}, weekly_weight_change_lb, goal_weight_lb`);
    if (v === null) next[k] = null;
    else if (k === "notes") next[k] = String(v).slice(0, 500);
    else {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Error(`${k} must be a number`);
      if (k !== "weekly_weight_change_kg" && n < 0) throw new Error(`${k} must be non-negative`);
      next[k] = Math.round(n * 100) / 100;
    }
  }
  const history = store.getSetting("targets_history", []);
  history.push({ at: store.nowIso(), targets: next });
  store.setSetting("targets_history", history.slice(-100));
  store.setSetting("targets", next);
  return next;
}

export function getProfile(store) {
  return store.getSetting("profile", {});
}

export function updateProfile(store, patch) {
  const next = { ...getProfile(store) };
  for (const [k, v] of Object.entries(patch || {})) {
    if (!PROFILE_FIELDS.includes(k)) throw new Error(`unknown profile field ${k}; known: ${PROFILE_FIELDS.join(", ")}`);
    next[k] = v;
  }
  store.setSetting("profile", next);
  return next;
}

/** Load server/config.local.json (if present) once, on first start of an empty database. */
export function seedFromLocalConfig(store, config) {
  if (!config || store.getSetting("seeded_from_local_config", false)) return false;
  if (config.policy) updatePolicy(store, config.policy);
  if (config.targets) updateTargets(store, config.targets);
  if (config.profile) updateProfile(store, config.profile);
  if (config.home_time_zone) store.setSetting("current_time_zone", config.home_time_zone);
  store.setSetting("seeded_from_local_config", true);
  return true;
}
