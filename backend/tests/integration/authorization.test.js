// Who may reach what.
//
// Four roles, three overlapping guards and one blanket write-block. The bulk of
// this file is a matrix: call an endpoint as each identity, assert each answer.
// A matrix is the right shape here because the failure mode being guarded
// against is an endpoint quietly answering 200 to the wrong role, and only a
// sweep catches that.

import { describe, it, expect, beforeEach, afterAll } from "vitest";

import { api, buildCast, makeSubAdmin } from "../helpers/fixtures.js";
import { resetDatabase, closePool, countRows } from "../helpers/db.js";

let cast;

beforeEach(async () => {
  await resetDatabase();
  cast = await buildCast();
});

afterAll(closePool);

function as(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Calls `path` as every identity and returns a map of role -> status.
async function statusesFor(method, path, body) {
  const identities = {
    anonymous: null,
    admin: cast.admin.token,
    subAdmin: cast.subAdmin.token,
    employee: cast.employeeA.token,
    user: cast.userA.token,
  };

  const result = {};

  for (const [name, token] of Object.entries(identities)) {
    let req = api()[method](path).set(as(token));
    if (body) req = req.send(body);
    result[name] = (await req).status;
  }

  return result;
}

describe("admin-only surfaces", () => {
  it("employee management is closed to everyone but the main admin", async () => {
    const statuses = await statusesFor("get", "/api/employees");

    expect(statuses.admin).toBe(200);
    expect(statuses.anonymous).toBe(401);
    expect(statuses.subAdmin).toBe(403);
    expect(statuses.employee).toBe(403);
    expect(statuses.user).toBe(403);
  });

  it("admin management is closed even to a sub-admin reading it", async () => {
    const statuses = await statusesFor("get", "/api/admins");

    expect(statuses.admin).toBe(200);
    expect(statuses.subAdmin).toBe(403);
    expect(statuses.employee).toBe(403);
    expect(statuses.user).toBe(403);
  });

  it("the payout flow is main-admin only, reads included", async () => {
    for (const path of ["/api/payouts/employees", `/api/payouts/users/${cast.userA.id}`]) {
      const statuses = await statusesFor("get", path);
      expect(statuses.admin).toBe(200);
      expect(statuses.subAdmin).toBe(403);
      expect(statuses.employee).toBe(403);
      expect(statuses.user).toBe(403);
    }
  });

  it("publishing a rate is main-admin only, but reading today's is public", async () => {
    const write = await statusesFor("post", "/api/silver-rate", {
      buyRatePerGram: 110,
      sellRatePerGram: 105,
    });

    expect(write.admin).toBe(200);
    expect(write.subAdmin).toBe(403);
    expect(write.employee).toBe(403);
    expect(write.user).toBe(403);

    const read = await statusesFor("get", "/api/silver-rate/today");
    expect(read.anonymous).toBe(200);
  });
});

describe("panel read access - admin and sub-admin together", () => {
  it("opens the reports to both panel roles and nobody else", async () => {
    for (const path of ["/api/reports/summary", "/api/reports/employees", "/api/reports/silver-rates"]) {
      const statuses = await statusesFor("get", path);
      expect(statuses.admin).toBe(200);
      expect(statuses.subAdmin).toBe(200);
      expect(statuses.employee).toBe(403);
      expect(statuses.user).toBe(403);
      expect(statuses.anonymous).toBe(401);
    }
  });

  it("opens the ledgers to both panel roles", async () => {
    for (const path of ["/api/purchases", "/api/sales", "/api/settlements", "/api/users"]) {
      const statuses = await statusesFor("get", path);
      expect(statuses.admin).toBe(200);
      expect(statuses.subAdmin).toBe(200);
      expect(statuses.employee).toBe(403);
      expect(statuses.user).toBe(403);
    }
  });

  it("keeps the unmasked single-user view admin-only", async () => {
    // The list masks Aadhaar and is open to sub-admins; the detail view
    // returns the full record and the document paths, so it is not.
    const statuses = await statusesFor("get", `/api/users/${cast.userA.id}`);

    expect(statuses.admin).toBe(200);
    expect(statuses.subAdmin).toBe(403);
  });
});

describe("the sub-admin write block", () => {
  it("refuses every write a sub-admin attempts", async () => {
    const writes = [
      ["post", "/api/employees", {}],
      ["put", `/api/employees/${cast.employeeA.id}`, {}],
      ["delete", `/api/employees/${cast.employeeA.id}`, null],
      ["put", `/api/employees/${cast.employeeA.id}/block`, { blocked: true }],
      ["post", "/api/admins", { name: "X", email: "x@test.local", password: "abcdef" }],
      ["put", `/api/admins/${cast.subAdmin.id}`, {}],
      ["delete", `/api/admins/${cast.subAdmin.id}`, null],
      ["post", "/api/silver-rate", { buyRatePerGram: 1, sellRatePerGram: 1 }],
      ["post", "/api/purchases", { userId: cast.userA.id, amountPaid: 100 }],
      ["post", "/api/sales", { userId: cast.userA.id, grams: 1 }],
      ["post", "/api/payouts", { userId: cast.userA.id, grams: 1, reference: "x" }],
      ["post", "/api/payouts/report", { userId: cast.userA.id, grams: 1 }],
      ["put", "/api/profile", { name: "New", email: "new@test.local" }],
      ["put", "/api/profile/change-password", { currentPassword: "a", newPassword: "b" }],
    ];

    for (const [method, path, body] of writes) {
      let req = api()[method](path).set(as(cast.subAdmin.token));
      if (body) req = req.send(body);
      const res = await req;

      expect(res.status, `${method.toUpperCase()} ${path}`).toBe(403);
      expect(res.body.message).toMatch(/sub-admin/i);
    }
  });

  it("leaves the database untouched after a refused write", async () => {
    const before = await countRows("employees");

    await api().delete(`/api/employees/${cast.employeeA.id}`).set(as(cast.subAdmin.token));

    expect(await countRows("employees")).toBe(before);
  });

  it("fails closed on path variations rather than opening a gap", async () => {
    // The allowlist is a regex over req.path. Anything it does not recognise
    // must be refused, not waved through - the block is on the role, and the
    // allowlist is the narrow exception.
    const variations = [
      "/api/employees/",
      "/API/employees",
      "//api/employees",
      "/api/settlements/1/accept/../../employees",
    ];

    for (const path of variations) {
      const res = await api().post(path).set(as(cast.subAdmin.token)).send({});
      expect(res.status, path).not.toBe(200);
      expect(res.status, path).not.toBe(201);
    }
  });

  it("allows the one write it is supposed to: accepting a cash handover", async () => {
    await api()
      .post("/api/purchases")
      .set(as(cast.employeeA.token))
      .send({ userId: cast.userA.id, amountPaid: 500 });

    const handover = await api().post("/api/settlements").set(as(cast.employeeA.token)).send({});
    expect(handover.status).toBe(201);

    const accept = await api()
      .post(`/api/settlements/${handover.body.settlement.id}/accept`)
      .set(as(cast.subAdmin.token))
      .send({});

    expect(accept.status).toBe(200);
  });

  it("records the sub-admin - not an admin with the same id - as who took the cash", async () => {
    // Ids restart at 1 in each table, so admin #1 and sub-admin #1 both exist.
    // Getting this wrong would credit the cash to the wrong person entirely.
    await api()
      .post("/api/purchases")
      .set(as(cast.employeeA.token))
      .send({ userId: cast.userA.id, amountPaid: 500 });

    const handover = await api().post("/api/settlements").set(as(cast.employeeA.token)).send({});
    await api()
      .post(`/api/settlements/${handover.body.settlement.id}/accept`)
      .set(as(cast.subAdmin.token))
      .send({});

    const detail = await api()
      .get(`/api/settlements/${handover.body.settlement.id}`)
      .set(as(cast.admin.token));

    expect(detail.body.settlement.acceptedByRole).toBe("subadmin");
    expect(detail.body.settlement.acceptedByName).toBe(cast.subAdmin.name);
    expect(detail.body.settlement.acceptedByName).not.toBe(cast.admin.name);
  });
});

describe("employee ownership of their own users", () => {
  it("lets an employee see only the users they registered", async () => {
    const res = await api().get("/api/employee/users").set(as(cast.employeeA.token));

    expect(res.status).toBe(200);
    const ids = res.body.users.map((user) => user.id);
    expect(ids).toContain(cast.userA.id);
    expect(ids).not.toContain(cast.userB.id);
  });

  it("answers 404 - not 403 - for another employee's user", async () => {
    // 404 is the right choice: 403 would confirm the row exists.
    const paths = [
      ["get", `/api/employee/users/${cast.userB.id}`, null],
      ["put", `/api/employee/users/${cast.userB.id}/reset-password`, {}],
      ["put", `/api/employee/users/${cast.userB.id}/status`, { active: false }],
    ];

    for (const [method, path, body] of paths) {
      let req = api()[method](path).set(as(cast.employeeA.token));
      if (body) req = req.send(body);
      const res = await req;

      expect(res.status, `${method} ${path}`).toBe(404);
    }
  });

  it("does not change the other employee's user on a refused call", async () => {
    await api()
      .put(`/api/employee/users/${cast.userB.id}/status`)
      .set(as(cast.employeeA.token))
      .send({ active: false });

    const asOwner = await api()
      .get(`/api/employee/users/${cast.userB.id}`)
      .set(as(cast.employeeB.token));

    expect(asOwner.body.user.is_active).toBe(1);
  });
});

describe("the counter enforces the same ownership", () => {
  // BUG-14, closed. The counter used to serve anyone while
  // employeeUserController was strict, so the two files contradicted each
  // other. Both now read one rule from utils/customerAccess.js: an employee
  // transacts for the users they registered, and for nobody else's. These
  // tests are what keep the counter from drifting back.
  it("refuses employee A the holding and history of employee B's customer", async () => {
    const res = await api()
      .get(`/api/purchases/customers/${cast.userB.id}`)
      .set(as(cast.employeeA.token));

    // 404, not 403: employee A has no business learning that id exists.
    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty("holding");
  });

  it("refuses employee A a purchase against employee B's customer", async () => {
    const res = await api()
      .post("/api/purchases")
      .set(as(cast.employeeA.token))
      .send({ userId: cast.userB.id, amountPaid: 100 });

    expect(res.status).toBe(404);
  });

  it("writes nothing when that purchase is refused", async () => {
    await api()
      .post("/api/purchases")
      .set(as(cast.employeeA.token))
      .send({ userId: cast.userB.id, amountPaid: 100 });

    const owner = await api()
      .get(`/api/purchases/customers/${cast.userB.id}`)
      .set(as(cast.employeeB.token));

    expect(owner.status).toBe(200);
    expect(owner.body.purchases).toEqual([]);
    expect(owner.body.holding.totalGrams).toBe(0);
  });

  it("refuses employee A a sell-back against employee B's customer", async () => {
    await api()
      .post("/api/purchases")
      .set(as(cast.employeeB.token))
      .send({ userId: cast.userB.id, amountPaid: 1050 }); // 10 g

    const res = await api()
      .post("/api/sales")
      .set(as(cast.employeeA.token))
      .send({ userId: cast.userB.id, grams: 1 });

    expect(res.status).toBe(404);
  });

  it("lists an employee only the customers they registered", async () => {
    const mine = await api().get("/api/purchases/customers").set(as(cast.employeeA.token));
    const theirs = await api().get("/api/purchases/customers").set(as(cast.employeeB.token));

    expect(mine.body.customers.map((customer) => customer.id)).toEqual([cast.userA.id]);
    expect(theirs.body.customers.map((customer) => customer.id)).toEqual([cast.userB.id]);
  });

  it("still lets each employee serve their own customer", async () => {
    const res = await api()
      .post("/api/purchases")
      .set(as(cast.employeeA.token))
      .send({ userId: cast.userA.id, amountPaid: 100 });

    expect(res.status).toBe(201);
  });
});

describe("customers reach only their own data", () => {
  it("gives a user their own holding and nobody else's", async () => {
    await api()
      .post("/api/purchases")
      .set(as(cast.employeeA.token))
      .send({ userId: cast.userA.id, amountPaid: 1000 });

    const mine = await api().get("/api/purchases/my-holding").set(as(cast.userA.token));
    expect(mine.status).toBe(200);
    expect(mine.body.holding.totalGrams).toBeGreaterThan(0);

    const other = await api().get("/api/purchases/my-holding").set(as(cast.userB.token));
    expect(other.body.holding.totalGrams).toBe(0);
  });

  it("closes the counter and panel routes to a customer", async () => {
    const closed = [
      "/api/purchases/customers",
      "/api/purchases/recorded-by-me",
      "/api/purchases",
      "/api/sales/recorded-by-me",
      "/api/settlements/mine",
      "/api/collections/me",
    ];

    for (const path of closed) {
      const res = await api().get(path).set(as(cast.userA.token));
      expect(res.status, path).toBe(403);
    }
  });
});

describe("deactivation takes effect on the next request", () => {
  it("kills a sub-admin's live token immediately", async () => {
    const subAdmin = await makeSubAdmin({ email: "temp@test.local", createdBy: cast.admin.id });

    const before = await api().get("/api/reports/summary").set(as(subAdmin.token));
    expect(before.status).toBe(200);

    await api()
      .put(`/api/admins/${subAdmin.id}/status`)
      .set(as(cast.admin.token))
      .send({ active: false });

    const after = await api().get("/api/reports/summary").set(as(subAdmin.token));
    expect(after.status).toBe(403);
    expect(after.body.message).toMatch(/deactivated/i);
  });

  it("kills a blocked employee's live token immediately", async () => {
    const before = await api().get("/api/employee/me").set(as(cast.employeeA.token));
    expect(before.status).toBe(200);

    await api()
      .put(`/api/employees/${cast.employeeA.id}/block`)
      .set(as(cast.admin.token))
      .send({ blocked: true });

    const after = await api().get("/api/employee/me").set(as(cast.employeeA.token));
    expect(after.status).toBe(403);
  });

  it("kills a deactivated customer's live token immediately", async () => {
    await api()
      .put(`/api/employee/users/${cast.userA.id}/status`)
      .set(as(cast.employeeA.token))
      .send({ active: false });

    const after = await api().get("/api/purchases/my-holding").set(as(cast.userA.token));
    expect(after.status).toBe(403);
  });

  // FIXED (was BUG-04). profileRoutes guarded with `protect` alone, which only
  // verifies the token's signature and never reads the database - so every
  // other router revoked on deactivation and this one did not. A locked-out
  // account could still read its profile, change its email, and change the
  // password it would use once somebody turned it back on.
  it("kills the token on the profile routes too", async () => {
    await api()
      .put(`/api/employee/users/${cast.userA.id}/status`)
      .set(as(cast.employeeA.token))
      .send({ active: false });

    const read = await api().get("/api/profile").set(as(cast.userA.token));
    expect(read.status).toBe(403);

    const write = await api()
      .put("/api/profile")
      .set(as(cast.userA.token))
      .send({ name: "Renamed While Deactivated", email: cast.userA.email });
    expect(write.status).toBe(403);

    const password = await api()
      .put("/api/profile/change-password")
      .set(as(cast.userA.token))
      .send({ currentPassword: "Passw0rd!", newPassword: "ChosenWhileLockedOut1" });
    expect(password.status).toBe(403);
  });

  it("kills a blocked employee's token on the profile routes as well", async () => {
    await api()
      .put(`/api/employees/${cast.employeeA.id}/block`)
      .set(as(cast.admin.token))
      .send({ blocked: true });

    const res = await api().get("/api/profile").set(as(cast.employeeA.token));
    expect(res.status).toBe(403);
  });
});

describe("the main admin cannot be reached through Admin Management", () => {
  it("does not find an admins row by id on the sub-admin routes", async () => {
    // Every write there resolves against sub_admins only, which is what stops
    // the account that runs the system being deleted from its own screen.
    const res = await api()
      .delete(`/api/admins/${cast.admin.id}`)
      .set(as(cast.admin.token));

    // Either 404 (no sub-admin with that id) or it hit the sub-admin sharing
    // the id - never the admin.
    if (res.status === 200) {
      expect(res.body.key).toMatch(/^subadmin-/);
    } else {
      expect(res.status).toBe(404);
    }

    expect(await countRows("admins")).toBe(1);
  });
});
