// The signed-in account's own profile.
//
// This router is the odd one out in the codebase: every other one adds a role
// guard that re-reads the account row, and this one guards with `protect`
// alone. Three separate defects follow from that single difference, and this
// suite pins all three.

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import bcrypt from "bcryptjs";

import { api, buildCast, PASSWORD } from "../helpers/fixtures.js";
import { resetDatabase, closePool, query } from "../helpers/db.js";

let cast;

beforeEach(async () => {
  await resetDatabase();
  cast = await buildCast();
});

afterAll(closePool);

const as = (account) => ({ Authorization: `Bearer ${account.token}` });

describe("reading your own profile", () => {
  it("returns the account without its password or OTP columns", async () => {
    const res = await api().get("/api/profile").set(as(cast.admin));

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(cast.admin.email);
    expect(res.body.user).not.toHaveProperty("password");
    expect(res.body.user).not.toHaveProperty("reset_otp");
  });

  it("adds the fuller record for a customer, with Aadhaar masked", async () => {
    const res = await api().get("/api/profile").set(as(cast.userA));

    expect(res.status).toBe(200);
    expect(res.body.user.mobile).toBeTruthy();
    expect(res.body.user.registered_by).toBe(cast.employeeA.full_name);
    // Masked even to its owner, the same rule every report follows.
    expect(res.body.user.aadhaar_number).toMatch(/^XXXX XXXX \d{4}$/);
  });

  it("lets a sub-admin read but not write", async () => {
    const read = await api().get("/api/profile").set(as(cast.subAdmin));
    expect(read.status).toBe(200);

    const write = await api()
      .put("/api/profile")
      .set(as(cast.subAdmin))
      .send({ name: "New Name", email: "new@test.local" });
    expect(write.status).toBe(403);
  });
});

describe("updating your own profile", () => {
  it("saves a new name and email", async () => {
    const res = await api()
      .put("/api/profile")
      .set(as(cast.admin))
      .send({ name: "Renamed Admin", email: "renamed@test.local" });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Renamed Admin");
    expect(res.body.user.email).toBe("renamed@test.local");
  });

  it("requires both fields", async () => {
    for (const body of [{}, { name: "X" }, { email: "x@test.local" }]) {
      const res = await api().put("/api/profile").set(as(cast.admin)).send(body);
      expect(res.status).toBe(400);
    }
  });
});

describe("FIXED (was BUG-05): profile email is validated and unique", () => {
  it("refuses an address that is not an email at all", async () => {
    const res = await api()
      .put("/api/profile")
      .set(as(cast.admin))
      .send({ name: "Admin", email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveProperty("email");

    // The account still signs in with the address it had.
    const rows = await query("SELECT email FROM admins WHERE id = ?", [cast.admin.id]);
    expect(rows[0].email).toBe(cast.admin.email);
  });

  it("answers 409 - not a 500 with the schema in it - on a duplicate in the same table", async () => {
    const other = await query("SELECT email FROM users WHERE id = ?", [cast.userB.id]);

    const res = await api()
      .put("/api/profile")
      .set(as(cast.userA))
      .send({ name: "Amit", email: other[0].email });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);
    // No table or column names in the response any more.
    expect(res.body.message).not.toMatch(/duplicate entry/i);
    expect(res.body.message).not.toMatch(/users\.email/i);
  });

  it("refuses a customer trying to take the main admin's address", async () => {
    // MySQL cannot enforce uniqueness across separate tables, so the check has
    // to be in the controller - and it now is.
    const res = await api()
      .put("/api/profile")
      .set(as(cast.userA))
      .send({ name: "Amit", email: cast.admin.email });

    expect(res.status).toBe(409);

    const users = await query("SELECT email FROM users WHERE id = ?", [cast.userA.id]);
    expect(users[0].email).toBe(cast.userA.email);
  });

  it("leaves both logins working, each resolving to its own account", async () => {
    await api()
      .put("/api/profile")
      .set(as(cast.userA))
      .send({ name: "Amit", email: cast.admin.email });

    const asAdmin = await api()
      .post("/api/auth/login")
      .send({ email: cast.admin.email, password: PASSWORD, role: "admin" });
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.user.role).toBe("admin");

    const asCustomer = await api()
      .post("/api/auth/login")
      .send({ email: cast.userA.email, password: PASSWORD, role: "user" });
    expect(asCustomer.status).toBe(200);
    expect(asCustomer.body.user.role).toBe("user");
  });

  it("still lets an account keep its own address when editing its name", async () => {
    // The uniqueness check has to exclude the account doing the editing, or
    // nobody could ever change just their name.
    const res = await api()
      .put("/api/profile")
      .set(as(cast.admin))
      .send({ name: "Renamed Admin", email: cast.admin.email });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Renamed Admin");
  });
});

describe("changing your own password", () => {
  it("requires the current password to be correct", async () => {
    const res = await api()
      .put("/api/profile/change-password")
      .set(as(cast.admin))
      .send({ currentPassword: "wrong", newPassword: "BrandNew1" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/current password is incorrect/i);
  });

  it("stores the new password as a bcrypt hash, and it works for login", async () => {
    const res = await api()
      .put("/api/profile/change-password")
      .set(as(cast.admin))
      .send({ currentPassword: PASSWORD, newPassword: "BrandNew1" });

    expect(res.status).toBe(200);

    const rows = await query("SELECT password FROM admins WHERE id = ?", [cast.admin.id]);
    expect(rows[0].password).toMatch(/^\$2[aby]\$10\$/);
    expect(await bcrypt.compare("BrandNew1", rows[0].password)).toBe(true);

    const login = await api()
      .post("/api/auth/login")
      .send({ email: cast.admin.email, password: "BrandNew1", role: "admin" });
    expect(login.status).toBe(200);
  });

  it("requires both fields", async () => {
    const res = await api()
      .put("/api/profile/change-password")
      .set(as(cast.admin))
      .send({ currentPassword: PASSWORD });

    expect(res.status).toBe(400);
  });
});

describe("FIXED (was BUG-15): the password minimum applies here too", () => {
  it("refuses a one-character password for the main admin", async () => {
    // Every other path that sets a password requires six characters: the OTP
    // reset on all four doors, the employee's own change, and sub-admin create
    // and edit. This one used to require nothing at all.
    const res = await api()
      .put("/api/profile/change-password")
      .set(as(cast.admin))
      .send({ currentPassword: PASSWORD, newPassword: "a" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/6 characters/i);

    // The old password still works, so nothing was changed.
    const login = await api()
      .post("/api/auth/login")
      .send({ email: cast.admin.email, password: PASSWORD, role: "admin" });
    expect(login.status).toBe(200);
  });

  it("is refused on every other path too", async () => {
    const subAdmin = await api()
      .post("/api/admins")
      .set(as(cast.admin))
      .send({ name: "Short Pass", email: "short@test.local", password: "a" });
    expect(subAdmin.status).toBe(400);

    const employee = await api()
      .put("/api/employee/change-password")
      .set(as(cast.employeeA))
      .send({ currentPassword: PASSWORD, newPassword: "a" });
    expect(employee.status).toBe(400);
  });
});

describe("the employee's own profile", () => {
  it("returns their record with Aadhaar masked", async () => {
    const res = await api().get("/api/employee/me").set(as(cast.employeeA));

    expect(res.status).toBe(200);
    expect(res.body.employee.aadhaarNumber).toMatch(/^XXXX XXXX \d{4}$/);
    expect(res.body.employee).not.toHaveProperty("password");
  });

  it("clears the must-change flag when they choose their own password", async () => {
    await query("UPDATE employees SET must_change_password = 1 WHERE id = ?", [
      cast.employeeA.id,
    ]);

    const res = await api()
      .put("/api/employee/change-password")
      .set(as(cast.employeeA))
      .send({ currentPassword: PASSWORD, newPassword: "ChosenByMe1" });

    expect(res.status).toBe(200);
    expect(res.body.employee.mustChangePassword).toBe(false);
  });

  it("rejects a wrong current password with 401", async () => {
    const res = await api()
      .put("/api/employee/change-password")
      .set(as(cast.employeeA))
      .send({ currentPassword: "wrong", newPassword: "ChosenByMe1" });

    expect(res.status).toBe(401);
  });
});

describe("FIXED (was BUG-06): the temporary password is enforced server-side", () => {
  beforeEach(async () => {
    await query("UPDATE employees SET must_change_password = 1 WHERE id = ?", [
      cast.employeeA.id,
    ]);
  });

  it("closes the portal to an employee still on the admin's temporary password", async () => {
    // The browser redirected them to their profile; the API did not care, so
    // a password that had been read aloud and written on paper was a working
    // credential for the whole counter.
    const closed = [
      ["get", "/api/employee/users"],
      ["get", "/api/purchases/customers"],
      ["get", "/api/purchases/rate"],
      ["get", "/api/settlements/pending-summary"],
      ["get", "/api/collections/me"],
    ];

    for (const [method, path] of closed) {
      const res = await api()[method](path).set(as(cast.employeeA));
      expect(res.status, path).toBe(403);
      expect(res.body.mustChangePassword, path).toBe(true);
    }
  });

  it("closes the writes, so nothing can be traded on that password", async () => {
    const purchase = await api()
      .post("/api/purchases")
      .set(as(cast.employeeA))
      .send({ userId: cast.userA.id, amountPaid: 500 });

    expect(purchase.status).toBe(403);
  });

  it("still lets them reach the two screens they need to fix it", async () => {
    // Otherwise the rule would lock them out of the only thing that clears it.
    const me = await api().get("/api/employee/me").set(as(cast.employeeA));
    expect(me.status).toBe(200);

    const change = await api()
      .put("/api/employee/change-password")
      .set(as(cast.employeeA))
      .send({ currentPassword: PASSWORD, newPassword: "ChosenByMe1" });
    expect(change.status).toBe(200);
  });

  it("opens the portal again once they have chosen their own", async () => {
    await api()
      .put("/api/employee/change-password")
      .set(as(cast.employeeA))
      .send({ currentPassword: PASSWORD, newPassword: "ChosenByMe1" });

    const res = await api().get("/api/employee/users").set(as(cast.employeeA));
    expect(res.status).toBe(200);
  });
});
