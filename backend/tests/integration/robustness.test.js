// Input robustness across the API surface.
//
// Not a coverage exercise: every case here is a shape a real client can send
// by accident or on purpose, and the question each one asks is whether the
// server answers with a 4xx it chose or a 500 it didn't.

import { describe, it, expect, beforeEach, afterAll } from "vitest";

import { api, buildCast } from "../helpers/fixtures.js";
import { resetDatabase, closePool, countRows } from "../helpers/db.js";

let cast;

beforeEach(async () => {
  await resetDatabase();
  cast = await buildCast();
});

afterAll(closePool);

const asAdmin = () => ({ Authorization: `Bearer ${cast.admin.token}` });
const asEmployee = () => ({ Authorization: `Bearer ${cast.employeeA.token}` });

// Endpoints that accept a row limit.
const LIMITED = [
  ["/api/purchases", asAdmin],
  ["/api/sales", asAdmin],
  ["/api/reports/silver-rates", asAdmin],
  ["/api/silver-rate/history", asAdmin],
  ["/api/purchases/recorded-by-me", asEmployee],
  ["/api/sales/recorded-by-me", asEmployee],
];

describe("row limits", () => {
  it("clamps an absurdly large limit instead of returning everything", async () => {
    for (let i = 0; i < 5; i += 1) {
      await api()
        .post("/api/purchases")
        .set(asEmployee())
        .send({ userId: cast.userA.id, amountPaid: 100 });
    }

    const res = await api().get("/api/purchases?limit=999999999").set(asAdmin());

    expect(res.status).toBe(200);
    expect(res.body.purchases.length).toBeLessThanOrEqual(200);
  });

  it("ignores a non-numeric limit and falls back to the default", async () => {
    const res = await api().get("/api/purchases?limit=abc").set(asAdmin());
    expect(res.status).toBe(200);
  });

  // FIXED (was BUG-11). The clamp was Math.min(Number(x) || default, MAX): it
  // capped the top but not the bottom and did not force a whole number, so
  // "-5" and "1.5" both reached `LIMIT ?` and produced invalid SQL - an
  // unauthenticated-shaped 500 on eight endpoints from a query string.
  it("handles a negative limit on every endpoint that takes one", async () => {
    for (const [path, auth] of LIMITED) {
      const res = await api().get(`${path}?limit=-5`).set(auth());
      expect(res.status, path).toBe(200);
    }
  });

  it("handles a fractional limit", async () => {
    const res = await api().get("/api/purchases?limit=1.5").set(asAdmin());
    expect(res.status).toBe(200);
  });

  it("truncates a fractional limit rather than rejecting it", async () => {
    for (let i = 0; i < 5; i += 1) {
      await api()
        .post("/api/purchases")
        .set(asEmployee())
        .send({ userId: cast.userA.id, amountPaid: 100 });
    }

    const res = await api().get("/api/purchases?limit=2.9").set(asAdmin());
    expect(res.body.purchases).toHaveLength(2);
  });
});

describe("path parameters", () => {
  it("404s on ids that do not exist", async () => {
    const paths = [
      "/api/employees/999999",
      "/api/admins/999999",
      "/api/users/999999",
      "/api/employee/users/999999",
    ];

    for (const path of paths) {
      const auth = path.startsWith("/api/employee/users") ? asEmployee : asAdmin;
      const res = await api().get(path).set(auth());
      expect(res.status, path).toBe(404);
    }
  });

  it("does not 500 on a wildly malformed id", async () => {
    const ids = ["abc", "0", "-1", "1.5", "%20", "null", "x".repeat(200)];

    for (const id of ids) {
      const res = await api().get(`/api/employees/${id}`).set(asAdmin());
      expect(res.status, id).toBeLessThan(500);
    }
  });

  // KNOWN DEFECT (BUG-20). The id is parameterised, so this is not injectable
  // - but it is passed as a string, and MySQL coerces '1abc' to 1 in a numeric
  // comparison. A malformed URL silently succeeds where it should 404.
  it("resolves '<id>abc' to the record with that id", async () => {
    const clean = await api().get(`/api/employees/${cast.employeeA.id}`).set(asAdmin());
    const dirty = await api().get(`/api/employees/${cast.employeeA.id}abc`).set(asAdmin());

    expect(clean.status).toBe(200);
    expect(dirty.status).toBe(200); // should be 404
    expect(dirty.body.employee.id).toBe(clean.body.employee.id);
  });

  it("validates ids properly where the controller bothered to", async () => {
    // For contrast: these routes use Number.isInteger and answer 400.
    for (const id of ["abc", "0", "-1"]) {
      const res = await api().post(`/api/settlements/${id}/accept`).set(asAdmin()).send({});
      expect(res.status, id).toBe(400);
    }
  });
});

describe("query filters", () => {
  it("falls back to 'all' for an unrecognised enum value", async () => {
    const res = await api().get("/api/sales?status=DROP&kind=platinum&source=nowhere").set(asAdmin());

    expect(res.status).toBe(200);
    expect(res.body.filters.status).toBe("all");
    expect(res.body.filters.kind).toBe("all");
    expect(res.body.filters.source).toBe("all");
  });

  it("drops a date that is not in the form the date input sends", async () => {
    const res = await api().get("/api/sales?from=yesterday&to=01/01/2026").set(asAdmin());

    expect(res.status).toBe(200);
    expect(res.body.filters.from).toBe("");
    expect(res.body.filters.to).toBe("");
  });

  it("treats SQL metacharacters in a search box as literal text", async () => {
    const payloads = [
      "' OR 1=1--",
      "'; DROP TABLE users;--",
      "\\",
      "admin' UNION SELECT * FROM admins--",
    ];

    for (const search of payloads) {
      const res = await api()
        .get(`/api/purchases?search=${encodeURIComponent(search)}`)
        .set(asAdmin());

      expect(res.status, search).toBe(200);
      expect(res.body.purchases, search).toEqual([]);
    }

    // The tables are all still there.
    expect(await countRows("users")).toBeGreaterThan(0);
    expect(await countRows("admins")).toBe(1);
  });

  it("treats LIKE wildcards as literal characters too", async () => {
    await api()
      .post("/api/purchases")
      .set(asEmployee())
      .send({ userId: cast.userA.id, amountPaid: 100 });

    // KNOWN LIMITATION: `%` is interpolated straight into the LIKE pattern,
    // so a search for "%" matches everything rather than searching for a
    // literal percent sign. Not injectable, but it makes the search box
    // behave oddly and lets one character bypass any filter.
    const res = await api().get("/api/purchases?search=%25").set(asAdmin());

    expect(res.status).toBe(200);
    expect(res.body.purchases.length).toBeGreaterThan(0);
  });

  it("caps an over-long search rather than passing it through", async () => {
    const res = await api()
      .get(`/api/purchases?search=${"a".repeat(5000)}`)
      .set(asAdmin());

    expect(res.status).toBe(200);
    expect(res.body.filters.search.length).toBeLessThanOrEqual(80);
  });
});

describe("request bodies", () => {
  it("rejects malformed JSON with a 400, in the API's own shape", async () => {
    const res = await api()
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email": "a@b.com", ');

    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/json/);
  });

  it("does not fall over on an empty or oddly typed body", async () => {
    // A bare number is sent as a raw string with a JSON content type, because
    // superagent refuses to serialise one itself.
    const bodies = [{}, [], null, "string"];

    for (const body of bodies) {
      const res = await api().post("/api/settlements").set(asEmployee()).send(body);
      expect(res.status, JSON.stringify(body)).toBeLessThan(500);
    }

    const numeric = await api()
      .post("/api/settlements")
      .set(asEmployee())
      .set("Content-Type", "application/json")
      .send("42");

    expect(numeric.status).toBeLessThan(500);
  });

  it("ignores extra fields rather than writing them", async () => {
    const res = await api()
      .post("/api/purchases")
      .set(asEmployee())
      .send({
        userId: cast.userA.id,
        amountPaid: 100,
        payment_status: "success",
        settlement_id: 999,
        id: 4242,
      });

    expect(res.status).toBe(201);
    expect(res.body.purchase.paymentStatus).toBe("pending");
    expect(res.body.purchase.settlementId).toBeNull();
    expect(res.body.purchase.id).not.toBe(4242);
  });
});

describe("the 404 handler and health check", () => {
  it("answers an unknown path with JSON, not an HTML page", async () => {
    const res = await api().get("/api/nope");

    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body.message).toMatch(/route not found/i);
  });

  it("answers the health check without touching the database", async () => {
    const res = await api().get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("responses never carry secrets", () => {
  it("keeps hashes and OTP columns out of every list endpoint", async () => {
    const paths = [
      ["/api/employees", asAdmin],
      ["/api/admins", asAdmin],
      ["/api/users", asAdmin],
      ["/api/reports/employees", asAdmin],
      ["/api/employee/users", asEmployee],
      ["/api/profile", asAdmin],
    ];

    for (const [path, auth] of paths) {
      const res = await api().get(path).set(auth());
      const body = JSON.stringify(res.body);

      expect(body, path).not.toMatch(/\$2[aby]\$\d\d\$/); // a bcrypt hash
      expect(body, path).not.toMatch(/"reset_otp"/);
      expect(body, path).not.toMatch(/"password"/);
    }
  });

  it("masks Aadhaar everywhere it is listed", async () => {
    const res = await api().get("/api/reports/employees").set(asAdmin());

    for (const employee of res.body.employees) {
      expect(employee.aadhaarNumber).toMatch(/^XXXX XXXX \d{4}$/);
    }
  });
});

describe("security headers", () => {
  // FIXED (was BUG-17). helmet was not installed, so none of these were sent.
  it("sets the headers a panel handling ID documents should", async () => {
    const res = await api().get("/api/health");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["referrer-policy"]).toBeDefined();
  });

  it("no longer advertises the framework", async () => {
    const res = await api().get("/api/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("FIXED (was BUG-01): uploaded documents require authentication", () => {
  it("refuses an anonymous request for any file", async () => {
    // These paths are guessable - they are built from the person's own name -
    // and the whole tree used to be public, so a millisecond timestamp was the
    // only thing standing between a visitor and a scan of an Aadhaar card.
    const res = await api().get("/uploads/employees/ramesh-sharma/aadhaar-front-1.jpg");

    expect(res.status).toBe(401);
  });

  it("refuses a request whose token is not valid", async () => {
    const res = await api()
      .get("/uploads/employees/ramesh-sharma/aadhaar-front-1.jpg")
      .set({ Authorization: "Bearer not-a-real-token" });

    expect(res.status).toBe(401);
  });

  it("accepts the token on the query string, since an <img> cannot set a header", async () => {
    // A valid token gets past authentication and on to the ownership check,
    // which answers 404 for a file no row refers to.
    const res = await api().get(
      `/uploads/employees/ramesh-sharma/aadhaar-front-1.jpg?token=${cast.admin.token}`
    );

    expect(res.status).toBe(404);
  });

  it("does not let a path escape the uploads directory", async () => {
    for (const attempt of [
      "/uploads/../.env",
      "/uploads/..%2f.env",
      "/uploads/employees/../../.env",
    ]) {
      const res = await api().get(`${attempt}?token=${cast.admin.token}`);
      expect(res.status, attempt).not.toBe(200);
    }
  });
});
