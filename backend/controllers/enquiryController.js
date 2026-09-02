// The landing page's enquiry form.
//
// The one endpoint in the application with no session behind it: a visitor who
// has never had an account fills the form in and the admin's inbox gets the
// message. Nothing is written to the database - an enquiry is a conversation
// starter, not a record the panels have any screen for.
//
// Because it is public and it sends mail, it is the easiest thing here to
// abuse. Three things keep that in check: the strict rate limiter it is mounted
// behind (see routes/enquiryRoutes.js), the length caps below, and the fact
// that the visitor's address only ever becomes a Reply-To header, never a From.

const { AdminModel } = require("../models/accounts");
const { sendEnquiryEmail } = require("../utils/sendEmail");

const LIMITS = { name: 100, email: 254, phone: 20, message: 2000 };

// Who an enquiry goes to.
//
// The admin accounts, read from the database rather than from a setting: the
// person who runs the shop is whoever is signed in at /admin, and when that
// changes - a new admin added, an old one deactivated - the enquiries follow
// without anyone remembering to edit .env and restart the server. Every ACTIVE
// admin gets it, so an enquiry is never addressed to an account that can no
// longer sign in to act on it.
//
// Sub-admins are deliberately left out. They are read-only staff; an enquiry
// is a new customer, which is the main admin's to answer.
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

// @route  POST /api/enquiries
async function submitEnquiry(req, res) {
  try {
    const name = field(req.body.name);
    const email = field(req.body.email);
    const phone = field(req.body.phone);
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";

    if (!name || !email || !message) {
      return res.status(400).json({ message: "Name, email and message are required" });
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

    await sendEnquiryEmail({ to: await enquiryRecipients(), name, email, phone, message });

    res.status(201).json({
      message: "Thank you. Your enquiry has been sent - we will get back to you shortly.",
    });
  } catch (error) {
    // The visitor cannot do anything about an SMTP failure, and telling them
    // the enquiry went through when it did not is worse than asking them to
    // call. The reason stays in the server log.
    console.error("submitEnquiry failed:", error);
    res.status(500).json({
      message: "We could not send your enquiry just now. Please try again or call us.",
    });
  }
}

module.exports = { submitEnquiry };
