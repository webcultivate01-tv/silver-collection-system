// Authentication: the four doors, and the rule that an account may only enter
// through its own.
//
// The design here is deliberate and worth testing precisely: the email is
// looked up across every account table BEFORE the door is checked, so that a
// wrong password can't be used to discover which door an address belongs to.
// Several tests below exist only to prove that ordering still holds.

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import jwt from "jsonwebtoken";

import {
  api,
  buildCast,
  captureOtp,
  makeSubAdmin,
  makeEmployee,
  PASSWORD,
} from "../helpers/fixtures.js";
import { resetDatabase, closePool, query } from "../helpers/db.js";

let cast;

beforeEach(async () => {
  await resetDatabase();
  cast = await buildCast();
});

afterAll(closePool);

describe("POST /api/auth/login - the admin door", () => {
  it("signs the main admin in and reports their role", async () => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: cast.admin.email, password: PASSWORD, role: "admin" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: cast.admin.email, role: "admin" });
  });

  it("signs a sub-admin in through the same door, with their own role", async () => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: cast.subAdmin.email, password: PASSWORD, role: "admin" });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("subadmin");
  });

  it("never returns the password hash or the OTP columns", async () => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: cast.admin.email, password: PASSWORD, role: "admin" });

    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/\$2[aby]\$/);
    expect(res.body.user).not.toHaveProperty("password");
    expect(res.body.user).not.toHaveProperty("reset_otp");
  });
});

describe("the doors stay separate", () => {
  it("refuses a user account submitted at the admin login", async () => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: cast.userA.email, password: PASSWORD, role: "admin" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/user login page/i);
  });

  it("refuses an admin account submitted at the user login", async () => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: cast.admin.email, password: PASSWORD, role: "user" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/admin login page/i);
  });

  it("does not let a WRONG password reveal which door an address belongs to", async () => {
    // The security property behind the lookup order. Both of these are the
    // same account at the wrong door; the only difference is the password.
    // The wrong one must look exactly like any other failed login.
    const wrong = await api()
      .post("/api/auth/login")
      .send({ email: cast.userA.email, password: "not-the-password", role: "admin" });

    expect(wrong.status).toBe(401);
    expect(wrong.body.message).toBe("Invalid email or password");

    const right = await api()
      .post("/api/auth/login")
      .send({ email: cast.userA.email, password: PASSWORD, role: "admin" });

    expect(right.status).toBe(403);
  });

  it("gives an unknown address the same answer as a wrong password", async () => {
    const unknown = await api()
      .post("/api/auth/login")
      .send({ email: "nobody@test.local", password: PASSWORD, role: "admin" });

    const wrongPassword = await api()
      .post("/api/auth/login")
      .send({ email: cast.admin.email, password: "wrong", role: "admin" });

    expect(unknown.status).toBe(wrongPassword.status);
    expect(unknown.body.message).toBe(wrongPassword.body.message);
  });

  it("employees sign in at their own endpoint, not the admin one", async () => {
    const wrongDoor = await api()
      .post("/api/auth/login")
      .send({ email: cast.employeeA.email, password: PASSWORD, role: "admin" });

    // An employee isn't in any of the three account tables the admin door
    // searches, so it reads as an unknown address.
    expect(wrongDoor.status).toBe(401);

    const ownDoor = await api()
      .post("/api/employee/login")
      .send({ email: cast.employeeA.email, password: PASSWORD });

    expect(ownDoor.status).toBe(200);
    expect(ownDoor.body.employee.email).toBe(cast.employeeA.email);
  });
});

describe("missing and malformed credentials", () => {
  it("asks for both fields rather than failing oddly", async () => {
    for (const body of [{}, { email: cast.admin.email }, { password: PASSWORD }]) {
      const res = await api().post("/api/auth/login").send(body);
      expect(res.status).toBe(400);
    }
  });

  it("does not accept the stored hash as a password", async () => {
    const [row] = await query("SELECT password FROM admins WHERE email = ?", [cast.admin.email]);

    const res = await api()
      .post("/api/auth/login")
      .send({ email: cast.admin.email, password: row.password, role: "admin" });

    expect(res.status).toBe(401);
  });

  it("handles a falsy non-string password with a 400", async () => {
    // null and undefined are caught by the `!password` guard.
    for (const password of [null, undefined, ""]) {
      const res = await api()
        .post("/api/auth/login")
        .send({ email: cast.admin.email, password, role: "admin" });

      expect(res.status).toBe(400);
    }
  });

  // FIXED (was BUG-28). A truthy non-string used to get past the `!password`
  // guard and reach bcrypt.compare, which throws "Illegal arguments" on
  // anything that isn't a string - turning a malformed login into an
  // unauthenticated 500 on every door in the app. Credentials are now read as
  // strings or not at all.
  it("answers a truthy non-string password with 400, not a server error", async () => {
    for (const password of [123, { $ne: null }, ["a"], true]) {
      const res = await api()
        .post("/api/auth/login")
        .send({ email: cast.admin.email, password, role: "admin" });

      expect(res.status, JSON.stringify(password)).toBe(400);
    }
  });

  it("does the same for a non-string email", async () => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: { $ne: null }, password: PASSWORD, role: "admin" });

    expect(res.status).toBe(400);
  });

  it("holds on the employee door too", async () => {
    const res = await api()
      .post("/api/employee/login")
      .send({ email: cast.employeeA.email, password: 123 });

    expect(res.status).toBe(400);
  });
});

describe("deactivated and blocked accounts cannot sign in", () => {
  it("refuses a deactivated sub-admin", async () => {
    const inactive = await makeSubAdmin({ email: "off@test.local", isActive: false });

    const res = await api()
      .post("/api/auth/login")
      .send({ email: inactive.email, password: PASSWORD, role: "admin" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/deactivated/i);
  });

  it("refuses a blocked employee, but only after checking the password", async () => {
    const blocked = await makeEmployee({ firstName: "Blocked", lastName: "Staff", isBlocked: true });

    const wrongPassword = await api()
      .post("/api/employee/login")
      .send({ email: blocked.email, password: "wrong" });
    expect(wrongPassword.status).toBe(401);

    const correct = await api()
      .post("/api/employee/login")
      .send({ email: blocked.email, password: PASSWORD });
    expect(correct.status).toBe(403);
    expect(correct.body.message).toMatch(/blocked/i);
  });
});

describe("token handling", () => {
  it("rejects a token signed with a different secret", async () => {
    const forged = jwt.sign({ id: cast.admin.id, role: "admin" }, "not-the-real-secret");

    const res = await api().get("/api/profile").set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it("rejects an unsigned (alg: none) token", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ id: 1, role: "admin" })).toString("base64url");

    const res = await api().get("/api/profile").set("Authorization", `Bearer ${header}.${payload}.`);
    expect(res.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const expired = jwt.sign({ id: cast.admin.id, role: "admin" }, process.env.JWT_SECRET, {
      expiresIn: "-1s",
    });

    const res = await api().get("/api/profile").set("Authorization", `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it("rejects malformed headers without a 500", async () => {
    const headers = ["", "Bearer", "Bearer ", "Basic abc", "abc.def.ghi", `Bearer ${"x".repeat(500)}`];

    for (const header of headers) {
      const res = await api().get("/api/profile").set("Authorization", header);
      expect(res.status).toBe(401);
    }
  });

  it("refuses a request with no Authorization header at all", async () => {
    const res = await api().get("/api/profile");
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/no token/i);
  });
});

describe("ids do not cross account tables", () => {
  it("resolves the same id to a different account depending on the role claim", async () => {
    // Ids restart at 1 in every table, so (role, id) is the real key. Both of
    // these tokens carry id 1 and resolve to different people.
    const adminRows = await query("SELECT id, email FROM admins ORDER BY id LIMIT 1");
    const userRows = await query("SELECT id, email FROM users ORDER BY id LIMIT 1");
    expect(adminRows[0].id).toBe(userRows[0].id);

    const asAdmin = jwt.sign({ id: 1, role: "admin" }, process.env.JWT_SECRET);
    const asUser = jwt.sign({ id: 1, role: "user" }, process.env.JWT_SECRET);

    const adminRes = await api().get("/api/profile").set("Authorization", `Bearer ${asAdmin}`);
    const userRes = await api().get("/api/profile").set("Authorization", `Bearer ${asUser}`);

    expect(adminRes.body.user.email).toBe(adminRows[0].email);
    expect(userRes.body.user.email).toBe(userRows[0].email);
    expect(adminRes.body.user.email).not.toBe(userRes.body.user.email);
  });

  it("gives a role with no account table nothing, rather than crashing", async () => {
    const tampered = jwt.sign({ id: 1, role: "superuser" }, process.env.JWT_SECRET);

    const res = await api().get("/api/profile").set("Authorization", `Bearer ${tampered}`);
    expect(res.status).toBe(404);
  });

  it("gives an employee token nothing on the account-profile route", async () => {
    // An employee has its own /api/employee/me; it has no row in the three
    // account tables, so /api/profile must not resolve it to somebody else.
    const res = await api().get("/api/profile").set("Authorization", `Bearer ${cast.employeeA.token}`);
    expect(res.status).toBe(404);
  });
});

describe("forgot password / reset password", () => {
  // The code is hashed in the database now, so a test reads it the way the
  // recipient does - off the delivery path.
  function requestOtp(email, role) {
    return captureOtp(() =>
      api().post("/api/auth/forgot-password").send({ email, role })
    );
  }

  it("issues an OTP and lets it set a new password", async () => {
    const otp = await requestOtp(cast.admin.email, "admin");
    expect(otp).toMatch(/^\d{6}$/);

    const reset = await api()
      .post("/api/auth/reset-password")
      .send({ email: cast.admin.email, otp, newPassword: "BrandNew1", role: "admin" });
    expect(reset.status).toBe(200);

    const login = await api()
      .post("/api/auth/login")
      .send({ email: cast.admin.email, password: "BrandNew1", role: "admin" });
    expect(login.status).toBe(200);
  });

  it("clears the OTP once used, so it cannot be replayed", async () => {
    const otp = await requestOtp(cast.admin.email, "admin");

    await api()
      .post("/api/auth/reset-password")
      .send({ email: cast.admin.email, otp, newPassword: "BrandNew1", role: "admin" });

    const [row] = await query("SELECT reset_otp FROM admins WHERE email = ?", [cast.admin.email]);
    expect(row.reset_otp).toBeNull();

    const replay = await api()
      .post("/api/auth/reset-password")
      .send({ email: cast.admin.email, otp, newPassword: "Another1", role: "admin" });
    expect(replay.status).toBe(400);
  });

  it("rejects a wrong OTP", async () => {
    await requestOtp(cast.admin.email, "admin");

    const res = await api()
      .post("/api/auth/reset-password")
      .send({ email: cast.admin.email, otp: "000000", newPassword: "BrandNew1", role: "admin" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid or expired/i);
  });

  it("rejects an expired OTP, and retires it", async () => {
    const otp = await requestOtp(cast.admin.email, "admin");

    await query("UPDATE admins SET reset_otp_expires = ? WHERE email = ?", [
      new Date(Date.now() - 60_000),
      cast.admin.email,
    ]);

    const res = await api()
      .post("/api/auth/reset-password")
      .send({ email: cast.admin.email, otp, newPassword: "BrandNew1", role: "admin" });

    expect(res.status).toBe(400);

    const [row] = await query("SELECT reset_otp FROM admins WHERE email = ?", [cast.admin.email]);
    expect(row.reset_otp).toBeNull();
  });

  it("enforces a minimum length on the new password", async () => {
    const otp = await requestOtp(cast.admin.email, "admin");

    const res = await api()
      .post("/api/auth/reset-password")
      .send({ email: cast.admin.email, otp, newPassword: "a", role: "admin" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/6 characters/i);
  });

  it("answers identically for an unknown address, and issues nothing", async () => {
    const known = await api()
      .post("/api/auth/forgot-password")
      .send({ email: cast.admin.email, role: "admin" });
    const unknown = await api()
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@test.local", role: "admin" });

    expect(unknown.status).toBe(known.status);
    expect(unknown.body.message).toBe(known.body.message);
  });

  it("issues no OTP for a deactivated account", async () => {
    const inactive = await makeSubAdmin({ email: "off2@test.local", isActive: false });

    const otp = await requestOtp(inactive.email, "admin");
    expect(otp).toBeNull();

    const [row] = await query("SELECT reset_otp FROM sub_admins WHERE email = ?", [inactive.email]);
    expect(row.reset_otp).toBeNull();
  });

  it("will not reset a user's password through the admin door", async () => {
    const otp = await requestOtp(cast.userA.email, "user");
    expect(otp).toMatch(/^\d{6}$/);

    const wrongDoor = await api()
      .post("/api/auth/reset-password")
      .send({ email: cast.userA.email, otp, newPassword: "BrandNew1", role: "admin" });

    expect(wrongDoor.status).toBe(400);
  });
});

describe("the OTP itself", () => {
  // FIXED (was BUG-03). Three things were wrong: the code came from
  // Math.random (predictable from a few observed outputs), it was stored
  // exactly as it was emailed, and a wrong guess left it usable so the
  // six-digit space could simply be walked through.
  it("is six digits when emailed, and a hash when stored", async () => {
    const otp = await captureOtp(() =>
      api().post("/api/auth/forgot-password").send({ email: cast.admin.email, role: "admin" })
    );

    expect(otp).toMatch(/^\d{6}$/);

    const [row] = await query("SELECT reset_otp FROM admins WHERE email = ?", [cast.admin.email]);
    // A SHA-256 hex digest - not something anyone can read a code out of.
    expect(row.reset_otp).toMatch(/^[a-f0-9]{64}$/);
    expect(row.reset_otp).not.toBe(otp);
  });

  it("dies after five wrong guesses instead of lasting its full ten minutes", async () => {
    await captureOtp(() =>
      api().post("/api/auth/forgot-password").send({ email: cast.admin.email, role: "admin" })
    );

    for (let i = 0; i < 5; i += 1) {
      await api()
        .post("/api/auth/reset-password")
        .send({ email: cast.admin.email, otp: "000000", newPassword: "BrandNew1", role: "admin" });
    }

    const [row] = await query("SELECT reset_otp FROM admins WHERE email = ?", [cast.admin.email]);
    expect(row.reset_otp).toBeNull();
  });

  it("cannot be used after being exhausted, even with the right code", async () => {
    const otp = await captureOtp(() =>
      api().post("/api/auth/forgot-password").send({ email: cast.admin.email, role: "admin" })
    );

    for (let i = 0; i < 5; i += 1) {
      await api()
        .post("/api/auth/reset-password")
        .send({ email: cast.admin.email, otp: "000000", newPassword: "BrandNew1", role: "admin" });
    }

    const res = await api()
      .post("/api/auth/reset-password")
      .send({ email: cast.admin.email, otp, newPassword: "BrandNew1", role: "admin" });

    expect(res.status).toBe(400);
  });

  it("gives a fresh code a fresh set of attempts", async () => {
    await captureOtp(() =>
      api().post("/api/auth/forgot-password").send({ email: cast.admin.email, role: "admin" })
    );

    for (let i = 0; i < 3; i += 1) {
      await api()
        .post("/api/auth/reset-password")
        .send({ email: cast.admin.email, otp: "000000", newPassword: "BrandNew1", role: "admin" });
    }

    const fresh = await captureOtp(() =>
      api().post("/api/auth/forgot-password").send({ email: cast.admin.email, role: "admin" })
    );

    const [row] = await query("SELECT reset_otp_attempts FROM admins WHERE email = ?", [
      cast.admin.email,
    ]);
    expect(Number(row.reset_otp_attempts)).toBe(0);

    const reset = await api()
      .post("/api/auth/reset-password")
      .send({ email: cast.admin.email, otp: fresh, newPassword: "BrandNew1", role: "admin" });
    expect(reset.status).toBe(200);
  });
});
