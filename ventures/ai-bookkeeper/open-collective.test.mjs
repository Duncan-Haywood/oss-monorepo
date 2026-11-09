import test from "node:test";
import assert from "node:assert/strict";
import { readStatement } from "./bank.mjs";

// Header follows Open Collective's transactions CSV from memory of its export (datetime, shortId, ...,
// amount, paymentProcessorFee, netAmount, balance, currency, ...); rows are made up.
const csv = [
  "datetime,shortId,shortGroup,description,type,kind,isRefund,isRefunded,shortRefundId,displayAmount,amount,paymentProcessorFee,netAmount,balance,currency,accountSlug,accountName,oppositeAccountSlug,oppositeAccountName,paymentMethodService,paymentMethodType,expenseType,expenseTags,payoutMethodType,merchantId,orderMemo",
  '2026-10-02T14:05:11,aaaa1111,g1,"Monthly contribution",CREDIT,CONTRIBUTION,,,,$10.00,10,-0.8,9.2,109.2,USD,proj,Proj,sam,Sam,stripe,creditcard,,,,,',
  '2026-10-05T09:00:00,bbbb2222,g2,"Hosting invoice",DEBIT,EXPENSE,,,,$25.00,-25,0,-25,84.2,USD,proj,Proj,hz,Hetzner,,,INVOICE,hosting,BANK_ACCOUNT,,',
].join("\n");

test("Open Collective export: the net amount moves the balance, so it is the amount", () => {
  const { rows, problems } = readStatement(csv);
  assert.deepEqual(rows.map((r) => r.cents), [920, -2500]);
  assert.deepEqual(rows.map((r) => r.balance), [10920, 8420]);
  assert.equal(rows[0].desc, "Monthly contribution");
  assert.deepEqual(problems, []);
});
