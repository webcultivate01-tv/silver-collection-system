// The arithmetic every rupee and every gram in the system passes through.
//
// This is the highest-value unit test in the project: a rounding mistake here
// doesn't throw, it just quietly moves fractions of a gram between the shop and
// its customers on every single transaction.

import { describe, it, expect } from "vitest";
import {
  roundGrams,
  roundRupees,
  gramsForAmount,
  amountForGrams,
  gramsToMilligrams,
  formatGrams,
  GRAM_DECIMALS,
} from "../../utils/silverMath.js";

describe("gramsForAmount", () => {
  it("keeps the fraction of a gram that two decimals would round away", () => {
    // The worked example from the module's own documentation: rounding
    // 0.952380952... to 0.95 g would keep 2.38 mg of the customer's silver.
    expect(gramsForAmount(100, 105)).toBe(0.952381);
  });

  it("stores to six decimals, which is one microgram", () => {
    const grams = gramsForAmount(1, 3);
    expect(grams).toBe(0.333333);
    expect(String(grams).split(".")[1].length).toBeLessThanOrEqual(GRAM_DECIMALS);
  });

  it("returns null rather than a number when the rate is unusable", () => {
    // The important half: a missing rate must never silently become 0 g or
    // Infinity g, either of which would be written to the ledger as fact.
    expect(gramsForAmount(100, 0)).toBeNull();
    expect(gramsForAmount(100, -5)).toBeNull();
    expect(gramsForAmount(100, null)).toBeNull();
    expect(gramsForAmount(100, undefined)).toBeNull();
    expect(gramsForAmount(100, "abc")).toBeNull();
    expect(gramsForAmount(100, Infinity)).toBeNull();
  });

  it("returns null for an unusable amount", () => {
    expect(gramsForAmount(-1, 105)).toBeNull();
    expect(gramsForAmount("abc", 105)).toBeNull();
    expect(gramsForAmount(NaN, 105)).toBeNull();
    expect(gramsForAmount(Infinity, 105)).toBeNull();
  });

  it("treats a zero payment as zero grams, not as an error", () => {
    expect(gramsForAmount(0, 105)).toBe(0);
  });
});

describe("amountForGrams", () => {
  it("is the inverse of gramsForAmount to the paise", () => {
    const grams = gramsForAmount(100, 105);
    expect(amountForGrams(grams, 105)).toBe(100);
  });

  it("rounds money to paise, not to six decimals", () => {
    expect(amountForGrams(0.952381, 105)).toBe(100);
    expect(amountForGrams(1.005, 100)).toBe(100.5);
  });

  it("returns null on an unusable rate or weight", () => {
    expect(amountForGrams(5, 0)).toBeNull();
    expect(amountForGrams(-5, 100)).toBeNull();
    expect(amountForGrams(NaN, 100)).toBeNull();
  });
});

describe("roundGrams and roundRupees", () => {
  it("rounds on the decimal string, which handles the documented case", () => {
    // The worked example in the module's own comment.
    expect(roundGrams(1.0000005)).toBe(1.000001);
  });

  // KNOWN DEFECT (see BUG-25 in the report). The module comments claim that
  // rounding via toFixed means "1.0000005 can't be knocked off by binary
  // floating point before it is rounded". That is true for that one value and
  // false in general: toFixed still reads the binary double, and a decimal
  // literal ending in 5 is usually stored a hair BELOW the tie, so it rounds
  // down. These assertions pin the real behaviour rather than the claimed one.
  it("does NOT round exact-looking .5 ties upward", () => {
    expect(roundRupees(1.005)).toBe(1); // a half-up rule would give 1.01
    expect(roundRupees(2.675)).toBe(2.67); // ...and 2.68

    // Worth keeping in proportion: the error is half a paise, and it only
    // appears on a value that looks like an exact tie in decimal. No division
    // in this codebase produces one. It is a documentation defect more than a
    // financial one - but the comment should not promise what it doesn't do.
  });

  it("returns NaN for values that aren't numbers", () => {
    expect(roundGrams("abc")).toBeNaN();
    expect(roundRupees(undefined)).toBeNaN();
  });
});

describe("formatGrams", () => {
  it("always shows three decimals, so one number reads as grams and milligrams", () => {
    expect(formatGrams(12.35)).toBe("12.350 g");
    expect(formatGrams(0.952381)).toBe("0.952 g");
    expect(formatGrams(0)).toBe("0.000 g");
  });

  it("shows a weight under half a milligram as 0.000 g rather than hiding it", () => {
    expect(formatGrams(0.0004)).toBe("0.000 g");
  });

  it("accepts the DECIMAL string MySQL returns, not just a number", () => {
    // Every gram figure arrives from the driver as a string. If this returned
    // the em dash, every weight in the app would render as "—".
    expect(formatGrams("9.523810")).toBe("9.524 g");
  });

  it("renders an em dash for something that isn't a number at all", () => {
    expect(formatGrams(undefined)).toBe("—");
    expect(formatGrams("abc")).toBe("—");
    expect(formatGrams(NaN)).toBe("—");
  });

  // FIXED (was BUG-26). Number(null) is 0 and 0 is finite, so the backend's
  // guard used to let null through and print a confident "0.000 g" for a
  // weight it did not know - while the frontend's copy of the very same
  // function guarded it correctly. The two had drifted; they now agree.
  it("renders an unknown weight as an em dash, not a false zero", () => {
    expect(formatGrams(null)).toBe("—");
    expect(formatGrams(undefined)).toBe("—");
    expect(formatGrams("")).toBe("—");
  });
});

describe("gramsToMilligrams", () => {
  it("converts at the relation the display format leans on", () => {
    expect(gramsToMilligrams(0.952381)).toBe(952.381);
    expect(gramsToMilligrams(1)).toBe(1000);
  });

  it("returns null for a non-number", () => {
    expect(gramsToMilligrams("abc")).toBeNull();
  });
});

describe("round-trip stability", () => {
  it("does not drift when a thousand purchases are summed", () => {
    // What the customer's holding actually is: a SUM over stored values. If
    // each stored gram figure were rounded to two decimals, this would be out
    // by more than two grams.
    const each = gramsForAmount(100, 105);
    const total = roundGrams(Array.from({ length: 1000 }, () => each).reduce((a, b) => a + b, 0));

    expect(total).toBeCloseTo(952.381, 3);
    expect(Math.abs(total - 1000 * (100 / 105))).toBeLessThan(0.001);
  });
});
