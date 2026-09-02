// Publishing the silver rate.
//
// Two numbers typed into one form price every transaction in the system. This
// suite is short because the controller is short - and that is the finding:
// each rate is checked for being a positive number under ₹100,000 and nothing
// else, so the form accepts several entries that break the business.

import { describe, it, expect, beforeEach, afterAll } from "vitest";

import { api, buildCast } from "../helpers/fixtures.js";
import { resetDatabase, closePool, query } from "../helpers/db.js";

let cast;

beforeEach(async () => {
  await resetDatabase();
  cast = await buildCast({ withRate: false });
});

afterAll(closePool);

const asAdmin = () => ({ Authorization: `Bearer ${cast.admin.token}` });

function saveRate(body) {
  return api().post("/api/silver-rate").set(asAdmin()).send(body);
}

const today = () => new Date().toISOString().slice(0, 10);

describe("publishing a rate", () => {
  it("saves both rates and reports them back", async () => {
    const res = await saveRate({ buyRatePerGram: 105.5, sellRatePerGram: 100.25 });

    expect(res.status).toBe(200);
    expect(res.body.rate.buyRatePerGram).toBe(105.5);
    expect(res.body.rate.sellRatePerGram).toBe(100.25);
    expect(res.body.rate.rateDate).toBe(today());
  });

  it("updates today's row rather than adding a second one", async () => {
    await saveRate({ buyRatePerGram: 105, sellRatePerGram: 100 });
    await saveRate({ buyRatePerGram: 110, sellRatePerGram: 104 });
    await saveRate({ buyRatePerGram: 115, sellRatePerGram: 109 });

    const rows = await query("SELECT * FROM silver_rates");
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].buy_rate_per_gram)).toBe(115);
  });

  it("reports the change against the previous published day", async () => {
    await saveRate({ buyRatePerGram: 100, sellRatePerGram: 95, rateDate: "2026-08-01" });
    const res = await saveRate({
      buyRatePerGram: 105,
      sellRatePerGram: 98,
      rateDate: "2026-08-02",
    });

    expect(res.body.change).toEqual({ buy: 5, sell: 3 });
  });

  it("rejects rates that are not usable numbers", async () => {
    const bad = [0, -1, "abc", null, Infinity, NaN, 100001];

    for (const value of bad) {
      const buyBad = await saveRate({ buyRatePerGram: value, sellRatePerGram: 100 });
      expect(buyBad.status, `buy=${value}`).toBe(400);

      const sellBad = await saveRate({ buyRatePerGram: 105, sellRatePerGram: value });
      expect(sellBad.status, `sell=${value}`).toBe(400);
    }

    expect(await query("SELECT * FROM silver_rates")).toHaveLength(0);
  });

  it("is readable without a token, for the login screens", async () => {
    await saveRate({ buyRatePerGram: 105, sellRatePerGram: 100 });

    const res = await api().get("/api/silver-rate/today");

    expect(res.status).toBe(200);
    expect(res.body.rate.buyRatePerGram).toBe(105);
    expect(res.body.isToday).toBe(true);
    // A public endpoint should not name who published it.
    expect(JSON.stringify(res.body)).not.toContain(cast.admin.name);
  });
});

describe("FIXED (was BUG-07): the two rates are compared", () => {
  it("refuses a sell rate at or above the buy rate", async () => {
    // Transposing two adjacent fields on a two-field form is an ordinary
    // mistake, and nothing used to catch it.
    for (const [buy, sell] of [[100, 105], [100, 100]]) {
      const res = await saveRate({ buyRatePerGram: buy, sellRatePerGram: sell });

      expect(res.status, `${buy}/${sell}`).toBe(400);
      expect(res.body.errors).toHaveProperty("sellRatePerGram");
    }

    expect(await query("SELECT * FROM silver_rates")).toHaveLength(0);
  });

  it("closes the round-trip arbitrage that followed from it", async () => {
    // With the rates inverted a customer could buy at the low rate and
    // immediately sell back at the high one, for a risk-free profit, as often
    // as they liked - every step a legitimate transaction.
    const inverted = await saveRate({ buyRatePerGram: 100, sellRatePerGram: 105 });
    expect(inverted.status).toBe(400);

    // With a correctly ordered rate, the round trip loses the spread, which is
    // where the shop's margin comes from.
    await saveRate({ buyRatePerGram: 105, sellRatePerGram: 100 });

    const asEmployee = { Authorization: `Bearer ${cast.employeeA.token}` };

    const purchase = await api()
      .post("/api/purchases")
      .set(asEmployee)
      .send({ userId: cast.userA.id, amountPaid: 1050 });
    expect(purchase.body.purchase.grams).toBe(10);

    const sale = await api()
      .post("/api/sales")
      .set(asEmployee)
      .send({ userId: cast.userA.id, grams: 10 });

    expect(sale.body.sale.amountPayable).toBe(1000);
    expect(sale.body.sale.amountPayable).toBeLessThan(1050);
  });
});

describe("FIXED (was BUG-08): a future date cannot be published", () => {
  it("refuses a rate dated ahead of today", async () => {
    // Valid rates on purpose, so this exercises the date check rather than
    // tripping the range check first.
    const res = await saveRate({
      buyRatePerGram: 105,
      sellRatePerGram: 100,
      rateDate: "2099-01-01",
    });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("rateDate");
    expect(await query("SELECT * FROM silver_rates")).toHaveLength(0);
  });

  it("still allows backdating, which is a legitimate correction", async () => {
    const res = await saveRate({
      buyRatePerGram: 105,
      sellRatePerGram: 100,
      rateDate: "2026-08-01",
    });

    expect(res.status).toBe(200);
  });

  it("means today's rate always wins, as it should", async () => {
    // getLatestPair orders by rate_date, so a future row used to become
    // "current" permanently and nothing published afterwards could displace
    // it - with no route to delete the bad row.
    await saveRate({ buyRatePerGram: 105, sellRatePerGram: 100 });

    const res = await api().get("/api/silver-rate/today");
    expect(res.body.rate.buyRatePerGram).toBe(105);
    expect(res.body.isToday).toBe(true);
  });
});

describe("FIXED (was BUG-18): the rate has a floor as well as a ceiling", () => {
  it("refuses a rate a hundred times too small", async () => {
    // The ceiling was guarded from the start - "a rate above this is a typo,
    // not a rate" - and the floor was not, so a decimal slip went through in
    // silence and every purchase that day bought a hundred times too much.
    const res = await saveRate({ buyRatePerGram: 1.05, sellRatePerGram: 1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too small/i);
  });

  it("refuses the rate small enough to overflow the grams column", async () => {
    // DECIMAL(14,6) tops out at 99,999,999.999999; at ₹0.01/g the maximum
    // permitted purchase computed 1,000,000,000 g and the insert failed with
    // an unhandled driver error.
    const res = await saveRate({ buyRatePerGram: 0.01, sellRatePerGram: 0.01 });
    expect(res.status).toBe(400);

    expect(await query("SELECT * FROM silver_rates")).toHaveLength(0);
  });

  it("accepts a rate at the floor", async () => {
    const res = await saveRate({ buyRatePerGram: 11, sellRatePerGram: 10 });
    expect(res.status).toBe(200);
  });

  it("does not get in the way of a realistic silver rate", async () => {
    // The floor has to be low enough that no genuine rate ever trips it.
    for (const [buy, sell] of [[70, 68], [105, 100], [130, 126]]) {
      const res = await saveRate({ buyRatePerGram: buy, sellRatePerGram: sell });
      expect(res.status, `${buy}/${sell}`).toBe(200);
    }
  });
});

describe("rate history", () => {
  it("is admin-only and returns the most recent first", async () => {
    await saveRate({ buyRatePerGram: 100, sellRatePerGram: 95, rateDate: "2026-08-01" });
    await saveRate({ buyRatePerGram: 105, sellRatePerGram: 98, rateDate: "2026-08-03" });

    const res = await api().get("/api/silver-rate/history").set(asAdmin());

    expect(res.status).toBe(200);
    expect(res.body.rates[0].rateDate).toBe("2026-08-03");
  });

  it("finds a day by either the stored or the displayed date format", async () => {
    await saveRate({ buyRatePerGram: 100, sellRatePerGram: 95, rateDate: "2026-08-01" });

    for (const search of ["2026-08-01", "01 Aug 2026", "01/08/2026"]) {
      const res = await api()
        .get(`/api/silver-rate/history?search=${encodeURIComponent(search)}`)
        .set(asAdmin());

      expect(res.body.rates, search).toHaveLength(1);
    }
  });
});
