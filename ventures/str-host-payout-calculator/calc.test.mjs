import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHANNEL_PRESETS,
  bookingFrom,
  calculateChannel,
  compareChannels,
  directBreakEvenBookings,
  restoreListedSubtotal,
} from "./calc.mjs";

const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 0.005, `${message}: expected ~${expected}, got ${actual}`);

const stay = {
  nightlyRate: 225,
  nights: 2,
  cleaningFee: 95,
  extraFees: 0,
  taxRate: 10,
  securityDeposit: 200,
  bookingsPerYear: 36,
};

const preset = (id) => CHANNEL_PRESETS.find((channel) => channel.id === id);
const subtotal = 225 * 2 + 95; // 545

test("booking subtotal is nights plus cleaning and extras, tax is extra", () => {
  const booking = bookingFrom(stay);
  close(booking.lodging, 450, "lodging");
  close(booking.subtotal, 545, "subtotal");
  close(booking.tax, 54.5, "tax");
  close(booking.guestPaymentBeforePlatform, 545 + 54.5 + 200, "guest payment");
});

test("rejects a stay with no nights", () => {
  assert.equal(bookingFrom({ ...stay, nights: 0 }).error, "Enter a nightly rate and at least one night.");
});

test("Airbnb host-only: 15.5% of subtotal, processing bundled, guest sees no service fee", () => {
  const result = calculateChannel(preset("airbnb-host-only"), bookingFrom(stay));
  close(result.hostFee, 545 * 0.155, "host fee");
  close(result.processing, 0, "processing is bundled");
  close(result.payoutPerStay, 545 - 545 * 0.155, "payout");
  close(result.guestPays, 545 + 54.5, "guest pays listed + tax only");
  close(result.annualPayout, result.payoutPerStay * 36, "annual");
});

test("Airbnb split: host 3%, guest 14.1% on top — the pre-migration model", () => {
  const result = calculateChannel(preset("airbnb-split"), bookingFrom(stay));
  close(result.hostFee, 545 * 0.03, "host fee");
  close(result.guestFee, 545 * 0.141, "guest fee");
  close(result.payoutPerStay, 545 * 0.97, "payout");
  close(result.guestPays, 545 + 545 * 0.141 + 54.5, "guest pays more than host-only at the same list price");
});

test("Vrbo pay-per-booking: 5% of subtotal plus 3% of guest payment including tax and deposit", () => {
  const result = calculateChannel(preset("vrbo-pay-per-booking"), bookingFrom(stay));
  const guestPayment = 545 + 54.5 + 200;
  close(result.hostFee, 545 * 0.05, "commission");
  close(result.processing, guestPayment * 0.03, "processing on a wider base");
  close(result.payoutPerStay, 545 - 545 * 0.05 - guestPayment * 0.03, "payout");
  assert.ok(
    result.processing > 545 * 0.03,
    "processing must be larger than 3% of the subtotal because tax and deposit are in the base",
  );
});

test("Vrbo subscription amortises the annual fee over the bookings it carries", () => {
  const result = calculateChannel(preset("vrbo-subscription"), bookingFrom(stay));
  close(result.hostFee, 0, "no commission");
  close(result.siteCostPerStay, 599 / 36, "subscription per stay");
  close(result.payoutAfterSite, result.payoutPerStay - 599 / 36, "payout after plan");
  close(result.annualPayout, result.payoutPerStay * 36 - 599, "annual");
});

test("direct booking: card processing plus site cost, then an occupancy haircut", () => {
  const result = calculateChannel(preset("direct"), bookingFrom(stay));
  close(result.processing, 545 * 0.029 + 0.3, "card processing");
  close(result.keptBookings, 36 * 0.7, "70% of marketplace bookings kept");
  close(result.siteCostAnnual, 29 * 12, "website");
  close(
    result.annualPayout,
    result.payoutPerStay * 25.2 - 348,
    "annual after occupancy keep and site cost",
  );
});

test("raising the listed price 14.8% restores the old 3% payout under a 15.5% host fee", () => {
  const restore = restoreListedSubtotal(545, 3, 15.5);
  close(restore.oldPayout, 545 * 0.97, "old payout");
  close(restore.newSubtotal, 545 * 0.97 / 0.845, "new list");
  close(restore.newPayout, restore.oldPayout, "same deposit");
  assert.ok(restore.raisePct > 14.7 && restore.raisePct < 14.9, `raise is ${restore.raisePct}`);
});

test("a 100% new host fee cannot be inverted", () => {
  assert.match(restoreListedSubtotal(545, 3, 100).error, /under 100%/);
});

test("direct break-even bookings pay the site cost and match the target annual", () => {
  const bookings = directBreakEvenBookings(20000, 500, 348);
  close(bookings, (20000 + 348) / 500, "break-even");
  assert.equal(directBreakEvenBookings(20000, 0, 348), null);
});

test("direct break-even floors at zero when the target is already a loss direct beats at zero bookings", () => {
  // A marketplace channel with a large fixed fee and few bookings can lose
  // money for the year. Direct's own payout at zero bookings is already
  // -siteCostAnnual; if that already beats the (negative) target, the
  // honest break-even is 0 stays, not a negative count.
  assert.equal(directBreakEvenBookings(-2000, 500, 348), 0);
  // -cost (-348) does not beat a milder target (-300): direct still needs a
  // small positive number of bookings, not zero.
  close(directBreakEvenBookings(-300, 500, 348), (-300 + 348) / 500, "still positive break-even");
});

test("comparison never reports a negative break-even booking count or occupancy share", () => {
  // Disable every channel except a fixed-fee subscription plan and direct,
  // at a low enough booking volume that the subscription channel's own
  // annual payout is negative — a host can reach this by toggling channels
  // off in the UI.
  const state = CHANNEL_PRESETS.map((channel) => ({
    ...channel,
    enabled: channel.id === "vrbo-subscription" || channel.id === "direct",
  }));
  const comparison = compareChannels(
    { nightlyRate: 50, nights: 2, cleaningFee: 0, extraFees: 0, taxRate: 0, securityDeposit: 0, bookingsPerYear: 2 },
    state,
  );
  const vrboSub = comparison.channels.find((channel) => channel.id === "vrbo-subscription");
  assert.ok(vrboSub.annualPayout < 0, "fixture should exercise a losing marketplace channel");
  assert.ok(comparison.directBreakEven.bookings >= 0, `bookings should not be negative: ${comparison.directBreakEven.bookings}`);
  assert.ok(comparison.directBreakEven.occupancyKeep >= 0, `occupancy share should not be negative: ${comparison.directBreakEven.occupancyKeep}`);
});

test("after the 2026 host-only cut, Vrbo pay-per-booking beats Airbnb at the same list price", () => {
  const comparison = compareChannels(stay);
  const airbnb = comparison.channels.find((channel) => channel.id === "airbnb-host-only");
  const vrbo = comparison.channels.find((channel) => channel.id === "vrbo-pay-per-booking");
  assert.ok(vrbo.annualPayout > airbnb.annualPayout, "Vrbo should win on fees at the same list");
  assert.equal(comparison.best.id, "vrbo-subscription");
});

test("restoring the Airbnb list price makes the guest total close to the old split-fee checkout", () => {
  const comparison = compareChannels(stay);
  // Old guest paid listed + 14.1% + tax. New guest pays the raised list + tax.
  // The two should land within a few percent — the migration moved the fee,
  // it did not invent a new one.
  const deltaPct = Math.abs(comparison.restore.guestDelta) / comparison.restore.legacyGuestPays * 100;
  assert.ok(deltaPct < 4, `guest totals diverged by ${deltaPct.toFixed(1)}%`);
  close(comparison.restore.newPayout, comparison.restore.oldPayout, "restored payout");
});

test("direct break-even says how many stays you must keep to match the best marketplace", () => {
  const comparison = compareChannels(stay);
  assert.ok(comparison.directBreakEven.bookings > 0);
  assert.equal(comparison.directBreakEven.vs, "Vrbo (annual subscription)");
  const direct = comparison.channels.find((channel) => channel.id === "direct");
  close(
    direct.payoutPerStay * comparison.directBreakEven.bookings - direct.siteCostAnnual,
    comparison.best.annualPayout,
    "break-even reconstructs the winner's annual",
  );
});

test("the retired Airbnb split model cannot win even when its payout is highest", () => {
  const comparison = compareChannels(stay);
  const split = comparison.channels.find((channel) => channel.id === "airbnb-split");
  assert.ok(split.annualPayout > comparison.best.annualPayout);
  assert.equal(split.isBest, false);
  assert.equal(split.referenceOnly, true);
});

test("a disabled channel cannot win", () => {
  const channels = CHANNEL_PRESETS.map((channel) => ({
    ...channel,
    enabled: channel.id !== "vrbo-subscription",
  }));
  const comparison = compareChannels(stay, channels);
  assert.equal(comparison.best.id, "vrbo-pay-per-booking");
  assert.equal(comparison.channels.find((channel) => channel.id === "vrbo-subscription").isBest, false);
});

test("compareChannels surfaces the first booking error instead of ranking zeros", () => {
  const comparison = compareChannels({ ...stay, nights: 0 });
  assert.match(comparison.error, /night/);
  assert.equal(comparison.channels.length, 0);
});
