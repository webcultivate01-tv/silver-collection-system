// The admin's silver coin payout: employee -> user -> report -> payment.
//
// The interesting properties are that steps 1-4 write nothing, that the same
// reference can never pay twice, and that the ledger this writes into is the
// same one the counter uses - so the coin cannot be handed over out of silver
// the customer has already sold.

import { describe, it, expect, beforeEach, afterAll } from "vitest";

import { api, buildCast, publishRate } from "../helpers/fixtures.js";
import { resetDatabase, closePool, query, countRows } from "../helpers/db.js";

let cast;

beforeEach(async () => {
  await resetDatabase();
  cast = await buildCast(); // buy 105, sell 100
});

afterAll(closePool);

const asAdmin = () => ({ Authorization: `Bearer ${cast.admin.token}` });
const asEmployee = () => ({ Authorization: `Bearer ${cast.employeeA.token}` });

function buy(amountPaid, userId = cast.userA.id) {
  return api().post("/api/purchases").set(asEmployee()).send({ userId, amountPaid });
}

function generateReport(body) {
  return api().post("/api/payouts/report").set(asAdmin()).send(body);
}

function payOut(body) {
  return api().post("/api/payouts").set(asAdmin()).send(body);
}

describe("steps 1 to 4 are reads", () => {
  it("lists employees with what their client book holds", async () => {
    await buy(1050); // 10 g for employee A's customer

    const res = await api().get("/api/payouts/employees").set(asAdmin());

    expect(res.status).toBe(200);
    const employeeA = res.body.employees.find((e) => e.id === cast.employeeA.id);
    expect(employeeA.heldGrams).toBe(10);
    expect(employeeA.users).toBe(1);
  });

  it("lists one employee's users with each holding", async () => {
    await buy(1050);

    const res = await api()
      .get(`/api/payouts/employees/${cast.employeeA.id}/users`)
      .set(asAdmin());

    expect(res.body.users).toHaveLength(1);
    expect(res.body.users[0].holding.totalGrams).toBe(10);
    expect(res.body.users[0].canPayout).toBe(true);
    expect(res.body.totals.heldGrams).toBe(10);
  });

  it("shows one customer's holding valued at the selling rate", async () => {
    await buy(1050); // 10 g

    const res = await api().get(`/api/payouts/users/${cast.userA.id}`).set(asAdmin());

    expect(res.body.holding.totalGrams).toBe(10);
    expect(res.body.rate.ratePerGram).toBe(100); // sell rate
    expect(res.body.holdingValue).toBe(1000);
  });

  it("generates a report without writing anything", async () => {
    await buy(1050);

    const before = await countRows("silver_sales");
    const res = await generateReport({ userId: cast.userA.id, grams: 4 });

    expect(res.status).toBe(200);
    expect(res.body.report.reference).toBeTruthy();
    expect(res.body.report.before.grams).toBe(10);
    expect(res.body.report.payout.grams).toBe(4);
    expect(res.body.report.after.grams).toBe(6);
    expect(res.body.report.payout.kind).toBe("coin");

    expect(await countRows("silver_sales")).toBe(before);
  });

  it("gives every report a fresh reference", async () => {
    await buy(1050);

    const first = await generateReport({ userId: cast.userA.id, grams: 4 });
    const second = await generateReport({ userId: cast.userA.id, grams: 5 });

    expect(first.body.report.reference).not.toBe(second.body.report.reference);
  });

  it("says plainly when a payout would empty the account", async () => {
    await buy(1050);
    const res = await generateReport({ userId: cast.userA.id, grams: 10 });

    expect(res.body.report.after.clearsAccount).toBe(true);
  });
});

describe("step 5 - the payment", () => {
  async function reportFor(grams) {
    const res = await generateReport({ userId: cast.userA.id, grams });
    return res.body.report;
  }

  it("writes one coin row and takes the weight off the holding", async () => {
    await buy(1050); // 10 g
    const report = await reportFor(4);

    const res = await payOut({
      userId: cast.userA.id,
      grams: 4,
      ratePerGram: report.rate.ratePerGram,
      reference: report.reference,
    });

    expect(res.status).toBe(201);
    expect(res.body.payout.payoutKind).toBe("coin");
    expect(res.body.payout.payoutStatus).toBe("paid");
    expect(res.body.payout.employeeId).toBeNull();
    expect(res.body.holding.totalGrams).toBe(6);

    const rows = await query("SELECT * FROM silver_sales");
    expect(rows).toHaveLength(1);
    expect(rows[0].recorded_by_admin_id).toBe(cast.admin.id);
    expect(rows[0].request_id).toBe(report.reference);
  });

  it("records the coin's value without pretending cash moved", async () => {
    await buy(1050);
    const report = await reportFor(4);

    const res = await payOut({
      userId: cast.userA.id,
      grams: 4,
      ratePerGram: report.rate.ratePerGram,
      reference: report.reference,
    });

    expect(res.body.payout.amountPayable).toBe(400);
    expect(res.body.payout.payoutKindLabel).toBe("Silver coin");
    expect(res.body.payout.isCoin).toBe(true);
  });

  it("reports the payout under the employee who owns the customer", async () => {
    // Nobody was at a counter, so employee_id is null - the customer's own
    // employee is the only attribution an admin payout has.
    await buy(1050);
    const report = await reportFor(4);
    await payOut({
      userId: cast.userA.id,
      grams: 4,
      ratePerGram: report.rate.ratePerGram,
      reference: report.reference,
    });

    const ledger = await api().get("/api/sales?source=admin").set(asAdmin());

    expect(ledger.body.sales).toHaveLength(1);
    expect(ledger.body.sales[0].ownerEmployeeId).toBe(cast.employeeA.id);
    expect(ledger.body.sales[0].handledBy).toMatch(/admin/i);
  });

  it("refuses to pay out more than the customer holds", async () => {
    await buy(1050); // 10 g

    const res = await payOut({
      userId: cast.userA.id,
      grams: 11,
      ratePerGram: 100,
      reference: "some-reference",
    });

    expect(res.status).toBe(409);
    expect(await countRows("silver_sales")).toBe(0);
  });

  it("refuses a deactivated customer", async () => {
    await buy(1050);
    await api()
      .put(`/api/employee/users/${cast.userA.id}/status`)
      .set(asEmployee())
      .send({ active: false });

    const res = await payOut({
      userId: cast.userA.id,
      grams: 4,
      ratePerGram: 100,
      reference: "r1",
    });

    expect(res.status).toBe(403);
  });

  it("refuses when the rate moved since the report was generated", async () => {
    await buy(1050);
    const report = await reportFor(4);

    await publishRate({ buy: 200, sell: 190, updatedBy: cast.admin.id });

    const res = await payOut({
      userId: cast.userA.id,
      grams: 4,
      ratePerGram: report.rate.ratePerGram, // the old, quoted rate
      reference: report.reference,
    });

    expect(res.status).toBe(409);
    expect(res.body.staleRate).toBe(true);
    expect(await countRows("silver_sales")).toBe(0);
  });

  it("builds the receipt from the holding as it stands after the write", async () => {
    // A purchase landing between report and payment makes the report's
    // "before" stale. The receipt has to describe the ledger, not the quote.
    await buy(1050); // 10 g
    const report = await reportFor(4);

    await buy(1050); // another 10 g arrives in between

    const res = await payOut({
      userId: cast.userA.id,
      grams: 4,
      ratePerGram: report.rate.ratePerGram,
      reference: report.reference,
    });

    expect(res.status).toBe(201);
    expect(res.body.report.before.grams).toBe(20); // not the report's 10
    expect(res.body.report.after.grams).toBe(16);
    expect(res.body.holding.totalGrams).toBe(16);
  });

  it("refuses when the counter sold the silver between report and payment", async () => {
    await buy(1050); // 10 g
    const report = await reportFor(10);

    await api()
      .post("/api/sales")
      .set(asEmployee())
      .send({ userId: cast.userA.id, grams: 10 });

    const res = await payOut({
      userId: cast.userA.id,
      grams: 10,
      ratePerGram: report.rate.ratePerGram,
      reference: report.reference,
    });

    expect(res.status).toBe(409);
    // Which of the two refusals fires depends on whether the counter took
    // everything or only some: an emptied account is caught by the "nothing to
    // pay out" check before the weight is even parsed. Either is correct - the
    // point is that no coin is recorded against silver that has already gone.
    expect(res.body.message).toMatch(/no silver to pay out|now holds/i);
    expect(await countRows("silver_sales")).toBe(1); // just the counter's sale
  });

  it("refuses a PARTIAL sale between report and payment, quoting the new holding", async () => {
    await buy(1050); // 10 g
    const report = await reportFor(10);

    // The counter takes half, so the account still has silver in it - this is
    // the branch that reports the fresh figure back to the admin.
    await api().post("/api/sales").set(asEmployee()).send({ userId: cast.userA.id, grams: 5 });

    const res = await payOut({
      userId: cast.userA.id,
      grams: 10,
      ratePerGram: report.rate.ratePerGram,
      reference: report.reference,
    });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/holds only/i);
    expect(res.body.availableGrams).toBe(5);
  });
});

describe("the reference makes a repeat safe", () => {
  it("returns the first payout instead of making a second", async () => {
    await buy(1050);
    const report = (await generateReport({ userId: cast.userA.id, grams: 4 })).body.report;

    const body = {
      userId: cast.userA.id,
      grams: 4,
      ratePerGram: report.rate.ratePerGram,
      reference: report.reference,
    };

    const first = await payOut(body);
    const second = await payOut(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.alreadyPaid).toBe(true);
    expect(second.body.message).toMatch(/no second coin/i);

    expect(await countRows("silver_sales")).toBe(1);
    // The holding dropped once, not twice.
    expect(second.body.holding.totalGrams).toBe(6);
  });

  it("holds under a genuine double click", async () => {
    await buy(1050);
    const report = (await generateReport({ userId: cast.userA.id, grams: 4 })).body.report;

    const body = {
      userId: cast.userA.id,
      grams: 4,
      ratePerGram: report.rate.ratePerGram,
      reference: report.reference,
    };

    const results = await Promise.all(Array.from({ length: 5 }, () => payOut(body)));

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await countRows("silver_sales")).toBe(1);

    const holding = await api().get(`/api/payouts/users/${cast.userA.id}`).set(asAdmin());
    expect(holding.body.holding.totalGrams).toBe(6);
  });

  it("requires a reference at all", async () => {
    await buy(1050);

    const res = await payOut({ userId: cast.userA.id, grams: 4, ratePerGram: 100 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/generate the payout report first/i);
  });
});

describe("KNOWN DEFECT (BUG-12): the reference is not checked against a report", () => {
  it("pays out on a reference this server never issued", async () => {
    await buy(1050);

    // No report was generated. The reference is simply invented.
    const res = await payOut({
      userId: cast.userA.id,
      grams: 4,
      ratePerGram: 100,
      reference: "just-made-this-up",
    });

    expect(res.status).toBe(201); // should be refused
    expect(await countRows("silver_sales")).toBe(1);
  });
});

describe("KNOWN DEFECT (BUG-13): the stale-rate guard fails open", () => {
  it("skips the rate check entirely when ratePerGram is omitted", async () => {
    await buy(1050);
    const report = (await generateReport({ userId: cast.userA.id, grams: 4 })).body.report;
    expect(report.rate.ratePerGram).toBe(100);

    await publishRate({ buy: 200, sell: 190, updatedBy: cast.admin.id });

    // Same request as the stale-rate test above, minus one field.
    const res = await payOut({
      userId: cast.userA.id,
      grams: 4,
      reference: report.reference,
    });

    expect(res.status).toBe(201); // should be 409
    // The coin is recorded at 190 while the customer signs a report saying 100.
    expect(res.body.payout.ratePerGram).toBe(190);
    expect(res.body.payout.amountPayable).toBe(760);
  });
});

describe("coin payouts share the counter's ledger and its lock", () => {
  it("cannot pay out silver a concurrent counter sale is taking", async () => {
    await buy(525); // exactly 5 g

    const results = await Promise.all([
      payOut({ userId: cast.userA.id, grams: 5, ratePerGram: 100, reference: "coin-1" }),
      api().post("/api/sales").set(asEmployee()).send({ userId: cast.userA.id, grams: 5 }),
    ]);

    const succeeded = results.filter((r) => r.status === 201);
    expect(succeeded).toHaveLength(1);

    const holding = await api().get(`/api/payouts/users/${cast.userA.id}`).set(asAdmin());
    expect(holding.body.holding.totalGrams).toBe(0);
    expect(holding.body.holding.totalGrams).toBeGreaterThanOrEqual(0);
  });
});
