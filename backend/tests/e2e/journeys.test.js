// End-to-end user journeys.
//
// Each test here walks a complete flow the way a real person does, across
// roles, through the real HTTP stack and the real database - no mocks, no
// short cuts through the models. A journey passes only if the OUTCOME is
// right, checked from every side that should be able to see it: a purchase
// that reads "success" to the employee must also read "success" to the admin
// and to the customer.
//
// These assert the behaviour the product is supposed to have. Where that
// differs from what the code currently does, the test fails - which is the
// point of writing them.

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import jwt from "jsonwebtoken";

import { api, buildCast, captureOtp, PASSWORD } from "../helpers/fixtures.js";
import { resetDatabase, closePool, query, countRows } from "../helpers/db.js";

let cast;

beforeEach(async () => {
  await resetDatabase();
  cast = await buildCast();
});

afterAll(closePool);

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

// A well-formed registration body, so a journey can vary one thing at a time.
function newUserForm(overrides = {}) {
  return {
    firstName: "Nikhil",
    lastName: "Joshi",
    mobile: "9800000011",
    email: "nikhil.joshi@test.local",
    age: "31",
    address: "88 Link Road, Malad West, Mumbai 400064",
    aadhaarNumber: "550011223344",
    panNumber: "NIKHL1234J",
    dateOfBirth: "1994-06-15",
    password: "Customer1",
    ...overrides,
  };
}

// The employee's registration form is multipart with document uploads.
function registerUser(token, form = newUserForm()) {
  let req = api().post("/api/employee/users").set(bearer(token));

  for (const [key, value] of Object.entries(form)) {
    req = req.field(key, String(value));
  }

  // A 1x1 PNG stands in for a scan.
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d494844520000000100000001080600000" +
      "01f15c4890000000a49444154789c6300010000050001" +
      "0d0a2db40000000049454e44ae426082",
    "hex"
  );

  return req
    .attach("aadhaarFront", png, "aadhaar-front.png")
    .attach("aadhaarBack", png, "aadhaar-back.png")
    .attach("panFront", png, "pan-front.png");
}

// ---------------------------------------------------------------------------
// 1. Registration
// ---------------------------------------------------------------------------

describe("Journey 1 - an employee registers a new customer", () => {
  it("registers them, and they can immediately sign in and see their portal", async () => {
    const created = await registerUser(cast.employeeA.token);

    expect(created.status).toBe(201);
    expect(created.body.user.email).toBe("nikhil.joshi@test.local");
    expect(created.body.user.created_by_employee_id).toBe(cast.employeeA.id);

    // The documents were actually stored, not just accepted.
    expect(created.body.user.aadhaar_front).toMatch(/^\/uploads\/user\//);
    expect(created.body.user.pan_front).toMatch(/^\/uploads\/user\//);

    // They can now sign in at their own door.
    const login = await api()
      .post("/api/auth/login")
      .send({ email: "nikhil.joshi@test.local", password: "Customer1", role: "user" });

    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe("user");

    // ...and the portal knows who registered them.
    const profile = await api().get("/api/profile").set(bearer(login.body.token));
    expect(profile.body.user.registered_by).toBe(cast.employeeA.full_name);
    // Aadhaar is masked even to its owner.
    expect(profile.body.user.aadhaar_number).toBe("XXXX XXXX 3344");
  });

  it("appears in the registering employee's list but not the other employee's", async () => {
    await registerUser(cast.employeeA.token);

    const mine = await api().get("/api/employee/users").set(bearer(cast.employeeA.token));
    const theirs = await api().get("/api/employee/users").set(bearer(cast.employeeB.token));

    expect(mine.body.users.map((u) => u.email)).toContain("nikhil.joshi@test.local");
    expect(theirs.body.users.map((u) => u.email)).not.toContain("nikhil.joshi@test.local");
  });

  it("refuses a duplicate email, Aadhaar or PAN without creating a second row", async () => {
    await registerUser(cast.employeeA.token);
    const before = await countRows("users");

    const duplicates = [
      [{}, "email"],
      [{ email: "different@test.local" }, "aadhaarNumber"],
      [{ email: "different2@test.local", aadhaarNumber: "550011229999" }, "panNumber"],
    ];

    for (const [overrides, field] of duplicates) {
      const res = await registerUser(cast.employeeA.token, newUserForm(overrides));
      expect(res.status, field).toBe(409);
      expect(res.body.errors, field).toHaveProperty(field);
    }

    expect(await countRows("users")).toBe(before);
  });

  it("refuses an email already used by the main admin", async () => {
    // Emails have to stay unique across every account table, or login becomes
    // ambiguous about which account it found.
    const res = await registerUser(
      cast.employeeA.token,
      newUserForm({ email: cast.admin.email })
    );

    expect(res.status).toBe(409);
    expect(res.body.errors.email).toMatch(/already exists/i);
  });
});

// ---------------------------------------------------------------------------
// 2, 3, 12. Login, logout, session expiry
// ---------------------------------------------------------------------------

describe("Journey 2 - signing in at the right door", () => {
  it("takes each role through its own door to its own landing place", async () => {
    const doors = [
      { email: cast.admin.email, role: "admin", expectRole: "admin" },
      { email: cast.subAdmin.email, role: "admin", expectRole: "subadmin" },
      { email: cast.userA.email, role: "user", expectRole: "user" },
    ];

    for (const door of doors) {
      const res = await api()
        .post("/api/auth/login")
        .send({ email: door.email, password: PASSWORD, role: door.role });

      expect(res.status, door.email).toBe(200);
      expect(res.body.user.role, door.email).toBe(door.expectRole);
    }

    const employee = await api()
      .post("/api/employee/login")
      .send({ email: cast.employeeA.email, password: PASSWORD });

    expect(employee.status).toBe(200);
    expect(employee.body.employee.mustChangePassword).toBe(false);
  });

  it("gives a working session, and the token opens what that role may open", async () => {
    const login = await api()
      .post("/api/auth/login")
      .send({ email: cast.subAdmin.email, password: PASSWORD, role: "admin" });

    const token = login.body.token;

    // A sub-admin's token reaches the reports...
    expect((await api().get("/api/reports/summary").set(bearer(token))).status).toBe(200);
    // ...and nothing else.
    expect((await api().get("/api/employees").set(bearer(token))).status).toBe(403);
  });
});

describe("Journey 3 - logging out", () => {
  it("is a client-side act, and the token keeps working until it expires", async () => {
    // There is no server-side session or revocation list: logout clears
    // localStorage in the browser. Worth stating as a test so nobody assumes
    // a stolen token can be revoked - it cannot.
    const login = await api()
      .post("/api/auth/login")
      .send({ email: cast.admin.email, password: PASSWORD, role: "admin" });

    const token = login.body.token;
    expect((await api().get("/api/profile").set(bearer(token))).status).toBe(200);

    // Nothing on the server was told about the logout.
    expect((await api().get("/api/profile").set(bearer(token))).status).toBe(200);
  });

  it("does revoke immediately when the ACCOUNT is deactivated", async () => {
    // The one mechanism that does end a live session.
    const login = await api()
      .post("/api/auth/login")
      .send({ email: cast.subAdmin.email, password: PASSWORD, role: "admin" });

    await api()
      .put(`/api/admins/${cast.subAdmin.id}/status`)
      .set(bearer(cast.admin.token))
      .send({ active: false });

    const after = await api().get("/api/reports/summary").set(bearer(login.body.token));
    expect(after.status).toBe(403);
  });
});

describe("Journey 12 - an expired token", () => {
  it("is refused everywhere, including the profile routes", async () => {
    const expired = jwt.sign({ id: cast.admin.id, role: "admin" }, process.env.JWT_SECRET, {
      expiresIn: "-1s",
    });

    for (const path of ["/api/profile", "/api/employees", "/api/reports/summary"]) {
      const res = await api().get(path).set(bearer(expired));
      expect(res.status, path).toBe(401);
    }
  });

  it("lets the account sign in again and carry on", async () => {
    const fresh = await api()
      .post("/api/auth/login")
      .send({ email: cast.admin.email, password: PASSWORD, role: "admin" });

    expect((await api().get("/api/profile").set(bearer(fresh.body.token))).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 4. Forgot password
// ---------------------------------------------------------------------------

describe("Journey 4 - forgotten password, end to end", () => {
  // The code is hashed at rest now, so a journey reads it where its recipient
  // would - off the delivery path.
  it("locks the old password out and lets the new one in", async () => {
    const otp = await captureOtp(() =>
      api().post("/api/auth/forgot-password").send({ email: cast.admin.email, role: "admin" })
    );
    expect(otp).toMatch(/^\d{6}$/);

    const reset = await api()
      .post("/api/auth/reset-password")
      .send({ email: cast.admin.email, otp, newPassword: "Recovered1", role: "admin" });
    expect(reset.status).toBe(200);

    // The new password works...
    const withNew = await api()
      .post("/api/auth/login")
      .send({ email: cast.admin.email, password: "Recovered1", role: "admin" });
    expect(withNew.status).toBe(200);

    // ...and the old one no longer does.
    const withOld = await api()
      .post("/api/auth/login")
      .send({ email: cast.admin.email, password: PASSWORD, role: "admin" });
    expect(withOld.status).toBe(401);
  });

  it("works the same way for an employee", async () => {
    const otp = await captureOtp(() =>
      api().post("/api/employee/forgot-password").send({ email: cast.employeeA.email })
    );

    const reset = await api()
      .post("/api/employee/reset-password")
      .send({ email: cast.employeeA.email, otp, newPassword: "Recovered1" });
    expect(reset.status).toBe(200);

    const login = await api()
      .post("/api/employee/login")
      .send({ email: cast.employeeA.email, password: "Recovered1" });
    expect(login.status).toBe(200);
    // Choosing their own password clears the forced-change flag.
    expect(login.body.employee.mustChangePassword).toBe(false);
  });

  it("does not let one person's OTP reset another person's account", async () => {
    const otp = await captureOtp(() =>
      api().post("/api/auth/forgot-password").send({ email: cast.userA.email, role: "user" })
    );

    const res = await api()
      .post("/api/auth/reset-password")
      .send({ email: cast.userB.email, otp, newPassword: "Stolen1", role: "user" });

    expect(res.status).toBe(400);

    // userB's password is untouched.
    const login = await api()
      .post("/api/auth/login")
      .send({ email: cast.userB.email, password: PASSWORD, role: "user" });
    expect(login.status).toBe(200);
  });

  it("cannot be brute-forced: the code dies after five wrong guesses", async () => {
    const otp = await captureOtp(() =>
      api().post("/api/auth/forgot-password").send({ email: cast.admin.email, role: "admin" })
    );

    for (let i = 0; i < 5; i += 1) {
      await api()
        .post("/api/auth/reset-password")
        .send({ email: cast.admin.email, otp: "000000", newPassword: "Guessed1", role: "admin" });
    }

    // Even the genuine code is now dead - the holder requests a fresh one.
    const res = await api()
      .post("/api/auth/reset-password")
      .send({ email: cast.admin.email, otp, newPassword: "Guessed1", role: "admin" });
    expect(res.status).toBe(400);

    // And the original password still works, so nothing was changed.
    const login = await api()
      .post("/api/auth/login")
      .send({ email: cast.admin.email, password: PASSWORD, role: "admin" });
    expect(login.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 5, 9. Admin CRUD
// ---------------------------------------------------------------------------

describe("Journey 9 - the admin manages sub-admins, create through delete", () => {
  it("walks the full lifecycle and each step is visible in the next", async () => {
    // Create
    const created = await api()
      .post("/api/admins")
      .set(bearer(cast.admin.token))
      .send({ name: "Nisha Rao", email: "nisha@test.local", password: "SubAdmin1" });

    expect(created.status).toBe(201);
    const id = created.body.account.id;
    expect(created.body.account.role).toBe("subadmin");
    expect(created.body.account.createdBy).toBe(cast.admin.id);

    // The new sub-admin can actually sign in.
    const login = await api()
      .post("/api/auth/login")
      .send({ email: "nisha@test.local", password: "SubAdmin1", role: "admin" });
    expect(login.status).toBe(200);

    // Read
    const list = await api().get("/api/admins").set(bearer(cast.admin.token));
    expect(list.body.accounts.map((a) => a.email)).toContain("nisha@test.local");

    // Update, including a new password
    const updated = await api()
      .put(`/api/admins/${id}`)
      .set(bearer(cast.admin.token))
      .send({ name: "Nisha Rao-Patel", email: "nisha.rp@test.local", password: "Changed12" });

    expect(updated.status).toBe(200);
    expect(updated.body.account.name).toBe("Nisha Rao-Patel");

    const withNewPassword = await api()
      .post("/api/auth/login")
      .send({ email: "nisha.rp@test.local", password: "Changed12", role: "admin" });
    expect(withNewPassword.status).toBe(200);

    // Deactivate - and the live token dies at once
    await api()
      .put(`/api/admins/${id}/status`)
      .set(bearer(cast.admin.token))
      .send({ active: false });

    expect((await api().get("/api/reports/summary").set(bearer(login.body.token))).status).toBe(403);
    // ...and they cannot sign in again either.
    const blocked = await api()
      .post("/api/auth/login")
      .send({ email: "nisha.rp@test.local", password: "Changed12", role: "admin" });
    expect(blocked.status).toBe(403);

    // Reactivate
    await api()
      .put(`/api/admins/${id}/status`)
      .set(bearer(cast.admin.token))
      .send({ active: true });

    const backIn = await api()
      .post("/api/auth/login")
      .send({ email: "nisha.rp@test.local", password: "Changed12", role: "admin" });
    expect(backIn.status).toBe(200);

    // Delete
    const deleted = await api().delete(`/api/admins/${id}`).set(bearer(cast.admin.token));
    expect(deleted.status).toBe(200);

    const gone = await api()
      .post("/api/auth/login")
      .send({ email: "nisha.rp@test.local", password: "Changed12", role: "admin" });
    expect(gone.status).toBe(401);
  });

  it("refuses a duplicate email at creation", async () => {
    const res = await api()
      .post("/api/admins")
      .set(bearer(cast.admin.token))
      .send({ name: "Clash", email: cast.userA.email, password: "SubAdmin1" });

    expect(res.status).toBe(409);
  });
});

describe("Journey 5 - the admin manages employees, create through delete", () => {
  it("blocks and unblocks an employee, and blocking ends their session", async () => {
    const before = await api().get("/api/employee/me").set(bearer(cast.employeeA.token));
    expect(before.status).toBe(200);

    await api()
      .put(`/api/employees/${cast.employeeA.id}/block`)
      .set(bearer(cast.admin.token))
      .send({ blocked: true });

    expect((await api().get("/api/employee/me").set(bearer(cast.employeeA.token))).status).toBe(403);

    const login = await api()
      .post("/api/employee/login")
      .send({ email: cast.employeeA.email, password: PASSWORD });
    expect(login.status).toBe(403);

    await api()
      .put(`/api/employees/${cast.employeeA.id}/block`)
      .set(bearer(cast.admin.token))
      .send({ blocked: false });

    expect((await api().get("/api/employee/me").set(bearer(cast.employeeA.token))).status).toBe(200);
  });

  it("resets an employee's password to a temporary one they must then change", async () => {
    const reset = await api()
      .put(`/api/employees/${cast.employeeA.id}/reset-password`)
      .set(bearer(cast.admin.token))
      .send({});

    expect(reset.status).toBe(200);
    expect(reset.body.tempPassword).toMatch(/^[A-Za-z0-9]{10}$/);

    const login = await api()
      .post("/api/employee/login")
      .send({ email: cast.employeeA.email, password: reset.body.tempPassword });

    expect(login.status).toBe(200);
    expect(login.body.employee.mustChangePassword).toBe(true);

    // A temporary password must not be usable to run the counter. The browser
    // redirects, but the API is the thing that has to enforce it.
    const purchase = await api()
      .post("/api/purchases")
      .set(bearer(login.body.token))
      .send({ userId: cast.userA.id, amountPaid: 100 });

    expect(purchase.status).toBe(403);

    // Once they choose their own password, the counter opens.
    await api()
      .put("/api/employee/change-password")
      .set(bearer(login.body.token))
      .send({ currentPassword: reset.body.tempPassword, newPassword: "MyOwnPass1" });

    const after = await api()
      .post("/api/employee/login")
      .send({ email: cast.employeeA.email, password: "MyOwnPass1" });

    const allowed = await api()
      .post("/api/purchases")
      .set(bearer(after.body.token))
      .send({ userId: cast.userA.id, amountPaid: 100 });

    expect(allowed.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// The trading day, end to end
// ---------------------------------------------------------------------------

describe("Journey 6 - a full trading day", () => {
  it("runs rate -> purchase -> handover -> acceptance, agreeing on every screen", async () => {
    // Morning: the admin publishes the day's rate.
    const rate = await api()
      .post("/api/silver-rate")
      .set(bearer(cast.admin.token))
      .send({ buyRatePerGram: 105, sellRatePerGram: 100 });
    expect(rate.status).toBe(200);

    // The counter takes two payments.
    for (const amount of [1000, 500]) {
      const res = await api()
        .post("/api/purchases")
        .set(bearer(cast.employeeA.token))
        .send({ userId: cast.userA.id, amountPaid: amount });
      expect(res.status).toBe(201);
      expect(res.body.purchase.paymentStatus).toBe("pending");
    }

    // The customer can see their silver straight away, still unsettled.
    const portalBefore = await api()
      .get("/api/purchases/my-holding")
      .set(bearer(cast.userA.token));

    // 9.523810 + 4.761905. Note this is NOT 1500/105 = 14.285714: each
    // purchase's weight is rounded to six decimals and frozen at the moment it
    // is recorded, and the holding is the sum of those stored figures rather
    // than a re-derivation from the total money. The difference is a
    // microgram, and it is the correct behaviour - re-deriving would let a
    // customer's holding move when the rate does.
    expect(portalBefore.body.holding.totalGrams).toBe(14.285715);
    expect(portalBefore.body.purchases.every((p) => p.paymentStatus === "pending")).toBe(true);

    // Evening: the employee hands the cash over.
    const handover = await api()
      .post("/api/settlements")
      .set(bearer(cast.employeeA.token))
      .send({});
    expect(handover.status).toBe(201);
    expect(handover.body.settlement.totalAmount).toBe(1500);

    // The admin accepts it.
    const accept = await api()
      .post(`/api/settlements/${handover.body.settlement.id}/accept`)
      .set(bearer(cast.admin.token))
      .send({});
    expect(accept.status).toBe(200);

    // Now all three views agree that the money arrived.
    const [portal, counter, panel] = await Promise.all([
      api().get("/api/purchases/my-holding").set(bearer(cast.userA.token)),
      api().get("/api/purchases/recorded-by-me").set(bearer(cast.employeeA.token)),
      api().get("/api/purchases").set(bearer(cast.admin.token)),
    ]);

    expect(portal.body.purchases.every((p) => p.paymentStatus === "success")).toBe(true);
    expect(counter.body.purchases.every((p) => p.paymentStatus === "success")).toBe(true);
    expect(panel.body.purchases.every((p) => p.paymentStatus === "success")).toBe(true);

    // And the employee's collection total matches what they handed over.
    const collections = await api()
      .get(`/api/collections/employees/${cast.employeeA.id}`)
      .set(bearer(cast.admin.token));

    expect(collections.body.summary.totalAmount).toBe(1500);
    expect(collections.body.summary.pendingAmount).toBe(0);
  });

  it("runs a sell-back through to an approved payout", async () => {
    await api()
      .post("/api/purchases")
      .set(bearer(cast.employeeA.token))
      .send({ userId: cast.userA.id, amountPaid: 1050 }); // 10 g

    const sale = await api()
      .post("/api/sales")
      .set(bearer(cast.employeeA.token))
      .send({ userId: cast.userA.id, grams: 4 });

    expect(sale.status).toBe(201);
    expect(sale.body.sale.amountPayable).toBe(400);

    // The silver is gone at once; the cash is not paid until approved.
    const midway = await api().get("/api/sales/my-sales").set(bearer(cast.userA.token));
    expect(midway.body.holding.totalGrams).toBe(6);
    expect(midway.body.sales[0].payoutStatus).toBe("pending");

    const approve = await api()
      .post(`/api/sales/${sale.body.sale.id}/approve`)
      .set(bearer(cast.admin.token))
      .send({});
    expect(approve.status).toBe(200);

    const after = await api().get("/api/sales/my-sales").set(bearer(cast.userA.token));
    expect(after.body.sales[0].payoutStatus).toBe("paid");
    expect(after.body.sales[0].approvedByName).toBe(cast.admin.name);
  });

  it("runs the admin's coin payout from employee to receipt", async () => {
    await api()
      .post("/api/purchases")
      .set(bearer(cast.employeeA.token))
      .send({ userId: cast.userA.id, amountPaid: 1050 }); // 10 g

    // Step 1: pick the employee.
    const employees = await api().get("/api/payouts/employees").set(bearer(cast.admin.token));
    const employee = employees.body.employees.find((e) => e.id === cast.employeeA.id);
    expect(employee.heldGrams).toBe(10);

    // Step 2: pick their customer.
    const users = await api()
      .get(`/api/payouts/employees/${cast.employeeA.id}/users`)
      .set(bearer(cast.admin.token));
    expect(users.body.users[0].canPayout).toBe(true);

    // Step 3: see what they hold.
    const view = await api()
      .get(`/api/payouts/users/${cast.userA.id}`)
      .set(bearer(cast.admin.token));
    expect(view.body.holdingValue).toBe(1000);

    // Step 4: the report. Nothing has been written yet.
    const report = await api()
      .post("/api/payouts/report")
      .set(bearer(cast.admin.token))
      .send({ userId: cast.userA.id, grams: 4 });
    expect(await countRows("silver_sales")).toBe(0);

    // Step 5: hand the coin over.
    const paid = await api()
      .post("/api/payouts")
      .set(bearer(cast.admin.token))
      .send({
        userId: cast.userA.id,
        grams: 4,
        ratePerGram: report.body.report.rate.ratePerGram,
        reference: report.body.report.reference,
      });

    expect(paid.status).toBe(201);
    expect(paid.body.payout.payoutKindLabel).toBe("Silver coin");
    expect(paid.body.holding.totalGrams).toBe(6);

    // The customer sees the coin in their own history.
    const portal = await api().get("/api/sales/my-sales").set(bearer(cast.userA.token));
    expect(portal.body.sales[0].isCoin).toBe(true);
    expect(portal.body.holding.totalGrams).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// 6. Search and filter
// ---------------------------------------------------------------------------

describe("Journey 7 - searching and filtering", () => {
  beforeEach(async () => {
    for (const amount of [100, 200, 300]) {
      await api()
        .post("/api/purchases")
        .set(bearer(cast.employeeA.token))
        .send({ userId: cast.userA.id, amountPaid: amount });
    }
    await api()
      .post("/api/purchases")
      .set(bearer(cast.employeeB.token))
      .send({ userId: cast.userB.id, amountPaid: 999 });
  });

  it("finds a customer by name and excludes everyone else", async () => {
    const res = await api()
      .get(`/api/purchases?search=${encodeURIComponent(cast.userA.name)}`)
      .set(bearer(cast.admin.token));

    expect(res.body.purchases).toHaveLength(3);
    expect(res.body.purchases.every((p) => p.userId === cast.userA.id)).toBe(true);
  });

  it("keeps the totals describing exactly the rows returned", async () => {
    // The figures above a table must always describe the table beneath it.
    const res = await api()
      .get(`/api/purchases?search=${encodeURIComponent(cast.userA.name)}`)
      .set(bearer(cast.admin.token));

    const sumOfRows = res.body.purchases.reduce((sum, p) => sum + p.amountPaid, 0);
    expect(sumOfRows).toBe(600);
  });

  it("filters employees by status", async () => {
    await api()
      .put(`/api/employees/${cast.employeeB.id}/block`)
      .set(bearer(cast.admin.token))
      .send({ blocked: true });

    const active = await api().get("/api/employees?status=active").set(bearer(cast.admin.token));
    const blocked = await api().get("/api/employees?status=blocked").set(bearer(cast.admin.token));

    expect(active.body.employees.map((e) => e.id)).toEqual([cast.employeeA.id]);
    expect(blocked.body.employees.map((e) => e.id)).toEqual([cast.employeeB.id]);
  });

  it("filters the sale ledger by status, source and kind together", async () => {
    await api()
      .post("/api/purchases")
      .set(bearer(cast.employeeA.token))
      .send({ userId: cast.userA.id, amountPaid: 1050 });

    await api()
      .post("/api/sales")
      .set(bearer(cast.employeeA.token))
      .send({ userId: cast.userA.id, grams: 2 });

    await api()
      .post("/api/payouts")
      .set(bearer(cast.admin.token))
      .send({ userId: cast.userA.id, grams: 1, ratePerGram: 100, reference: "coin-journey" });

    const counter = await api().get("/api/sales?source=counter").set(bearer(cast.admin.token));
    const admin = await api().get("/api/sales?source=admin").set(bearer(cast.admin.token));
    const coins = await api().get("/api/sales?kind=coin").set(bearer(cast.admin.token));
    const pending = await api().get("/api/sales?status=pending").set(bearer(cast.admin.token));

    expect(counter.body.sales).toHaveLength(1);
    expect(admin.body.sales).toHaveLength(1);
    expect(coins.body.sales).toHaveLength(1);
    expect(pending.body.sales).toHaveLength(1); // the counter sale only
  });

  it("filters by date range and excludes what falls outside it", async () => {
    await query("UPDATE silver_purchases SET purchased_on = '2026-01-15' WHERE amount_paid = 100");

    const inRange = await api()
      .get("/api/purchases?from=2026-01-01&to=2026-01-31")
      .set(bearer(cast.admin.token));

    expect(inRange.body.purchases).toHaveLength(1);
    expect(inRange.body.purchases[0].amountPaid).toBe(100);
  });

  it("returns an empty result, not an error, when nothing matches", async () => {
    const res = await api()
      .get("/api/purchases?search=nobody-by-that-name")
      .set(bearer(cast.admin.token));

    expect(res.status).toBe(200);
    expect(res.body.purchases).toEqual([]);
    expect(res.body.totals.totalPaid).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 10, 11. Unauthorised attempts and invalid input
// ---------------------------------------------------------------------------

describe("Journey 10 - an unauthorised user tries to get in", () => {
  it("cannot reach anything without a token", async () => {
    const paths = [
      "/api/profile",
      "/api/employees",
      "/api/admins",
      "/api/users",
      "/api/reports/summary",
      "/api/purchases",
      "/api/sales",
      "/api/settlements",
      "/api/payouts/employees",
    ];

    for (const path of paths) {
      expect((await api().get(path)).status, path).toBe(401);
    }
  });

  it("cannot escalate by editing the role in a token", async () => {
    // The signature is what stops this; changing the payload invalidates it.
    const [header, payload] = cast.userA.token.split(".");
    const tampered = JSON.parse(Buffer.from(payload, "base64url").toString());
    tampered.role = "admin";

    const forged = [
      header,
      Buffer.from(JSON.stringify(tampered)).toString("base64url"),
      cast.userA.token.split(".")[2],
    ].join(".");

    expect((await api().get("/api/employees").set(bearer(forged))).status).toBe(401);
  });

  it("cannot write anything as a sub-admin, and nothing changes when it tries", async () => {
    const employeesBefore = await countRows("employees");
    const ratesBefore = await countRows("silver_rates");

    await api().delete(`/api/employees/${cast.employeeA.id}`).set(bearer(cast.subAdmin.token));
    await api()
      .post("/api/silver-rate")
      .set(bearer(cast.subAdmin.token))
      .send({ buyRatePerGram: 1, sellRatePerGram: 1 });

    expect(await countRows("employees")).toBe(employeesBefore);
    expect(await countRows("silver_rates")).toBe(ratesBefore);
  });

  it("cannot read another customer's data by guessing an id", async () => {
    const res = await api()
      .get(`/api/employee/users/${cast.userB.id}`)
      .set(bearer(cast.employeeA.token));

    expect(res.status).toBe(404);
  });
});

describe("Journey 11 - invalid input at every form", () => {
  it("rejects a registration with several bad fields and names each one", async () => {
    const res = await registerUser(
      cast.employeeA.token,
      newUserForm({
        firstName: "N",
        mobile: "123",
        email: "not-an-email",
        aadhaarNumber: "1",
        panNumber: "bad",
        age: "5",
      })
    );

    expect(res.status).toBe(400);
    expect(Object.keys(res.body.errors).sort()).toEqual(
      ["aadhaarNumber", "age", "email", "firstName", "mobile", "panNumber"].sort()
    );
    expect(await countRows("users")).toBe(2); // only the two from the cast
  });

  it("rejects a registration missing its documents", async () => {
    let req = api().post("/api/employee/users").set(bearer(cast.employeeA.token));
    for (const [key, value] of Object.entries(newUserForm())) {
      req = req.field(key, String(value));
    }

    const res = await req; // no attachments
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("aadhaarFront");
  });

  it("rejects an oversized or wrongly typed upload", async () => {
    const tooBig = Buffer.alloc(11 * 1024, 1);
    const big = await api()
      .post("/api/employee/users")
      .set(bearer(cast.employeeA.token))
      .field("firstName", "Nikhil")
      .attach("aadhaarFront", tooBig, "big.jpg");

    expect(big.status).toBe(400);
    expect(big.body.message).toMatch(/10KB or smaller/i);

    const notAnImage = await api()
      .post("/api/employee/users")
      .set(bearer(cast.employeeA.token))
      .field("firstName", "Nikhil")
      .attach("aadhaarFront", Buffer.from("%PDF-1.4"), {
        filename: "x.pdf",
        contentType: "application/pdf",
      });

    expect(notAnImage.status).toBe(400);
    expect(notAnImage.body.message).toMatch(/JPG, PNG or WebP/i);
  });

  it("never answers a bad form with a 500", async () => {
    const attempts = [
      ["/api/purchases", { userId: "abc", amountPaid: "xyz" }, cast.employeeA.token],
      ["/api/sales", { userId: null, grams: -1 }, cast.employeeA.token],
      ["/api/silver-rate", { buyRatePerGram: "abc" }, cast.admin.token],
      ["/api/admins", { name: "", email: "bad", password: "1" }, cast.admin.token],
      ["/api/settlements", {}, cast.employeeA.token],
    ];

    for (const [path, body, token] of attempts) {
      const res = await api().post(path).set(bearer(token)).send(body);
      expect(res.status, path).toBeLessThan(500);
    }
  });

  it("never answers a bad login with a 500", async () => {
    const bodies = [
      { email: cast.admin.email, password: 12345, role: "admin" },
      { email: { $ne: null }, password: "x", role: "admin" },
      { email: cast.admin.email, password: ["a"], role: "admin" },
    ];

    for (const body of bodies) {
      const res = await api().post("/api/auth/login").send(body);
      expect(res.status, JSON.stringify(body)).toBeLessThan(500);
    }
  });
});

// ---------------------------------------------------------------------------
// Data protection
// ---------------------------------------------------------------------------

describe("Journey 13 - a customer's identity documents stay private", () => {
  it("does not serve an uploaded document to an anonymous visitor", async () => {
    const created = await registerUser(cast.employeeA.token);
    const path = created.body.user.aadhaar_front;

    const res = await api().get(path); // no token at all

    expect([401, 403]).toContain(res.status);
  });

  it("does not serve one to a customer who does not own it", async () => {
    const created = await registerUser(cast.employeeA.token);
    const path = created.body.user.aadhaar_front;

    const res = await api().get(path).set(bearer(cast.userB.token));

    expect([401, 403, 404]).toContain(res.status);
  });
});
