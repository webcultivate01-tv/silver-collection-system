// The landing page's enquiry form, and the panel screen that works through
// what it collects.
//
// Two halves that meet at one table:
//
//   POST /api/enquiries        the only endpoint in the application with no
//                              session behind it - a visitor who has never had
//                              an account fills the form in
//   GET/PATCH/DELETE           the admin and sub-admin panels reading those
//                              enquiries back and moving each one from 'new'
//                              to 'closed'
//
// An enquiry used to be an email and nothing more. That is fine until the mail
// is missed, filed or deleted - and then somebody who asked to be called back
// is simply gone, with nothing anywhere to say they wrote in, and no way to
// tell an enquiry that has been answered from one nobody has opened. So it is
// stored first and mailed second: the mail is what makes someone go and look,
// the row is the record.
//
// Because the public half is unauthenticated and sends mail, it is the easiest
// thing here to abuse. Four things keep that in check: the strict rate limiter
// it is mounted behind (see routes/enquiryRoutes.js), the length caps below,
// the fact that the visitor's address only ever becomes a Reply-To header and
// never a From, and that nothing the visitor types is ever rendered as
// anything but text.

const EnquiryModel = require("../models/enquiryModel");
const { AdminModel } = require("../models/accounts");
const { sendEnquiryEmail } = require("../utils/sendEmail");
const { parseDate, parseEnum, parseSearch } = require("../utils/requestParams");

const LIMITS = { name: 100, email: 254, phone: 20, message: 2000, note: 2000 };

// Who the notification goes to.
//
// The admin accounts, read from the database rather than from a setting: the
// person who runs the shop is whoever is signed in at /admin, and when that
// changes - a new admin added, an old one deactivated - the enquiries follow
// without anyone remembering to edit .env and restart the server. Every ACTIVE
// admin gets it, so an enquiry is never addressed to an account that can no
// longer sign in to act on it.
//
// Sub-admins are deliberately left out of the MAIL. They can see and work
// every enquiry on the panel - that is what the Enquiries screen is for - but
// a new customer arriving is the main admin's to be told about.
//
// ENQUIRY_EMAIL overrides all of it (comma-separated for more than one), for
// the shop that would rather enquiries went to a shared inbox than to the
// admin's own address.
async function enquiryRecipients() {
  const override = process.env.ENQUIRY_EMAIL;

  if (override) {
    return override.split(",").map((address) => address.trim()).filter(Boolean);
  }

  // Deliberately swallowed rather than thrown: sending mail does not otherwise
  // need the database, so a database that is down should cost us the addressee
  // - the sending mailbox picks it up in sendEnquiryEmail - not the enquiry.
  try {
    const admins = await AdminModel.findAll({ status: "active" });
    return admins.map((admin) => admin.email).filter(Boolean);
  } catch (error) {
    console.error("enquiryRecipients: could not read the admin list:", error);
    return [];
  }
}

// Deliberately loose - "looks like an address" is all we need, and a stricter
// pattern only turns away real people with unusual addresses. If it is wrong
// the reply bounces, which the shop finds out about either way.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A header injection guard as much as a tidy-up: a newline in the name would
// end up in the Subject line, and a newline in a header is how an extra Bcc
// gets smuggled into a message. Only `message` is allowed to keep its line
// breaks, and it is only ever part of the body.
function field(value) {
  return typeof value === "string" ? value.replace(/[\r\n]+/g, " ").trim() : "";
}

// What the panels see. `message` and `adminNote` are the only free text here,
// and both reach the browser as JSON that React renders as text.
function toEnquiry(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    message: row.message,
    status: row.status,
    adminNote: row.admin_note || "",
    handledBy: row.handled_by,
    handledByRole: row.handled_by ? row.handled_by_role : null,
    handledByName: row.handled_by_name || null,
    handledAt: row.handled_at,
    // False on an enquiry whose notification mail failed - this row is then
    // the only place it exists, so the screen says so.
    emailed: Boolean(row.emailed),
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// The public form
// ---------------------------------------------------------------------------

// Neither of these may take the request down with it: an enquiry that reached
// the database but not the inbox is still an enquiry, and so is one that
// reached the inbox but not the database. Only losing both is a failure.
async function storeEnquiry(fields) {
  try {
    return await EnquiryModel.create(fields);
  } catch (error) {
    console.error("submitEnquiry: could not store the enquiry:", error);
    return null;
  }
}

// False means nothing reached anybody's inbox - which covers an SMTP failure
// AND the unconfigured case, where sendEnquiryEmail logs the message instead
// of sending it (a developer's machine, and the test suite). Both leave the
// stored row as the only copy, which is what `emailed` is there to say.
async function mailEnquiry(fields) {
  try {
    return await sendEnquiryEmail({ to: await enquiryRecipients(), ...fields });
  } catch (error) {
    console.error("submitEnquiry: could not email the enquiry:", error);
    return false;
  }
}

// @route  POST /api/enquiries  (public)
async function submitEnquiry(req, res) {
  try {
    const name = field(req.body.name);
    const email = field(req.body.email);
    const phone = field(req.body.phone);
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";

    if (!name || !email || !phone || !message) {
      return res.status(400).json({ message: "Name, email, phone and message are required" });
    }

    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    if (
      name.length > LIMITS.name ||
      email.length > LIMITS.email ||
      phone.length > LIMITS.phone ||
      message.length > LIMITS.message
    ) {
      return res.status(400).json({ message: "That is longer than we can accept" });
    }

    const fields = { name, email, phone, message };

    // Stored first, so that the panel has it even if no mail ever goes out.
    const enquiryId = await storeEnquiry(fields);
    const emailed = await mailEnquiry(fields);

    // Both failed - the enquiry has gone nowhere at all. The visitor cannot do
    // anything about that, and telling them it went through when it did not is
    // worse than asking them to call. The reason stays in the server log.
    if (!enquiryId && !emailed) {
      return res.status(500).json({
        message: "We could not send your enquiry just now. Please try again or call us.",
      });
    }

    if (enquiryId && emailed) {
      // Bookkeeping, not the enquiry: a failure here must not turn a message
      // that was both stored and delivered into an error for the visitor.
      await EnquiryModel.markEmailed(enquiryId).catch((error) =>
        console.error("submitEnquiry: could not mark the enquiry as emailed:", error)
      );
    }

    // Nothing about the stored row is echoed back. A visitor has no session,
    // so an id would only be something to guess with.
    res.status(201).json({
      message: "Thank you. Your enquiry has been sent - we will get back to you shortly.",
    });
  } catch (error) {
    console.error("submitEnquiry failed:", error);
    res.status(500).json({
      message: "We could not send your enquiry just now. Please try again or call us.",
    });
  }
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

// @route GET /api/enquiries?status=&search=&from=&to=  (admin + sub-admin)
// The counts come back with every list because they belong to the whole table,
// not to the filter currently applied - the tabs have to keep saying how many
// are waiting while you are looking at the closed ones.
async function listEnquiries(req, res) {
  try {
    const status = parseEnum(req.query.status, EnquiryModel.STATUSES);
    const search = parseSearch(req.query.search);
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);

    const [enquiries, counts] = await Promise.all([
      EnquiryModel.listAll({ status, search, from, to }),
      EnquiryModel.counts(),
    ]);

    res.json({ enquiries: enquiries.map(toEnquiry), counts });
  } catch (error) {
    console.error("listEnquiries failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/enquiries/:id  (admin + sub-admin)
async function getEnquiry(req, res) {
  try {
    const id = Number(req.params.id);
    const enquiry = Number.isInteger(id) ? await EnquiryModel.findById(id) : null;

    if (!enquiry) {
      return res.status(404).json({ message: "Enquiry not found" });
    }

    res.json({ enquiry: toEnquiry(enquiry) });
  } catch (error) {
    console.error("getEnquiry failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route PATCH /api/enquiries/:id  (admin + sub-admin)
// Moving one along: 'new' -> 'in_progress' -> 'closed', and the note that says
// what was done about it. Whoever moved it is stamped on the row, so the two
// panel accounts can see which of them has picked something up rather than
// both ringing the same person.
async function updateEnquiry(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid enquiry" });
    }

    const { status } = req.body;

    if (!EnquiryModel.STATUSES.includes(status)) {
      return res.status(400).json({ message: "Pick one of: new, in progress, closed" });
    }

    // Left out entirely, the stored note is kept; sent empty, it is cleared.
    // Those are different intentions, and the model tells them apart by
    // whether `note` is undefined - so it must stay undefined here.
    let note;

    if (req.body.note !== undefined) {
      note = field(req.body.note === null ? "" : String(req.body.note)).slice(0, LIMITS.note);
    }

    const updated = await EnquiryModel.update(id, {
      status,
      note,
      handledBy: { id: req.user.id, role: req.user.role },
    });

    if (!updated) {
      return res.status(404).json({ message: "Enquiry not found" });
    }

    const enquiry = await EnquiryModel.findById(id);

    res.json({ message: "Enquiry updated", enquiry: toEnquiry(enquiry) });
  } catch (error) {
    console.error("updateEnquiry failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route DELETE /api/enquiries/:id  (main admin only)
// For spam, and for a duplicate somebody sent twice. Deliberately the one
// thing on this screen a sub-admin cannot do: closing an enquiry is working
// it, deleting one is destroying the record that it ever arrived.
async function deleteEnquiry(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid enquiry" });
    }

    const removed = await EnquiryModel.remove(id);

    if (!removed) {
      return res.status(404).json({ message: "Enquiry not found" });
    }

    res.json({ message: "Enquiry deleted" });
  } catch (error) {
    console.error("deleteEnquiry failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

module.exports = { submitEnquiry, listEnquiries, getEnquiry, updateEnquiry, deleteEnquiry };
