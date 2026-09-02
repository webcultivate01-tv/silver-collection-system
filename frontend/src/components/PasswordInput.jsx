// A password box with an eye button that previews what was typed.
// Used everywhere the app asks for a password so the behaviour is identical
// on the login, reset, change-password and register screens.

import { useState } from "react";
import { IconEye, IconEyeOff } from "./Icons.jsx";

export default function PasswordInput({ className = "", ...inputProps }) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Hide password" : "Show password";

  return (
    <div className="relative">
      <input
        {...inputProps}
        type={visible ? "text" : "password"}
        className={`input pr-11 ${className}`}
      />

      <button
        type="button"
        onClick={() => setVisible((prev) => !prev)}
        // Skipped by Tab so the eye never sits between the field and the
        // submit button.
        tabIndex={-1}
        aria-label={label}
        title={label}
        className="absolute right-0 top-0 grid h-full w-11 place-items-center text-silver-400 hover:text-silver-700"
      >
        {visible ? <IconEyeOff className="h-5 w-5" /> : <IconEye className="h-5 w-5" />}
      </button>
    </div>
  );
}
