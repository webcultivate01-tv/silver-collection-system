// The popup behind "Login" in the landing page navbar.
//
// Two doors are offered here - employee and customer - and picking one sends
// the visitor to that role's own login page. The forms are NOT inlined into
// this dialog: /employee and /user stay the real sign-in screens, so a typed
// URL, a bookmark and this popup all land in exactly the same place.
//
// The admin door is deliberately absent. /admin is reached by typing it, and
// nothing on the public site advertises it.

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { IconArrowRight, IconClose, IconIdCard, IconUser } from "./Icons.jsx";

const DOORS = [
  {
    to: "/user",
    label: "Customer",
    description: "Check your silver balance, rates and payment history",
    Icon: IconUser,
    accent: "text-brand-600 bg-brand-50 group-hover:bg-brand-100",
  },
  {
    to: "/employee",
    label: "Employee",
    description: "Record collections, purchases and daily settlements",
    Icon: IconIdCard,
    accent: "text-silver-700 bg-silver-100 group-hover:bg-silver-200",
  },
];

export default function LoginChoiceModal({ open, onClose }) {
  const navigate = useNavigate();
  const dialogRef = useRef(null);

  // Escape closes it, and the first door takes focus, so the dialog can be
  // driven from the keyboard alone.
  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    dialogRef.current?.querySelector("button, a")?.focus();

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-silver-900/50 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-choice-title"
        className="relative w-full max-w-md card shadow-lift animate-fade-in"
      >
        <div className="card-header">
          <div>
            <h3 id="login-choice-title" className="card-title">
              Sign in
            </h3>
            <p className="mt-0.5 text-xs text-silver-500">Choose how you use the service</p>
          </div>
          <button
            onClick={onClose}
            className="text-silver-400 transition-colors hover:text-silver-600"
            aria-label="Close"
          >
            <IconClose />
          </button>
        </div>

        <div className="space-y-3 p-6">
          {DOORS.map(({ to, label, description, Icon, accent }) => (
            <button
              key={to}
              type="button"
              onClick={() => navigate(to)}
              className="group flex w-full items-center gap-4 rounded-xl border border-silver-200 bg-white p-4 text-left
                         transition-all hover:border-brand-300 hover:shadow-card
                         focus:outline-none focus:ring-4 focus:ring-brand-500/10"
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors ${accent}`}
              >
                <Icon className="h-5 w-5" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-silver-900">{label}</span>
                <span className="block text-xs text-silver-500">{description}</span>
              </span>

              <IconArrowRight className="h-4 w-4 shrink-0 text-silver-300 transition-colors group-hover:text-brand-500" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
