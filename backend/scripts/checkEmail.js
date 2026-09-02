// Run with: npm run check:email               - check the SMTP login only
//           npm run check:email you@mail.com  - and send a test message there
//
// Answers "why is no mail going out?" without booting the app, filling in the
// forgot-password form, or reading a stack trace. Every failure here is a
// configuration mistake rather than a fault, so it says what to change rather
// than what went wrong.

require("dotenv").config();
const nodemailer = require("nodemailer");

function config() {
  return {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || "",
    // The same stripping the application does, so this checks what it will
    // really send rather than what is literally in the file.
    password: (process.env.SMTP_PASSWORD || "").replace(/\s/g, ""),
  };
}

function report(smtp) {
  console.log(`  Host      ${smtp.host}:${smtp.port}`);
  console.log(`  Mailbox   ${smtp.user || "(not set)"}`);
  console.log(`  Password  ${smtp.password.length} characters`);
  console.log(`  Enquiries ${process.env.ENQUIRY_EMAIL || "(to the active admin accounts)"}`);
  console.log("");
}

async function main() {
  const smtp = config();
  const recipient = process.argv[2];

  console.log("\nSMTP configuration in .env:\n");
  report(smtp);

  if (!smtp.user || !smtp.password) {
    console.log("SMTP is not configured, so the application will print OTPs to the console");
    console.log("instead of emailing them. Set SMTP_USER and SMTP_PASSWORD in .env to send.\n");
    return;
  }

  // Gmail app passwords are always 16 characters, shown in four groups of
  // four. Short by one is the usual mistake and the hardest to spot by eye,
  // so it is worth saying before the login is even attempted.
  if (smtp.host.includes("gmail") && smtp.password.length !== 16) {
    console.log(`WARNING: a Gmail App Password is 16 characters; this one is ${smtp.password.length}.`);
    console.log("         Trying it anyway.\n");
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.password },
  });

  try {
    await transporter.verify();
    console.log("Login accepted.\n");
  } catch (error) {
    console.log(`Login REJECTED: ${String(error.message).split("\n")[0]}\n`);

    if (error.code === "EAUTH") {
      console.log("SMTP_PASSWORD must be an App Password, not the Google account password:");
      console.log("  1. Google Account -> Security -> turn on 2-Step Verification");
      console.log("  2. Security -> App passwords -> create one for \"Mail\"");
      console.log("  3. Paste all 16 characters into SMTP_PASSWORD in backend/.env");
      console.log("     (the spaces Google shows it with are fine, they are stripped)");
      console.log("  4. Restart the backend, then run this again\n");
    }

    process.exitCode = 1;
    return;
  }

  if (!recipient) {
    console.log("Pass an address to send a test message: npm run check:email you@example.com\n");
    return;
  }

  await transporter.sendMail({
    from: process.env.MAIL_FROM_NAME
      ? `"${process.env.MAIL_FROM_NAME}" <${smtp.user}>`
      : smtp.user,
    to: recipient,
    subject: "Test message from the Shiv Shakti Silver backend",
    text: "If you are reading this, the SMTP settings in backend/.env are working.",
  });

  console.log(`Test message sent to ${recipient}. Check the inbox (and the spam folder).\n`);
}

main()
  .catch((error) => {
    console.error("\nCheck failed:", error.message, "\n");
    process.exitCode = 1;
  })
  .finally(() => process.exit());
