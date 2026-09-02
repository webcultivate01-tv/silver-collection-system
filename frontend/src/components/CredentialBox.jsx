// Shows a temporary password exactly once, with a copy button.
// The plain text never comes back from the API again, so the warning matters.

import { useState } from "react";
import { IconCheck, IconCopy } from "./Icons.jsx";

export default function CredentialBox({
  email,
  password,
  title = "Temporary password",
  // Who the credentials are for - an employee, or a user an employee added.
  audience = "employee",
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 animate-fade-in">
      <div className="text-sm font-semibold text-amber-900">{title}</div>
      <p className="mt-1 text-xs text-amber-700">
        Share these with the {audience} now — the password won't be shown again.
      </p>

      <dl className="mt-4 space-y-2">
        {email && (
          <div className="flex items-center gap-3">
            <dt className="w-20 shrink-0 text-xs text-amber-700">Email</dt>
            <dd className="text-sm font-medium text-amber-900 break-all">{email}</dd>
          </div>
        )}
        <div className="flex items-center gap-3">
          <dt className="w-20 shrink-0 text-xs text-amber-700">Password</dt>
          <dd className="flex items-center gap-2">
            <code className="rounded-md bg-white px-2.5 py-1 text-sm font-semibold tracking-wider text-amber-900 border border-amber-200">
              {password}
            </code>
            <button onClick={handleCopy} className="btn-secondary btn-sm" type="button">
              {copied ? <IconCheck className="w-3.5 h-3.5" /> : <IconCopy className="w-3.5 h-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </dd>
        </div>
      </dl>
    </div>
  );
}
