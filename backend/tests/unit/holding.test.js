// toHolding is the subtraction the whole ledger rests on: what a customer
// holds is every gram bought minus every gram sold. Three screens read it -
// the customer's portal, the counter's buy screen and the counter's sell
// screen, where it is the ceiling on what may be sold - so a mistake here is a
// mistake in all three at once.
//
// The pure function is tested here; the locked, concurrent version that guards
// the actual write is tested in tests/integration/ledger.test.js.

import { describe, it, expect } from "vitest";
import { toHolding } from "../../utils/holding.js";

const NO_PURCHASES = { purchases: 0, totalGrams: 0, totalPaid: 0, lastPurchaseOn: null };
const NO_SALES = { sales: 0, totalGrams: 0, totalPayable: 0, lastSaleOn: null };

describe("toHolding", () => {
  it("reports bought minus sold as the figure to act on", () => {
    const holding = toHolding(
      { purchases: 3, totalGrams: 10, totalPaid: 1050, lastPurchaseOn: "2026-08-01" },
      { sales: 1, totalGrams: 4, totalPayable: 400, lastSaleOn: "2026-08-05" }
    );

    expect(holding.totalGrams).toBe(6);
    expect(holding.gramsLabel).toBe("6.000 g");
  });

  it("keeps the two gross sides available without deciding anything from them", () => {
    const holding = toHolding(
      { purchases: 3, totalGrams: 10, totalPaid: 1050, lastPurchaseOn: "2026-08-01" },
      { sales: 1, totalGrams: 4, totalPayable: 400, lastSaleOn: "2026-08-05" }
    );

    expect(holding.boughtGrams).toBe(10);
    expect(holding.soldGrams).toBe(4);
    expect(holding.totalPaid).toBe(1050);
    expect(holding.totalReceived).toBe(400);
    expect(holding.purchases).toBe(3);
    expect(holding.sales).toBe(1);
  });

  it("is exactly zero when everything held has been sold", () => {
    // The case the sell path has to allow: a customer must be able to sell
    // their whole holding, and the result must land on a clean zero rather
    // than a floating-point crumb that then reads as a tiny leftover.
    const bought = 0.952381;
    const holding = toHolding(
      { purchases: 1, totalGrams: bought, totalPaid: 100, lastPurchaseOn: "2026-08-01" },
      { sales: 1, totalGrams: bought, totalPayable: 95, lastSaleOn: "2026-08-02" }
    );

    expect(holding.totalGrams).toBe(0);
    expect(holding.gramsLabel).toBe("0.000 g");
  });

  it("holds six-decimal precision through the subtraction", () => {
    const holding = toHolding(
      { purchases: 1, totalGrams: 9.52381, totalPaid: 1000, lastPurchaseOn: "2026-08-01" },
      { sales: 1, totalGrams: 4, totalPayable: 400, lastSaleOn: "2026-08-02" }
    );

    expect(holding.totalGrams).toBe(5.52381);
  });

  it("reports a zero holding for a customer who has never traded", () => {
    const holding = toHolding(NO_PURCHASES, NO_SALES);

    expect(holding.totalGrams).toBe(0);
    expect(holding.gramsLabel).toBe("0.000 g");
    expect(holding.purchases).toBe(0);
    expect(holding.lastPurchaseOn).toBeNull();
  });

  it("accepts the DECIMAL strings the driver actually returns", () => {
    // SUM() over a DECIMAL column comes back as a string. If the subtraction
    // coerced badly, "10.000000" - "4.000000" would concatenate rather than
    // subtract, and every holding in the system would be wrong.
    const holding = toHolding(
      { purchases: 1, totalGrams: "10.000000", totalPaid: "1050.00", lastPurchaseOn: null },
      { sales: 1, totalGrams: "4.000000", totalPayable: "400.00", lastSaleOn: null }
    );

    expect(holding.totalGrams).toBe(6);
  });

  // Not reachable through the API - the sell path refuses to overdraw - but
  // worth pinning: if a negative ever appears here it means a row was written
  // around the lock, and it should show as negative rather than as zero.
  it("does not clamp a negative holding to zero", () => {
    const holding = toHolding(
      { purchases: 1, totalGrams: 1, totalPaid: 105, lastPurchaseOn: null },
      { sales: 1, totalGrams: 3, totalPayable: 300, lastSaleOn: null }
    );

    expect(holding.totalGrams).toBe(-2);
  });
});
