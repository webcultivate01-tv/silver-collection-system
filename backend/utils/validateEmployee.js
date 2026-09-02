// Shared validation for the employee register/edit forms.
// Returns { errors, values } - errors is an empty object when everything passed.

const { DOCUMENTS } = require("./employeeFiles");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_PATTERN = /^[A-Za-z][A-Za-z\s.'-]*$/;
// "ABCDE1234F" - five letters, four digits, one letter.
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// Both forms ask for the Aadhaar number and the PAN number. `staffFields` turns
// on the one field the admin's employee form asks for and the employee panel's
// user form does not: the alternate mobile (optional).
function validateEmployee(body, { staffFields = false } = {}) {
  const errors = {};

  const firstName = String(body.firstName || "").trim();
  const lastName = String(body.lastName || "").trim();
  const mobile = String(body.mobile || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const address = String(body.address || "").trim();
  const aadhaarNumber = String(body.aadhaarNumber || "").replace(/\s/g, "");
  const panNumber = String(body.panNumber || "").replace(/\s/g, "").toUpperCase();
  const alternateMobile = String(body.alternateMobile || "").trim();
  const dateOfBirth = String(body.dateOfBirth || "").slice(0, 10);
  const age = Number(body.age);

  if (firstName.length < 2) {
    errors.firstName = "First name must be at least 2 characters";
  } else if (!NAME_PATTERN.test(firstName)) {
    errors.firstName = "First name can only contain letters";
  }

  if (lastName.length < 2) {
    errors.lastName = "Last name must be at least 2 characters";
  } else if (!NAME_PATTERN.test(lastName)) {
    errors.lastName = "Last name can only contain letters";
  }

  if (!/^\d{10}$/.test(mobile)) errors.mobile = "Mobile number must be exactly 10 digits";
  if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address";
  if (address.length < 5) errors.address = "Address must be at least 5 characters";
  if (!/^\d{12}$/.test(aadhaarNumber)) errors.aadhaarNumber = "Aadhaar number must be exactly 12 digits";

  if (!PAN_PATTERN.test(panNumber)) {
    errors.panNumber = "PAN number must look like ABCDE1234F";
  }

  if (staffFields) {
    // Optional - only checked once something has been typed in.
    if (alternateMobile) {
      if (!/^\d{10}$/.test(alternateMobile)) {
        errors.alternateMobile = "Alternate mobile number must be exactly 10 digits";
      } else if (alternateMobile === mobile) {
        errors.alternateMobile = "Alternate mobile must differ from the mobile number";
      }
    }
  }

  if (!Number.isInteger(age) || age < 18 || age > 100) {
    errors.age = "Age must be a whole number between 18 and 100";
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    errors.dateOfBirth = "Enter a valid date of birth";
  } else if (new Date(dateOfBirth) > new Date()) {
    errors.dateOfBirth = "Date of birth cannot be in the future";
  }

  return {
    errors,
    values: {
      firstName,
      lastName,
      // Kept in sync so the employee portal and dashboard can keep using it.
      fullName: `${firstName} ${lastName}`.trim(),
      mobile,
      email,
      age,
      address,
      aadhaarNumber,
      panNumber,
      dateOfBirth,
      // Only meaningful when `staffFields` was asked for; the user controller
      // ignores it.
      alternateMobile,
    },
  };
}

// Registration must include every document; an edit only replaces the ones
// the admin picked again, so nothing is required there.
function validateEmployeeDocuments(files = {}) {
  const errors = {};

  for (const doc of DOCUMENTS) {
    if (!files[doc.field]?.[0]) {
      errors[doc.field] = `${doc.label} is required`;
    }
  }

  return errors;
}

module.exports = validateEmployee;
module.exports.validateEmployeeDocuments = validateEmployeeDocuments;
