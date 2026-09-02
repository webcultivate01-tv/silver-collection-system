// Outgoing mail, over SMTP, for the two things this application sends:
// the password-reset OTP, and the enquiry a visitor leaves on the landing page.
//
// If no SMTP credentials are set in .env, nothing is sent and the message is
// logged to the console instead - handy for local development, and what the
// test suite reads the OTP back out of.

const nodemailer = require("nodemailer");

// One transporter for the whole process rather than one per message: each
// createTransport() opens its own connection pool to Gmail, and building a
// fresh one on every send is what makes the first OTP after a restart slow.
// Built lazily so that requiring this file never touches the network, and
// reset whenever the credentials change (which only happens in tests).
let transporter = null;
let transporterKey = "";

function smtpConfig() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;

  return {
    host: SMTP_HOST || "smtp.gmail.com",
    port: Number(SMTP_PORT) || 587,
    user: SMTP_USER,
    // Gmail shows an app password in four groups of four ("abcd efgh ijkl
    // mnop"). Pasted into .env with those spaces it authenticates as the wrong
    // string and Gmail answers 535, so they come out here rather than relying
    // on whoever fills the file in to know that.
    password: (SMTP_PASSWORD || "").replace(/\s/g, ""),
  };
}

function getTransporter(config) {
  const key = `${config.host}:${config.port}:${config.user}`;

  if (!transporter || transporterKey !== key) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.password },
    });
    transporterKey = key;
  }

  return transporter;
}

// The name the message shows up as in the recipient's inbox. The address has
// to stay the authenticated mailbox - Gmail rewrites a "from" it does not own,
// so anything else would be silently replaced anyway.
function fromHeader(config) {
  const name = process.env.MAIL_FROM_NAME;
  return name ? `"${name}" <${config.user}>` : config.user;
}

// Every send goes through here. `devLog` is what gets printed instead when
// SMTP is unconfigured, so a developer still sees what would have gone out.
async function send({ to, subject, text, replyTo, devLog }) {
  const config = smtpConfig();

  if (!config.user || !config.password) {
    console.log(devLog);
    return false;
  }

  try {
    await getTransporter(config).sendMail({
      from: fromHeader(config),
      to,
      subject,
      text,
      ...(replyTo ? { replyTo } : {}),
    });
  } catch (error) {
    // Gmail's 535 is the one failure here that is always a configuration
    // mistake rather than a fault, and its message ("Username and Password not
    // accepted") sends people to check the account password - which is never
    // what belongs in SMTP_PASSWORD. Say what it actually wants, and point at
    // the length, because a mistyped app password is usually short by a
    // character or two and nothing else makes that visible.
    if (error.code === "EAUTH") {
      console.error(
        `Gmail rejected the SMTP login for ${config.user}. SMTP_PASSWORD must be a 16-character ` +
          `App Password (Google Account -> Security -> 2-Step Verification -> App passwords), ` +
          `not the account password. The one in .env is ${config.password.length} characters.`
      );
    }
    throw error;
  }

  return true;
}

async function sendOtpEmail(toEmail, otp) {
  return send({
    to: toEmail,
    subject: "Your password reset OTP",
    text: `Your OTP to reset your password is: ${otp}. It is valid for 10 minutes.`,
    devLog: `[DEV MODE] No SMTP configured. OTP for ${toEmail} is: ${otp}`,
  });
}

// The landing page's "Send an enquiry" form.
//
// `to` is worked out by the controller, which is the layer that can ask the
// database who the admins are - see controllers/enquiryController.js. If it
// comes back with nobody, the sending mailbox is the last resort: an enquiry
// nobody receives is worse than one that lands in the shop's own inbox.
//
// replyTo is the visitor, so hitting Reply answers them directly. The "from"
// cannot be the visitor: Gmail will not send as an address it does not own,
// and forging one is what gets a domain marked as spam.
async function sendEnquiryEmail({ to, name, email, phone, message }) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  const envelopeTo = recipients.length ? recipients.join(", ") : smtpConfig().user;

  const body = [
    "A new enquiry was submitted from the website.",
    "",
    `Name:    ${name}`,
    `Email:   ${email}`,
    `Phone:   ${phone || "-"}`,
    "",
    "Message:",
    message,
    "",
    `Received: ${new Date().toLocaleString("en-IN")}`,
  ].join("\n");

  return send({
    to: envelopeTo,
    subject: `New enquiry from ${name}`,
    text: body,
    replyTo: email,
    devLog: `[DEV MODE] No SMTP configured. Enquiry from ${name} <${email}> to [${envelopeTo}]:\n${body}`,
  });
}

module.exports = { sendOtpEmail, sendEnquiryEmail };
