import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyVipTier,
  getTierDiscount,
  getTierHoldHours,
  generateVipPasscode,
  generatePresaleOffer,
  calculateCatalogPresaleProjection,
  scheduleViewingSlots,
  VipCollector,
  ArtFairCatalogItem,
} from "../src/lib/art-fair-presale-catalog.ts";

describe("Art Fair VIP Presale Catalog Engine", () => {
  it("classifies collectors into VIP tiers accurately", () => {
    const platinumCollector: VipCollector = {
      id: "col-1",
      name: "Alice",
      email: "alice@example.com",
      lifetimeSpendUsd: 55_000,
      purchasedEditionsCount: 5,
    };
    const goldCollector: VipCollector = {
      id: "col-2",
      name: "Bob",
      email: "bob@example.com",
      lifetimeSpendUsd: 18_000,
      purchasedEditionsCount: 8,
    };
    const silverCollector: VipCollector = {
      id: "col-3",
      name: "Charlie",
      email: "charlie@example.com",
      lifetimeSpendUsd: 6_000,
      purchasedEditionsCount: 3,
    };
    const generalCollector: VipCollector = {
      id: "col-4",
      name: "Dave",
      email: "dave@example.com",
      lifetimeSpendUsd: 1_200,
      purchasedEditionsCount: 1,
    };

    assert.equal(classifyVipTier(platinumCollector), "PLATINUM");
    assert.equal(classifyVipTier(goldCollector), "GOLD");
    assert.equal(classifyVipTier(silverCollector), "SILVER");
    assert.equal(classifyVipTier(generalCollector), "GENERAL");
  });

  it("returns correct discounts and hold hours per tier", () => {
    assert.equal(getTierDiscount("PLATINUM"), 15);
    assert.equal(getTierDiscount("GOLD"), 10);
    assert.equal(getTierDiscount("SILVER"), 5);
    assert.equal(getTierDiscount("GENERAL"), 0);

    assert.equal(getTierHoldHours("PLATINUM"), 48);
    assert.equal(getTierHoldHours("GOLD"), 24);
    assert.equal(getTierHoldHours("SILVER"), 12);
    assert.equal(getTierHoldHours("GENERAL"), 6);
  });

  it("generates deterministic VIP passcodes", () => {
    const passcode = generateVipPasscode("col-9988", "Art Basel Miami");
    assert.equal(passcode, "VIP-ARTB-9988");
  });

  it("generates presale offers with accurate pricing, discounts, and deposits", () => {
    const collector: VipCollector = {
      id: "col-100",
      name: "Elena",
      email: "elena@example.com",
      lifetimeSpendUsd: 60_000,
      purchasedEditionsCount: 20,
      requestedTimeSlot: "10:00",
    };

    const item: ArtFairCatalogItem = {
      id: "art-50",
      title: "Solitude No. 4",
      artistName: "Marcus Vance",
      medium: "Archival Pigment Print",
      editionTotal: 10,
      presaleReservedCount: 5,
      listPriceUsd: 10_000,
    };

    const offer = generatePresaleOffer(collector, item, true);

    assert.equal(offer.assignedTier, "PLATINUM");
    assert.equal(offer.discountPercentage, 15);
    assert.equal(offer.presalePriceUsd, 8500); // $10,000 less 15%
    assert.equal(offer.presaleDepositRequiredUsd, 1700); // 20% of $8500
    assert.equal(offer.reservationHoldHours, 48);
    assert.equal(offer.assignedViewingSlot, "10:00");
    assert.equal(offer.isSlotConfirmed, true);
  });

  it("calculates presale catalog financial projections and conversion rates", () => {
    const items: ArtFairCatalogItem[] = [
      {
        id: "item-1",
        title: "Monochrome Study",
        artistName: "Elena Rostova",
        medium: "Silver Gelatin Print",
        editionTotal: 10,
        presaleReservedCount: 4,
        listPriceUsd: 5_000,
      },
      {
        id: "item-2",
        title: "Chromatic Shift",
        artistName: "Kai Tanaka",
        medium: "Giclée Print",
        editionTotal: 20,
        presaleReservedCount: 10,
        listPriceUsd: 2_500,
      },
    ];

    const collectors: VipCollector[] = [
      {
        id: "c1",
        name: "Plat 1",
        email: "p1@ex.com",
        lifetimeSpendUsd: 100_000,
        purchasedEditionsCount: 25,
      },
      { id: "c2", name: "Gold 1", email: "g1@ex.com", lifetimeSpendUsd: 20_000, purchasedEditionsCount: 8 },
    ];

    const projection = calculateCatalogPresaleProjection("Frieze London", items, collectors);

    assert.equal(projection.fairName, "Frieze London");
    assert.equal(projection.totalCatalogItems, 30);
    assert.equal(projection.totalCatalogValueUsd, 100_000); // (10*5000) + (20*2500)
    // Reservable presale value = (4 * 5000) + (10 * 2500) = 20,000 + 25,000 = 45,000
    // Conversion rate = (0.65 + 0.45) / 2 = 0.55
    // Projected presale revenue = 45,000 * 0.55 = 24,750
    // Deposit = 24,750 * 0.20 = 4,950
    assert.equal(projection.projectedConversionRate, 0.55);
    assert.equal(projection.projectedPresaleRevenueUsd, 24750);
    assert.equal(projection.projectedPresaleDepositRevenueUsd, 4950);
    assert.equal(projection.allocatedVipCount.PLATINUM, 1);
    assert.equal(projection.allocatedVipCount.GOLD, 1);
  });

  it("prioritizes higher VIP tiers when scheduling viewing slots", () => {
    const collectors: VipCollector[] = [
      {
        id: "c-general",
        name: "Gen",
        email: "gen@ex.com",
        lifetimeSpendUsd: 100,
        purchasedEditionsCount: 1,
        requestedTimeSlot: "10:00",
      },
      {
        id: "c-platinum",
        name: "Plat",
        email: "plat@ex.com",
        lifetimeSpendUsd: 80_000,
        purchasedEditionsCount: 20,
        requestedTimeSlot: "10:00",
      },
    ];

    const availableSlots = ["10:00", "11:30"];
    const schedule = scheduleViewingSlots(collectors, availableSlots, 1);

    const slot10 = schedule.find((s) => s.slotTime === "10:00");
    const slot11 = schedule.find((s) => s.slotTime === "11:30");

    assert.ok(slot10);
    assert.ok(slot11);
    // Platinum collector gets priority for 10:00 slot
    assert.equal(slot10.assignedCollectors[0].collectorId, "c-platinum");
    // General collector gets bumped to 11:30 fallback slot
    assert.equal(slot11.assignedCollectors[0].collectorId, "c-general");
  });
});
