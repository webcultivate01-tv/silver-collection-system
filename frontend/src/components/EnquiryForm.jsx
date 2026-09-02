// The enquiry form at the bottom of the public landing page.
//
// The only form in the application a visitor can use without an account. It
// posts to /api/enquiries, which emails the shop; nothing is stored, and there
// is nowhere in the panels to read enquiries back - the shop's inbox is the
// record.
//
// It talks to the API directly rather than through a Redux slice: no other
// screen needs this state, and it is gone the moment the visitor navigates
// away.

import { useState } from "react";
import api, { apiErrorMessage } from "../api/axios.js";
import { IconCheck, IconMail } from "./Icons.jsx";

const EMPTY = { name: "", email: "", phone: "", message: "" };

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
    <section
      id="enquiry"
      className="scroll-mt-20 border-t border-silver-200 bg-white py-20 sm:py-24"
    >
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16">
        <div className="max-w-xl">
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">
            Enquiry
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-silver-900 sm:text-4xl">
            Send us a message.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-silver-600">
            Tell us what you would like to know - how the daily saving works, what opening an
            account needs, or what your silver is worth today. Write to us here and we will reply
            to your email.
          </p>

          <div className="mt-8 flex items-start gap-3 rounded-lg bg-silver-50 p-4">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <IconMail className="h-4 w-4" />
            </span>
            <p className="text-sm leading-relaxed text-silver-600">
              We do not ask for any document or account detail here. Opening an account is always
              done in person.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 sm:p-8">
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
                  Phone <span className="font-normal text-silver-400">(optional)</span>
                </label>
                <input
                  id="enquiry-phone"
                  type="tel"
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
        </form>
      </div>
    </section>
  );
}
