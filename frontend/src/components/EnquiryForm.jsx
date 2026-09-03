// Contact: how to reach the shop, and the form for doing it in writing.
//
// This is one section rather than two. The branch details used to sit in their
// own band above, as a row of four cards, with the form's own introduction
// repeating most of what they said a screen later. Someone who wanted the
// phone number and someone who wanted to type a message were being sent to
// different places to do the same thing. Now the details are the left column
// and the form is the right one, so the section answers "how do I reach you"
// once, whichever way the visitor prefers.
//
// The form is the only one in the application a visitor can use without an
// account. It posts to /api/enquiries, which stores the message and emails the
// shop. Both, deliberately: the email is what makes somebody go and look, and
// the stored row is the record, read back on the panel's Enquiries screen
// (pages/Enquiries.jsx) and worked from New to Closed there. A missed or
// deleted email is no longer a customer nobody ever hears from again.
//
// It talks to the API directly rather than through a Redux slice: no other
// screen needs this state, and it is gone the moment the visitor navigates
// away.

import { useState } from "react";
import api, { apiErrorMessage } from "../api/axios.js";
import { CONTACT, PHONE_HREF } from "../utils/brand.js";
import { IconCheck, IconClock, IconMail, IconPhone, IconPin } from "./Icons.jsx";
import Reveal from "./Reveal.jsx";

const EMPTY = { name: "", email: "", phone: "", message: "" };

// Rows of the details panel, in the order someone reaching for the shop wants
// them: the two ways to make contact first, then where it is and when it is
// open. `href` is what separates a row you can act on from one you can only
// read - it drives both the link and the accent on the icon.
const CONTACT_ROWS = [
  { Icon: IconPhone, label: "Phone", href: PHONE_HREF, lines: [CONTACT.phone] },
  { Icon: IconMail, label: "Email", href: `mailto:${CONTACT.email}`, lines: [CONTACT.email] },
  { Icon: IconPin, label: "Branch", href: null, lines: CONTACT.address },
  { Icon: IconClock, label: "Open", href: null, lines: [CONTACT.hours] },
];

export default function EnquiryForm() {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState({ sending: false, sent: "", error: "" });

  function update(field) {
    return (e) => setForm((current) => ({ ...current, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus({ sending: true, sent: "", error: "" });

    try {
      const { data } = await api.post("/enquiries", form);

      setForm(EMPTY);
      setStatus({ sending: false, sent: data.message, error: "" });
    } catch (error) {
      setStatus({
        sending: false,
        sent: "",
        error: apiErrorMessage(error, "Could not send your enquiry. Please try again."),
      });
    }
  }

  return (
    // Grey band. The section above it and the footer below are both flat, so
    // this is what tells the eye the page has reached its last stop, and it is
    // what the white details panel and the white form are read against.
    <section
      id="contact"
      className="scroll-mt-20 overflow-x-hidden border-t border-silver-200 bg-silver-50 py-20 sm:py-24"
    >
      <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
        <Reveal direction="left">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-brand-600">
            <span aria-hidden="true" className="h-px w-6 bg-brand-300" />
            Contact
          </span>
          <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-silver-900 sm:text-[2.6rem]">
            Talk to us before you start.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-silver-600">
            Opening an account is done in person, so that your identity documents are verified once
            and never asked for again. Call or write, and we will arrange for an employee to visit
            you.
          </p>

          {/* One panel of stacked rows rather than four separate cards. In a
              half-width column four cards would either sit two-by-two, which
              breaks the reading order, or run in a single file of boxes with
              a gap between each - and the four things are one address book
              entry, not four unrelated facts. Hairlines say that better. */}
          <dl className="mt-8 overflow-hidden rounded-2xl border border-silver-200 bg-white shadow-card">
            {CONTACT_ROWS.map(({ Icon, label, href, lines }) => {
              const body = (
                <>
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${
                      href
                        ? "bg-brand-50 text-brand-600 ring-brand-100"
                        : "bg-silver-50 text-silver-500 ring-silver-200"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-silver-500">
                      {label}
                    </dt>
                    <dd className="mt-1 break-words text-sm font-medium leading-relaxed text-silver-900">
                      {lines.map((line) => (
                        <span key={line} className="block">
                          {line}
                        </span>
                      ))}
                    </dd>
                  </div>
                </>
              );

              // The <div> wrapper is what keeps each icon with its own dt/dd;
              // HTML allows it inside a <dl> precisely for grouping like this.
              const row = "flex items-start gap-4 border-b border-silver-200 p-5 last:border-b-0";

              return href ? (
                <a key={label} href={href} className={`${row} transition-colors hover:bg-silver-50`}>
                  {body}
                </a>
              ) : (
                <div key={label} className={row}>
                  {body}
                </div>
              );
            })}
          </dl>
        </Reveal>

        {/* The form keeps the #enquiry id the footer's "Send an enquiry" link
            points at, so that link lands on the form itself rather than at the
            top of a section whose first screenful is the address. */}
        <Reveal
          as="form"
          delay={150}
          direction="right"
          id="enquiry"
          onSubmit={handleSubmit}
          className="card scroll-mt-24 p-6 sm:p-8 lg:self-start"
        >
          <h3 className="text-xl font-bold tracking-tight text-silver-900">Send us a message.</h3>
          <p className="mt-2 text-sm leading-relaxed text-silver-600">
            Tell us what you would like to know - how the daily saving works, what opening an
            account needs, or what your silver is worth today. We will reply to your email.
          </p>

          <div className="mb-6 mt-5 flex items-start gap-3 rounded-lg bg-silver-50 p-4">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <IconMail className="h-4 w-4" />
            </span>
            <p className="text-sm leading-relaxed text-silver-600">
              We do not ask for any document or account detail here. Opening an account is always
              done in person.
            </p>
          </div>

          {status.sent && (
            <div className="alert-success mb-5 flex items-start gap-2">
              <IconCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{status.sent}</span>
            </div>
          )}

          {status.error && <div className="alert-error mb-5">{status.error}</div>}

          <div className="space-y-5">
            <div>
              <label htmlFor="enquiry-name" className="label">
                Name
              </label>
              <input
                id="enquiry-name"
                type="text"
                required
                maxLength={100}
                value={form.name}
                onChange={update("name")}
                className="input"
                placeholder="Your full name"
                autoComplete="name"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="enquiry-email" className="label">
                  Email
                </label>
                <input
                  id="enquiry-email"
                  type="email"
                  required
                  maxLength={254}
                  value={form.email}
                  onChange={update("email")}
                  className="input"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <label htmlFor="enquiry-phone" className="label">
                  Phone
                </label>
                <input
                  id="enquiry-phone"
                  type="tel"
                  required
                  maxLength={20}
                  value={form.phone}
                  onChange={update("phone")}
                  className="input"
                  placeholder="+91 98765 43210"
                  autoComplete="tel"
                />
              </div>
            </div>

            <div>
              <label htmlFor="enquiry-message" className="label">
                Message
              </label>
              <textarea
                id="enquiry-message"
                required
                rows={5}
                maxLength={2000}
                value={form.message}
                onChange={update("message")}
                className="input resize-y"
                placeholder="What would you like to know?"
              />
            </div>

            <button type="submit" disabled={status.sending} className="btn-primary w-full">
              {status.sending ? "Sending..." : "Send enquiry"}
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
