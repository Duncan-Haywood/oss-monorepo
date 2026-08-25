export function calculateOrder(input) {
  const number = (value, name) => {
    const result = Number(value);
    if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
    return result;
  };
  const price = number(input.price, 'Price');
  const shippingCharged = number(input.shippingCharged ?? 0, 'Shipping charged');
  const listingFee = number(input.listingFee ?? 0.2, 'Listing fee');
  const transactionRate = number(input.transactionRate ?? 6.5, 'Transaction rate');
  const paymentRate = number(input.paymentRate ?? 3, 'Payment rate');
  const paymentFixed = number(input.paymentFixed ?? 0.25, 'Payment fixed fee');
  const offsiteAdRate = number(input.offsiteAdRate ?? 0, 'Offsite ad rate');
  const shippingCost = number(input.shippingCost ?? 0, 'Shipping cost');
  const materialCost = number(input.materialCost ?? 0, 'Material cost');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const revenue = price + shippingCharged;
  const fees = {
    listing: listingFee,
    transaction: revenue * transactionRate / 100,
    payment: revenue * paymentRate / 100 + paymentFixed,
    offsiteAd: revenue * offsiteAdRate / 100,
  };
  const costs = fees.listing + fees.transaction + fees.payment + fees.offsiteAd + shippingCost + materialCost + otherCost;
  const profit = revenue - costs;
  return {
    revenue, fees, costs, profit,
    margin: revenue === 0 ? 0 : profit / revenue * 100,
    breakEvenPrice: Math.max(0, (listingFee + paymentFixed + shippingCost + materialCost + otherCost) /
      (1 - (transactionRate + paymentRate + offsiteAdRate) / 100)),
  };
}

export function priceForMargin(input, targetMargin) {
  const margin = Number(targetMargin);
  if (!Number.isFinite(margin) || margin < 0 || margin >= 100) throw new Error('Target margin must be between 0 and 99.9%');
  const n = name => Number(input[name] ?? ({ listingFee: .2, paymentFixed: .25, transactionRate: 6.5, paymentRate: 3, offsiteAdRate: 0 }[name] ?? 0));
  const denominator = 1 - (n('transactionRate') + n('paymentRate') + n('offsiteAdRate')) / 100 - margin / 100;
  if (denominator <= 0) throw new Error('Target margin is not possible with these fee rates');
  return Math.max(0, (n('listingFee') + n('paymentFixed') + n('shippingCost') + n('materialCost') + n('otherCost')) / denominator - n('shippingCharged'));
}

// How many extra orders the cheaper-per-order path needs so monthly profit
// matches the richer path. Percentage fees apply to item + shipping charged,
// so moving a label into the item price (same customer total) is a tie.
// Free shipping only changes profit when the customer total changes, or when
// it brings more orders — which is the question this helper answers.
function liftToMatch(baseProfit, altProfit) {
  if (altProfit > baseProfit + 1e-9) {
    return { liftPercent: 0, extraPerOrder: 0, canWinWithVolume: true, alreadyAhead: true };
  }
  if (Math.abs(altProfit - baseProfit) <= 1e-9) {
    return { liftPercent: 0, extraPerOrder: 0, canWinWithVolume: true, alreadyAhead: false };
  }
  if (altProfit <= 0) {
    return { liftPercent: null, extraPerOrder: null, canWinWithVolume: false, alreadyAhead: false };
  }
  const extraPerOrder = (baseProfit - altProfit) / altProfit;
  return {
    liftPercent: extraPerOrder * 100,
    extraPerOrder,
    canWinWithVolume: true,
    alreadyAhead: false,
  };
}

function winner(left, right) {
  if (left > right + 1e-9) return 'raised';
  if (right > left + 1e-9) return 'charged';
  return 'tie';
}

export function compareFreeShipping(input) {
  const charged = calculateOrder(input);
  const price = Number(input.price);
  const shippingCharged = Number(input.shippingCharged ?? 0);
  const rawFree = input.freeShipPrice;
  const freeShipPrice = rawFree === undefined || rawFree === '' ? price + shippingCharged : Number(rawFree);
  if (!Number.isFinite(freeShipPrice) || freeShipPrice < 0) {
    throw new Error('Free-shipping item price must be a non-negative number');
  }
  const rawOrders = input.monthlyOrders;
  const monthlyOrders = rawOrders === undefined || rawOrders === '' ? 0 : Number(rawOrders);
  if (!Number.isFinite(monthlyOrders) || monthlyOrders < 0) {
    throw new Error('Monthly orders must be a non-negative number');
  }

  const eatLabel = calculateOrder({ ...input, shippingCharged: 0 });
  const absorbPrice = price + shippingCharged;
  const absorb = calculateOrder({ ...input, price: absorbPrice, shippingCharged: 0 });
  const raised = calculateOrder({ ...input, price: freeShipPrice, shippingCharged: 0 });
  const lift = liftToMatch(charged.profit, raised.profit);
  const extraOrdersNeeded = lift.extraPerOrder == null ? null : monthlyOrders * lift.extraPerOrder;

  return {
    charged,
    eatLabel,
    absorb,
    raised,
    absorbPrice,
    freeShipPrice,
    monthlyOrders,
    perOrderDelta: raised.profit - charged.profit,
    eatLabelDelta: eatLabel.profit - charged.profit,
    liftPercent: lift.liftPercent,
    extraPerOrder: lift.extraPerOrder,
    extraOrdersNeeded,
    canWinWithVolume: lift.canWinWithVolume,
    alreadyAhead: lift.alreadyAhead,
    winnerPerOrder: winner(raised.profit, charged.profit),
    monthlyCharged: monthlyOrders * charged.profit,
    monthlyRaised: monthlyOrders * raised.profit,
    monthlyEatLabel: monthlyOrders * eatLabel.profit,
  };
}
