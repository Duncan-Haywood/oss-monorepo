// End-to-end checks over real HTTP, numbered by the brief's acceptance criteria
// (docs/acceptance.md maps each one, including the ones only a device can show).
import { test } from "node:test";
import assert from "node:assert/strict";
import { startApp, photo, steak } from "./helpers.mjs";

const menu = { kind: "menu", consumed_likelihood: 0.05, relation_to_recent_meal: "none", meal_name: "menu", overall_confidence: 0.9, items: [], label: null, notes: "" };

test("AC2-6: a camera photo becomes a logged meal and a HealthKit upsert with sync identifiers", async () => {
  const app = await startApp({ fixtures: { "steak-plate": steak } });
  try {
    const r = await app.device("POST", "/v1/device/photos", photo("steak-plate", "2026-11-20T23:15:00Z"));
    assert.equal(r.status, 201);
    assert.equal(r.body.state, "logged");
    assert.equal(r.body.local_date, "2026-11-20"); // 18:15 in New York
    const meal = app.store.meal(r.body.meal_id);
    assert.equal(meal.status, "logged");
    assert.equal(meal.items.length, 2);

    const feed = await app.device("GET", "/v1/device/healthkit/changes?since=0");
    assert.equal(feed.body.changes.length, 1);
    const ch = feed.body.changes[0];
    assert.equal(ch.action, "upsert");
    assert.equal(ch.version, 1);
    const energy = ch.samples.find((s) => s.type === "dietaryEnergyConsumed");
    assert.equal(energy.value, 670);
    assert.equal(energy.unit, "kcal");
    assert.equal(energy.sync_identifier, `pna:${meal.id}:energy_kcal`);
    assert.ok(ch.samples.some((s) => s.type === "dietaryProtein" && s.value === 70));
    assert.ok(ch.samples.some((s) => s.type === "dietarySodium" && s.unit === "mg"));
    assert.equal(ch.start, "2026-11-20T23:15:00.000Z");
  } finally {
    await app.close();
  }
});

test("AC7-9: ChatGPT reads the meal, corrects it, and the correction becomes a newer HealthKit version", async () => {
  const app = await startApp({ fixtures: { "steak-plate": steak } });
  try {
    const up = await app.device("POST", "/v1/device/photos", photo("steak-plate", "2026-11-20T23:15:00Z"));
    const mealId = up.body.meal_id;
    let feed = await app.device("GET", "/v1/device/healthkit/changes?since=0");
    await app.device("POST", "/v1/device/healthkit/ack", { results: [{ meal_id: mealId, version: 1, ok: true }] });
    const cursor = feed.body.cursor;

    const init = await app.mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test" } });
    assert.equal(init.result.protocolVersion, "2025-06-18");
    const list = await app.mcp("tools/list", {});
    const names = list.result.tools.map((t) => t.name);
    for (const n of ["get_daily_totals", "get_meals", "update_meal", "delete_meal", "get_sync_status"]) assert.ok(names.includes(n), n);
    assert.equal(list.result.tools.find((t) => t.name === "get_meals").annotations.readOnlyHint, true);
    assert.equal(list.result.tools.find((t) => t.name === "delete_meal").annotations.destructiveHint, true);

    const totals = await app.tool("get_daily_totals", { date: "2026-11-20" });
    assert.equal(totals.totals.energy_kcal, 670);
    assert.equal(totals.meals_logged, 1);
    assert.ok(totals.energy_kcal_range[0] < 670 && totals.energy_kcal_range[1] > 670);

    const found = await app.tool("find_meals", { query: "steak", days: 30 });
    assert.equal(found.meals[0].id, mealId);

    // "That steak was actually 12 ounces."
    const fixed = await app.tool("update_meal", { meal_id: mealId, reason: "steak was 12 oz", operations: [{ op: "set_amount", item: "steak", amount: { value: 12, unit: "oz" } }] });
    assert.equal(fixed.version, 2);
    const s = fixed.items.find((i) => i.name === "sirloin steak");
    assert.equal(s.grams, 340);
    assert.equal(s.source, "user");
    assert.equal(s.nutrients.energy_kcal, Math.round((460 * 340.19) / 227));
    assert.equal(fixed.healthkit.state, "pending");

    feed = await app.device("GET", `/v1/device/healthkit/changes?since=${cursor}`);
    assert.equal(feed.body.changes.length, 1);
    assert.equal(feed.body.changes[0].version, 2);
    assert.equal(feed.body.changes[0].samples.find((x) => x.type === "dietaryEnergyConsumed").sync_identifier, `pna:${mealId}:energy_kcal`);

    let sync = await app.tool("get_sync_status");
    assert.equal(sync.pending, 1);
    await app.device("POST", "/v1/device/healthkit/ack", { results: [{ meal_id: mealId, version: 2, ok: true }] });
    // A late ack of the old version must not roll the written version back.
    await app.device("POST", "/v1/device/healthkit/ack", { results: [{ meal_id: mealId, version: 1, ok: true }] });
    sync = await app.tool("get_sync_status");
    assert.equal(sync.pending, 0);

    // "I only ate half", "there were two tablespoons of olive oil", "add three eggs"
    const more = await app.tool("update_meal", {
      meal_id: mealId,
      operations: [{ op: "scale", factor: 0.5 }, { op: "add_item", name: "olive oil", amount: { value: 2, unit: "tbsp" } }, { op: "add_item", name: "eggs", amount: { value: 3, unit: "each" } }],
    });
    assert.equal(more.version, 3);
    const oil = more.items.find((i) => i.name === "olive oil");
    assert.equal(oil.source, "reference");
    assert.equal(oil.grams, 27);
    assert.equal(oil.nutrients.fat_g, 26.9);
    assert.equal(more.items.find((i) => i.name === "egg").grams, 150);

    const detail = await app.tool("get_meal", { meal_id: mealId });
    assert.deepEqual(detail.history.map((h) => h.version), [1, 2, 3]);
    assert.equal(detail.history[1].reason, "steak was 12 oz");

    // "That photograph was someone else's food."
    const del = await app.tool("delete_meal", { meal_id: mealId, reason: "not_consumed" });
    assert.equal(del.status, "deleted");
    feed = await app.device("GET", `/v1/device/healthkit/changes?since=${cursor}`);
    const last = feed.body.changes.at(-1);
    assert.equal(last.action, "delete");
    assert.ok(last.sync_identifiers.includes(`pna:${mealId}:energy_kcal`));
    assert.equal((await app.tool("get_daily_totals", { date: "2026-11-20" })).totals.energy_kcal, undefined);

    const restored = await app.tool("restore_meal", { meal_id: mealId });
    assert.equal(restored.status, "logged");
  } finally {
    await app.close();
  }
});

test("AC10: the same photo, re-uploads, identical bytes and burst shots never create a second meal", async () => {
  const app = await startApp({ fixtures: { "steak-plate": steak, "steak-burst": steak } });
  try {
    const p = photo("steak-plate", "2026-11-20T23:15:00Z", { dhash: "f0f0f0f0f0f0f0f0" });
    const a = await app.device("POST", "/v1/device/photos", p);
    const again = await app.device("POST", "/v1/device/photos", p);
    assert.equal(again.status, 200);
    assert.equal(again.body.duplicate_request, true);
    assert.equal(again.body.meal_id, a.body.meal_id);

    const sameBytes = await app.device("POST", "/v1/device/photos", photo("steak-plate", "2026-11-20T23:15:00Z", { asset_id: "edited-copy" }));
    assert.equal(sameBytes.body.state, "duplicate");

    const burst = await app.device("POST", "/v1/device/photos", photo("steak-burst", "2026-11-20T23:15:04Z", { dhash: "f0f0f0f0f0f0f0f1" }));
    assert.equal(burst.body.state, "duplicate");
    assert.equal(burst.body.duplicate_of, a.body.id);

    assert.equal(app.store.mealsByDate("2026-11-20", "2026-11-20").length, 1);
    assert.equal(app.analyzer.calls.length, 1, "duplicates are not re-analysed");
  } finally {
    await app.close();
  }
});

test("AC10: a second angle of the same meal attaches; a dessert added to it extends it", async () => {
  const angle = { ...steak, relation_to_recent_meal: "same_meal" };
  const dessert = { ...steak, relation_to_recent_meal: "additional_items", meal_name: "cheesecake", items: [{ name: "cheesecake", grams: 120, preparation: null, confidence: 0.7, energy_low_kcal: 300, energy_high_kcal: 450, nutrients: { energy_kcal: 385, protein_g: 7, carbs_g: 31, fat_g: 26, fiber_g: null, sugar_g: 25, sat_fat_g: 15, sodium_mg: 300 } }] };
  const app = await startApp({ fixtures: { a: steak, b: angle, c: dessert } });
  try {
    const first = await app.device("POST", "/v1/device/photos", photo("a", "2026-11-20T23:15:00Z"));
    const second = await app.device("POST", "/v1/device/photos", photo("b", "2026-11-20T23:20:00Z"));
    assert.equal(second.body.state, "attached");
    assert.equal(second.body.meal_id, first.body.meal_id);
    assert.ok(app.analyzer.calls[1].context.recent_meal, "the analyzer is told about the recent meal");
    const third = await app.device("POST", "/v1/device/photos", photo("c", "2026-11-20T23:50:00Z"));
    assert.equal(third.body.meal_id, first.body.meal_id);
    const meal = app.store.meal(first.body.meal_id);
    assert.equal(meal.items.length, 3);
    assert.equal(meal.version, 2);
  } finally {
    await app.close();
  }
});

test("AC11: an analyzer outage queues the photo and maintenance completes it later", async () => {
  const fail = new Map([["steak-plate", { remaining: 2 }]]);
  const app = await startApp({ fixtures: { "steak-plate": steak }, fail });
  try {
    const r = await app.device("POST", "/v1/device/photos", photo("steak-plate", "2026-11-20T23:15:00Z"));
    assert.equal(r.body.state, "queued");
    assert.match(r.body.error, /simulated outage/);
    // Backoff not yet elapsed: nothing happens.
    let m = await app.call("POST", "/api/maintenance", {});
    assert.equal(m.body.processed, 0);
    app.clock.t = new Date(app.clock.t.getTime() + 61000);
    m = await app.call("POST", "/api/maintenance", {});
    assert.equal(m.body.processed, 1);
    assert.equal(app.store.photo(r.body.id).state, "queued");
    app.clock.t = new Date(app.clock.t.getTime() + 3 * 60000);
    await app.call("POST", "/api/maintenance", {});
    const done = app.store.photo(r.body.id);
    assert.equal(done.state, "logged");
    assert.equal(done.attempts, 3);
  } finally {
    await app.close();
  }
});

test("AC11: with no analyzer configured photos are kept, not lost", async () => {
  const app = await startApp({ analyzer: false });
  try {
    const r = await app.device("POST", "/v1/device/photos", photo("x", "2026-11-20T23:15:00Z"));
    assert.equal(r.status, 201);
    assert.equal(r.body.state, "queued");
    assert.equal(r.body.image_retained, true);
    const status = await app.tool("get_processing_status");
    assert.equal(status.analyzer, null);
    assert.equal(status.counts.queued, 1);
  } finally {
    await app.close();
  }
});

test("AC3/13: menus, groceries and other people's plates are not logged, and their images are dropped at once", async () => {
  const friend = { ...steak, kind: "other_persons_food", consumed_likelihood: 0.1 };
  const app = await startApp({ fixtures: { menu, friend } });
  try {
    const a = await app.device("POST", "/v1/device/photos", photo("menu", "2026-11-20T23:00:00Z"));
    const b = await app.device("POST", "/v1/device/photos", photo("friend", "2026-11-20T23:10:00Z"));
    for (const r of [a, b]) {
      assert.equal(r.body.state, "ignored");
      assert.equal(r.body.image_retained, false);
      assert.equal(r.body.meal_id, null);
    }
    assert.equal(app.store.mealsByDate("2026-11-20", "2026-11-20").length, 0);
    // "Actually I did eat that": promote the ignored photo's estimate.
    const pend = await app.tool("get_pending_reviews", { days: 30 });
    assert.equal(pend.photos_not_logged.length, 2);
    const meal = await app.tool("resolve_pending_review", { action: "log_photo", photo_id: b.body.id });
    assert.equal(meal.status, "logged");
  } finally {
    await app.close();
  }
});

test("AC13: a photo below the on-device food score is refused without storing its image", async () => {
  const app = await startApp({ fixtures: {} });
  try {
    const r = await app.device("POST", "/v1/device/photos", photo("cat", "2026-11-20T23:00:00Z", { food_score: 0.02 }));
    assert.equal(r.body.state, "ignored");
    assert.equal(app.analyzer.calls.length, 0);
    assert.equal(app.store.photo(r.body.id).image, null);
  } finally {
    await app.close();
  }
});

test("uncertain meals are provisional: out of totals and Apple Health until confirmed", async () => {
  const unsure = { ...steak, overall_confidence: 0.35 };
  const app = await startApp({ fixtures: { u: unsure } });
  try {
    const r = await app.device("POST", "/v1/device/photos", photo("u", "2026-11-20T23:15:00Z"));
    const meal = app.store.meal(r.body.meal_id);
    assert.equal(meal.status, "provisional");
    const totals = await app.tool("get_daily_totals", { date: "2026-11-20" });
    assert.equal(totals.meals_provisional, 1);
    assert.equal(totals.provisional_totals.energy_kcal, 670);
    assert.equal(totals.totals.energy_kcal, undefined);
    let feed = await app.device("GET", "/v1/device/healthkit/changes?since=0");
    assert.equal(feed.body.changes.length, 0);
    await app.tool("resolve_pending_review", { action: "confirm", meal_id: meal.id });
    feed = await app.device("GET", "/v1/device/healthkit/changes?since=0");
    assert.equal(feed.body.changes[0].action, "upsert");
  } finally {
    await app.close();
  }
});

test("provisional meals auto-confirm after the policy window when enabled", async () => {
  const app = await startApp({ fixtures: { u: { ...steak, overall_confidence: 0.35 } } });
  try {
    await app.tool("update_nutrition_targets", { policy: { provisional_auto_confirm_hours: 12 } });
    const r = await app.device("POST", "/v1/device/photos", photo("u", "2026-11-20T23:15:00Z"));
    app.clock.t = new Date(app.clock.t.getTime() + 13 * 3600000);
    const m = await app.call("POST", "/api/maintenance", {});
    assert.equal(m.body.confirmed, 1);
    assert.equal(app.store.meal(r.body.meal_id).status, "logged");
  } finally {
    await app.close();
  }
});

test("a nutrition label photographed before the meal is applied when the meal arrives", async () => {
  const label = { kind: "nutrition_label", consumed_likelihood: 0.5, relation_to_recent_meal: "none", meal_name: "label", overall_confidence: 0.95, items: [], notes: "", label: { product: "Greek yogurt", serving_grams: 170, servings_per_container: 1, per_serving: { energy_kcal: 100, protein_g: 18, carbs_g: 6, fat_g: 0, fiber_g: 0, sugar_g: 4, sat_fat_g: 0, sodium_mg: 65 } } };
  const yogurt = { ...steak, meal_name: "Yogurt bowl", items: [{ name: "greek yogurt", grams: 170, preparation: null, confidence: 0.6, energy_low_kcal: 90, energy_high_kcal: 200, nutrients: { energy_kcal: 150, protein_g: 15, carbs_g: 8, fat_g: 6, fiber_g: 0, sugar_g: 6, sat_fat_g: 4, sodium_mg: 60 } }] };
  const app = await startApp({ fixtures: { label, yogurt } });
  try {
    const l = await app.device("POST", "/v1/device/photos", photo("label", "2026-11-20T12:00:00Z"));
    assert.equal(l.body.state, "label_pending");
    const m = await app.device("POST", "/v1/device/photos", photo("yogurt", "2026-11-20T12:05:00Z"));
    const meal = app.store.meal(m.body.meal_id);
    const item = meal.items[0];
    assert.equal(item.source, "label");
    assert.equal(item.nutrients.protein_g, 18);
    assert.equal(item.nutrients.energy_kcal, 100);
    assert.equal(app.store.photo(l.body.id).state, "attached");
  } finally {
    await app.close();
  }
});

test("screenshots: only nutrition labels are analysed by default", async () => {
  const app = await startApp({ fixtures: { shot: steak } });
  try {
    const r = await app.device("POST", "/v1/device/photos", photo("shot", "2026-11-20T23:15:00Z", { is_screenshot: true }));
    assert.equal(r.body.state, "ignored");
    assert.match(r.body.reason, /not a nutrition label/);
    await app.tool("update_nutrition_targets", { policy: { non_camera_images: "ignore" } });
    const r2 = await app.device("POST", "/v1/device/photos", photo("shot2", "2026-11-20T23:16:00Z", { has_camera_exif: false }));
    assert.equal(r2.body.state, "ignored");
    assert.equal(app.analyzer.calls.length, 1);
  } finally {
    await app.close();
  }
});

test("time zones: the meal's day is the local day where it was eaten", async () => {
  const app = await startApp({ fixtures: { tokyo: steak } });
  try {
    // 2026-11-20 23:30 UTC is 2026-11-21 08:30 in Tokyo.
    const r = await app.device("POST", "/v1/device/photos", photo("tokyo", "2026-11-20T23:30:00Z", { time_zone: "Asia/Tokyo", tz_offset_min: 540 }));
    assert.equal(r.body.local_date, "2026-11-21");
    assert.equal((await app.tool("get_daily_totals", { date: "2026-11-21" })).meals_logged, 1);
    assert.equal((await app.tool("get_daily_totals", { date: "2026-11-20" })).meals_logged, 0);
  } finally {
    await app.close();
  }
});

test("pausing refuses uploads with 503 so the device keeps them queued", async () => {
  const app = await startApp({ fixtures: {} });
  try {
    await app.tool("update_nutrition_targets", { policy: { paused: true } });
    const r = await app.device("POST", "/v1/device/photos", photo("x", "2026-11-20T23:00:00Z"));
    assert.equal(r.status, 503);
    assert.equal(r.body.paused, true);
    const hb = await app.device("POST", "/v1/device/heartbeat", { time_zone: "America/Chicago", wake_reason: "camera_closed" });
    assert.equal(hb.body.paused, true);
  } finally {
    await app.close();
  }
});

test("image retention: images are purged after the retention window", async () => {
  const app = await startApp({ fixtures: { s: steak } });
  try {
    const r = await app.device("POST", "/v1/device/photos", photo("s", "2026-11-20T23:00:00Z"));
    assert.equal(app.store.photo(r.body.id).image !== null, true);
    app.clock.t = new Date(app.clock.t.getTime() + 4 * 86400000);
    const m = await app.call("POST", "/api/maintenance", {});
    assert.equal(m.body.purged, 1);
    assert.equal(app.store.photo(r.body.id).image, null);
  } finally {
    await app.close();
  }
});

test("a HealthKit write the device reports as failed is offered again on later pulls until it succeeds", async () => {
  const app = await startApp({ fixtures: { s: steak } });
  try {
    const r = await app.device("POST", "/v1/device/photos", photo("s", "2026-11-20T23:00:00Z"));
    let feed = await app.device("GET", "/v1/device/healthkit/changes?since=0");
    await app.device("POST", "/v1/device/healthkit/ack", { results: [{ meal_id: r.body.meal_id, version: 1, ok: false, error: "simulated" }] });
    const sync = await app.tool("get_sync_status");
    assert.equal(sync.backlog[0].error, "simulated");
    feed = await app.device("GET", `/v1/device/healthkit/changes?since=${feed.body.cursor}`);
    assert.equal(feed.body.changes.length, 1);
    assert.equal(feed.body.changes[0].retry, true);
    await app.device("POST", "/v1/device/healthkit/ack", { results: [{ meal_id: r.body.meal_id, version: 1, ok: true }] });
    feed = await app.device("GET", `/v1/device/healthkit/changes?since=${feed.body.cursor}`);
    assert.equal(feed.body.changes.length, 0);
    assert.equal((await app.tool("get_sync_status")).pending, 0);
  } finally {
    await app.close();
  }
});
