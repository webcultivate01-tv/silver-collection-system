// The shared person validator. One function guards both the admin's employee
// form and the employee panel's user form - the widest input surface in the
// application, and the only thing standing between a typed form and the
// database columns it writes.

import { describe, it, expect } from "vitest";
import validateEmployee from "../../utils/validateEmployee.js";

const { validateEmployeeDocuments } = validateEmployee;

// A body that passes cleanly, so each test can break exactly one field.
function validBody(overrides = {}) {
  return {
    firstName: "Ramesh",
    lastName: "Sharma",
    mobile: "9812345601",
    email: "ramesh@example.com",
    address: "12 MG Road, Andheri West, Mumbai 400058",
    aadhaarNumber: "421056789012",
    panNumber: "ABCDE1234F",
    dateOfBirth: "1995-04-12",
    age: 30,
    ...overrides,
  };
}

function errorsFor(overrides, options) {
  return validateEmployee(validBody(overrides), options).errors;
}

describe("a valid submission", () => {
  it("passes with no errors", () => {
    expect(validateEmployee(validBody()).errors).toEqual({});
  });

  it("normalises the values it returns", () => {
    const { values } = validateEmployee(
      validBody({
        firstName: "  Ramesh  ",
        lastName: "  Sharma ",
        email: "  RAMESH@Example.COM ",
        aadhaarNumber: "4210 5678 9012",
        panNumber: " abcde1234f ",
      })
    );

    expect(values.firstName).toBe("Ramesh");
    expect(values.email).toBe("ramesh@example.com");
    expect(values.aadhaarNumber).toBe("421056789012");
    expect(values.panNumber).toBe("ABCDE1234F");
    // Kept in step so the portal and every report can keep reading it.
    expect(values.fullName).toBe("Ramesh Sharma");
  });
});

describe("names", () => {
  it("rejects a name shorter than two characters", () => {
    expect(errorsFor({ firstName: "R" })).toHaveProperty("firstName");
    expect(errorsFor({ lastName: "" })).toHaveProperty("lastName");
  });

  it("rejects digits and symbols", () => {
    expect(errorsFor({ firstName: "R4mesh" })).toHaveProperty("firstName");
    expect(errorsFor({ firstName: "<script>" })).toHaveProperty("firstName");
  });

  it("accepts the punctuation real names carry", () => {
    expect(errorsFor({ firstName: "Mary-Jane" })).not.toHaveProperty("firstName");
    expect(errorsFor({ lastName: "O'Brien" })).not.toHaveProperty("lastName");
    expect(errorsFor({ lastName: "St. John" })).not.toHaveProperty("lastName");
  });

  // Worth knowing rather than worth fixing blindly: NAME_PATTERN is ASCII-only,
  // so a Devanagari or Tamil name is refused. In an application that asks for
  // an Aadhaar number, that is a real usability limit for real users.
  it("refuses non-Latin scripts, which excludes many Indian names", () => {
    expect(errorsFor({ firstName: "रमेश" })).toHaveProperty("firstName");
  });
});

describe("mobile numbers", () => {
  it("requires exactly ten digits", () => {
    expect(errorsFor({ mobile: "981234560" })).toHaveProperty("mobile");
    expect(errorsFor({ mobile: "98123456012" })).toHaveProperty("mobile");
    expect(errorsFor({ mobile: "98123456ab" })).toHaveProperty("mobile");
    expect(errorsFor({ mobile: "" })).toHaveProperty("mobile");
  });

  it("checks the alternate mobile only on the staff form, and only when filled", () => {
    // The user form doesn't ask for it at all.
    expect(errorsFor({ alternateMobile: "123" })).not.toHaveProperty("alternateMobile");

    // The staff form does, but blank is allowed.
    expect(errorsFor({ alternateMobile: "" }, { staffFields: true })).not.toHaveProperty(
      "alternateMobile"
    );
    expect(errorsFor({ alternateMobile: "123" }, { staffFields: true })).toHaveProperty(
      "alternateMobile"
    );
  });

  it("refuses an alternate number identical to the main one", () => {
    const errors = errorsFor(
      { mobile: "9812345601", alternateMobile: "9812345601" },
      { staffFields: true }
    );
    expect(errors).toHaveProperty("alternateMobile");
  });
});

describe("Aadhaar and PAN", () => {
  it("requires exactly twelve Aadhaar digits", () => {
    expect(errorsFor({ aadhaarNumber: "42105678901" })).toHaveProperty("aadhaarNumber");
    expect(errorsFor({ aadhaarNumber: "4210567890123" })).toHaveProperty("aadhaarNumber");
    expect(errorsFor({ aadhaarNumber: "42105678901X" })).toHaveProperty("aadhaarNumber");
  });

  it("enforces the PAN shape", () => {
    expect(errorsFor({ panNumber: "ABCD1234F" })).toHaveProperty("panNumber");
    expect(errorsFor({ panNumber: "ABCDE12345" })).toHaveProperty("panNumber");
    expect(errorsFor({ panNumber: "ABCDE1234" })).toHaveProperty("panNumber");
    expect(errorsFor({ panNumber: "" })).toHaveProperty("panNumber");
  });

  it("uppercases a lowercase PAN rather than rejecting it", () => {
    expect(errorsFor({ panNumber: "abcde1234f" })).not.toHaveProperty("panNumber");
  });
});

describe("age and date of birth", () => {
  it("accepts the boundaries and rejects just outside them", () => {
    expect(errorsFor({ age: 18 })).not.toHaveProperty("age");
    expect(errorsFor({ age: 100 })).not.toHaveProperty("age");
    expect(errorsFor({ age: 17 })).toHaveProperty("age");
    expect(errorsFor({ age: 101 })).toHaveProperty("age");
  });

  it("requires a whole number", () => {
    expect(errorsFor({ age: 30.5 })).toHaveProperty("age");
    expect(errorsFor({ age: "abc" })).toHaveProperty("age");
    expect(errorsFor({ age: undefined })).toHaveProperty("age");
  });

  it("rejects a malformed or future date of birth", () => {
    expect(errorsFor({ dateOfBirth: "12-04-1995" })).toHaveProperty("dateOfBirth");
    expect(errorsFor({ dateOfBirth: "" })).toHaveProperty("dateOfBirth");
    expect(errorsFor({ dateOfBirth: "2099-01-01" })).toHaveProperty("dateOfBirth");
  });

  // KNOWN GAP (see BUG-27). Age and date of birth are validated independently,
  // so a 30-year-old born in 2010 passes both checks. Every report shows both
  // figures side by side, where the contradiction is plainly visible.
  it("does not check that age agrees with the date of birth", () => {
    const errors = errorsFor({ age: 30, dateOfBirth: "2010-01-01" });
    expect(errors).not.toHaveProperty("age");
    expect(errors).not.toHaveProperty("dateOfBirth");
  });
});

describe("address and email", () => {
  it("requires an address of at least five characters", () => {
    expect(errorsFor({ address: "12" })).toHaveProperty("address");
  });

  it("rejects obviously malformed emails", () => {
    expect(errorsFor({ email: "not-an-email" })).toHaveProperty("email");
    expect(errorsFor({ email: "no@domain" })).toHaveProperty("email");
    expect(errorsFor({ email: "spaces in@example.com" })).toHaveProperty("email");
  });
});

describe("reporting every problem at once", () => {
  it("returns all the bad fields, not just the first", () => {
    const errors = errorsFor({
      firstName: "R",
      mobile: "123",
      email: "nope",
      aadhaarNumber: "1",
      panNumber: "x",
      age: 5,
    });

    // The forms render one message per input, so a submission with six
    // problems has to come back with six.
    expect(Object.keys(errors).sort()).toEqual(
      ["aadhaarNumber", "age", "email", "firstName", "mobile", "panNumber"].sort()
    );
  });
});

describe("validateEmployeeDocuments", () => {
  const file = [{ originalname: "x.jpg" }];

  it("requires all four documents at registration", () => {
    expect(Object.keys(validateEmployeeDocuments({}))).toHaveLength(4);
  });

  it("passes once every document is present", () => {
    const files = {
      profilePhoto: file,
      aadhaarFront: file,
      aadhaarBack: file,
      panFront: file,
    };
    expect(validateEmployeeDocuments(files)).toEqual({});
  });

  it("names the specific document that is missing", () => {
    const files = { profilePhoto: file, aadhaarFront: file, aadhaarBack: file };
    expect(validateEmployeeDocuments(files)).toHaveProperty("panFront");
  });
});
