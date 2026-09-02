// The cast.
//
// Most of the authorization suite is "call this endpoint as each of six
// identities and assert six status codes", which only stays readable if
// building the six is one line. buildCast() returns every account the suite
// needs, already signed in.
//
// Accounts are created through the models rather than through the API, because
// the API path is itself under test - a fixture that broke when registration
// broke would take the whole suite down with it.

const bcrypt = require("bcryptjs");
const request = require("supertest");

const { AdminModel, SubAdminModel } = require("../../models/accounts");
const EmployeeModel = require("../../models/employeeModel");
const ManagedUserModel = require("../../models/managedUserModel");
const SilverRateModel = require("../../models/silverRateModel");
const generateToken = require("../../utils/generateToken");
const { createApp } = require("../../app");

const PASSWORD = "Passw0rd!";
const app = createApp();

function api() {
  return request(app);
}

// Supertest sets the header itself; this just keeps the call sites short.
function auth(token) {
  return `Bearer ${token}`;
}

// bcrypt at cost 10 takes ~90ms, and buildCast() needs eight hashes of the
// same string on every single test. Hashing it once and reusing the digest
// takes the suite from ~70s to a few seconds without weakening anything - the
// login path still performs a real bcrypt.compare against a real hash.
const hashCache = new Map();

async function hash(password = PASSWORD) {
  if (!hashCache.has(password)) {
    hashCache.set(password, await bcrypt.hash(password, 10));
  }
  return hashCache.get(password);
}

async function makeAdmin({ name = "Main Admin", email = "admin@test.local" } = {}) {
  const id = await AdminModel.create({ name, email, password: await hash() });
  const row = await AdminModel.findById(id);
  return { ...row, id, email, password: PASSWORD, token: generateToken({ id, role: "admin" }) };
}

async function makeSubAdmin({
  name = "Sub Admin",
  email = "subadmin@test.local",
  createdBy = null,
  isActive = true,
} = {}) {
  const id = await SubAdminModel.create({ name, email, password: await hash(), createdBy });
  if (!isActive) await SubAdminModel.setActive(id, false);
  const row = await SubAdminModel.findById(id);
  return { ...row, id, email, password: PASSWORD, token: generateToken({ id, role: "subadmin" }) };
}

// Aadhaar and PAN have to be unique and well-formed, so they are derived from a
// counter rather than hard-coded - two employees in one test would otherwise
// collide on the unique index.
let personCounter = 0;

function nextPerson(prefix) {
  personCounter += 1;
  const n = String(personCounter).padStart(2, "0");
  return {
    aadhaarNumber: `4210567890${n}`,
    panNumber: `ABCDE${String(1000 + personCounter)}${String.fromCharCode(65 + (personCounter % 26))}`,
    mobile: `98123456${n}`,
    email: `${prefix}${personCounter}@test.local`,
  };
}

async function makeEmployee({
  firstName = "Ramesh",
  lastName = "Sharma",
  isBlocked = false,
  mustChangePassword = false,
} = {}) {
  const person = nextPerson("employee");

  const id = await EmployeeModel.create({
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    mobile: person.mobile,
    alternateMobile: "",
    email: person.email,
    age: 30,
    address: "12 MG Road, Mumbai 400058",
    aadhaarNumber: person.aadhaarNumber,
    panNumber: person.panNumber,
    dateOfBirth: "1995-04-12",
    folderName: `${firstName}-${lastName}-${personCounter}`.toLowerCase(),
    password: await hash(),
  });

  await EmployeeModel.setEmployeeCode(id, `EMP${String(id).padStart(4, "0")}`);
  await EmployeeModel.updatePassword(id, await hash(), mustChangePassword);
  if (isBlocked) await EmployeeModel.setBlocked(id, true);

  const row = await EmployeeModel.findById(id);
  return {
    ...row,
    id,
    email: person.email,
    password: PASSWORD,
    token: generateToken({ id, role: "employee" }),
  };
}

async function makeUser({
  firstName = "Amit",
  lastName = "Patel",
  employeeId = null,
  isActive = true,
} = {}) {
  const person = nextPerson("user");

  const id = await ManagedUserModel.create({
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    mobile: person.mobile,
    email: person.email,
    age: 28,
    address: "45 Ashram Road, Ahmedabad 380009",
    aadhaarNumber: person.aadhaarNumber,
    panNumber: person.panNumber,
    dateOfBirth: "1997-09-03",
    folderName: `owner/${firstName}-${lastName}-${personCounter}`.toLowerCase(),
    password: await hash(),
    employeeId,
  });

  if (!isActive) await ManagedUserModel.setActive(id, false);

  const row = await ManagedUserModel.findById(id);
  return {
    ...row,
    id,
    email: person.email,
    password: PASSWORD,
    token: generateToken({ id, role: "user" }),
  };
}

// The rate everything else is priced against. Buy above sell, which is the way
// round the business depends on - see the rate suite for what happens when it
// isn't.
async function publishRate({ buy = 105, sell = 100, date = null, updatedBy = 1 } = {}) {
  const rateDate = date || new Date().toISOString().slice(0, 10);
  await SilverRateModel.upsertForDate({
    rateDate,
    buyRatePerGram: buy,
    sellRatePerGram: sell,
    updatedBy,
  });
  return { rateDate, buy, sell };
}

// Everyone, wired together: employeeA owns userA, employeeB owns userB. That
// pairing is what the ownership tests turn on.
async function buildCast({ withRate = true } = {}) {
  personCounter = 0;

  const admin = await makeAdmin();
  const subAdmin = await makeSubAdmin({ createdBy: admin.id });
  const employeeA = await makeEmployee({ firstName: "Ramesh", lastName: "Sharma" });
  const employeeB = await makeEmployee({ firstName: "Priya", lastName: "Nair" });
  const userA = await makeUser({ firstName: "Amit", lastName: "Patel", employeeId: employeeA.id });
  const userB = await makeUser({ firstName: "Sneha", lastName: "Rao", employeeId: employeeB.id });

  const rate = withRate ? await publishRate({ updatedBy: admin.id }) : null;

  return { admin, subAdmin, employeeA, employeeB, userA, userB, rate };
}

// The OTP as the recipient would receive it.
//
// It is stored hashed now, so a test cannot read it back out of the database -
// which is the whole point. With SMTP unconfigured, sendEmail.js logs the code
// instead of sending it, so this watches that line. Testing through the real
// delivery path also means a change that stopped sending the OTP entirely
// would fail these tests rather than passing them.
async function captureOtp(run) {
  const original = console.log;
  let otp = null;

  console.log = (...args) => {
    const line = args.join(" ");
    const match = line.match(/OTP for \S+ is: (\d{6})/);
    if (match) otp = match[1];
  };

  try {
    await run();
  } finally {
    console.log = original;
  }

  return otp;
}

module.exports = {
  app,
  api,
  auth,
  captureOtp,
  PASSWORD,
  buildCast,
  makeAdmin,
  makeSubAdmin,
  makeEmployee,
  makeUser,
  publishRate,
};
