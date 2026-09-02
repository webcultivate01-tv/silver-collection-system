// The daily cash handover.
//
// Two writes, each touching two tables, each of which must be all-or-nothing:
// bundling an employee's unsettled purchases into a handover, and the panel
// accepting it. The failure this guards against is an employee's takings being
// counted twice or not at all.

import { describe, it, expect, beforeEach, afterAll } from "vitest";

import { api, buildCast } from "../helpers/fixtures.js";
import { resetDatabase, closePool, query, countRows } from "../helpers/db.js";

let cast;

beforeEach(async () => {
  await resetDatabase();
  cast = await buildCast();
});

afterAll(closePool);

const asEmployee = (employee = cast.employeeA) => ({
  Authorization: `Bearer ${employee.token}`,
});
const asAdmin = () => ({ Authorization: `Bearer ${cast.admin.token}` });

function buy(amountPaid, employee = cast.employeeA, userId = cast.userA.id) {
  return api().post("/api/purchases").set(asEmployee(employee)).send({ userId, amountPaid });
}

const handOver = (employee = cast.employeeA) =>
  api().post("/api/settlements").set(asEmployee(employee)).send({});

describe("what is waiting to be handed over", () => {
  it("totals only this employee's own unsettled takings", async () => {
    await buy(500);
    await buy(300);
    await buy(200, cast.employeeB, cast.userB.id); // somebody else's counter

    const res = await api().get("/api/settlements/pending-summary").set(asEmployee());

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.totalAmount).toBe(800);
  });

  it("is empty for an employee who has taken nothing", async () => {
    const res = await api().get("/api/settlements/pending-summary").set(asEmployee());

    expect(res.body.count).toBe(0);
    expect(res.body.totalAmount).toBe(0);
    expect(res.body.purchases).toEqual([]);
  });
});

describe("creating a handover", () => {
  it("bundles every unsettled purchase and totals them", async () => {
    await buy(500);
    await buy(300);

    const res = await handOver();

    expect(res.status).toBe(201);
    expect(res.body.settlement.totalAmount).toBe(800);
    expect(res.body.settlement.purchaseCount).toBe(2);
    expect(res.body.settlement.status).toBe("pending");
  });

  it("stamps the bundled purchases with the settlement id", async () => {
    await buy(500);
    const res = await handOver();

    const rows = await query("SELECT settlement_id, payment_status FROM silver_purchases");
    expect(rows[0].settlement_id).toBe(res.body.settlement.id);
    // Still pending: the handover says cash is coming, not that it arrived.
    expect(rows[0].payment_status).toBe("pending");
  });

  it("refuses when there is nothing to hand over", async () => {
    const res = await handOver();

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/nothing to hand over/i);
    expect(await countRows("cash_settlements")).toBe(0);
  });

  it("refuses a second handover when the first took everything", async () => {
    await buy(500);
    expect((await handOver()).status).toBe(201);
    expect((await handOver()).status).toBe(409);
  });

  it("picks up purchases taken after the previous handover", async () => {
    await buy(500);
    await handOver();
    await buy(300);

    const second = await handOver();
    expect(second.status).toBe(201);
    expect(second.body.settlement.totalAmount).toBe(300);
  });

  it("does not bundle another employee's purchases", async () => {
    await buy(500);
    await buy(999, cast.employeeB, cast.userB.id);

    const res = await handOver();
    expect(res.body.settlement.totalAmount).toBe(500);
    expect(res.body.settlement.purchaseCount).toBe(1);
  });

  it("bundles once under concurrent submissions", async () => {
    // A double click or a retried request must not put the same purchase into
    // two different handovers - that is what the FOR UPDATE lock is for.
    await buy(500);
    await buy(300);

    const results = await Promise.all(Array.from({ length: 5 }, () => handOver()));

    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    expect(await countRows("cash_settlements")).toBe(1);

    const rows = await query(
      "SELECT DISTINCT settlement_id FROM silver_purchases WHERE settlement_id IS NOT NULL"
    );
    expect(rows).toHaveLength(1);
  });
});

describe("accepting a handover", () => {
  async function pendingSettlement() {
    await buy(500);
    await buy(300);
    const res = await handOver();
    return res.body.settlement.id;
  }

  it("marks the handover accepted and every purchase it carries successful", async () => {
    const id = await pendingSettlement();

    const res = await api().post(`/api/settlements/${id}/accept`).set(asAdmin()).send({});

    expect(res.status).toBe(200);
    expect(res.body.settlement.status).toBe("accepted");
    expect(res.body.settlement.acceptedByRole).toBe("admin");
    expect(res.body.settlement.acceptedAt).toBeTruthy();

    const rows = await query("SELECT payment_status FROM silver_purchases");
    expect(rows.every((row) => row.payment_status === "success")).toBe(true);
  });

  it("shows the same change on the customer's own history", async () => {
    // The point of doing both tables in one transaction: the employee, the
    // panel and the customer all see it flip at the same moment.
    const id = await pendingSettlement();
    await api().post(`/api/settlements/${id}/accept`).set(asAdmin()).send({});

    const portal = await api()
      .get("/api/purchases/my-holding")
      .set({ Authorization: `Bearer ${cast.userA.token}` });

    expect(portal.body.purchases.every((p) => p.paymentStatus === "success")).toBe(true);
  });

  it("refuses to accept the same handover twice", async () => {
    const id = await pendingSettlement();

    await api().post(`/api/settlements/${id}/accept`).set(asAdmin()).send({});
    const second = await api().post(`/api/settlements/${id}/accept`).set(asAdmin()).send({});

    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/already been accepted/i);
  });

  it("accepts only once under concurrent clicks", async () => {
    const id = await pendingSettlement();

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        api().post(`/api/settlements/${id}/accept`).set(asAdmin()).send({})
      )
    );

    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
    expect(results.filter((res) => res.status === 409)).toHaveLength(4);
  });

  it("404s on a settlement that does not exist", async () => {
    const res = await api().post("/api/settlements/999999/accept").set(asAdmin()).send({});
    expect(res.status).toBe(404);
  });

  it("400s on an invalid settlement id", async () => {
    for (const id of [0, -1, "abc"]) {
      const res = await api().post(`/api/settlements/${id}/accept`).set(asAdmin()).send({});
      expect(res.status, String(id)).toBe(400);
    }
  });
});

describe("the employee's own handover history", () => {
  it("shows their handovers and who accepted each", async () => {
    await buy(500);
    const created = await handOver();
    await api()
      .post(`/api/settlements/${created.body.settlement.id}/accept`)
      .set(asAdmin())
      .send({});

    const res = await api().get("/api/settlements/mine").set(asEmployee());

    expect(res.status).toBe(200);
    expect(res.body.settlements).toHaveLength(1);
    expect(res.body.settlements[0].status).toBe("accepted");
    expect(res.body.settlements[0].acceptedByName).toBe(cast.admin.name);
  });

  it("shows an employee only their own", async () => {
    await buy(500);
    await handOver();
    await buy(300, cast.employeeB, cast.userB.id);
    await handOver(cast.employeeB);

    const mine = await api().get("/api/settlements/mine").set(asEmployee());
    expect(mine.body.settlements).toHaveLength(1);
    expect(mine.body.settlements[0].employeeId).toBe(cast.employeeA.id);
  });
});

describe("known gap: what a handover is dated", () => {
  // KNOWN GAP (BUG-22). createFromUnsettled takes EVERY unsettled purchase
  // regardless of when it was taken, and stamps the row with today's date. The
  // settlement reports group on that date, so a day's reported cash can
  // silently include takings from days already reported as closed.
  it("dates a handover today even when it carries older purchases", async () => {
    await buy(500);

    // Backdate the purchase, as though it were taken last week and never
    // handed over.
    await query("UPDATE silver_purchases SET purchased_on = '2026-08-01'");

    const res = await handOver();
    const today = new Date().toISOString().slice(0, 10);

    expect(res.body.settlement.settlementDate).toBe(today);
    expect(res.body.settlement.totalAmount).toBe(500);

    // The purchase inside it is from a different day entirely.
    const detail = await api()
      .get(`/api/settlements/${res.body.settlement.id}`)
      .set(asAdmin());
    expect(detail.body.purchases[0].purchasedOn).toBe("2026-08-01");
  });
});
