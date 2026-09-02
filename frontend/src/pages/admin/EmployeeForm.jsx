// The register/edit form body, shared by EmployeeRegister and EmployeeDetail.
// Client-side rules mirror backend/utils/validateEmployee.js so the admin sees
// problems before a round trip; the server still validates everything again.
//
// The employee portal's User Management asks a user for nearly the same
// details, so it renders this same form with `subject="user"`. What that
// switches:
//
//   * an employee is also asked for an alternate mobile (optional); a user is
//     not,
//   * a user's photo is stored in `profile_image`, an employee's in
//     `profile_photo` (the `photoColumn` prop).
//
// Everything else is asked of both, the Aadhaar and PAN numbers included, and
// both upload the same documents (the PAN card front side only).

import { useState } from "react";
import { ageFromDateOfBirth } from "../../utils/format.js";
import { DOCUMENT_FIELDS, DocumentUpload, PhotoUpload } from "../../components/DocumentUpload.jsx";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PATTERN = /^[A-Za-z][A-Za-z\s.'-]*$/;
// "ABCDE1234F" - mirrors PAN_PATTERN in backend/utils/validateEmployee.js.
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const sharedFields = {
  firstName: "",
  lastName: "",
  mobile: "",
  email: "",
  age: "",
  address: "",
  aadhaarNumber: "",
  panNumber: "",
  dateOfBirth: "",
  // Documents: a File once picked, null otherwise.
  profilePhoto: null,
  aadhaarFront: null,
  aadhaarBack: null,
  panFront: null,
};

export const emptyEmployee = {
  ...sharedFields,
  alternateMobile: "",
};

export const emptyUser = { ...sharedFields };

function validateName(value, label) {
  if (value.trim().length < 2) return `${label} must be at least 2 characters`;
  if (!NAME_PATTERN.test(value.trim())) return `${label} can only contain letters`;
  return null;
}

export function validate(
  values,
  { requirePassword = false, requireDocuments = false, subject = "employee" } = {}
) {
  const errors = {};

  const firstNameError = validateName(values.firstName, "First name");
  if (firstNameError) errors.firstName = firstNameError;

  const lastNameError = validateName(values.lastName, "Last name");
  if (lastNameError) errors.lastName = lastNameError;

  if (!/^\d{10}$/.test(values.mobile)) errors.mobile = "Mobile number must be exactly 10 digits";
  if (!EMAIL_PATTERN.test(values.email.trim())) errors.email = "Enter a valid email address";
  if (values.address.trim().length < 5) errors.address = "Address must be at least 5 characters";
  if (!/^\d{12}$/.test(values.aadhaarNumber)) errors.aadhaarNumber = "Aadhaar number must be exactly 12 digits";

  if (!PAN_PATTERN.test(String(values.panNumber || "").toUpperCase())) {
    errors.panNumber = "PAN number must look like ABCDE1234F";
  }

  // Asked of an employee only - see the note at the top of this file.
  if (subject !== "user") {
    const alternateMobile = String(values.alternateMobile || "").trim();
    if (alternateMobile) {
      if (!/^\d{10}$/.test(alternateMobile)) {
        errors.alternateMobile = "Alternate mobile number must be exactly 10 digits";
      } else if (alternateMobile === values.mobile) {
        errors.alternateMobile = "Alternate mobile must differ from the mobile number";
      }
    }
  }

  const age = Number(values.age);
  if (!Number.isInteger(age) || age < 18 || age > 100) {
    errors.age = "Age must be between 18 and 100";
  }

  if (!values.dateOfBirth) {
    errors.dateOfBirth = "Date of birth is required";
  } else if (new Date(values.dateOfBirth) > new Date()) {
    errors.dateOfBirth = "Date of birth cannot be in the future";
  }

  if (requirePassword && String(values.tempPassword || "").length < 6) {
    errors.tempPassword = "Temporary password must be at least 6 characters";
  }

  // Registration needs every document; an edit only replaces what was re-picked.
  //
  // A user's profile photo is the exception - the employee registering somebody
  // at the counter often has no photo of them, and the user can add one
  // themselves from /user/profile. Mirrors `optional` in
  // backend/utils/userFiles.js.
  if (requireDocuments) {
    if (subject !== "user" && !values.profilePhoto) {
      errors.profilePhoto = "Profile photo is required";
    }

    for (const doc of DOCUMENT_FIELDS) {
      if (!values[doc.field]) errors[doc.field] = `${doc.label} is required`;
    }
  }

  return errors;
}

// What each field is called when it has to be named outside its own label -
// the "these fields need attention" summary on the register screens.
export const FIELD_LABELS = {
  firstName: "First name",
  lastName: "Last name",
  dateOfBirth: "Date of birth",
  age: "Age",
  aadhaarNumber: "Aadhaar number",
  panNumber: "PAN number",
  mobile: "Mobile number",
  alternateMobile: "Alternate mobile number",
  email: "Email address",
  address: "Address",
  profilePhoto: "Profile photo",
  aadhaarFront: "Aadhaar card — front",
  aadhaarBack: "Aadhaar card — back",
  panFront: "PAN card — front",
  password: "Password",
  tempPassword: "Temporary password",
};

// Anchors a field so a form can scroll the first invalid one into view.
export const fieldAnchorId = (field) => `field-${field}`;

function Field({ label, error, hint, children, className = "", name }) {
  return (
    <div className={className} id={name ? fieldAnchorId(name) : undefined}>
      <label className="label">{label}</label>
      {children}
      {error ? <p className="field-error">{error}</p> : hint && <p className="mt-1.5 text-xs text-silver-500">{hint}</p>}
    </div>
  );
}

function SectionTitle({ title, description }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-silver-900">{title}</h3>
      {description && <p className="mt-1 text-xs text-silver-500">{description}</p>}
    </div>
  );
}

export default function EmployeeForm({
  values,
  errors,
  onChange,
  existing = null,
  subject = "employee",
  photoColumn = "profile_photo",
  children,
}) {
  const [aadhaarFocused, setAadhaarFocused] = useState(false);

  // A user is not asked for a second contact number.
  const isStaff = subject !== "user";

  function set(field, value) {
    onChange({ ...values, [field]: value });
  }

  // Age is derived from the date of birth but stays editable.
  function handleDateOfBirth(value) {
    const derivedAge = ageFromDateOfBirth(value);
    onChange({ ...values, dateOfBirth: value, age: derivedAge === "" ? values.age : derivedAge });
  }

  const inputClass = (field) => `input ${errors[field] ? "input-error" : ""}`;

  const aadhaarDisplay =
    aadhaarFocused || values.aadhaarNumber.length !== 12
      ? values.aadhaarNumber
      : values.aadhaarNumber.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3");

  return (
    <div className="space-y-8">
      <section>
        <SectionTitle title="Personal Details" />
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Field label="First Name" error={errors.firstName} name="firstName">
            <input
              type="text"
              value={values.firstName}
              onChange={(e) => set("firstName", e.target.value)}
              className={inputClass("firstName")}
              placeholder="Ramesh"
            />
          </Field>

          <Field label="Last Name" error={errors.lastName} name="lastName">
            <input
              type="text"
              value={values.lastName}
              onChange={(e) => set("lastName", e.target.value)}
              className={inputClass("lastName")}
              placeholder="Sharma"
            />
          </Field>

          <Field label="Date of Birth" error={errors.dateOfBirth} name="dateOfBirth">
            <input
              type="date"
              value={values.dateOfBirth}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => handleDateOfBirth(e.target.value)}
              className={inputClass("dateOfBirth")}
            />
          </Field>

          <Field
            label="Age"
            error={errors.age}
            hint="Filled in from the date of birth"
            name="age"
          >
            <input
              type="number"
              min={18}
              max={100}
              value={values.age}
              onChange={(e) => set("age", e.target.value)}
              className={inputClass("age")}
              placeholder="28"
            />
          </Field>

          <Field label="Aadhaar Number" error={errors.aadhaarNumber} name="aadhaarNumber">
            <input
              type="text"
              inputMode="numeric"
              value={aadhaarDisplay}
              onFocus={() => setAadhaarFocused(true)}
              onBlur={() => setAadhaarFocused(false)}
              onChange={(e) => set("aadhaarNumber", e.target.value.replace(/\D/g, "").slice(0, 12))}
              className={`${inputClass("aadhaarNumber")} tracking-wider tabular-nums`}
              placeholder="12 digits"
            />
          </Field>

          <Field label="PAN Number" error={errors.panNumber} name="panNumber">
            <input
              type="text"
              value={values.panNumber || ""}
              // Always upper case, letters and digits only - the format the
              // card itself uses, so it can't be typed in wrong.
              onChange={(e) =>
                set("panNumber", e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10))
              }
              className={`${inputClass("panNumber")} tracking-wider uppercase`}
              placeholder="ABCDE1234F"
            />
          </Field>
        </div>
      </section>

      <section>
        <SectionTitle title="Contact Details" />
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Field label="Mobile Number" error={errors.mobile} name="mobile">
            <div className="flex">
              <span className="inline-flex items-center rounded-l-lg border border-r-0 border-silver-300 bg-silver-50 px-3 text-sm text-silver-500">
                +91
              </span>
              <input
                type="tel"
                inputMode="numeric"
                value={values.mobile}
                onChange={(e) => set("mobile", e.target.value.replace(/\D/g, "").slice(0, 10))}
                className={`${inputClass("mobile")} rounded-l-none tabular-nums`}
                placeholder="9876543210"
              />
            </div>
          </Field>

          {isStaff && (
            <Field
              label="Alternate Mobile Number"
              error={errors.alternateMobile}
              hint="Optional"
              name="alternateMobile"
            >
              <div className="flex">
                <span className="inline-flex items-center rounded-l-lg border border-r-0 border-silver-300 bg-silver-50 px-3 text-sm text-silver-500">
                  +91
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={values.alternateMobile || ""}
                  onChange={(e) =>
                    set("alternateMobile", e.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                  className={`${inputClass("alternateMobile")} rounded-l-none tabular-nums`}
                  placeholder="Optional"
                />
              </div>
            </Field>
          )}

          <Field label="Email Address" error={errors.email} name="email">
            <input
              type="email"
              value={values.email}
              onChange={(e) => set("email", e.target.value)}
              className={inputClass("email")}
              placeholder={`${subject}@example.com`}
            />
          </Field>

          <Field label="Address" error={errors.address} className="sm:col-span-2" name="address">
            <textarea
              rows={3}
              value={values.address}
              onChange={(e) => set("address", e.target.value)}
              className={`${inputClass("address")} resize-none`}
              placeholder="House / street, area, city, state, PIN"
            />
          </Field>
        </div>
      </section>

      <section>
        <SectionTitle
          title="Photo & Documents"
          description={
            existing
              ? "Pick a file again only to replace the stored copy."
              : `Stored on the server in a folder named after this ${subject}.`
          }
        />

        <div className="mt-4 space-y-6">
          <div id={fieldAnchorId("profilePhoto")}>
            <PhotoUpload
              file={values.profilePhoto}
              existingPath={existing?.[photoColumn]}
              error={errors.profilePhoto}
              optional={subject === "user"}
              onPick={(file) => set("profilePhoto", file)}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {DOCUMENT_FIELDS.map((doc) => (
              <div key={doc.field} id={fieldAnchorId(doc.field)}>
                <DocumentUpload
                  label={doc.label}
                  file={values[doc.field]}
                  existingPath={existing?.[doc.column]}
                  error={errors[doc.field]}
                  onPick={(file) => set(doc.field, file)}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {children}
    </div>
  );
}
