// Photo ingestion: idempotent, retryable, and conservative about what it
// counts as eaten. The device has already run stage 1 (on-device food
// classification) and only uploads likely-food photos; this file runs stage 2
// and turns the verdict into meal records.
import { createHash } from "node:crypto";
import { CONSUMABLE_KINDS } from "./analyze.mjs";
import { createMeal, correctMeal, replaceItems, normalizeItem } from "./meals.mjs";
import { getPolicy } from "./policy.mjs";
import { localDate, scaleNutrients, cleanNutrients } from "./nutrition.mjs";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const ACTIVE_STATES = new Set(["queued", "analyzing", "logged", "attached", "label_pending"]);

export class PausedError extends Error {
  constructor() {
    super("automatic processing is paused");
    this.status = 503;
  }
}

export function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i += 8) {
    let x = BigInt(`0x${a.slice(i, i + 8)}`) ^ BigInt(`0x${b.slice(i, i + 8)}`);
    while (x) {
      d += Number(x & 1n);
      x >>= 1n;
    }
  }
  return d;
}

const minutes = (a, b) => Math.abs(new Date(a) - new Date(b)) / 60000;

export function presentPhoto(p) {
  if (!p) return null;
  return {
    id: p.id,
    asset_id: p.asset_id,
    captured_at: p.captured_at,
    local_date: p.local_date,
    state: p.state,
    kind: p.kind,
    meal_id: p.meal_id,
    duplicate_of: p.duplicate_of,
    reason: p.reason,
    error: p.error,
    attempts: p.attempts,
    image_retained: !!p.image,
    analysis: p.analysis
      ? {
          kind: p.analysis.kind,
          meal_name: p.analysis.meal_name,
          overall_confidence: p.analysis.overall_confidence,
          consumed_likelihood: p.analysis.consumed_likelihood,
          items: p.analysis.items?.map((i) => ({ name: i.name, grams: i.grams, energy_kcal: i.nutrients?.energy_kcal })),
          label: p.analysis.label,
          flags: p.analysis.flags,
          notes: p.analysis.notes,
        }
      : null,
  };
}

function validateIngest(payload) {
  if (!payload || typeof payload !== "object") throw Object.assign(new Error("body must be a JSON object"), { status: 400 });
  const asset = String(payload.asset_id || "").trim();
  if (!asset || asset.length > 300) throw Object.assign(new Error("asset_id is required"), { status: 400 });
  const t = new Date(payload.captured_at);
  if (Number.isNaN(t.getTime())) throw Object.assign(new Error("captured_at must be an ISO-8601 timestamp"), { status: 400 });
  if (payload.dhash != null && !/^[0-9a-f]{16}$/i.test(String(payload.dhash))) throw Object.assign(new Error("dhash must be 16 hex characters"), { status: 400 });
  return { asset, capturedAt: t.toISOString() };
}

/**
 * Accept one photo from the device. Safe to call any number of times for the
 * same asset: the asset id, then the image hash, then a near-duplicate check
 * all short-circuit before anything is created.
 */
export async function ingestPhoto(ctx, payload, { process = true } = {}) {
  const { store } = ctx;
  const policy = getPolicy(store);
  if (policy.paused) throw new PausedError();
  const { asset, capturedAt } = validateIngest(payload);

  const existing = store.photoByAsset(asset);
  if (existing) return { ...presentPhoto(existing), duplicate_request: true };

  const tzOffset = Number.isFinite(Number(payload.tz_offset_min)) ? Math.round(Number(payload.tz_offset_min)) : 0;
  const zone = payload.time_zone || null;
  if (zone) store.setSetting("current_time_zone", zone);
  const base = {
    asset_id: asset,
    captured_at: capturedAt,
    tz_offset_min: tzOffset,
    time_zone: zone,
    local_date: localDate(capturedAt, { timeZone: zone, offsetMin: tzOffset }),
    is_screenshot: !!payload.is_screenshot,
    has_camera_exif: payload.has_camera_exif !== false,
    food_score: payload.food_score == null ? null : Number(payload.food_score),
    dhash: payload.dhash ? String(payload.dhash).toLowerCase() : null,
  };

  let bytes = null;
  if (payload.image_base64) {
    bytes = Buffer.from(String(payload.image_base64), "base64");
    if (bytes.length > MAX_IMAGE_BYTES) throw Object.assign(new Error(`image larger than ${MAX_IMAGE_BYTES} bytes; downscale on device`), { status: 413 });
  }
  const sha = bytes ? createHash("sha256").update(bytes).digest("hex") : null;

  const sameBytes = store.photoBySha(sha);
  if (sameBytes) {
    const p = store.insertPhoto({ ...base, sha256: null, state: "duplicate", duplicate_of: sameBytes.id, meal_id: sameBytes.meal_id, reason: "identical image bytes" });
    store.logEvent("photo.duplicate", p.id, { of: sameBytes.id });
    return presentPhoto(p);
  }

  if (base.food_score != null && base.food_score < policy.min_food_score) {
    const p = store.insertPhoto({ ...base, sha256: sha, state: "ignored", reason: "below the on-device food score threshold" });
    return presentPhoto(p);
  }

  if (base.dhash) {
    const windowMs = policy.near_duplicate_minutes * 60000;
    const near = store
      .photosBetween(new Date(new Date(capturedAt) - windowMs).toISOString(), new Date(new Date(capturedAt).getTime() + windowMs).toISOString())
      .filter((q) => ACTIVE_STATES.has(q.state) && hamming(q.dhash, base.dhash) <= policy.near_duplicate_hamming);
    if (near.length) {
      const p = store.insertPhoto({ ...base, sha256: sha, state: "duplicate", duplicate_of: near[0].id, meal_id: near[0].meal_id, reason: "near-identical shot (burst or retake)" });
      store.logEvent("photo.duplicate", p.id, { of: near[0].id, near: true });
      return presentPhoto(p);
    }
  }

  const nonCamera = base.is_screenshot || !base.has_camera_exif;
  if (nonCamera && policy.non_camera_images === "ignore") {
    const p = store.insertPhoto({ ...base, sha256: sha, state: "ignored", reason: "screenshot or non-camera image (policy: ignore)" });
    return presentPhoto(p);
  }
  if (!bytes) throw Object.assign(new Error("image_base64 is required for a photo that needs analysis"), { status: 400 });

  const expires = new Date(store.now().getTime() + Math.max(policy.image_retention_days, 1 / 24) * 86400000).toISOString();
  const photo = store.insertPhoto({ ...base, sha256: sha, state: "queued", image: bytes, image_mime: payload.image_mime || "image/jpeg", image_expires_at: expires });
  store.logEvent("photo.received", photo.id, { asset_id: asset, food_score: base.food_score });
  if (process && ctx.analyzer) return presentPhoto(await processPhoto(ctx, photo.id));
  return presentPhoto(photo);
}

function nearestMeal(store, atIso, windowMin, { excludeId = null } = {}) {
  const from = new Date(new Date(atIso) - windowMin * 60000).toISOString();
  const to = new Date(new Date(atIso).getTime() + windowMin * 60000).toISOString();
  const meals = store.mealsBetweenInstants(from, to).filter((m) => m.id !== excludeId);
  meals.sort((a, b) => minutes(a.eaten_at, atIso) - minutes(b.eaten_at, atIso));
  return meals[0] || null;
}

function backoffMs(attempts) {
  return Math.min(6 * 3600, 60 * 2 ** Math.max(0, attempts - 1)) * 1000; // 1, 2, 4, ... minutes, capped at 6 h
}

export async function processPhoto(ctx, photoId, { note = null } = {}) {
  const { store, analyzer } = ctx;
  let photo = store.photo(photoId);
  if (!photo || !["queued", "failed"].includes(photo.state)) return photo;
  if (!analyzer) return photo;
  const policy = getPolicy(store);
  if (!photo.image) return store.updatePhoto(photo.id, { state: "failed", error: "image no longer retained; ask for reanalysis from the item list instead" });

  photo = store.updatePhoto(photo.id, { state: "analyzing", attempts: photo.attempts + 1, error: null });
  const recent = nearestMeal(store, photo.captured_at, policy.meal_window_minutes);
  const context = {
    captured_at_local: new Date(new Date(photo.captured_at).getTime() + photo.tz_offset_min * 60000).toISOString().slice(0, 16).replace("T", " "),
    recent_meal: recent ? { name: recent.name, items: recent.items, minutes_ago: Math.round((new Date(photo.captured_at) - new Date(recent.eaten_at)) / 60000) } : null,
    preferences: store.getSetting("preferences", null),
    note,
  };
  let analysis;
  try {
    analysis = await analyzer.analyzeImage({ imageBase64: Buffer.from(photo.image).toString("base64"), mime: photo.image_mime, context });
  } catch (e) {
    const retry = e.retryable !== false && photo.attempts < policy.max_attempts;
    store.logEvent("photo.analysis_error", photo.id, { error: String(e.message).slice(0, 300), retry });
    return store.updatePhoto(photo.id, {
      state: retry ? "queued" : "failed",
      error: String(e.message).slice(0, 500),
      next_attempt_at: retry ? new Date(store.now().getTime() + backoffMs(photo.attempts)).toISOString() : null,
    });
  }
  return store.tx(() => applyAnalysisSync(ctx, photo, analysis, recent, policy));
}

// Synchronous part, run inside one transaction so a crash can't leave a
// photo marked "logged" without its meal (or the reverse).
function applyAnalysisSync(ctx, photo, analysis, recent, policy) {
  const { store } = ctx;
  const nonCamera = photo.is_screenshot || !photo.has_camera_exif;
  const done = (fields) => {
    const keep = fields.state !== "ignored" && policy.image_retention_days > 0;
    const p = store.updatePhoto(photo.id, { kind: analysis.kind, analysis_json: analysis, next_attempt_at: null, error: null, ...(keep ? {} : { image: null, image_mime: null, image_expires_at: null }), ...fields });
    store.logEvent(`photo.${fields.state}`, photo.id, { kind: analysis.kind, meal_id: fields.meal_id ?? null });
    return p;
  };

  if (nonCamera && policy.non_camera_images === "labels_only" && analysis.kind !== "nutrition_label") {
    return done({ state: "ignored", reason: "screenshot or non-camera image that is not a nutrition label" });
  }

  if (analysis.kind === "nutrition_label") {
    if (!analysis.label) return done({ state: "ignored", reason: "label could not be read" });
    const meal = nearestMeal(store, photo.captured_at, policy.meal_window_minutes);
    if (!meal) return done({ state: "label_pending", reason: "no meal within the window yet" });
    const r = applyLabelSync(store, meal, analysis.label);
    return done({ state: "attached", meal_id: meal.id, reason: r });
  }

  if (!CONSUMABLE_KINDS.has(analysis.kind)) return done({ state: "ignored", reason: analysis.kind.replace(/_/g, " ") });
  if (analysis.consumed_likelihood < 0.25) return done({ state: "ignored", reason: "food, but probably not eaten by you" });
  if (!analysis.items.length) return done({ state: "ignored", reason: "food recognised but nothing could be estimated" });

  const confident = analysis.overall_confidence >= policy.auto_log_confidence && analysis.consumed_likelihood >= policy.auto_log_consumed;
  const status = confident ? "logged" : "provisional";

  if (recent && analysis.relation_to_recent_meal === "same_meal") {
    return done({ state: "attached", meal_id: recent.id, reason: "another photo of the same meal" });
  }
  if (recent && analysis.relation_to_recent_meal === "additional_items") {
    const items = [...recent.items, ...analysis.items.map(normalizeItem)];
    replaceItems(store, recent.id, items, { actor: "pipeline", reason: `added from photo ${photo.id}` });
    return done({ state: "logged", meal_id: recent.id, reason: "added to the recent meal" });
  }

  const mealId = `ml_${photo.id.replace(/^ph_/, "")}`; // deterministic: one photo can create at most one meal
  const meal = createMeal(store, {
    id: mealId,
    name: analysis.meal_name,
    eaten_at: photo.captured_at,
    tz_offset_min: photo.tz_offset_min,
    time_zone: photo.time_zone,
    items: analysis.items,
    status,
    confidence: analysis.overall_confidence,
    origin: "photo",
    actor: "pipeline",
    reason: `photo ${photo.id}`,
  });
  // Labels photographed shortly before the meal photo attach now.
  const from = new Date(new Date(photo.captured_at) - policy.meal_window_minutes * 60000).toISOString();
  const to = new Date(new Date(photo.captured_at).getTime() + policy.meal_window_minutes * 60000).toISOString();
  for (const lp of store.photosBetween(from, to).filter((q) => q.state === "label_pending" && q.analysis?.label)) {
    const r = applyLabelSync(store, store.meal(meal.id), lp.analysis.label);
    store.updatePhoto(lp.id, { state: "attached", meal_id: meal.id, reason: r });
  }
  return done({ state: "logged", meal_id: meal.id, reason: status === "provisional" ? "logged as provisional (low confidence)" : null });
}

const words = (s) => new Set(String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));

/** Replace the matching item's estimate with label values. Returns a short description. */
export function applyLabelSync(store, meal, label) {
  const lw = words(label.product);
  let target = meal.items.find((i) => [...words(i.name)].some((w) => lw.has(w)));
  if (!target && meal.items.length === 1) target = meal.items[0];
  if (!target) return "label attached; no item matched, nutrients unchanged";
  const servings = target.grams && label.serving_grams ? target.grams / label.serving_grams : 1;
  const items = meal.items.map((i) => {
    if (i.id !== target.id) return i;
    const { energy_range, ...rest } = i;
    return {
      ...rest,
      nutrients: cleanNutrients(scaleNutrients(label.per_serving, servings)),
      source: "label",
      confidence: target.grams && label.serving_grams ? 0.85 : 0.7,
      note: `from label${label.product ? ` (${label.product})` : ""}, ${Math.round(servings * 100) / 100} serving(s)`,
    };
  });
  replaceItems(store, meal.id, items, { actor: "pipeline", reason: "nutrition label applied" });
  return `label applied to ${target.name} (${Math.round(servings * 100) / 100} serving(s))`;
}

/** Retry queued photos whose backoff has passed, auto-confirm old provisional meals, purge expired images. */
export async function runMaintenance(ctx) {
  const { store } = ctx;
  const policy = getPolicy(store);
  const now = store.now();
  const out = { processed: 0, confirmed: 0, purged: 0 };
  if (ctx.analyzer && !policy.paused) {
    for (const p of store.photosInState("queued", 50)) {
      if (p.next_attempt_at && new Date(p.next_attempt_at) > now) continue;
      await processPhoto(ctx, p.id);
      out.processed++;
    }
  }
  if (policy.provisional_auto_confirm_hours > 0) {
    const cutoff = now.getTime() - policy.provisional_auto_confirm_hours * 3600000;
    for (const m of store.mealsWithStatus("provisional")) {
      if (new Date(m.updated_at).getTime() <= cutoff) {
        await correctMeal(store, m.id, [{ op: "set_status", status: "logged" }], { actor: "pipeline", reason: "auto-confirmed after policy window" });
        out.confirmed++;
      }
    }
  }
  out.purged = store.purgeExpiredImages();
  return out;
}

/** Re-run stage 2 for a meal: from a retained photo if there is one, else from its item list. */
export async function reanalyzeMeal(ctx, mealId, { note = null } = {}) {
  const { store, analyzer } = ctx;
  const meal = store.meal(mealId);
  if (!meal) throw new Error(`no meal ${mealId}`);
  if (!analyzer) throw new Error("no analyzer configured (set NUTRITION_API_KEY)");
  const photo = store.photosForMeal(mealId).find((p) => p.image);
  let analysis;
  let basis;
  if (photo) {
    analysis = await analyzer.analyzeImage({ imageBase64: Buffer.from(photo.image).toString("base64"), mime: photo.image_mime, context: { note, recent_meal: null } });
    basis = `photo ${photo.id}`;
  } else {
    const desc = meal.items.map((i) => `${i.grams ? `${i.grams} g ` : ""}${i.name}${i.preparation ? ` (${i.preparation})` : ""}`).join("; ");
    analysis = await analyzer.estimateText({ description: `${desc}${note ? `. Correction from the person: ${note}` : ""}` });
    basis = "item list (photo not retained)";
  }
  if (!analysis.items.length) throw new Error("reanalysis produced no items; meal left unchanged");
  const updated = replaceItems(store, mealId, analysis.items, { actor: "pipeline", reason: `reanalysis from ${basis}${note ? `: ${note}` : ""}`, confidence: analysis.overall_confidence });
  return { meal: updated, basis };
}

/** Turn an ignored or provisional photo verdict into a logged meal ("I did eat that"). */
export function promotePhoto(ctx, photoId) {
  const { store } = ctx;
  const photo = store.photo(photoId);
  if (!photo) throw new Error(`no photo ${photoId}`);
  if (photo.meal_id) return store.meal(photo.meal_id);
  if (!photo.analysis?.items?.length) throw new Error("this photo has no item estimates to log; use log_meal or reanalysis");
  return store.tx(() => {
    const meal = createMeal(store, {
      id: `ml_${photo.id.replace(/^ph_/, "")}`,
      name: photo.analysis.meal_name,
      eaten_at: photo.captured_at,
      tz_offset_min: photo.tz_offset_min,
      time_zone: photo.time_zone,
      items: photo.analysis.items,
      status: "logged",
      confidence: photo.analysis.overall_confidence,
      origin: "photo",
      actor: "chat",
      reason: "promoted from an ignored photo",
    });
    store.updatePhoto(photo.id, { state: "logged", meal_id: meal.id, reason: "promoted by user" });
    return meal;
  });
}
