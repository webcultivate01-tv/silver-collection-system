// Run with: npm run seed:bulk
//
// Fills the database with a larger, more realistic dataset than seed:demo
// does: ten employees, fifty customers spread evenly across them (five each),
// and a silver rate for every day of August 2026.
//
// Every employee and every customer here shares one password - admin123 - so
// any of the sixty logins can be signed into without looking anything up. That
// makes this a development-only seeder; it is not something to point at a real
// database.
//
// Like the other seeders, re-running is safe. Accounts are matched by email,
// Aadhaar and PAN and skipped if they already exist, and rates are upserted on
// their date, so a second run changes nothing.
//
// No purchases, handovers or payouts are written. Those are what a customer's
// holding is made of, and seeding them repeatedly would quietly inflate every
// balance - seed:demo already covers that case for a smaller set of people.

require("dotenv").config();
const bcrypt = require("bcryptjs");

const { pool } = require("../config/db");
const {
  AdminModel,
  UserModel,
  findByEmailAnywhere,
  emailTakenAnywhere,
} = require("../models/accounts");
const EmployeeModel = require("../models/employeeModel");
const ManagedUserModel = require("../models/managedUserModel");
const SilverRateModel = require("../models/silverRateModel");
const { ROLES } = require("../middleware/authMiddleware");
const { slugify, buildFolderName } = require("../utils/employeeFiles");
const { buildUserFolder, userFolderExistsOnDisk } = require("../utils/userFiles");

// ---------------------------------------------------------------------------
// What gets created
// ---------------------------------------------------------------------------
const EMPLOYEE_COUNT = 10;
const USER_COUNT = 50;

// The one password shared by every employee and every customer below.
const PASSWORD = "admin123";

const ADMIN = {
  name: process.env.ADMIN_NAME || "Admin",
  email: (process.env.ADMIN_EMAIL || "admin@gmail.com").toLowerCase(),
  password: process.env.ADMIN_PASSWORD || "Admin123",
};

// The month the rates cover.
const YEAR = 2026;
const MONTH = 8; // August
const DAYS_IN_MONTH = 31;

// Ages are worked out against a fixed day rather than "today", so the numbers
// stored do not drift as the machine's clock moves on.
const REFERENCE_DATE = new Date(`${YEAR}-09-02T00:00:00Z`);

// ---------------------------------------------------------------------------
// Deterministic "randomness" - the same generator seed:demo uses, so two
// people running this end up with the same database.
// ---------------------------------------------------------------------------
function makeRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20260802);

function dateOf(day) {
  return `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Name and address pools
// ---------------------------------------------------------------------------
// Deliberately different from the names seed:demo uses, so the two seeders can
// be run against the same database without either one's rows being skipped.
const EMPLOYEE_FIRST = [
  "Mahesh", "Sunita", "Prakash", "Rekha", "Nitin",
  "Shweta", "Girish", "Kavita", "Sandeep", "Manisha",
];
const EMPLOYEE_LAST = [
  "Pawar", "Thakur", "Chavan", "Bhosale", "Salunkhe",
  "Jadhav", "Kadam", "Shinde", "Mane", "Gaikwad",
];

const USER_FIRST = [
  "Aditya", "Bhavna", "Chirag", "Deepika", "Eshan",
  "Falguni", "Gaurav", "Harshita", "Irfan", "Jyoti",
  "Karan", "Lavanya", "Mohit", "Nandini", "Omkar",
  "Pallavi", "Qadir", "Ritika", "Suresh", "Tanvi",
  "Umesh", "Vaishali", "Wasim", "Yamini", "Zoya",
];
const USER_LAST = ["Agarwal", "Menon", "Chopra", "Dutta", "Fernandes"];

const CITIES = [
  "Zaveri Bazaar, Kalbadevi, Mumbai 400002",
  "Laxmi Road, Budhwar Peth, Pune 411002",
  "Manek Chowk, Khadia, Ahmedabad 380001",
  "Johari Bazaar, Jaipur 302003",
  "Chandni Chowk, Delhi 110006",
  "T Nagar, Chennai 600017",
  "Bowbazar, Kolkata 700012",
  "Sultan Bazaar, Hyderabad 500095",
  "Rajwada, Indore 452002",
  "MG Road, Bengaluru 560001",
];

// ---------------------------------------------------------------------------
// Well-formed but invented identifiers
// ---------------------------------------------------------------------------
// Aadhaar is 12 digits and PAN is "ABCDE1234F" - five letters, four digits, a
// letter - which is what the registration forms validate. The number blocks
// below are kept clear of the ones seed:demo uses so neither seeder collides
// with the other.
function aadhaarFor(prefix, index) {
  return `${prefix}${String(index).padStart(12 - prefix.length, "0")}`;
}

// Three letters from the name plus a two-letter tag, then the row's index and
// a trailing letter. The index is unique per person, so the PAN is too.
function panFor(firstName, lastName, tag, index) {
  const letters = `${firstName}${lastName}`.toUpperCase().replace(/[^A-Z]/g, "");
  const head = (letters + "XXX").slice(0, 3);
  const tail = String.fromCharCode(65 + (index % 26));
  return `${head}${tag}${String(index).padStart(4, "0")}${tail}`;
}

function ageOn(dateOfBirth) {
  const born = new Date(`${dateOfBirth}T00:00:00Z`);
  let age = REFERENCE_DATE.getUTCFullYear() - born.getUTCFullYear();

  const monthDiff = REFERENCE_DATE.getUTCMonth() - born.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && REFERENCE_DATE.getUTCDate() < born.getUTCDate())) {
    age -= 1;
  }

  return age;
}

// A birthday that keeps everyone comfortably adult, spread over the years so
// the age column is not all one number.
function birthDateFor(index, spread, oldest) {
  const year = oldest + ((index * 7) % spread);
  const month = (index % 12) + 1;
  const day = ((index * 3) % 28) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildEmployees() {
  return Array.from({ length: EMPLOYEE_COUNT }, (_, i) => {
    const firstName = EMPLOYEE_FIRST[i % EMPLOYEE_FIRST.length];
    const lastName = EMPLOYEE_LAST[i % EMPLOYEE_LAST.length];
    const dateOfBirth = birthDateFor(i, 25, 1980);
    const number = i + 1;

    return {
      firstName,
      lastName,
      email: `${firstName}.${lastName}@staff.test`.toLowerCase(),
      mobile: `99${String(10000000 + number).padStart(8, "0")}`,
      // Only every third employee carries a second number, so the column is
      // not uniformly filled in.
      alternateMobile: i % 3 === 0 ? `98${String(10000000 + number).padStart(8, "0")}` : null,
      age: ageOn(dateOfBirth),
      dateOfBirth,
      aadhaarNumber: aadhaarFor("7301", number),
      panNumber: panFor(firstName, lastName, "EM", number),
      address: `${number * 3} ${CITIES[i % CITIES.length]}`,
    };
  });
}

function buildUsers() {
  return Array.from({ length: USER_COUNT }, (_, i) => {
    // 25 first names against 5 last names, walked so all fifty combinations
    // come out distinct.
    const firstName = USER_FIRST[i % USER_FIRST.length];
    const lastName = USER_LAST[Math.floor(i / USER_FIRST.length) % USER_LAST.length];
    const dateOfBirth = birthDateFor(i, 40, 1968);
    const number = i + 1;

    return {
      firstName,
      lastName,
      email: `${firstName}.${lastName}@customer.test`.toLowerCase(),
      mobile: `97${String(10000000 + number).padStart(8, "0")}`,
      age: ageOn(dateOfBirth),
      dateOfBirth,
      aadhaarNumber: aadhaarFor("7402", number),
      panNumber: panFor(firstName, lastName, "US", number),
      address: `${number * 2} ${CITIES[i % CITIES.length]}`,
      // Five customers each, dealt round-robin.
      employeeIndex: i % EMPLOYEE_COUNT,
    };
  });
}

// ---------------------------------------------------------------------------
// 1. Admin - only so the rates have somebody to be attributed to
// ---------------------------------------------------------------------------
async function ensureAdmin() {
  const existing = await findByEmailAnywhere(ADMIN.email);

  if (existing) {
    if (existing.role !== ROLES.ADMIN) {
      throw new Error(
        `${ADMIN.email} already exists as a ${existing.role}, so the admin cannot be used.`
      );
    }
    console.log(`  ${ADMIN.email} already exists - kept as it is`);
    return existing.id;
  }

  const id = await AdminModel.create({
    name: ADMIN.name,
    email: ADMIN.email,
    password: await bcrypt.hash(ADMIN.password, 10),
  });

  console.log(`  ${ADMIN.email} created`);
  return id;
}

// ---------------------------------------------------------------------------
// 2. Employees
// ---------------------------------------------------------------------------
// "EMP0007" - the same readable id controllers/employeeController.js derives.
function employeeCodeFor(id) {
  return `EMP${String(id).padStart(4, "0")}`;
}

async function reserveEmployeeFolder(employee) {
  const base = buildFolderName(employee.firstName, employee.lastName);

  let candidate = base;
  let suffix = 2;

  while (await EmployeeModel.folderNameTaken(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function seedEmployees(hashedPassword) {
  const rows = [];
  let created = 0;

  for (const employee of buildEmployees()) {
    const existing = await EmployeeModel.findByEmail(employee.email);

    if (existing) {
      console.log(`  ${existing.employee_code}  ${employee.email} already exists`);
      rows.push(existing);
      continue;
    }

    if (await emailTakenAnywhere(employee.email, { excludeRole: ROLES.EMPLOYEE })) {
      console.log(`  ${employee.email} skipped - the email belongs to another account`);
      continue;
    }

    const folderName = await reserveEmployeeFolder(employee);

    const id = await EmployeeModel.create({
      ...employee,
      fullName: `${employee.firstName} ${employee.lastName}`,
      folderName,
      password: hashedPassword,
    });

    await EmployeeModel.setEmployeeCode(id, employeeCodeFor(id));

    // Registering through the admin panel forces a password change on first
    // login. These are demo logins meant to be signed straight into, so that
    // flag is cleared - the real flow is still testable from a real
    // registration.
    await EmployeeModel.updatePassword(id, hashedPassword, false);

    console.log(
      `  ${employeeCodeFor(id)}  ${employee.firstName} ${employee.lastName}  ${employee.email}`
    );
    created += 1;
    rows.push(await EmployeeModel.findByEmail(employee.email));
  }

  console.log(`  -> ${created} created, ${rows.length - created} already there`);
  return rows;
}

// ---------------------------------------------------------------------------
// 3. Customers
// ---------------------------------------------------------------------------
function employeeFolderFor(employee) {
  return slugify(employee.folder_name || employee.employee_code || `employee-${employee.id}`);
}

async function reserveUserFolder(employee, user) {
  const base = buildUserFolder(employeeFolderFor(employee), user.firstName, user.lastName);

  let candidate = base;
  let suffix = 2;

  while (
    (await ManagedUserModel.folderNameTaken(candidate)) ||
    userFolderExistsOnDisk(candidate)
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function seedUsers(employees, hashedPassword) {
  if (!employees.length) {
    console.log("  no employees to attach customers to - skipped");
    return [];
  }

  const rows = [];
  let created = 0;
  let skipped = 0;

  for (const user of buildUsers()) {
    // Fewer employees than expected (one of them already existing under a
    // different email) still deals the customers out evenly across whatever
    // is there.
    const employee = employees[user.employeeIndex % employees.length];

    const existing = await UserModel.findByEmail(user.email);
    if (existing) {
      rows.push(existing);
      skipped += 1;
      continue;
    }

    // The same three uniqueness checks the employee panel's register form makes.
    if (await emailTakenAnywhere(user.email, { excludeRole: ROLES.USER })) {
      console.log(`  ${user.email} skipped - the email belongs to another account`);
      skipped += 1;
      continue;
    }
    if (await ManagedUserModel.aadhaarTaken(user.aadhaarNumber)) {
      console.log(`  ${user.email} skipped - Aadhaar already registered`);
      skipped += 1;
      continue;
    }
    if (await ManagedUserModel.panTaken(user.panNumber)) {
      console.log(`  ${user.email} skipped - PAN already registered`);
      skipped += 1;
      continue;
    }

    const folderName = await reserveUserFolder(employee, user);

    const id = await ManagedUserModel.create({
      ...user,
      fullName: `${user.firstName} ${user.lastName}`,
      folderName,
      password: hashedPassword,
      employeeId: employee.id,
    });

    created += 1;
    rows.push({ id, ...user });
  }

  console.log(`  -> ${created} created, ${skipped} already there or skipped`);
  return rows;
}

// ---------------------------------------------------------------------------
// 4. A silver rate for every day of August 2026
// ---------------------------------------------------------------------------
// The buying rate wanders up and down around Rs 112/g the way a real quote
// does; the selling rate sits about 2.5% under it, which is where the shop's
// margin comes from.
function buildRates() {
  const rates = [];
  let buy = 111.4;

  for (let day = 1; day <= DAYS_IN_MONTH; day += 1) {
    // A drift of roughly +/- Rs 1.20 a day, nudged back towards Rs 112 so a
    // month of steps does not wander off somewhere silly.
    const drift = (random() - 0.48) * 2.4;
    const pullBack = (112 - buy) * 0.08;
    buy = Math.min(122, Math.max(103, buy + drift + pullBack));

    rates.push({
      rateDate: dateOf(day),
      buyRate: Number(buy.toFixed(2)),
      sellRate: Number((buy * 0.975).toFixed(2)),
    });
  }

  return rates;
}

async function seedRates(adminId) {
  const rates = buildRates();

  for (const rate of rates) {
    await SilverRateModel.upsertForDate({
      rateDate: rate.rateDate,
      buyRatePerGram: rate.buyRate,
      sellRatePerGram: rate.sellRate,
      updatedBy: adminId,
    });
  }

  const buys = rates.map((rate) => rate.buyRate);
  const first = rates[0];
  const last = rates[rates.length - 1];

  console.log(`  ${rates.length} daily rates, ${first.rateDate} to ${last.rateDate}`);
  console.log(
    `  buy Rs ${first.buyRate}/g -> Rs ${last.buyRate}/g ` +
      `(low Rs ${Math.min(...buys)}, high Rs ${Math.max(...buys)})`
  );

  return rates;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function seedBulk() {
  try {
    // Hashed once and reused: bcrypt is deliberately slow, and hashing the
    // same password sixty times would dominate the run for no reason.
    const hashedPassword = await bcrypt.hash(PASSWORD, 10);

    console.log("Admin");
    const adminId = await ensureAdmin();

    console.log(`\nEmployees (${EMPLOYEE_COUNT})`);
    const employees = await seedEmployees(hashedPassword);

    console.log(`\nCustomers (${USER_COUNT})`);
    const users = await seedUsers(employees, hashedPassword);

    console.log(`\nSilver rates for August ${YEAR}`);
    await seedRates(adminId);

    console.log("\n---------------------------------------------");
    console.log("Sign in with:");
    console.log(`  /admin     ${ADMIN.email}  /  ${ADMIN.password}`);
    if (employees.length) {
      console.log(`  /employee  ${employees[0].email}  /  ${PASSWORD}`);
    }
    if (users.length) {
      console.log(`  /user      ${users[0].email}  /  ${PASSWORD}`);
    }
    console.log(`(every employee and every customer uses the password "${PASSWORD}")`);
  } catch (error) {
    console.error("\nFailed to seed bulk data:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seedBulk();
