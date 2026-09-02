// An employee registers a user: the same details the admin fills in for an
// employee, plus the password the user will sign in at /user with.
//
// The user is saved against this employee, so they show up in this employee's
// list and nobody else's.
//
// The form is long - nine fields and four images, of which only the profile
// photo may be left out - so the page carries a checklist that ticks itself off
// as things are filled in, and a failed submit names what is missing and jumps
// to the first one instead of leaving the employee to hunt for a red outline.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import EmployeeForm, {
  emptyUser,
  fieldAnchorId,
  FIELD_LABELS,
  validate,
} from "./admin/EmployeeForm.jsx";
import CredentialBox from "../components/CredentialBox.jsx";
import PasswordInput from "../components/PasswordInput.jsx";
import { clearUserErrors, createUser } from "../store/employeeUsersSlice.js";
import {
  IconArrowLeft,
  IconCheck,
  IconCopy,
  IconIdCard,
  IconKey,
  IconUser,
  IconUsers,
} from "../components/Icons.jsx";

const MIN_PASSWORD_LENGTH = 6;

// The checklist, and - flattened - the order a failed submit walks the fields
// in. It matches the order they appear in the form.
const GROUPS = [
  {
    key: "personal",
    label: "Personal details",
    fields: ["firstName", "lastName", "dateOfBirth", "age", "aadhaarNumber", "panNumber"],
  },
  {
    key: "contact",
    label: "Contact details",
    fields: ["mobile", "email", "address"],
  },
  {
    key: "documents",
    label: "Photo & documents",
    fields: ["profilePhoto", "aadhaarFront", "aadhaarBack", "panFront"],
  },
  {
    key: "access",
    label: "Portal password",
    fields: ["password"],
  },
];

const FIELD_ORDER = GROUPS.flatMap((group) => group.fields);

// The profile photo is optional for a user - they can add their own from
// /user/profile - so it isn't counted in the checklist's "n of 3 uploaded".
const REQUIRED_DOCUMENTS = GROUPS[2].fields.filter((field) => field !== "profilePhoto");

// Mirrors backend/utils/generateTempPassword.js - readable, no ambiguous characters.
function suggestPassword() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const alphabet = letters + digits;
  const random = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(random, (n, i) => {
    if (i === 0) return letters[n % letters.length];
    if (i === 1) return digits[n % digits.length];
    return alphabet[n % alphabet.length];
  }).join("");
}

// Everything the server would reject, checked here first. Used both for the
// submit and, silently, for the live checklist.
function validateUser(values) {
  const found = validate(values, { requireDocuments: true, subject: "user" });

  if (String(values.password || "").length < MIN_PASSWORD_LENGTH) {
    found.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  return found;
}

// Brings the first field that still needs work into view, and puts the cursor
// in it when it is something typeable (a document tile has only a hidden file
// input, which can't take focus).
function revealField(field) {
  const anchor = document.getElementById(fieldAnchorId(field));
  if (!anchor) return;

  anchor.scrollIntoView({ behavior: "smooth", block: "center" });
  anchor.querySelector('input:not([type="file"]), textarea')?.focus({ preventScroll: true });
}

function ChecklistRow({ label, done, detail, onClick }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-silver-50"
      >
        <span
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-white transition-colors ${
            done ? "border-emerald-600 bg-emerald-600" : "border-silver-300 bg-white"
          }`}
        >
          {done && <IconCheck className="h-3 w-3" />}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`block text-sm font-medium ${done ? "text-silver-500" : "text-silver-900"}`}
          >
            {label}
          </span>
          {detail && <span className="block text-xs text-silver-500">{detail}</span>}
        </span>
      </button>
    </li>
  );
}

export default function EmployeeUserRegister() {
  const [values, setValues] = useState({ ...emptyUser, password: "" });
  const [localErrors, setLocalErrors] = useState({});
  const [issued, setIssued] = useState(null);
  const [copied, setCopied] = useState(false);
  // Set only by a failed submit, so the summary never nags while typing.
  const [summary, setSummary] = useState([]);

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { saving, error, fieldErrors } = useSelector((state) => state.employeeUsers);

  useEffect(() => {
    dispatch(clearUserErrors());
  }, [dispatch]);

  const errors = { ...fieldErrors, ...localErrors };

  // What is still outstanding right now - drives the checklist, not the red
  // outlines (those stay tied to `errors`).
  const pending = useMemo(() => validateUser(values), [values]);
  const documentsPicked = REQUIRED_DOCUMENTS.filter((field) => values[field]).length;
  const remaining = FIELD_ORDER.filter((field) => pending[field]).length;

  async function handleSubmit(e) {
    e.preventDefault();

    const found = validateUser(values);
    setLocalErrors(found);

    const missing = FIELD_ORDER.filter((field) => found[field]);
    setSummary(missing);

    if (missing.length) {
      revealField(missing[0]);
      return;
    }

    const result = await dispatch(createUser({ ...values, age: Number(values.age) }));

    if (createUser.fulfilled.match(result)) {
      setIssued({
        id: result.payload.id,
        name: result.payload.name,
        email: result.payload.email,
        password: values.password,
      });
    }
  }

  async function copyPassword() {
    await navigator.clipboard.writeText(values.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function startAnother() {
    setValues({ ...emptyUser, password: "" });
    setLocalErrors({});
    setSummary([]);
    setIssued(null);
    dispatch(clearUserErrors());
    window.scrollTo({ top: 0 });
  }

  if (issued) {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="alert-success">User registered successfully.</div>

        <div className="card flex items-center gap-4 px-6 py-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-700">
            <IconUser className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-silver-500">
              New user
            </div>
            <div className="mt-0.5 truncate text-2xl font-bold text-silver-900">{issued.name}</div>
            <p className="mt-1 text-sm text-silver-500">
              Added to your users · documents saved on the server.
            </p>
          </div>
        </div>

        <CredentialBox
          email={issued.email}
          password={issued.password}
          title="User login credentials"
          audience="user"
        />

        <div className="flex flex-wrap gap-3">
          <Link to={`/employee/users/${issued.id}`} className="btn-primary">
            View user
          </Link>
          <Link to="/employee/users" className="btn-secondary">
            Back to list
          </Link>
          <button className="btn-secondary" onClick={startAnother}>
            Add another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => navigate("/employee/users")}
          className="inline-flex items-center gap-1.5 text-sm text-silver-500 hover:text-silver-800"
        >
          <IconArrowLeft className="w-4 h-4" />
          My Users
        </button>
        <h1 className="mt-2 text-2xl font-bold text-silver-900">Add User</h1>
        <p className="mt-1 text-sm text-silver-500">
          Take the user's details and documents, and give them access to the user portal. The
          user is saved under your name.
        </p>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {summary.length > 0 && (
        <div className="alert-error">
          <p className="font-medium">
            {summary.length} {summary.length === 1 ? "field needs" : "fields need"} your attention
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
            {summary.map((field) => (
              <li key={field}>
                <button
                  type="button"
                  onClick={() => revealField(field)}
                  className="rounded-md bg-white/70 px-2 py-0.5 text-xs font-medium underline underline-offset-2 hover:bg-white"
                >
                  {FIELD_LABELS[field] || field}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
        <form onSubmit={handleSubmit} noValidate>
          <div className="card">
            <div className="card-body">
              <EmployeeForm
                values={values}
                errors={errors}
                onChange={setValues}
                subject="user"
                photoColumn="profile_image"
              >
                <section id={fieldAnchorId("password")}>
                  <h3 className="text-sm font-semibold text-silver-900">Portal Access</h3>
                  <p className="mt-1 text-xs text-silver-500">
                    The user signs in at <code className="text-silver-700">/user</code> with their
                    email and this password. Note it down — you can reset it later, but it is
                    never shown again.
                  </p>

                  <div className="mt-4 max-w-sm">
                    <label className="label">Password</label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <PasswordInput
                          value={values.password}
                          onChange={(e) => setValues({ ...values, password: e.target.value })}
                          className={errors.password ? "input-error" : ""}
                          placeholder="At least 6 characters"
                          autoComplete="new-password"
                        />
                      </div>

                      <button
                        type="button"
                        className="btn-secondary shrink-0"
                        onClick={() => setValues({ ...values, password: suggestPassword() })}
                        title="Generate a password"
                      >
                        <IconKey className="w-4 h-4" />
                        Generate
                      </button>

                      {values.password && (
                        <button
                          type="button"
                          className="btn-secondary shrink-0"
                          onClick={copyPassword}
                          title="Copy the password"
                          aria-label="Copy the password"
                        >
                          {copied ? (
                            <IconCheck className="w-4 h-4" />
                          ) : (
                            <IconCopy className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>

                    {errors.password ? (
                      <p className="field-error">{errors.password}</p>
                    ) : (
                      <p className="mt-1.5 text-xs text-silver-500">
                        At least {MIN_PASSWORD_LENGTH} characters. Generate one if you'd rather
                        not think of it.
                      </p>
                    )}
                  </div>
                </section>
              </EmployeeForm>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-silver-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
              <Link to="/employee/users" className="btn-secondary justify-center">
                Cancel
              </Link>
              <button type="submit" disabled={saving} className="btn-primary justify-center">
                {saving ? "Saving..." : "Add User"}
              </button>
            </div>
          </div>
        </form>

        <aside className="card px-4 py-5 lg:sticky lg:top-6">
          <div className="flex items-center gap-2 px-2">
            <IconIdCard className="h-4 w-4 text-silver-400" />
            <h2 className="text-sm font-semibold text-silver-900">Before you save</h2>
          </div>

          <ul className="mt-3 space-y-0.5">
            {GROUPS.map((group) => (
              <ChecklistRow
                key={group.key}
                label={group.label}
                done={!group.fields.some((field) => pending[field])}
                detail={
                  group.key === "documents"
                    ? `${documentsPicked} of ${REQUIRED_DOCUMENTS.length} uploaded · photo optional`
                    : undefined
                }
                onClick={() => revealField(group.fields.find((f) => pending[f]) || group.fields[0])}
              />
            ))}
          </ul>

          <p className="mt-3 border-t border-silver-200 px-2 pt-3 text-xs text-silver-500">
            {remaining === 0 ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                <IconCheck className="h-3.5 w-3.5" />
                Everything is filled in.
              </span>
            ) : (
              <>
                {remaining} {remaining === 1 ? "item is" : "items are"} still missing. Documents
                are stored in a folder of your own, under this user's name.
              </>
            )}
          </p>

          <Link
            to="/employee/users"
            className="mt-4 flex items-center justify-center gap-1.5 text-xs text-silver-500 hover:text-silver-800"
          >
            <IconUsers className="h-3.5 w-3.5" />
            See all my users
          </Link>
        </aside>
      </div>
    </div>
  );
}
