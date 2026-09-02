// Every sign-in screen in the app (admin, employee, user) uses this: a single
// login box centred on the page. Same shape everywhere, so whichever door you
// come in through there is nothing to work out.

import { Link } from "react-router-dom";

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-silver-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="card p-7 sm:p-8">
          <div className="text-center">
            <h1 className="text-xl font-bold text-silver-900">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-silver-500">{subtitle}</p>}
          </div>

          <div className="mt-7">{children}</div>

          {footer && (
            <div className="mt-7 border-t border-silver-200 pt-5 text-center">{footer}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AuthSwitchLink({ to, label, action }) {
  return (
    <p className="text-sm text-silver-500">
      {label}{" "}
      <Link to={to} className="font-medium text-brand-600 hover:underline">
        {action}
      </Link>
    </p>
  );
}
