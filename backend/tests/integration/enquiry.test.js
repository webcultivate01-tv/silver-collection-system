// The landing page's enquiry form.
//
// The only public write in the application: no token, no account, and it sends
// mail. That combination is what the suite is really about - the endpoint has
// to accept a genuine visitor while giving a script as little as possible.
//
// With SMTP unconfigured (which is how .env.test leaves it) the controller
// logs what it would have sent instead of sending it, so these tests read the
// outgoing message off that line. Testing through the real delivery path means
// a change that quietly stopped mailing anyone would fail here rather than
// pass.

import { describe, it, expect, beforeEach, afterAll } from "vitest";

import { api, makeAdmin, makeSubAdmin } from "../helpers/fixtures.js";
import { resetDatabase, closePool } from "../helpers/db.js";
import { AdminModel } from "../../models/accounts.js";

afterAll(closePool);

// The suites above touch no table, so they get no resetDatabase(); the last
// one, which is about who the mail is addressed to, does.

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

  it("does not echo the enquiry back, so nothing is stored to read later", async () => {
    const res = await submit(VALID);

    expect(res.body.enquiry).toBeUndefined();
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
