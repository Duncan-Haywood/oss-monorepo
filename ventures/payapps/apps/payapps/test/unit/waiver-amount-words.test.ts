// The waiver form's typed values (src/client/components/waivers.tsx, typeValue): Massachusetts'
// partial waiver states the payment in words and in figures, so the words follow the figures until
// the user writes their own.
import { expect, it } from "vitest";
import { typeValue } from "../../src/client/components/waivers";

const ma = {
  paymentAmountCents: "45000.00",
  paymentAmountWords: "Forty-Five Thousand and 00/100 Dollars",
};

it("the words follow the figures while they are the prefilled words", () => {
  const next = typeValue(ma, "paymentAmountCents", "1,234.50");
  expect(next.paymentAmountCents).toBe("1,234.50");
  expect(next.paymentAmountWords).toBe("One Thousand Two Hundred Thirty-Four and 50/100 Dollars");
});

it("blank words are filled; figures that are not an amount clear them", () => {
  expect(
    typeValue({ ...ma, paymentAmountWords: "" }, "paymentAmountCents", "12").paymentAmountWords,
  ).toBe("Twelve and 00/100 Dollars");
  expect(typeValue(ma, "paymentAmountCents", "abc").paymentAmountWords).toBe("");
});

it("words the user wrote are kept", () => {
  const own = { ...ma, paymentAmountWords: "Forty-five thousand dollars exactly" };
  expect(typeValue(own, "paymentAmountCents", "100").paymentAmountWords).toBe(
    "Forty-five thousand dollars exactly",
  );
});

it("forms without words are unchanged apart from the field typed", () => {
  expect(typeValue({ checkAmountCents: "1" }, "checkAmountCents", "2")).toEqual({
    checkAmountCents: "2",
  });
  expect(typeValue(ma, "county", "Suffolk")).toEqual({ ...ma, county: "Suffolk" });
});
