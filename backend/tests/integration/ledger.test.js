// The ledger: buying silver, selling it back, and the holding that is the
// difference between the two.
//
// This is the business logic the whole product exists to get right, and the
// part where a bug costs somebody real money. The properties worth proving:
//
//   * the rate comes from the server, never from the request
//   * the rate and the weight are frozen into the row and never re-derived
//   * a customer can sell exactly what they hold, and never a microgram more
//   * two concurrent sales cannot spend the same gram

import { describe, it, expect, beforeEach, afterAll } from "vitest";

import { api, buildCast, publishRate } from "../helpers/fixtures.js";
import { resetDatabase, closePool, query, countRows } from "../helpers/db.js";

let cast;

beforeEach(async () => {
  await resetDatabase();
  cast = await buildCast(); // rate: buy 105, sell 100
});

afterAll(closePool);

const asEmployee = () => ({ Authorization: `Bearer ${cast.employeeA.token}` });
const asAdmin = () => ({ Authorization: `Bearer ${cast.admin.token}` });

function buy(amountPaid, userId = cast.userA.id) {
  return api().post("/api/purchases").set(asEmployee()).send({ userId, amountPaid });
}

function sell(body, userId = cast.userA.id) {
  return api().post("/api/sales").set(asEmployee()).send({ userId, ...body });
}

function holding(userId = cast.userA.id) {
  return api().get(`/api/purchases/customers/${userId}`).set(asEmployee());
}

describe("recording a purchase", () => {
  it("converts rupees to grams at the published BUYING rate", async () => {
    const res = await buy(1000);

    expect(res.status).toBe(201);
    // 1000 / 105 = 9.523809523... -> 9.523810 at six decimals
    expect(res.body.purchase.grams).toBe(9.52381);
    expect(res.body.purchase.ratePerGram).toBe(105);
    expect(res.body.purchase.amountPaid).toBe(1000);
  });

  it("ignores a rate supplied in the request body", async () => {
    // The whole reason the rate is read server-side: a hand-made API call must
    // not be able to buy silver at a rate of its own choosing.
    const res = await api()
      .post("/api/purchases")
      .set(asEmployee())
      .send({ userId: cast.userA.id, amountPaid: 1000, ratePerGram: 1, rate: 1, grams: 999 });

    expect(res.status).toBe(201);
    expect(res.body.purchase.ratePerGram).toBe(105);
    expect(res.body.purchase.grams).toBe(9.52381);
  });

  it("freezes the rate, so tomorrow's rate does not re-price yesterday's row", async () => {
    await buy(1000);
    await publishRate({ buy: 200, sell: 190, updatedBy: cast.admin.id });
    await buy(1000);

    const rows = await query(
      "SELECT rate_per_gram, grams FROM silver_purchases WHERE user_id = ? ORDER BY id",
      [cast.userA.id]
    );

    expect(Number(rows[0].rate_per_gram)).toBe(105);
    expect(Number(rows[1].rate_per_gram)).toBe(200);

    // And the holding is the sum of the two frozen weights, not a
    // re-derivation of the money at the new rate.
    const view = await holding();
    expect(view.body.holding.totalGrams).toBe(9.52381 + 5);
  });

  it("starts every purchase as pending, awaiting the cash handover", async () => {
    const res = await buy(500);
    expect(res.body.purchase.paymentStatus).toBe("pending");
    expect(res.body.purchase.settlementId).toBeNull();
  });

  it("records who took the money", async () => {
    const res = await buy(500);
    expect(res.body.purchase.employeeId).toBe(cast.employeeA.id);
  });

  it("refuses when no rate has ever been published", async () => {
    await query("DELETE FROM silver_rates");

    const res = await buy(1000);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/no silver rate/i);
    expect(await countRows("silver_purchases")).toBe(0);
  });

  it("refuses a deactivated customer", async () => {
    await api()
      .put(`/api/employee/users/${cast.userA.id}/status`)
      .set(asEmployee())
      .send({ active: false });

    const res = await buy(1000);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/deactivated/i);
    expect(await countRows("silver_purchases")).toBe(0);
  });

  it("refuses a customer that does not exist", async () => {
    const res = await buy(1000, 999999);
    expect(res.status).toBe(404);
  });

  it("rejects unusable amounts without writing a row", async () => {
    const bad = [0, -100, "abc", null, Infinity, NaN, 1e12];

    for (const amountPaid of bad) {
      const res = await buy(amountPaid);
      expect(res.status, String(amountPaid)).toBe(400);
    }

    expect(await countRows("silver_purchases")).toBe(0);
  });
});

describe("selling silver back", () => {
  it("prices at the SELLING rate, which is the lower of the two", async () => {
    await buy(1050); // 10 g at 105
    const res = await sell({ grams: 4 });

    expect(res.status).toBe(201);
    expect(res.body.sale.ratePerGram).toBe(100); // sell rate, not buy rate
    expect(res.body.sale.amountPayable).toBe(400);
  });

  it("accepts either side of the trade and lands on the same weight", async () => {
    await buy(2100); // 20 g

    const byGrams = await sell({ grams: 4 });
    expect(byGrams.body.sale.grams).toBe(4);
    expect(byGrams.body.sale.amountPayable).toBe(400);

    const byRupees = await sell({ amountPayable: 400 });
    expect(byRupees.body.sale.grams).toBe(4);
    expect(byRupees.body.sale.amountPayable).toBe(400);
  });

  it("takes the grams out of the holding straight away", async () => {
    await buy(1050); // 10 g
    await sell({ grams: 4 });

    const view = await holding();
    expect(view.body.holding.totalGrams).toBe(6);
    expect(view.body.holding.boughtGrams).toBe(10);
    expect(view.body.holding.soldGrams).toBe(4);
  });

  it("leaves the payout pending until an admin approves it", async () => {
    await buy(1050);
    const res = await sell({ grams: 4 });

    expect(res.body.sale.payoutStatus).toBe("pending");
    expect(res.body.sale.approvedBy).toBeNull();
    expect(res.body.sale.payoutKind).toBe("cash");
  });

  it("refuses to sell more silver than the customer holds", async () => {
    await buy(1050); // 10 g

    const res = await sell({ grams: 11 });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/only holds/i);
    expect(res.body.availableGrams).toBe(10);
    expect(await countRows("silver_sales")).toBe(0);
  });

  it("refuses a customer with nothing at all", async () => {
    const res = await sell({ grams: 1 });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/no silver to sell/i);
  });

  it("allows selling EXACTLY the whole holding, landing on a clean zero", async () => {
    // The boundary the storage precision exists for: a holding of 9.523810 g
    // must be sellable in full, and must leave nothing behind.
    await buy(1000); // 9.523810 g
    const view = await holding();
    const all = view.body.holding.totalGrams;

    const res = await sell({ grams: all });
    expect(res.status).toBe(201);

    const after = await holding();
    expect(after.body.holding.totalGrams).toBe(0);
    expect(after.body.holding.gramsLabel).toBe("0.000 g");

    // ...and then there is genuinely nothing left.
    const again = await sell({ grams: 0.001 });
    expect(again.status).toBe(409);
  });

  it("refuses one microgram more than the holding", async () => {
    await buy(1000); // 9.523810 g

    const res = await sell({ grams: 9.523811 });
    expect(res.status).toBe(409);
  });

  it("rejects unusable weights without writing a row", async () => {
    await buy(10500);

    for (const grams of [0, -1, "abc", null, Infinity, NaN, 0.0001]) {
      const res = await sell({ grams });
      expect(res.status, String(grams)).toBe(400);
    }

    expect(await countRows("silver_sales")).toBe(0);
  });
});

describe("the holding is one number, computed one way", () => {
  it("agrees across the customer portal, the counter and the admin panel", async () => {
    // Three different endpoints, three different queries, one figure. If these
    // ever disagree, somebody is looking at a number that isn't true.
    await buy(1050);
    await sell({ grams: 4 });

    const [portal, counter, panel] = await Promise.all([
      api().get("/api/purchases/my-holding").set({ Authorization: `Bearer ${cast.userA.token}` }),
      holding(),
      api().get(`/api/users/${cast.userA.id}`).set(asAdmin()),
    ]);

    expect(portal.body.holding.totalGrams).toBe(6);
    expect(counter.body.holding.totalGrams).toBe(6);
    expect(panel.body.holding.totalGrams).toBe(6);
  });

  it("agrees with the employee's own view of their user", async () => {
    await buy(1050);
    await sell({ grams: 4 });

    const res = await api()
      .get(`/api/employee/users/${cast.userA.id}`)
      .set(asEmployee());

    expect(res.body.holding.totalGrams).toBe(6);
  });

  it("survives many small purchases without drifting", async () => {
    // 50 payments of ₹100 at ₹105/g. Two-decimal storage would have lost
    // about 0.12 g of the customer's silver across these.
    for (let i = 0; i < 50; i += 1) {
      await buy(100);
    }

    const view = await holding();
    expect(view.body.holding.totalGrams).toBe(47.61905); // 50 x 0.952381
    expect(Math.abs(view.body.holding.totalGrams - 5000 / 105)).toBeLessThan(0.001);
  });
});

describe("concurrency: the holding lock", () => {
  it("stops two simultaneous sales from spending the same gram", async () => {
    await buy(525); // exactly 5 g

    // Ten requests for the whole holding, fired together. Exactly one may win.
    const results = await Promise.all(Array.from({ length: 10 }, () => sell({ grams: 5 })));

    const created = results.filter((res) => res.status === 201);
    const refused = results.filter((res) => res.status === 409);

    expect(created).toHaveLength(1);
    expect(refused).toHaveLength(9);
    expect(await countRows("silver_sales")).toBe(1);

    const after = await holding();
    expect(after.body.holding.totalGrams).toBe(0);
    // The property that actually matters: never negative.
    expect(after.body.holding.totalGrams).toBeGreaterThanOrEqual(0);
  });

  it("lets concurrent partial sales through only while the silver lasts", async () => {
    await buy(1050); // 10 g

    // Six requests for 2 g each against a 10 g holding: five fit, one cannot.
    const results = await Promise.all(Array.from({ length: 6 }, () => sell({ grams: 2 })));

    const created = results.filter((res) => res.status === 201).length;
    expect(created).toBe(5);

    const after = await holding();
    expect(after.body.holding.totalGrams).toBe(0);
  });

  it("keeps the ledger consistent when buying and selling at the same time", async () => {
    await buy(1050); // 10 g

    await Promise.all([
      sell({ grams: 5 }),
      buy(1050),
      sell({ grams: 5 }),
      buy(1050),
    ]);

    // Whatever the interleaving, the stored rows must add up to the reported
    // holding - that is the invariant, not any particular final number.
    const [sums] = await query(
      `SELECT
         (SELECT COALESCE(SUM(grams),0) FROM silver_purchases WHERE user_id = ?) AS bought,
         (SELECT COALESCE(SUM(grams),0) FROM silver_sales WHERE user_id = ?) AS sold`,
      [cast.userA.id, cast.userA.id]
    );

    const expected = Number(sums.bought) - Number(sums.sold);
    const view = await holding();

    expect(view.body.holding.totalGrams).toBeCloseTo(expected, 6);
    expect(expected).toBeGreaterThanOrEqual(0);
  });
});

describe("approving a payout", () => {
  it("moves a pending sale to paid and records who approved it", async () => {
    await buy(1050);
    const sale = await sell({ grams: 4 });

    const res = await api()
      .post(`/api/sales/${sale.body.sale.id}/approve`)
      .set(asAdmin())
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.sale.payoutStatus).toBe("paid");
    expect(res.body.sale.approvedBy).toBe(cast.admin.id);
    expect(res.body.sale.approvedAt).toBeTruthy();
  });

  it("refuses to approve the same payout twice", async () => {
    await buy(1050);
    const sale = await sell({ grams: 4 });

    await api().post(`/api/sales/${sale.body.sale.id}/approve`).set(asAdmin()).send({});
    const second = await api()
      .post(`/api/sales/${sale.body.sale.id}/approve`)
      .set(asAdmin())
      .send({});

    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/already been approved/i);
  });

  it("approves only once under concurrent clicks", async () => {
    await buy(1050);
    const sale = await sell({ grams: 4 });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        api().post(`/api/sales/${sale.body.sale.id}/approve`).set(asAdmin()).send({})
      )
    );

    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
  });

  it("404s on a sale that does not exist", async () => {
    const res = await api().post("/api/sales/999999/approve").set(asAdmin()).send({});
    expect(res.status).toBe(404);
  });

  // KNOWN GAP (BUG-09). Approval is the only transition a sale has. There is
  // no reject, cancel or reverse - so a mis-keyed sale has permanently removed
  // the customer's silver, and declining to approve does not give it back.
  it("has no way to reverse a sale once recorded", async () => {
    await buy(1050); // 10 g
    const sale = await sell({ grams: 9 }); // meant to be 0.9

    const del = await api().delete(`/api/sales/${sale.body.sale.id}`).set(asAdmin());
    expect(del.status).toBe(404); // no such route exists

    // Refusing to approve leaves the payout pending, but the silver is gone.
    const after = await holding();
    expect(after.body.holding.totalGrams).toBe(1);
  });
});
