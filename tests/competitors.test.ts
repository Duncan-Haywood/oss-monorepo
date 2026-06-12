import assert from "node:assert/strict";
import test from "node:test";
import { buildCompetitorBattlecards } from "../src/lib/competitors.ts";

test("buildCompetitorBattlecards shows Print Atelier winning against POD benchmarks at healthy economics", () => {
  const deck = buildCompetitorBattlecards({
    retailPrice: 85,
    fulfillmentCost: 28,
    monthlyOrders: 12,
  });

  assert.equal(deck.overallPosition, "win");
  assert.ok(deck.podAdvantagePerOrder > 0);
  assert.equal(deck.cards[0]?.id, "print-atelier");
  assert.ok(deck.cards.some((card) => card.id === "society6"));
  assert.ok(deck.cards.some((card) => card.name.includes("Redbubble")));
  assert.ok(deck.cards.every((card) => card.objectionHandlers.length >= 2));
});

test("buildCompetitorBattlecards flags weak economics before competitive outreach", () => {
  const deck = buildCompetitorBattlecards({
    retailPrice: 55,
    fulfillmentCost: 40,
    monthlyOrders: 8,
  });

  assert.equal(deck.overallPosition, "lose");
  assert.ok(deck.podAdvantagePerOrder < 0);
  assert.match(deck.recommendation, /Fix economics/i);
});
