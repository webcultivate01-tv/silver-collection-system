// The landing page's enquiry form, and the panel screen that works through
// what it collects.
//
// The public half is the only public write in the application: no token, no
// account, and it sends mail. That combination is what the first half of the
// suite is really about - the endpoint has to accept a genuine visitor while
// giving a script as little as possible.
//
// With SMTP unconfigured (which is how .env.test leaves it) the controller
// logs what it would have sent instead of sending it, so these tests read the
// outgoing message off that line. Testing through the real delivery path means
// a change that quietly stopped mailing anyone would fail here rather than
// pass.
//
// The second half is the panel: an enquiry is stored now as well as mailed, so
// that a missed email is no longer a lost customer, and both panel roles work
// it from 'new' to 'closed'. Who may do what to one is the part worth pinning
// down - a sub-admin can work an enquiry but not delete it.

import { describe, it, expect, beforeEach, afterAll } from "vitest";

import { api, auth, makeAdmin, makeSubAdmin, buildCast } from "../helpers/fixtures.js";
import { resetDatabase, closePool, query } from "../helpers/db.js";
import { AdminModel } from "../../models/accounts.js";

afterAll(closePool);

// The validation suites below touch no account table, so they get no
// resetDatabase(); the ones about who the mail is addressed to, and about the
// panel screen, do.

const VALID = {
  name: "Ramesh Patil",
  email: "ramesh@example.com",
  phone: "+91 98765 43210",
  message: "I would like to know how the daily saving works.",
};

function submit(body) {
  return api().post("/api/enquiries").send(body);
}

// The message as it would have gone out, read off the dev-mode log line.
async function captureEnquiry(run) {
  const original = console.log;
  let sent = null;

  console.log = (...args) => {
    const line = args.join(" ");
    if (line.includes("Enquiry from")) sent = line;
  };

  try {
    await run();
  } finally {
    console.log = original;
  }

  return sent;
}

describe("sending an enquiry", () => {
  it("accepts one from a visitor with no session at all", async () => {
    const res = await submit(VALID);

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/thank you/i);
  });

  it("puts every field the visitor filled in into the message", async () => {
    let res;
    const sent = await captureEnquiry(async () => {
      res = await submit(VALID);
    });

    expect(res.status).toBe(201);
    expect(sent).toContain(VALID.name);
    expect(sent).toContain(VALID.email);
    expect(sent).toContain(VALID.phone);
    expect(sent).toContain(VALID.message);
  });

  it("does not echo anything back to a visitor who has no session", async () => {
    const res = await submit(VALID);

    expect(res.body.enquiry).toBeUndefined();
    expect(res.body.id).toBeUndefined();
  });

  it("stores it as well as mailing it, so a missed email isn't a lost customer", async () => {
    await resetDatabase();
    await submit(VALID);

    const rows = await query("SELECT * FROM enquiries");

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe(VALID.name);
    expect(rows[0].email).toBe(VALID.email);
    expect(rows[0].phone).toBe(VALID.phone);
    expect(rows[0].message).toBe(VALID.message);
    // Nobody has looked at it yet.
    expect(rows[0].status).toBe("new");
    expect(rows[0].handled_by).toBeNull();
  });

  // `emailed` is what tells the panel "this row is the only copy". With SMTP
  // unconfigured - which is how the suite runs - nothing reaches an inbox, so
  // it must stay 0 rather than optimistically claiming a message was sent.
  it("does not claim a notification went out when nothing was sent", async () => {
    await resetDatabase();
    await makeAdmin({ email: "owner@shop.test" });
    await submit(VALID);

    const rows = await query("SELECT emailed FROM enquiries");

    expect(rows[0].emailed).toBe(0);
  });
});

describe("what the form refuses", () => {
  it("needs a name, an email, a phone number and a message", async () => {
    for (const missing of ["name", "email", "phone", "message"]) {
      const res = await submit({ ...VALID, [missing]: "" });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/required/i);
    }
  });

  it("treats whitespace as missing", async () => {
    const res = await submit({ ...VALID, message: "   \n  " });

    expect(res.status).toBe(400);
  });

  it("refuses an address that could not be replied to", async () => {
    for (const email of ["not-an-email", "missing@domain", "two @spaces.com"]) {
      const res = await submit({ ...VALID, email });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/valid email/i);
    }
  });

  it("caps the message rather than mailing an unbounded body", async () => {
    const res = await submit({ ...VALID, message: "x".repeat(2001) });

    expect(res.status).toBe(400);
  });

  it("caps the name too", async () => {
    const res = await submit({ ...VALID, name: "x".repeat(101) });

    expect(res.status).toBe(400);
  });

  it("ignores a body that isn't strings", async () => {
    const res = await submit({ name: 42, email: { toString: 1 }, message: ["hi"] });

    expect(res.status).toBe(400);
  });
});

describe("header injection", () => {
  // The name ends up in the Subject line. A newline there is how an extra
  // recipient gets smuggled into a message, so it must not survive.
  it("strips line breaks out of the name", async () => {
    let res;
    const sent = await captureEnquiry(async () => {
      res = await submit({ ...VALID, name: "Ramesh\nBcc: victim@example.com" });
    });

    expect(res.status).toBe(201);
    expect(sent).toContain("Ramesh Bcc: victim@example.com");
    expect(sent).not.toMatch(/Ramesh\nBcc:/);
  });

  it("strips them out of the email and phone as well", async () => {
    let res;
    const sent = await captureEnquiry(async () => {
      res = await submit({ ...VALID, phone: "98765\r\nBcc: a@b.co" });
    });

    expect(res.status).toBe(201);
    expect(sent).not.toMatch(/\r/);
  });

  // The visitor's address is only ever a Reply-To. A newline in it would be
  // refused as an invalid address before it could reach a header anyway.
  it("refuses a line break inside the email outright", async () => {
    const res = await submit({ ...VALID, email: "ok@example.com\nBcc: victim@example.com" });

    expect(res.status).toBe(400);
  });
});

// Where an enquiry is actually addressed.
//
// This is the part worth pinning down: the enquiry is useless if it lands
// somewhere nobody reads. The recipient comes from the `admins` table rather
// than from a setting, so that adding or deactivating an admin re-routes
// enquiries without an .env edit and a restart.
describe("who receives it", () => {
  // ENQUIRY_EMAIL overrides everything, so it has to be out of the way for
  // these. .env.test does not set it, but .env might on a developer's machine.
  const savedOverride = process.env.ENQUIRY_EMAIL;

  beforeEach(async () => {
    delete process.env.ENQUIRY_EMAIL;
    await resetDatabase();
  });

  afterAll(() => {
    if (savedOverride === undefined) delete process.env.ENQUIRY_EMAIL;
    else process.env.ENQUIRY_EMAIL = savedOverride;
  });

  it("goes to the admin, not to the mailbox it is sent from", async () => {
    const admin = await makeAdmin({ email: "owner@shop.test" });

    const sent = await captureEnquiry(() => submit(VALID));

    expect(sent).toContain(`to [${admin.email}]`);
  });

  it("goes to every admin when there is more than one", async () => {
    await makeAdmin({ email: "first@shop.test" });
    await makeAdmin({ email: "second@shop.test" });

    const sent = await captureEnquiry(() => submit(VALID));

    expect(sent).toContain("first@shop.test");
    expect(sent).toContain("second@shop.test");
  });

  it("leaves out an admin who can no longer sign in", async () => {
    const active = await makeAdmin({ email: "active@shop.test" });
    const gone = await makeAdmin({ email: "deactivated@shop.test" });
    await AdminModel.setActive(gone.id, false);

    const sent = await captureEnquiry(() => submit(VALID));

    expect(sent).toContain(active.email);
    expect(sent).not.toContain(gone.email);
  });

  it("does not go to a sub-admin, who is read-only staff", async () => {
    await makeAdmin({ email: "owner@shop.test" });
    const subAdmin = await makeSubAdmin({ email: "readonly@shop.test" });

    const sent = await captureEnquiry(() => submit(VALID));

    expect(sent).not.toContain(subAdmin.email);
  });

  it("still sends when ENQUIRY_EMAIL overrides the admin list", async () => {
    await makeAdmin({ email: "owner@shop.test" });
    process.env.ENQUIRY_EMAIL = "shared@shop.test, second@shop.test";

    const sent = await captureEnquiry(() => submit(VALID));

    expect(sent).toContain("shared@shop.test");
    expect(sent).toContain("second@shop.test");
    expect(sent).not.toContain("owner@shop.test");
  });
});

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------
//
// What the stored enquiry is for: a screen both panel roles work from, rather
// than an inbox that may or may not have been read. The interesting line here
// is the one between the two roles - a sub-admin answers enquiries, which is a
// write, and the app's rule is otherwise "a sub-admin reads". So the exception
// is exactly one method on exactly one path, and DELETE is not it.
describe("the panel's enquiry screen", () => {
  let cast;

  beforeEach(async () => {
    await resetDatabase();
    cast = await buildCast({ withRate: false });
    await submit(VALID);
  });

  async function onlyEnquiry(token) {
    const res = await api().get("/api/enquiries").set("Authorization", auth(token));
    return res.body.enquiries[0];
  }

  it("shows the admin what a visitor wrote", async () => {
    const res = await api().get("/api/enquiries").set("Authorization", auth(cast.admin.token));

    expect(res.status).toBe(200);
    expect(res.body.enquiries).toHaveLength(1);
    expect(res.body.enquiries[0]).toMatchObject({
      name: VALID.name,
      email: VALID.email,
      phone: VALID.phone,
      message: VALID.message,
      status: "new",
      handledByName: null,
    });
  });

  it("shows a sub-admin the same list", async () => {
    const res = await api().get("/api/enquiries").set("Authorization", auth(cast.subAdmin.token));

    expect(res.status).toBe(200);
    expect(res.body.enquiries).toHaveLength(1);
  });

  it("is closed to an employee, a customer and a passer-by", async () => {
    for (const token of [cast.employeeA.token, cast.userA.token]) {
      const res = await api().get("/api/enquiries").set("Authorization", auth(token));
      expect(res.status).toBe(403);
    }

    expect((await api().get("/api/enquiries")).status).toBe(401);
  });

  it("counts every status, not just the ones on screen", async () => {
    const enquiry = await onlyEnquiry(cast.admin.token);

    await api()
      .patch(`/api/enquiries/${enquiry.id}`)
      .set("Authorization", auth(cast.admin.token))
      .send({ status: "closed" });

    const res = await api()
      .get("/api/enquiries?status=new")
      .set("Authorization", auth(cast.admin.token));

    expect(res.body.enquiries).toHaveLength(0);
    expect(res.body.counts).toMatchObject({ total: 1, new: 0, closed: 1 });
  });

  it("finds one by name, email, phone or what it says", async () => {
    for (const term of ["Ramesh", "ramesh@example.com", "98765", "daily saving"]) {
      const res = await api()
        .get(`/api/enquiries?search=${encodeURIComponent(term)}`)
        .set("Authorization", auth(cast.admin.token));

      expect(res.body.enquiries, term).toHaveLength(1);
    }
  });

  it("stamps who moved it, and keeps their note", async () => {
    const enquiry = await onlyEnquiry(cast.admin.token);

    const res = await api()
      .patch(`/api/enquiries/${enquiry.id}`)
      .set("Authorization", auth(cast.admin.token))
      .send({ status: "in_progress", note: "Called back, visiting Tuesday." });

    expect(res.status).toBe(200);
    expect(res.body.enquiry).toMatchObject({
      status: "in_progress",
      adminNote: "Called back, visiting Tuesday.",
      handledByRole: "admin",
      handledByName: cast.admin.name,
    });
    expect(res.body.enquiry.handledAt).toBeTruthy();
  });

  // The status buttons on the list send a status and nothing else. If that
  // wiped the note somebody typed on the detail panel, closing an enquiry
  // would erase the record of what was done about it.
  it("keeps an existing note when only the status is sent", async () => {
    const enquiry = await onlyEnquiry(cast.admin.token);
    const as = { Authorization: auth(cast.admin.token) };

    await api().patch(`/api/enquiries/${enquiry.id}`).set(as).send({
      status: "in_progress",
      note: "Called back.",
    });
    const res = await api().patch(`/api/enquiries/${enquiry.id}`).set(as).send({ status: "closed" });

    expect(res.body.enquiry.adminNote).toBe("Called back.");
  });

  it("clears the note when the box is emptied", async () => {
    const enquiry = await onlyEnquiry(cast.admin.token);
    const as = { Authorization: auth(cast.admin.token) };

    await api().patch(`/api/enquiries/${enquiry.id}`).set(as).send({
      status: "in_progress",
      note: "Wrong number.",
    });
    const res = await api().patch(`/api/enquiries/${enquiry.id}`).set(as).send({
      status: "closed",
      note: "",
    });

    expect(res.body.enquiry.adminNote).toBe("");
  });

  it("refuses a status nobody defined", async () => {
    const enquiry = await onlyEnquiry(cast.admin.token);

    const res = await api()
      .patch(`/api/enquiries/${enquiry.id}`)
      .set("Authorization", auth(cast.admin.token))
      .send({ status: "archived" });

    expect(res.status).toBe(400);
  });

  it("answers 404 for an enquiry that isn't there", async () => {
    const res = await api()
      .patch("/api/enquiries/9999")
      .set("Authorization", auth(cast.admin.token))
      .send({ status: "closed" });

    expect(res.status).toBe(404);
  });

  // Ids restart at 1 in every account table, so admin #1 and sub-admin #1 both
  // exist. The row has to say which of the two it was.
  it("records the sub-admin - not an admin with the same id - as who worked it", async () => {
    const enquiry = await onlyEnquiry(cast.subAdmin.token);

    const res = await api()
      .patch(`/api/enquiries/${enquiry.id}`)
      .set("Authorization", auth(cast.subAdmin.token))
      .send({ status: "closed", note: "Answered by phone." });

    expect(res.status).toBe(200);
    expect(res.body.enquiry.handledByRole).toBe("subadmin");
    expect(res.body.enquiry.handledByName).toBe(cast.subAdmin.name);
  });

  it("lets the main admin delete one", async () => {
    const enquiry = await onlyEnquiry(cast.admin.token);

    const res = await api()
      .delete(`/api/enquiries/${enquiry.id}`)
      .set("Authorization", auth(cast.admin.token));

    expect(res.status).toBe(200);
    expect(await query("SELECT id FROM enquiries")).toHaveLength(0);
  });

  it("does not let a sub-admin delete one", async () => {
    const enquiry = await onlyEnquiry(cast.subAdmin.token);

    const res = await api()
      .delete(`/api/enquiries/${enquiry.id}`)
      .set("Authorization", auth(cast.subAdmin.token));

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/sub-admin/i);
    expect(await query("SELECT id FROM enquiries")).toHaveLength(1);
  });

  it("does not let an employee or a customer touch one", async () => {
    const enquiry = await onlyEnquiry(cast.admin.token);

    for (const token of [cast.employeeA.token, cast.userA.token]) {
      const res = await api()
        .patch(`/api/enquiries/${enquiry.id}`)
        .set("Authorization", auth(token))
        .send({ status: "closed" });

      expect(res.status).toBe(403);
    }
  });
});
