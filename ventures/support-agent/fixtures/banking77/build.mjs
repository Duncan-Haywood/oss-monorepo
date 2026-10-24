#!/usr/bin/env node
// Rebuild dev.csv and test.csv from the BANKING77 dataset (PolyAI, CC BY 4.0; see README.md here).
//   curl -O https://raw.githubusercontent.com/PolyAI-LDN/task-specific-datasets/master/banking_data/train.csv
//   curl -O https://raw.githubusercontent.com/PolyAI-LDN/task-specific-datasets/master/banking_data/test.csv
//   node build.mjs train.csv test.csv
// dev.csv: the first 40 training questions of each intent used (for tuning). test.csv: every test question of those
// intents (40 each, held out). examples.csv: the next 40 training questions of each intent, as past questions a
// deployer has labelled (disjoint from dev.csv and from the test split). Each question's expected outcome is the article that covers its intent, or "handoff"
// for intents no article in kb.md covers (most need someone to look at the account).
import { readFileSync, writeFileSync } from "node:fs";
import { parseCsv } from "../../eval.mjs";

export const COVERED = {
  card_arrival: "card-delivery", card_delivery_estimate: "card-delivery", activate_my_card: "activate-card",
  change_pin: "change-pin", pin_blocked: "pin-blocked", topping_up_by_card: "top-up-by-card", top_up_by_card_charge: "top-up-by-card",
  transfer_into_account: "top-up-bank-transfer", top_up_by_bank_transfer_charge: "top-up-bank-transfer", top_up_limits: "top-up-limits",
  exchange_rate: "exchange-rates", exchange_charge: "exchange-rates", exchange_via_app: "exchange-rates",
  fiat_currency_support: "supported-currencies", supported_cards_and_currencies: "supported-currencies", country_support: "country-support",
  apple_pay_or_google_pay: "apple-google-pay", getting_virtual_card: "virtual-cards", get_disposable_virtual_card: "virtual-cards",
  disposable_card_limits: "virtual-cards", age_limit: "age-limit", verify_my_identity: "verify-identity", why_verify_identity: "verify-identity",
  passcode_forgotten: "passcode", terminate_account: "close-account", edit_personal_details: "edit-details", transfer_timing: "transfer-timing",
  atm_support: "atm-cash", cash_withdrawal_charge: "atm-cash", card_about_to_expire: "card-expiry", getting_spare_card: "order-card",
  order_physical_card: "order-card", get_physical_card: "order-card", contactless_not_working: "contactless",
};
export const HANDOFF = ["compromised_card", "lost_or_stolen_card", "lost_or_stolen_phone", "transaction_charged_twice", "request_refund",
  "Refund_not_showing_up", "card_payment_not_recognised", "cash_withdrawal_not_recognised", "direct_debit_payment_not_recognised",
  "wrong_amount_of_cash_received", "card_swallowed", "extra_charge_on_statement", "declined_card_payment", "failed_transfer", "pending_transfer",
  "top_up_failed", "balance_not_updated_after_bank_transfer", "transfer_not_received_by_recipient", "unable_to_verify_identity", "beneficiary_not_allowed"];

const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
function cases(file, perIntent, skip = 0) {
  const rows = parseCsv(readFileSync(file, "utf8")).slice(1), seen = {}, out = ["question,expect,intent"];
  for (const [text, intent] of rows) {
    const expect = COVERED[intent] || (HANDOFF.includes(intent) ? "handoff" : null);
    if (!expect) continue;
    const n = (seen[intent] = (seen[intent] || 0) + 1);
    if (n <= skip || n > skip + perIntent) continue;
    out.push([q(text.trim().replace(/\s+/g, " ")), expect, intent].join(","));
  }
  return out.join("\n") + "\n";
}
if (process.argv[1]?.endsWith("build.mjs")) {
  const [train, test] = process.argv.slice(2);
  writeFileSync(new URL("./dev.csv", import.meta.url), cases(train, 40));
  writeFileSync(new URL("./examples.csv", import.meta.url), cases(train, 40, 40));
  writeFileSync(new URL("./test.csv", import.meta.url), cases(test, Infinity));
}
